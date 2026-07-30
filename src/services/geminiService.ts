import { GoogleGenAI, Type } from "@google/genai";
import { tokenizeSentences, segmentByWaterFilling, segmentByIndex, Sentence, ensureSceneCount, parseSrtToTimeline, parseTxtToSyntheticTimeline, segmentByTimeline, TimelineBlock } from "../utils/textSegmentation";
import { Cache } from "../utils/cache";
import { parseJsonArray, FALLBACK_MODELS } from "../utils/aiHelpers";



export const validateApiKey = async (apiKey: string, provider: 'gemini' | 'kyma' = 'gemini'): Promise<boolean> => {
    try {
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const res = await fetch(url);
            return res.ok;
        } else {
            const res = await fetch('https://kymaapi.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            return res.ok;
        }
    } catch (error) {
        console.error("Key Validation Failed:", error);
        return false;
    }
};

const BATCH_SIZE = 5;

// Hàm cứu hộ: Mổ xẻ lấy các Object còn nguyên vẹn trong JSON hỏng (hỗ trợ 1 cấp nested)
const bestEffortParse = (text: string): any[] => {
    const objects = text.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g) || [];
    return objects.map(o => {
        try { return JSON.parse(o); } catch { return null; }
    }).filter(Boolean);
};

// Hàm phân loại lỗi: Không phải lỗi nào cũng nên thử lại
const shouldRetry = (e: any): boolean => {
    const msg = String(e?.message || e || '');
    if (msg.includes('JSON')) return false;  // Lỗi đứt JSON thì Retry vô ích, phải parse best-effort
    if (msg.includes('400')) return false;   // Bad request thì bỏ qua
    return true; // 429, 500, timeout... thì retry
};

// Nâng cấp withRetry: Xoay vòng Key và xoay vòng Model (Fallback)
const withRetry = async <T>(
    fn: (key: string, modelToUse: string) => Promise<T>,
    keys: string,
    requestedModel: string,
    fallbackList: string[],
    retries: number = 2,
    delayMs: number = 2000
): Promise<T> => {
    const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
    let currentKeyIndex = 0;

    // Đảm bảo requestedModel nằm ở đầu mảng fallback
    const modelsToTry = [requestedModel, ...fallbackList.filter(m => m !== requestedModel)];
    let currentModelIndex = 0;

    for (let r = 0; r <= retries; r++) {
        try {
            return await fn(keyList[currentKeyIndex], modelsToTry[currentModelIndex]);
        } catch (e) {
            if (r === retries || !shouldRetry(e)) {
                throw e;
            }
            const msg = String((e as Error)?.message || '');

            // Xoay vòng Key trước
            if (msg.includes('429') || msg.includes('503')) {
                if (keyList.length > 1) {
                    currentKeyIndex = (currentKeyIndex + 1) % keyList.length;
                    console.warn(`Hit limit! Rotating to key index ${currentKeyIndex}...`);
                } else if (modelsToTry.length > 1 && currentModelIndex < modelsToTry.length - 1) {
                    // Nếu chỉ có 1 key, xoay vòng Model
                    currentModelIndex++;
                    console.warn(`Hit limit! Falling back to model ${modelsToTry[currentModelIndex]}...`);
                }
            }

            await new Promise(res => setTimeout(res, delayMs * (r + 1)));
        }
    }
    throw new Error("Unreachable");
};

// Batched AI generation to avoid token limits and skipped text
const generateBatch = async (
    scenesBatch: string[],
    systemInstruction: string,
    promptGenerationInstruction: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash"
): Promise<any[]> => {
    const batchSystemInstruction = `You are a professional storyboard artist and script analyst. 
Your task is to generate visual prompts for a list of PRE-SEGMENTED script lines.

**CORE DIRECTIVE**
You are given an array of "scriptLine" strings. For EACH string in the array, you must output exactly one JSON object. The number of items in your output array MUST EXACTLY MATCH the number of items in the input array.
Do NOT modify, summarize, or skip ANY of the provided scriptLine texts. Copy them verbatim to your output.

**TASK**
For each input scriptLine, generate a JSON object with:
1. "scriptLine": (VERBATIM from input)
${promptGenerationInstruction}

OUTPUT ONLY A JSON ARRAY.`;

    const batchInput = JSON.stringify(scenesBatch, null, 2);

    const schemaProperties: any = {
        scriptLine: { type: Type.STRING }
    };
    const requiredFields = ["scriptLine"];
    if (promptGenerationInstruction.includes("imagePrompt")) {
        schemaProperties.imagePrompt = { type: Type.STRING };
        requiredFields.push("imagePrompt");
    } else {
        schemaProperties.videoPrompt = { type: Type.STRING };
        requiredFields.push("videoPrompt");
    }

    const attemptGemini = async (key: string, modelToUse: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelToUse,
            contents: `Generate prompts for these lines:\n${batchInput}`,
            config: {
                systemInstruction: batchSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: schemaProperties,
                        required: requiredFields
                    }
                }
            }
        });
        const text = response.text;
        if (!text) throw new Error("AI không phản hồi.");
        try {
            return JSON.parse(text.trim());
        } catch (e) {
            console.warn("JSON parse failed for batch Gemini, attempting best-effort salvage...");
            const salvaged = bestEffortParse(text);
            if (salvaged.length > 0) return salvaged;
            throw e;
        }
    };

    const attemptKyma = async (key: string, modelToUse: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: 'system', content: batchSystemInstruction },
                    { role: 'user', content: `Generate prompts for these lines:\n${batchInput}` }
                ],
                temperature: 0.7,
                max_tokens: modelToUse.includes('flash') ? 10000 : 8000 // Token cao cho Batch
            })
        });
        if (!response.ok) throw new Error(`Kyma API Error: ${response.status}`);
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            throw new Error("Kyma trả response rỗng hoặc không hợp lệ.");
        }
        let text = content;
        const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) {
            text = match[0];
        } else {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        if (!text) {
            throw new Error("Kyma trả content rỗng sau khi strip markdown.");
        }
        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.warn("JSON parse failed for batch, attempting best-effort salvage...");
            const salvaged = bestEffortParse(text);
            if (salvaged.length > 0) return salvaged;
            throw parseError; // Vô phương cứu chữa
        }
    };

    // Provider đơn nhất: nếu có Kyma → dùng Kyma, ngược lại → dùng Gemini.
    // Không fallback giữa các provider (đã có xoay vòng key).
    if (kymaKey) {
        return await withRetry((k, m) => attemptKyma(k, m), kymaKey, kymaModelName, FALLBACK_MODELS.kyma);
    }
    if (keyToUse) {
        return await withRetry((k, m) => attemptGemini(k, m), keyToUse, modelName, FALLBACK_MODELS.gemini);
    }

    throw new Error("Tất cả API đều lỗi khi xử lý batch.");
};

// Streaming variant: yield từng scene ngay khi Gemini parse xong (Kyma fallback non-streaming)
const generateBatchStream = async function* (
    scenesBatch: string[],
    systemInstruction: string,
    promptGenerationInstruction: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash"
): AsyncGenerator<{ index: number, scene: any }> {
    // Provider đơn nhất: nếu có Kyma → dùng Kyma, ngược lại → dùng Gemini.
    // Kyma path: wrapper non-streaming rồi yield từng cái (Kyma API không support stream)
    if (kymaKey) {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${kymaKey.split(',')[0].trim()}`
            },
            body: JSON.stringify({
                model: kymaModelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Generate prompts for these lines:\n${JSON.stringify(scenesBatch, null, 2)}` }
                ],
                temperature: 0.7,
                max_tokens: kymaModelName.includes('flash') ? 10000 : 8000
            })
        });
        if (!response.ok) throw new Error(`Kyma API Error: ${response.status}`);
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            throw new Error("Kyma trả response rỗng hoặc không hợp lệ.");
        }
        let text = content;
        const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) {
            text = match[0];
        } else {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        if (!text) {
            throw new Error("Kyma trả content rỗng sau khi strip markdown.");
        }
        let scenes: any[];
        try {
            scenes = JSON.parse(text);
        } catch {
            scenes = bestEffortParse(text);
        }
        if (scenes.length === 0) {
            throw new Error("Kyma trả về JSON không chứa scene hợp lệ.");
        }
        for (let i = 0; i < scenes.length; i++) {
            yield { index: i, scene: scenes[i] };
        }
        return;
    }

    // Gemini streaming path
    const schemaProperties: any = {
        scriptLine: { type: Type.STRING }
    };
    const requiredFields = ["scriptLine"];
    if (promptGenerationInstruction.includes("imagePrompt")) {
        schemaProperties.imagePrompt = { type: Type.STRING };
        requiredFields.push("imagePrompt");
    } else {
        schemaProperties.videoPrompt = { type: Type.STRING };
        requiredFields.push("videoPrompt");
    }

    const ai = new GoogleGenAI({ apiKey: keyToUse.split(',')[0].trim() });
    const stream = await ai.models.generateContentStream({
        model: modelName,
        contents: `Generate prompts for these lines:\n${JSON.stringify(scenesBatch, null, 2)}`,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: schemaProperties,
                    required: requiredFields
                }
            }
        }
    });

    const objectRegex = /\{(?:[^{}]|\{[^{}]*\})*\}/g;
    let buffer = '';
    let index = 0;
    for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        buffer += chunkText;
        const matches = buffer.match(objectRegex);
        if (matches) {
            for (const m of matches) {
                try {
                    const scene = JSON.parse(m);
                    yield { index: index++, scene };
                    buffer = buffer.replace(m, '');
                } catch {
                    // Object chưa hoàn chỉnh, đợi chunk tiếp
                }
            }
        }
    }
};

const fetchSceneAnchors = async (
    sentences: Sentence[],
    targetSceneCount: number,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash"
): Promise<{ fromSentenceIdx: number, toSentenceIdx: number }[]> => {
    const scriptText = sentences.map(s => `[${s.idx}] ${s.text}`).join('\n');

    const systemInstruction = `You are a storyboard director. Divide the script into EXACTLY ${targetSceneCount} logical scenes.
The script is provided as a numbered list of sentences: [0] "...", [1] "...".
Return ONLY a JSON array of EXACTLY ${targetSceneCount} objects. Do NOT return fewer or more than ${targetSceneCount} under any circumstance.
If the script has more logical breaks than needed, merge short adjacent scenes. If it has fewer logical breaks, split longer scenes into multiple parts to ALWAYS hit ${targetSceneCount}.
Each object must contain: sceneNumber (integer starting from 1), fromSentenceIdx (integer), toSentenceIdx (integer).
Example for ${targetSceneCount} scenes:
{
  "sceneNumber": 1,
  "fromSentenceIdx": 0,
  "toSentenceIdx": 5
}`;

    const schemaProperties: any = {
        sceneNumber: { type: Type.INTEGER },
        fromSentenceIdx: { type: Type.INTEGER },
        toSentenceIdx: { type: Type.INTEGER },
    };

    const attemptGemini = async (key: string, modelToUse: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelToUse,
            contents: `Script:\n\n${scriptText}`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: schemaProperties,
                        required: ["sceneNumber", "fromSentenceIdx", "toSentenceIdx"]
                    }
                }
            }
        });
        const text = response.text;
        if (!text) throw new Error("AI không phản hồi.");
        try {
            return JSON.parse(text.trim());
        } catch (e) {
            console.warn("JSON parse failed for scene anchors Gemini, attempting best-effort salvage...");
            const salvaged = bestEffortParse(text);
            if (salvaged.length > 0) return salvaged;
            throw e;
        }
    };

    const attemptKyma = async (key: string, modelToUse: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Script:\n\n${scriptText}` }
                ],
                temperature: 0.2,
                max_tokens: 1500 // Token cho Scene Anchors (output ~200 tokens)
            })
        });
        if (!response.ok) throw new Error(`Kyma API Error: ${response.status}`);
        const data = await response.json();
        let text = data.choices[0].message.content;
        const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) {
            text = match[0];
        } else {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            console.warn("JSON parse failed for scene anchors Kyma, attempting best-effort salvage...");
            const salvaged = bestEffortParse(text);
            if (salvaged.length > 0) return salvaged;
            throw e;
        }
    };

    if (kymaKey) {
        return await withRetry((k, m) => attemptKyma(k, m), kymaKey, kymaModelName, FALLBACK_MODELS.kyma);
    }
    if (keyToUse) {
        return await withRetry((k, m) => attemptGemini(k, m), keyToUse, modelName, FALLBACK_MODELS.gemini);
    }

    throw new Error("Lỗi phân tích điểm neo (Anchors).");
};

const fetchCharacterDictionary = async (
    script: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash"
): Promise<string> => {
    const cached = Cache.getCharacters(script, kymaKey ? kymaModelName : modelName);
    if (cached) return cached;

    const systemInstruction = `You are a script analyst. Read the script and identify the main characters.
For each character, write a concise 1-sentence visual description (age, gender, hair, clothing, key features) that fits the story.
Return a JSON object where the key is the character's name and the value is their visual description.
Example: {"John": "30yo man, short brown hair, wearing a suit", "Mary": "25yo woman, long blonde hair, red dress"}`;

    const attemptGemini = async (key: string, modelToUse: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelToUse,
            contents: `Script:\n\n${script}`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
            }
        });
        const text = response.text;
        if (!text) throw new Error("AI không phản hồi.");
        return text.trim();
    };

    const attemptKyma = async (key: string, modelToUse: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Script:\n\n${script}` }
                ],
                temperature: 0.3,
                max_tokens: 2000 // Token cho Character Dictionary (output ~500 tokens)
            })
        });
        if (!response.ok) throw new Error(`Kyma API Error: ${response.status}`);
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            console.warn("Kyma returned empty/invalid content for characters");
            return ""; // Trả rỗng để caller skip tạo dictionary
        }
        let text = content;
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            text = match[0];
        } else {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        return text;
    };

    let result: string | null = null;
    if (kymaKey) {
        result = await withRetry((k, m) => attemptKyma(k, m), kymaKey, kymaModelName, FALLBACK_MODELS.kyma);
    } else if (keyToUse) {
        result = await withRetry((k, m) => attemptGemini(k, m), keyToUse, modelName, FALLBACK_MODELS.gemini);
    }

    if (!result) throw new Error("Tất cả API đều lỗi khi phân tích nhân vật.");

    Cache.setCharacters(script, kymaKey ? kymaModelName : modelName, result);
    return result;
};

export const analyzeScriptWithAI = async (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string, 
    styleLock: string, 
    mode: string,
    segmentationMode: 'ai' | 'punctuation' | 'fixed',
    modelName: string = "gemini-2.5-flash",
    targetSceneCount: number = 10,
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9',
    enableAspectRatio: boolean = false,
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini",
    onProgress?: (scenes: any[], progress: number, statusText: string) => void
): Promise<{ scenes: any[], provider: string, model: string }> => {
    // Theo dõi provider thực sự đã chạy (cho Fix #12)
    let finalProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    let finalModel = kymaKey ? kymaModelName : modelName;

    // Guard: nếu không có key nào thì throw sớm
    if (!kymaKey && !apiKey) {
        throw new Error("Không có API key. Vui lòng cấu hình Kyma hoặc Gemini key trước khi phân cảnh.");
    }
    // No fallback: provider chỉ dựa trên key đã cấu hình.

    // 1. PRE-SEGMENTATION (Tokenize + AI/Water-fill)
    if (onProgress) onProgress([], 5, "Đang tiền xử lý kịch bản...");
    const sentences = tokenizeSentences(script);
    let segmentedLines: string[] = [];

    if (sentences.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    if (segmentationMode === 'ai') {
        if (onProgress) onProgress([], 5, "Đang dùng AI phân tích điểm neo...");

        // Fix #4: Chunking cho script > 1000 câu
        let anchors: { fromSentenceIdx: number; toSentenceIdx: number }[] = [];
        if (sentences.length > 1000) {
            const CHUNK_SIZE = 800;
            const chunks: Sentence[][] = [];
            for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
                chunks.push(sentences.slice(i, i + CHUNK_SIZE));
            }

            let offset = 0;
            for (const chunk of chunks) {
                const chunkTarget = Math.max(1, Math.round((chunk.length / sentences.length) * targetSceneCount));
                const chunkAnchors = await fetchSceneAnchors(chunk, chunkTarget, modelName, apiKey, kymaKey, kymaModelName);
                anchors = anchors.concat(
                    chunkAnchors.map(a => ({
                        fromSentenceIdx: a.fromSentenceIdx + offset,
                        toSentenceIdx: a.toSentenceIdx + offset
                    }))
                );
                offset += chunk.length;
            }
        } else {
            anchors = await fetchSceneAnchors(sentences, targetSceneCount, modelName, apiKey, kymaKey, kymaModelName);
        }

        segmentedLines = segmentByIndex(sentences, anchors);

        // Fix: AI có thể trả thiếu anchors → đảm bảo đủ targetSceneCount
        if (segmentedLines.length < targetSceneCount) {
            segmentedLines = ensureSceneCount(segmentedLines, sentences, targetSceneCount);
        }
    } else if (segmentationMode === 'punctuation') {
        segmentedLines = sentences.map(s => s.text);
    } else {
        segmentedLines = segmentByWaterFilling(sentences, targetSceneCount);
    }

    if (segmentedLines.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    // 1.5 CHARACTER DICTIONARY FETCH
    let characterDictionaryStr = "";
    if (enableCharacterConsistency) {
        try {
            if (onProgress) onProgress([], 15, "Đang phân tích tạo hình nhân vật (Casting)...");
            const charDict = await fetchCharacterDictionary(script, modelName, apiKey, kymaKey, kymaModelName);
            if (!charDict) {
                console.warn("Character dictionary rỗng, bỏ qua bước này.");
            } else {
                // charDict is a JSON string like {"Hung": "..."}
                const parsedDict = JSON.parse(charDict);
                let dictText = "";
                for (const [char, desc] of Object.entries(parsedDict)) {
                    dictText += `- ${char}: ${desc}\n`;
                }
                if (dictText) {
                    characterDictionaryStr = `\n   - **CHARACTER CONSISTENCY MANDATE**: When any of the following characters appear in the scene, you MUST incorporate their EXACT visual description into your prompt to ensure consistency across all scenes:\n${dictText}`;
                }
            }
        } catch (e) {
            console.warn("Lỗi khi tạo hình nhân vật, bỏ qua bước này: ", e);
        }
    }

    // 2. CONSTRUCT PROMPT INSTRUCTIONS
    let promptGenerationInstruction = "";
    // Note: Style injection is now mainly handled by Javascript concatenation.
    const commonStyleInjection = `   - **STYLE INJECTION**: Analyze the attached Reference Images (if any). Extract their art style (e.g., color palette, lighting key, texture, rendering style) and apply it to the scene description.`;

    if (promptType === 'image') {
        const aspectRatioInstruction = enableAspectRatio ? `\n   - **ASPECT RATIO**: Output MUST include the aspect ratio parameter "--ar ${aspectRatio}" at the very end of the prompt.` : "";
        promptGenerationInstruction = `2. "imagePrompt": A self-contained, highly detailed visual description for a static image, optimized for Google Nano Banana (Gemini Image Models).
${commonStyleInjection}
   - **NO PARAMETERS**: Do not use Midjourney parameters (like --v 6.0, --ar 16:9). Use natural, descriptive English only.${aspectRatioInstruction}${characterDictionaryStr}
   - **VISUAL FIDELITY**: Focus on soft lighting, rich textures, and a clean composition suitable for the "Nano Banana" model (high adherence to prompt).
   - **ACTION & MOOD**: Describe the scene action and atmosphere vividly based on the script context.`;
    } else {
        let videoRatioDesc = "Widescreen cinematic";
        if (aspectRatio === '9:16') videoRatioDesc = "Vertical full-screen mobile";
        if (aspectRatio === '1:1') videoRatioDesc = "Square format";
        
        const aspectRatioInstruction = enableAspectRatio ? `\n   - **ASPECT RATIO & FRAMING**: Composition must be ${videoRatioDesc} (${aspectRatio}). Frame the subject accordingly.` : "";

        promptGenerationInstruction = `2. "videoPrompt": A highly detailed video generation prompt optimized for Google Veo 3 (approx 8 seconds).
${commonStyleInjection}${aspectRatioInstruction}${characterDictionaryStr}
   - **VISUAL NARRATIVE**: Describe the continuous motion, physics, and changes within the clip.
   - **CAMERA & CINEMATOGRAPHY**: Specify camera movement (e.g., "Slow tracking shot", "Drone view", "Static camera with subtle subject motion", "Rack focus").
   - **CHARACTER & ACTION**: Describe fluid movements based on the script.
   - **ATMOSPHERE**: Describe how light interacts with motion.`;
    }

    // 3. BATCH PROCESSING (Parallel with Queue Workers)
    const batches: string[][] = [];
    for (let i = 0; i < segmentedLines.length; i += BATCH_SIZE) {
        batches.push(segmentedLines.slice(i, i + BATCH_SIZE));
    }

    const MAX_CONCURRENCY = Math.min(5, batches.length);
    let finalScenes: any[] = new Array(segmentedLines.length);
    let completedScenesCount = 0;

    const runBatch = async (batchIdx: number) => {
        const batch = batches[batchIdx];
        const batchResults = await generateBatch(
            batch,
            "", // System instruction is built in generateBatch
            promptGenerationInstruction,
            modelName,
            apiKey,
            kymaKey,
            kymaModelName
        );

        for (let j = 0; j < batch.length; j++) {
            const aiResult = batchResults[j] || {};
            const rawImagePrompt = aiResult.imagePrompt || "";
            const rawVideoPrompt = aiResult.videoPrompt || "";

            finalScenes[batchIdx * BATCH_SIZE + j] = {
                scriptLine: batch[j],
                imagePrompt: (styleLock && rawImagePrompt) ? `${styleLock}, ${rawImagePrompt}` : rawImagePrompt,
                videoPrompt: (styleLock && rawVideoPrompt) ? `${styleLock}, ${rawVideoPrompt}` : rawVideoPrompt
            };
        }

        completedScenesCount += batch.length;
        if (onProgress) {
            const progress = Math.floor(((completedScenesCount / segmentedLines.length) * 85) + 15);
            onProgress([...finalScenes.filter(Boolean)], progress, `Đang sinh prompt (${completedScenesCount}/${segmentedLines.length} cảnh)...`);
        }
    };

    // Fix #3: Queue Worker pattern thay cho Set + Promise.race
    const queue = batches.map((_, i) => () => runBatch(i));
    const workers = Array.from({ length: MAX_CONCURRENCY }, async () => {
        while (queue.length > 0) {
            const taskFn = queue.shift();
            if (taskFn) {
                await taskFn();
            }
        }
    });

    await Promise.all(workers);

    // Fix #12: Trả về đúng provider thực tế đã chạy (sau fallback)
    return { scenes: finalScenes.filter(Boolean), provider: finalProvider, model: finalModel };
};

// Streaming variant: yield từng scene ngay khi Gemini parse xong (real-time UI)
export const analyzeScriptWithAIStream = async function* (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string,
    styleLock: string,
    mode: string,
    segmentationMode: 'ai' | 'punctuation' | 'fixed',
    modelName: string = "gemini-2.5-flash",
    targetSceneCount: number = 10,
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9',
    enableAspectRatio: boolean = false,
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini"
): AsyncGenerator<{ type: 'progress' | 'final', scenes?: any[], progress?: number, status?: string, provider?: string, model?: string, totalCount?: number }> {
    // Theo dõi provider thực sự
    let finalProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    let finalModel = kymaKey ? kymaModelName : modelName;

    // Guard: nếu không có key nào thì throw sớm
    if (!kymaKey && !apiKey) {
        throw new Error("Không có API key. Vui lòng cấu hình Kyma hoặc Gemini key trước khi phân cảnh.");
    }
    // No fallback: provider chỉ dựa trên key đã cấu hình.

    // 1. PRE-SEGMENTATION
    yield { type: 'progress', scenes: [], progress: 5, status: "Đang tiền xử lý kịch bản..." };
    const sentences = tokenizeSentences(script);
    let segmentedLines: string[] = [];

    if (sentences.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    if (segmentationMode === 'ai') {
        yield { type: 'progress', scenes: [], progress: 8, status: "Đang dùng AI phân tích điểm neo..." };

        let anchors: { fromSentenceIdx: number; toSentenceIdx: number }[] = [];
        if (sentences.length > 1000) {
            const CHUNK_SIZE = 800;
            const chunks: Sentence[][] = [];
            for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
                chunks.push(sentences.slice(i, i + CHUNK_SIZE));
            }
            let offset = 0;
            for (const chunk of chunks) {
                const chunkTarget = Math.max(1, Math.round((chunk.length / sentences.length) * targetSceneCount));
                const chunkAnchors = await fetchSceneAnchors(chunk, chunkTarget, modelName, apiKey, kymaKey, kymaModelName);
                anchors = anchors.concat(
                    chunkAnchors.map(a => ({
                        fromSentenceIdx: a.fromSentenceIdx + offset,
                        toSentenceIdx: a.toSentenceIdx + offset
                    }))
                );
                offset += chunk.length;
            }
        } else {
            anchors = await fetchSceneAnchors(sentences, targetSceneCount, modelName, apiKey, kymaKey, kymaModelName);
        }

        segmentedLines = segmentByIndex(sentences, anchors);

        // Fix: AI có thể trả thiếu anchors → đảm bảo đủ targetSceneCount
        if (segmentedLines.length < targetSceneCount) {
            segmentedLines = ensureSceneCount(segmentedLines, sentences, targetSceneCount);
        }
    } else if (segmentationMode === 'punctuation') {
        segmentedLines = sentences.map(s => s.text);
    } else {
        segmentedLines = segmentByWaterFilling(sentences, targetSceneCount);
    }

    if (segmentedLines.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    // 1.5 CHARACTER DICTIONARY
    let characterDictionaryStr = "";
    if (enableCharacterConsistency) {
        try {
            yield { type: 'progress', scenes: [], progress: 14, status: "Đang phân tích tạo hình nhân vật (Casting)..." };
            const charDict = await fetchCharacterDictionary(script, modelName, apiKey, kymaKey, kymaModelName);
            if (!charDict) {
                console.warn("Character dictionary rỗng, bỏ qua bước này.");
            } else {
                const parsedDict = JSON.parse(charDict);
                let dictText = "";
                for (const [char, desc] of Object.entries(parsedDict)) {
                    dictText += `- ${char}: ${desc}\n`;
                }
                if (dictText) {
                    characterDictionaryStr = `\n   - **CHARACTER CONSISTENCY MANDATE**: When any of the following characters appear in the scene, you MUST incorporate their EXACT visual description into your prompt to ensure consistency across all scenes:\n${dictText}`;
                }
            }
        } catch (e) {
            console.warn("Lỗi khi tạo hình nhân vật, bỏ qua bước này: ", e);
        }
    }

    // 2. CONSTRUCT PROMPT INSTRUCTIONS
    const promptGenerationInstruction = promptGenerationInstruction_for_stream(
        promptType, styleLock, aspectRatio, enableAspectRatio, characterDictionaryStr
    );

    const batchSystemInstruction = `You are a professional storyboard artist and script analyst.
Your task is to generate visual prompts for a list of PRE-SEGMENTED script lines.

|**CORE DIRECTIVE**
You are given an array of "scriptLine" strings. For EACH string in the array, you must output exactly one JSON object. The number of items in your output array MUST EXACTLY MATCH the number of items in the input array.
Do NOT modify, summarize, or skip ANY of the provided scriptLine texts. Copy them verbatim to your output.

|**TASK**
For each input scriptLine, generate a JSON object with:
1. "scriptLine": (VERBATIM from input)
${promptGenerationInstruction}`;

    // 3. STREAMING BATCH PROCESSING
    const batches: string[][] = [];
    for (let i = 0; i < segmentedLines.length; i += BATCH_SIZE) {
        batches.push(segmentedLines.slice(i, i + BATCH_SIZE));
    }

    const MAX_CONCURRENCY = Math.min(5, batches.length);
    const finalScenes: any[] = new Array(segmentedLines.length);
    let completedCount = 0;

    // Yield thông báo bắt đầu streaming
    yield {
        type: 'progress',
        scenes: [],
        progress: 15,
        status: `Đang sinh prompt real-time (0/${segmentedLines.length} cảnh)...`
    };

    // Mỗi batch chạy 1 generator riêng. Push kết quả vào finalScenes theo global index.
    const generators: AsyncGenerator<{ index: number, scene: any }>[] = batches.map((batch, batchIdx) =>
        generateBatchStream(
            batch,
            batchSystemInstruction,
            promptGenerationInstruction,
            modelName,
            apiKey,
            kymaKey,
            kymaModelName
        )
    );

    // Forward yield từ tất cả generators song song (mỗi generator handle 1 batch)
    type ProgressEvent = { type: 'progress', scenes: any[], progress: number, status: string };

    async function* consumeGenerator(batchIdx: number): AsyncGenerator<ProgressEvent> {
        const gen = generators[batchIdx];
        try {
            for await (const { index, scene } of gen) {
                const globalIdx = batchIdx * BATCH_SIZE + index;
                finalScenes[globalIdx] = {
                    scriptLine: segmentedLines[globalIdx],
                    imagePrompt: (styleLock && scene.imagePrompt) ? `${styleLock}, ${scene.imagePrompt}` : (scene.imagePrompt || ""),
                    videoPrompt: (styleLock && scene.videoPrompt) ? `${styleLock}, ${scene.videoPrompt}` : (scene.videoPrompt || "")
                };
                completedCount++;
                yield {
                    type: 'progress',
                    scenes: [...finalScenes.filter(Boolean)],
                    progress: Math.floor((completedCount / segmentedLines.length) * 85) + 15,
                    status: `Đang sinh prompt real-time (${completedCount}/${segmentedLines.length} cảnh)...`
                };
            }
        } catch (e) {
            console.warn(`Batch ${batchIdx} failed:`, e);
        }
    }

    // Race tất cả generators, yield progress ngay khi có
    async function* mergeGenerators() {
        const pending: AsyncGenerator<ProgressEvent>[] = generators.map((_, i) => consumeGenerator(i));
        const iters = pending.map(g => g[Symbol.asyncIterator]());

        // Promise.race trên tất cả next() calls
        type NextResult = { idx: number, result: IteratorResult<ProgressEvent> };
        const activePromises = new Map<number, Promise<NextResult>>();
        for (let i = 0; i < iters.length; i++) {
            const p = iters[i].next().then(r => ({ idx: i, result: r }));
            activePromises.set(i, p);
        }

        while (activePromises.size > 0) {
            const winner = await Promise.race(activePromises.values());
            activePromises.delete(winner.idx);
            if (!winner.result.done && winner.result.value) {
                yield winner.result.value;
            }
            if (!winner.result.done) {
                const p = iters[winner.idx].next().then(r => ({ idx: winner.idx, result: r }));
                activePromises.set(winner.idx, p);
            }
        }
    }

    for await (const evt of mergeGenerators()) {
        yield evt;
    }

    // Fix #3: Nếu stream bị ngắt giữa chừng, fill missing scenes bằng placeholder
    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < segmentedLines.length) {
        const missingCount = segmentedLines.length - filledCount;
        console.warn(`Stream chỉ nhận ${filledCount}/${segmentedLines.length} scenes, đang fill ${missingCount} placeholder...`);
        const missingIndices: number[] = [];
        for (let i = 0; i < segmentedLines.length; i++) {
            if (!finalScenes[i]) missingIndices.push(i);
        }

        // Water-fill missing positions
        const remainingSentences = missingIndices.map((idx, k) => ({
            idx: k,
            text: segmentedLines[idx],
            wordCount: segmentedLines[idx].split(/\s+/).filter(w => w.length > 0).length
        }));
        const fills = segmentByWaterFilling(remainingSentences, Math.min(missingCount, remainingSentences.length));

        for (let k = 0; k < missingIndices.length; k++) {
            const sceneText = fills[k] || segmentedLines[missingIndices[k]];
            finalScenes[missingIndices[k]] = {
                scriptLine: sceneText,
                imagePrompt: styleLock ? `${styleLock}, (placeholder - AI stream bị ngắt)` : "(placeholder - AI stream bị ngắt)",
                videoPrompt: styleLock ? `${styleLock}, (placeholder - AI stream bị ngắt)` : "(placeholder - AI stream bị ngắt)"
            };
        }
    }

    // Yield final
    yield {
        type: 'final',
        scenes: finalScenes.filter(Boolean),
        provider: finalProvider,
        model: finalModel,
        totalCount: segmentedLines.length
    };
};

// Helper: build prompt generation instruction cho streaming (sync, không promise)
const promptGenerationInstruction_for_stream = (
    promptType: 'image' | 'video',
    styleLock: string,
    aspectRatio: string,
    enableAspectRatio: boolean,
    characterDictionaryStr: string
): string => {
    const commonStyleInjection = `   - **STYLE INJECTION**: Analyze the attached Reference Images (if any). Extract their art style (e.g., color palette, lighting key, texture, rendering style) and apply it to the scene description.`;

    if (promptType === 'image') {
        const aspectRatioInstruction = enableAspectRatio ? `\n   - **ASPECT RATIO**: Output MUST include the aspect ratio parameter "--ar ${aspectRatio}" at the very end of the prompt.` : "";
        return `2. "imagePrompt": A self-contained, highly detailed visual description for a static image, optimized for Google Nano Banana (Gemini Image Models).
${commonStyleInjection}
   - **NO PARAMETERS**: Do not use Midjourney parameters (like --v 6.0, --ar 16:9). Use natural, descriptive English only.${aspectRatioInstruction}${characterDictionaryStr}
   - **VISUAL FIDELITY**: Focus on soft lighting, rich textures, and a clean composition suitable for the "Nano Banana" model (high adherence to prompt).
   - **ACTION & MOOD**: Describe the scene action and atmosphere vividly based on the script context.`;
    } else {
        let videoRatioDesc = "Widescreen cinematic";
        if (aspectRatio === '9:16') videoRatioDesc = "Vertical full-screen mobile";
        if (aspectRatio === '1:1') videoRatioDesc = "Square format";

        const aspectRatioInstruction = enableAspectRatio ? `\n   - **ASPECT RATIO & FRAMING**: Composition must be ${videoRatioDesc} (${aspectRatio}). Frame the subject accordingly.` : "";

        return `2. "videoPrompt": A highly detailed video generation prompt optimized for Google Veo 3 (approx 8 seconds).
${commonStyleInjection}${aspectRatioInstruction}${characterDictionaryStr}
   - **VISUAL NARRATIVE**: Describe the continuous motion, physics, and changes within the clip.
   - **CAMERA & CINEMATOGRAPHY**: Specify camera movement (e.g., "Slow tracking shot", "Drone view", "Static camera with subtle subject motion", "Rack focus").
   - **CHARACTER & ACTION**: Describe fluid movements based on the script.
   - **ATMOSPHERE**: Describe how light interacts with motion.`;
    }
};

// ========== KHỐI 3 (hybrid-segmentation): HYBRID STREAM FUNCTION ==========

export const analyzeScriptWithAIHybridStream = async function* (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string,
    styleLock: string,
    mode: string,
    modelName: string = "gemini-2.5-flash",
    targetSceneCount: number = 10,
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9',
    enableAspectRatio: boolean = false,
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini",
    audioDuration?: number,
    enhanceWithAI: boolean = false
): AsyncGenerator<{ type: 'progress' | 'final', scenes?: any[], progress?: number, status?: string, provider?: string, model?: string, totalCount?: number }> {
    let finalProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    let finalModel = kymaKey ? kymaModelName : modelName;

    if (!kymaKey && !apiKey) {
        throw new Error("Không có API key. Vui lòng cấu hình Kyma hoặc Gemini key trước khi phân cảnh.");
    }

    // 1. TIMELINE-BASED PRE-SEGMENTATION (SRT or TXT)
    yield { type: 'progress', scenes: [], progress: 5, status: "Đang phân tích timeline kịch bản..." };

    const isSrt = script.includes('-->') && (script.includes(',000') || script.includes('.000') || script.includes('\n1\n'));
    let timelineBlocks: TimelineBlock[];
    if (isSrt) {
        timelineBlocks = parseSrtToTimeline(script);
    } else {
        timelineBlocks = parseTxtToSyntheticTimeline(script, audioDuration);
    }

    if (timelineBlocks.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    let segmentedLines: string[] = segmentByTimeline(timelineBlocks, targetSceneCount);

    // Optional AI Enhance: AI review lại boundaries cho semantic flow
    if (enhanceWithAI && (kymaKey || apiKey)) {
        try {
            yield { type: 'progress', scenes: [], progress: 8, status: "Đang dùng AI nắn chỉnh ranh giới cảnh..." };
            const scriptText = segmentedLines.map((line, i) => `[Scene ${i + 1}]: ${line}`).join('\n\n');
            const systemInstruction = `You are a storyboard director. Review the script and adjust the scene boundaries for better semantic flow.
You MUST return EXACTLY ${targetSceneCount} scenes. Do not change any text content, only move words/sentences between adjacent scenes if it improves the flow.
Return ONLY a JSON array of strings, where each string is a scene.`;

            const attemptEnhance = async (key: string, currentModel: string) => {
                const url = kymaKey ? 'https://kymaapi.com/v1/chat/completions' : `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;

                if (kymaKey) {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                        body: JSON.stringify({
                            model: currentModel,
                            messages: [
                                { role: 'system', content: systemInstruction },
                                { role: 'user', content: scriptText }
                            ],
                            temperature: 0.1,
                        })
                    });
                    if (!response.ok) throw new Error(`Kyma HTTP ${response.status}`);
                    const data = await response.json();
                    return data.choices?.[0]?.message?.content || "[]";
                } else {
                    const ai = new GoogleGenAI({ apiKey: key });
                    const response = await ai.models.generateContent({
                        model: currentModel,
                        contents: scriptText,
                        config: {
                            systemInstruction,
                            responseMimeType: "application/json"
                        }
                    });
                    return response.text || "[]";
                }
            };

            const textOutput = kymaKey
                ? await withRetry(attemptEnhance, kymaKey, kymaModelName, FALLBACK_MODELS.kyma, 2)
                : await withRetry(attemptEnhance, apiKey, modelName, FALLBACK_MODELS.gemini, 2);

            const adjustedScenes = parseJsonArray(textOutput, targetSceneCount);
            if (adjustedScenes.length === targetSceneCount) {
                segmentedLines = adjustedScenes;
            } else {
                console.warn(`Enhance fail: expected ${targetSceneCount}, got ${adjustedScenes.length}`);
            }
        } catch (e) {
            console.warn("AI enhance failed, using default timeline segment", e);
        }
    }

    // Safety net: đảm bảo đúng targetSceneCount
    const sentences = tokenizeSentences(script);
    if (segmentedLines.length < targetSceneCount && sentences.length > 0) {
        segmentedLines = ensureSceneCount(segmentedLines, sentences, targetSceneCount);
    }

    if (segmentedLines.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    // 1.5 CHARACTER DICTIONARY
    let characterDictionaryStr = "";
    if (enableCharacterConsistency) {
        try {
            yield { type: 'progress', scenes: [], progress: 14, status: "Đang phân tích tạo hình nhân vật (Casting)..." };
            const charDict = await fetchCharacterDictionary(script, modelName, apiKey, kymaKey, kymaModelName);
            if (!charDict) {
                console.warn("Character dictionary rỗng, bỏ qua bước này.");
            } else {
                const parsedDict = JSON.parse(charDict);
                let dictText = "";
                for (const [char, desc] of Object.entries(parsedDict)) {
                    dictText += `- ${char}: ${desc}\n`;
                }
                if (dictText) {
                    characterDictionaryStr = `\n   - **CHARACTER CONSISTENCY MANDATE**: When any of the following characters appear in the scene, you MUST incorporate their EXACT visual description into your prompt to ensure consistency across all scenes:\n${dictText}`;
                }
            }
        } catch (e) {
            console.warn("Lỗi khi tạo hình nhân vật, bỏ qua bước này: ", e);
        }
    }

    // 2. CONSTRUCT PROMPT INSTRUCTIONS
    const promptGenerationInstruction = promptGenerationInstruction_for_stream(
        promptType, styleLock, aspectRatio, enableAspectRatio, characterDictionaryStr
    );

    const batchSystemInstruction = `You are a professional storyboard artist and script analyst.
Your task is to generate visual prompts for a list of PRE-SEGMENTED script lines.

**CORE DIRECTIVE**
You are given an array of "scriptLine" strings. For EACH string in the array, you must output exactly one JSON object. The number of items in your output array MUST EXACTLY MATCH the number of items in the input array.
Do NOT modify, summarize, or skip ANY of the provided scriptLine texts. Copy them verbatim to your output.

**TASK**
For each input scriptLine, generate a JSON object with:
1. "scriptLine": (VERBATIM from input)
${promptGenerationInstruction}`;

    // 3. STREAMING BATCH PROCESSING
    const BATCH_SIZE = 6;
    const batches: string[][] = [];
    for (let i = 0; i < segmentedLines.length; i += BATCH_SIZE) {
        batches.push(segmentedLines.slice(i, i + BATCH_SIZE));
    }

    const finalScenes: any[] = new Array(segmentedLines.length);
    let completedCount = 0;

    yield {
        type: 'progress',
        scenes: [],
        progress: 15,
        status: `Đang sinh prompt real-time (0/${segmentedLines.length} cảnh)...`
    };

    const generators: AsyncGenerator<{ index: number, scene: any }>[] = batches.map((batch, batchIdx) =>
        generateBatchStream(
            batch,
            batchSystemInstruction,
            promptGenerationInstruction,
            modelName,
            apiKey,
            kymaKey,
            kymaModelName
        )
    );

    type ProgressEvent = { type: 'progress', scenes: any[], progress: number, status: string };

    async function* consumeGenerator(batchIdx: number): AsyncGenerator<ProgressEvent> {
        const gen = generators[batchIdx];
        try {
            for await (const { index, scene } of gen) {
                const globalIdx = batchIdx * BATCH_SIZE + index;
                finalScenes[globalIdx] = {
                    scriptLine: segmentedLines[globalIdx],
                    imagePrompt: (styleLock && scene.imagePrompt) ? `${styleLock}, ${scene.imagePrompt}` : (scene.imagePrompt || ""),
                    videoPrompt: (styleLock && scene.videoPrompt) ? `${styleLock}, ${scene.videoPrompt}` : (scene.videoPrompt || "")
                };
                completedCount++;
                yield {
                    type: 'progress',
                    scenes: [...finalScenes.filter(Boolean)],
                    progress: Math.floor((completedCount / segmentedLines.length) * 85) + 15,
                    status: `Đang sinh prompt real-time (${completedCount}/${segmentedLines.length} cảnh)...`
                };
            }
        } catch (e) {
            console.warn(`Batch ${batchIdx} failed:`, e);
        }
    }

    async function* mergeGenerators() {
        const pending: AsyncGenerator<ProgressEvent>[] = generators.map((_, i) => consumeGenerator(i));
        const iters = pending.map(g => g[Symbol.asyncIterator]());

        type NextResult = { idx: number, result: IteratorResult<ProgressEvent> };
        const activePromises = new Map<number, Promise<NextResult>>();
        for (let i = 0; i < iters.length; i++) {
            const p = iters[i].next().then(r => ({ idx: i, result: r }));
            activePromises.set(i, p);
        }

        while (activePromises.size > 0) {
            const winner = await Promise.race(activePromises.values());
            activePromises.delete(winner.idx);
            if (!winner.result.done && winner.result.value) {
                yield winner.result.value;
            }
            if (!winner.result.done) {
                const p = iters[winner.idx].next().then(r => ({ idx: winner.idx, result: r }));
                activePromises.set(winner.idx, p);
            }
        }
    }

    for await (const evt of mergeGenerators()) {
        yield evt;
    }

    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < segmentedLines.length) {
        const missingCount = segmentedLines.length - filledCount;
        console.warn(`Stream thiếu ${missingCount} cảnh. Fill placeholder.`);
        for (let i = 0; i < segmentedLines.length; i++) {
            if (!finalScenes[i]) {
                finalScenes[i] = {
                    scriptLine: segmentedLines[i],
                    imagePrompt: styleLock ? `${styleLock}, scene placeholder` : "scene placeholder",
                    videoPrompt: styleLock ? `${styleLock}, video placeholder` : "video placeholder"
                };
            }
        }
    }

    yield {
        type: 'final',
        scenes: finalScenes,
        provider: finalProvider,
        model: finalModel,
        totalCount: segmentedLines.length
    };
};

// ========== KHỐI v4 (2-bước): BƯỚC 1 - PURE SCENE SPLIT ==========
// Chỉ phân chia kịch bản thành các cảnh, KHÔNG gọi AI. Dùng pure timeline + early-cut.
export const splitScriptToScenes = async (
    script: string,
    targetSceneCount: number,
    audioDuration?: number,
    apiKey: string = '',
    kymaKey: string = '',
    kymaModelName: string = 'gpt-4o-mini'
): Promise<string[]> => {
    if (targetSceneCount <= 1) return [script];

    // 1. TIMELINE-BASED PRE-SEGMENTATION (SRT hoặc TXT)
    const isSrt = script.includes('-->') && (script.includes(',000') || script.includes('.000') || script.includes('\n1\n'));
    let timelineBlocks: TimelineBlock[];
    if (isSrt) {
        timelineBlocks = parseSrtToTimeline(script);
    } else {
        timelineBlocks = parseTxtToSyntheticTimeline(script, audioDuration);
    }

    if (timelineBlocks.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    let segmentedLines: string[] = segmentByTimeline(timelineBlocks, targetSceneCount);

    // 2. SAFETY NET: đảm bảo đúng targetSceneCount
    const sentences = tokenizeSentences(script);
    if (segmentedLines.length < targetSceneCount && sentences.length > 0) {
        segmentedLines = ensureSceneCount(segmentedLines, sentences, targetSceneCount);
    }

    if (segmentedLines.length === 0) {
        throw new Error("Kịch bản trống hoặc không thể phân mảnh.");
    }

    return segmentedLines;
};

// ========== KHỐI v4 (2-bước): BƯỚC 2 - PROMPT GENERATION ==========
// Sinh imagePrompt + videoPrompt cho mảng scene lines đã phân chia ở bước 1.
// AI là BẮT BUỘC ở bước này.
export const generatePromptsForScenes = async function* (
    sceneLines: string[],
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string,
    styleLock: string,
    mode: string,
    modelName: string = 'gemini-2.5-flash',
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9',
    enableAspectRatio: boolean = false,
    enableCharacterConsistency: boolean = false,
    scriptContext: string = '',
    kymaKey?: string,
    kymaModelName: string = 'gpt-4o-mini'
): AsyncGenerator<{ type: 'progress' | 'final', scenes?: any[], progress?: number, status?: string, provider?: string, model?: string, totalCount?: number }> {
    if (!kymaKey && !apiKey) {
        throw new Error("Cần API key (Kyma hoặc Gemini) để sinh prompt. Vui lòng cấu hình trước.");
    }
    if (sceneLines.length === 0) {
        throw new Error("Chưa có cảnh nào. Vui lòng bấm 'Phân cảnh' trước.");
    }

    const finalProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    const finalModel = kymaKey ? kymaModelName : modelName;

    yield { type: 'progress', scenes: [], progress: 5, status: "Đang chuẩn bị..." };

    // 1. CHARACTER DICTIONARY (optional, chỉ khi user bật)
    let characterDictionaryStr = "";
    if (enableCharacterConsistency && scriptContext) {
        try {
            yield { type: 'progress', scenes: [], progress: 10, status: "Đang phân tích tạo hình nhân vật (Casting)..." };
            const charDict = await fetchCharacterDictionary(scriptContext, modelName, apiKey, kymaKey, kymaModelName);
            if (charDict) {
                const parsedDict = JSON.parse(charDict);
                let dictText = "";
                for (const [char, desc] of Object.entries(parsedDict)) {
                    dictText += `- ${char}: ${desc}\n`;
                }
                if (dictText) {
                    characterDictionaryStr = `\n   - **CHARACTER CONSISTENCY MANDATE**: When any of the following characters appear in the scene, you MUST incorporate their EXACT visual description into your prompt to ensure consistency across all scenes:\n${dictText}`;
                }
            }
        } catch (e) {
            console.warn("Lỗi khi tạo hình nhân vật, bỏ qua bước này: ", e);
        }
    }

    // 2. CONSTRUCT PROMPT INSTRUCTIONS
    const promptGenerationInstruction = promptGenerationInstruction_for_stream(
        promptType, styleLock, aspectRatio, enableAspectRatio, characterDictionaryStr
    );

    const batchSystemInstruction = `You are a professional storyboard artist and script analyst.
Your task is to generate visual prompts for a list of PRE-SEGMENTED script lines.

**CORE DIRECTIVE**
You are given an array of "scriptLine" strings. For EACH string in the array, you must output exactly one JSON object. The number of items in your output array MUST EXACTLY MATCH the number of items in the input array.
Do NOT modify, summarize, or skip ANY of the provided scriptLine texts. Copy them verbatim to your output.

**TASK**
For each input scriptLine, generate a JSON object with:
1. "scriptLine": (VERBATIM from input)
${promptGenerationInstruction}`;

    // 3. BATCH PROCESSING
    const BATCH_SIZE = 6;
    const batches: string[][] = [];
    for (let i = 0; i < sceneLines.length; i += BATCH_SIZE) {
        batches.push(sceneLines.slice(i, i + BATCH_SIZE));
    }

    const finalScenes: any[] = new Array(sceneLines.length);
    let completedCount = 0;

    yield {
        type: 'progress',
        scenes: [],
        progress: 15,
        status: `Đang sinh prompt real-time (0/${sceneLines.length} cảnh)...`
    };

    const generators: AsyncGenerator<{ index: number, scene: any }>[] = batches.map((batch, batchIdx) =>
        generateBatchStream(
            batch,
            batchSystemInstruction,
            promptGenerationInstruction,
            modelName,
            apiKey,
            kymaKey,
            kymaModelName
        )
    );

    type ProgressEvent = { type: 'progress', scenes: any[], progress: number, status: string };

    async function* consumeGenerator(batchIdx: number): AsyncGenerator<ProgressEvent> {
        const gen = generators[batchIdx];
        try {
            for await (const { index, scene } of gen) {
                const globalIdx = batchIdx * BATCH_SIZE + index;
                finalScenes[globalIdx] = {
                    scriptLine: sceneLines[globalIdx],
                    imagePrompt: (styleLock && scene.imagePrompt) ? `${styleLock}, ${scene.imagePrompt}` : (scene.imagePrompt || ""),
                    videoPrompt: (styleLock && scene.videoPrompt) ? `${styleLock}, ${scene.videoPrompt}` : (scene.videoPrompt || "")
                };
                completedCount++;
                yield {
                    type: 'progress',
                    scenes: [...finalScenes.filter(Boolean)],
                    progress: Math.floor((completedCount / sceneLines.length) * 85) + 15,
                    status: `Đang sinh prompt real-time (${completedCount}/${sceneLines.length} cảnh)...`
                };
            }
        } catch (e) {
            console.warn(`Batch ${batchIdx} failed:`, e);
        }
    }

    async function* mergeGenerators() {
        const pending: AsyncGenerator<ProgressEvent>[] = generators.map((_, i) => consumeGenerator(i));
        const iters = pending.map(g => g[Symbol.asyncIterator]());

        type NextResult = { idx: number, result: IteratorResult<ProgressEvent> };
        const activePromises = new Map<number, Promise<NextResult>>();
        for (let i = 0; i < iters.length; i++) {
            const p = iters[i].next().then(r => ({ idx: i, result: r }));
            activePromises.set(i, p);
        }

        while (activePromises.size > 0) {
            const winner = await Promise.race(activePromises.values());
            activePromises.delete(winner.idx);
            if (!winner.result.done && winner.result.value) {
                yield winner.result.value;
            }
            if (!winner.result.done) {
                const p = iters[winner.idx].next().then(r => ({ idx: winner.idx, result: r }));
                activePromises.set(winner.idx, p);
            }
        }
    }

    for await (const evt of mergeGenerators()) {
        yield evt;
    }

    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < sceneLines.length) {
        const missingCount = sceneLines.length - filledCount;
        console.warn(`Stream thiếu ${missingCount} cảnh. Fill placeholder.`);
        for (let i = 0; i < sceneLines.length; i++) {
            if (!finalScenes[i]) {
                finalScenes[i] = {
                    scriptLine: sceneLines[i],
                    imagePrompt: styleLock ? `${styleLock}, scene placeholder` : "scene placeholder",
                    videoPrompt: styleLock ? `${styleLock}, video placeholder` : "video placeholder"
                };
            }
        }
    }

    yield {
        type: 'final',
        scenes: finalScenes,
        provider: finalProvider,
        model: finalModel,
        totalCount: sceneLines.length
    };
};
