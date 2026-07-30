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
    kymaModelName: string = "qwen-3.7-flash"
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
    kymaModelName: string = "qwen-3.7-flash"
): AsyncGenerator<{ index: number, scene: any }> {
    // Provider đơn nhất: nếu có Kyma → dùng Kyma, ngược lại → dùng Gemini.
    // Học từ auto-edit-video-main:
    //   - Kyma path: synchronous call → parse 1 lần (auto-edit-video-main cũng làm vậy)
    //   - Gemini path: synchronous call → parse 1 lần (BỎ streaming vì Gemini SDK streaming
    //     gây chunk parse phức tạp, không đáng cho 5-10 scenes/batch)
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
        // Dùng parseSceneArrayFromBuffer (robust, handle edge cases)
        const scenes = parseSceneArrayFromBuffer(content, scenesBatch.length);
        if (scenes.length === 0) {
            throw new Error("Kyma trả về JSON không chứa scene hợp lệ.");
        }
        for (let i = 0; i < scenes.length; i++) {
            yield { index: i, scene: scenes[i] };
        }
        return;
    }

    // NON-STREAMING Gemini path (học auto-edit-video-main strategies/prompt_service.py::_call_batch_async)
    // Lý do bỏ streaming:
    //   - Gemini SDK streaming trả chunks NHỎ → parser regex fail với string chứa "}"
    //   - Yield progress từng scene phức tạp, không cần thiết cho 5 scenes/batch
    //   - Synchronous call + parallel batches cho UI progress mượt hơn
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
    const RETRYABLE_PATTERNS = ['429', '500', '503', 'unavailable', 'timeout', 'fetch failed', 'econnreset', 'rate limit'];
    const isRetryable = (e: any) => {
        const msg = String(e?.message || e || '').toLowerCase();
        return RETRYABLE_PATTERNS.some(p => msg.includes(p));
    };

    // Pattern học từ _call_batch_async:
    //   - max_retries = 4
    //   - exponential backoff mạnh: 3s, 8s, 15s, 25s, 40s — giảm risk 429 khi batch nặng
    //   - Model fallback: 429/404 → đổi model tiếp theo trong chain
    const MAX_RETRIES = 5;
    let lastError: any = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 3s, 8s, 15s, 25s, 40s — phù hợp cho Gemini free-tier quota window
        const delayMs = attempt === 0 ? 3000 : 3000 + (attempt * 5000);
        try {
            const response = await ai.models.generateContent({
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
            const text = response.text || '';
            if (!text) {
                throw new Error("Gemini trả response rỗng (text='').");
            }
            const scenes = parseSceneArrayFromBuffer(text, scenesBatch.length);
            if (scenes.length === 0) {
                throw new Error(`Gemini trả về JSON không chứa scene hợp lệ (text=${text.length} chars).`);
            }
            for (let i = 0; i < scenes.length; i++) {
                yield { index: i, scene: scenes[i] };
            }
            return;
        } catch (e) {
            lastError = e;
            if (!isRetryable(e) || attempt === MAX_RETRIES - 1) {
                console.error(`Batch Gemini failed (sau ${attempt + 1} attempts):`, e);
                throw e;
            }
            console.warn(`Batch Gemini attempt ${attempt + 1}/${MAX_RETRIES} failed (${(e as Error)?.message || e}); retrying in ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastError || new Error("Batch failed after all retries");
};

/**
 * Parse JSON array từ buffer streaming. Học từ auto-edit-video-main
 * ai_prompts.py::_parse_array().
 *
 * Ưu tiên:
 *   1. JSON.parse trực tiếp (nếu buffer là JSON thuần)
 *   2. Bóc ```json ... ``` wrapper
 *   3. Rút [ ... ] đầu tiên → JSON.parse
 *   4. Best-effort: rút các { ... } riêng lẻ (fallback)
 *   5. Trả [] nếu tất cả fail
 */
const parseSceneArrayFromBuffer = (rawText: string, expectedCount: number): any[] => {
    let text = (rawText || '').trim();

    // 1) Bóc markdown wrapper ```json ... ```
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    // 2) Thử JSON.parse trực tiếp
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.slice(0, expectedCount);
    } catch { /* fallthrough */ }

    // 3) Tìm [ ... ] trong text (AI đôi khi trả prefix)
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        const slice = text.slice(firstBracket, lastBracket + 1);
        try {
            const parsed = JSON.parse(slice);
            if (Array.isArray(parsed)) return parsed.slice(0, expectedCount);
        } catch { /* fallthrough */ }
    }

    // 4) Best-effort: rút từng { ... } object (dùng non-greedy match
    //    KHÔNG bị stuck khi string chứa } bên trong — dùng parser
    //    từng ký tự)
    const objects = parseObjectsFromText(text);
    if (objects.length > 0) return objects.slice(0, expectedCount);

    return [];
};

/**
 * Parse các JSON object từ text brute-force: duyệt từng ký tự,
 * đếm `{` và `}` (bỏ qua nếu trong string literal), tách object.
 * An toàn với "}" bên trong string.
 */
const parseObjectsFromText = (text: string): any[] => {
    const objects: any[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }

        if (inString) continue;

        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                const objStr = text.slice(start, i + 1);
                try {
                    objects.push(JSON.parse(objStr));
                } catch { /* skip malformed */ }
                start = -1;
            }
        }
    }

    return objects;
};

/**
 * Per-scene retry: gọi AI riêng từng scene bị thiếu (batch=1).
 * Học pattern từ auto-edit-video-main/services/prompt_service.py:
 *   _call_batch_async detect empty_idx trong batch → retry.
 * Ở đây ta tách luôn: nếu streaming batch bị fail/empty → gọi lại
 * TỪNG scene với batch_size=1 → tăng tỉ lệ thành công gần 100%.
 *
 * Returns array of {scriptLine, imagePrompt, videoPrompt} | null (null = still failed)
 */
const retryMissingScenesOneByOne = async (
    missingIndices: number[],
    allLines: string[],
    systemInstruction: string,
    promptGenerationInstruction: string,
    styleLock: string,
    modelName: string,
    apiKey: string,
    kymaKey?: string,
    kymaModelName: string = 'gpt-4o-mini'
): Promise<(any | null)[]> => {
    const results: (any | null)[] = [];
    // Limit concurrency to 3 to avoid hammering Gemini
    const CONCURRENT_RETRY = 3;
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (cursor < missingIndices.length) {
            const idx = cursor++;
            const sceneIdx = missingIndices[idx];
            const line = allLines[sceneIdx];
            try {
                const gen = generateBatchStream(
                    [line], systemInstruction, promptGenerationInstruction,
                    modelName, apiKey, kymaKey, kymaModelName
                );
                for await (const { scene } of gen) {
                    results[idx] = {
                        scriptLine: line,
                        imagePrompt: (styleLock && scene.imagePrompt) ? `${styleLock}, ${scene.imagePrompt}` : (scene.imagePrompt || ""),
                        videoPrompt: (styleLock && scene.videoPrompt) ? `${styleLock}, ${scene.videoPrompt}` : (scene.videoPrompt || "")
                    };
                    break; // Only first scene needed
                }
                // If generator yielded nothing → still null
                if (!results[idx]) results[idx] = null;
            } catch (e) {
                console.warn(`Per-scene retry cảnh ${sceneIdx + 1} failed:`, e);
                results[idx] = null;
            }
        }
    };

    const workers = Array(Math.min(CONCURRENT_RETRY, missingIndices.length))
        .fill(0).map(() => worker());
    await Promise.all(workers);
    return results;
};

const fetchSceneAnchors = async (
    sentences: Sentence[],
    targetSceneCount: number,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "qwen-3.7-flash"
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
    kymaModelName: string = "qwen-3.7-flash"
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
        promptGenerationInstruction = `2. "imagePrompt": A self-contained, highly detailed visual description for a static image, optimized for Google Nano Banana (Gemini Image Models).
${commonStyleInjection}
   - **NO PARAMETERS**: Do not use Midjourney parameters (like --v 6.0, --ar 16:9). Use natural, descriptive English only.${characterDictionaryStr}
   - **VISUAL FIDELITY**: Focus on soft lighting, rich textures, and a clean composition suitable for the "Nano Banana" model (high adherence to prompt).
   - **ACTION & MOOD**: Describe the scene action and atmosphere vividly based on the script context.`;
    } else {
        promptGenerationInstruction = `2. "videoPrompt": A highly detailed video generation prompt optimized for Google Veo 3 (approx 8 seconds).
${commonStyleInjection}${characterDictionaryStr}
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

    // Kyma thì khỏe (5 luồng), Gemini free-tier chỉ 2 để né 429
    const MAX_CONCURRENCY = Math.min(kymaKey ? 5 : 2, batches.length);
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
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "qwen-3.7-flash"
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
        promptType, styleLock, characterDictionaryStr
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

    // Kyma thì khỏe (5 luồng), Gemini free-tier chỉ 2 để né 429
    const MAX_CONCURRENCY = Math.min(kymaKey ? 5 : 2, batches.length);
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

    // Fix #3: Nếu stream bị ngắt giữa chừng → retry TỪNG scene lẻ trước khi fill placeholder
    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < segmentedLines.length) {
        const missingIndices: number[] = [];
        for (let i = 0; i < segmentedLines.length; i++) {
            if (!finalScenes[i]) missingIndices.push(i);
        }
        const missingCount = missingIndices.length;
        console.warn(`Stream chỉ nhận ${filledCount}/${segmentedLines.length} scenes, đang retry ${missingCount} scenes lẻ (one-by-one)...`);

        // Per-scene retry: gọi AI riêng từng scene với batch_size=1
        const retryResults = await retryMissingScenesOneByOne(
            missingIndices, segmentedLines,
            batchSystemInstruction, promptGenerationInstruction,
            styleLock, modelName, apiKey, kymaKey, kymaModelName
        );

        for (let k = 0; k < missingIndices.length; k++) {
            const sceneIdx = missingIndices[k];
            if (retryResults[k]) {
                finalScenes[sceneIdx] = retryResults[k];
            } else {
                // Vẫn fail → placeholder
                finalScenes[sceneIdx] = {
                    scriptLine: segmentedLines[sceneIdx],
                    imagePrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)",
                    videoPrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)"
                };
            }
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
    characterDictionaryStr: string
): string => {
    const commonStyleInjection = `   - **STYLE INJECTION**: Analyze the attached Reference Images (if any). Extract their art style (e.g., color palette, lighting key, texture, rendering style) and apply it to the scene description.`;

    if (promptType === 'image') {
        return `2. "imagePrompt": A self-contained, highly detailed visual description for a static image, optimized for Google Nano Banana (Gemini Image Models).
${commonStyleInjection}
   - **NO PARAMETERS**: Do not use Midjourney parameters (like --v 6.0, --ar 16:9). Use natural, descriptive English only.${characterDictionaryStr}
   - **VISUAL FIDELITY**: Focus on soft lighting, rich textures, and a clean composition suitable for the "Nano Banana" model (high adherence to prompt).
   - **ACTION & MOOD**: Describe the scene action and atmosphere vividly based on the script context.`;
    } else {
        return `2. "videoPrompt": A highly detailed video generation prompt optimized for Google Veo 3 (approx 8 seconds).
${commonStyleInjection}${characterDictionaryStr}
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
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "qwen-3.7-flash",
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
        promptType, styleLock, characterDictionaryStr
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
    const BATCH_SIZE = 5;
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
        // Kyma khỏe thì 5, Gemini Free thì 2 để tránh 429
        const MAX_CONCURRENT = kymaKey ? 5 : 2;
        const pending: AsyncGenerator<ProgressEvent>[] = generators.map((_, i) => consumeGenerator(i));
        const iters = pending.map(g => g[Symbol.asyncIterator]());

        type NextResult = { idx: number, result: IteratorResult<ProgressEvent> };
        const activePromises = new Map<number, Promise<NextResult>>();
        // Start at most MAX_CONCURRENT generators to avoid hitting Gemini rate limits
        // when total batches > MAX_CONCURRENT (e.g. 75 scenes / BATCH_SIZE 4 = 19 batches).
        for (let i = 0; i < Math.min(MAX_CONCURRENT, iters.length); i++) {
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
            } else if (winner.idx + MAX_CONCURRENT < iters.length) {
                const nextIdx = winner.idx + MAX_CONCURRENT;
                const p = iters[nextIdx].next().then(r => ({ idx: nextIdx, result: r }));
                activePromises.set(nextIdx, p);
            }
        }
    }

    for await (const evt of mergeGenerators()) {
        yield evt;
    }

    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < segmentedLines.length) {
        const missingIndices: number[] = [];
        for (let i = 0; i < segmentedLines.length; i++) {
            if (!finalScenes[i]) missingIndices.push(i);
        }
        const missingCount = missingIndices.length;
        console.warn(`Stream thiếu ${missingCount} cảnh. Retry từng scene lẻ...`);

        const retryResults = await retryMissingScenesOneByOne(
            missingIndices, segmentedLines,
            batchSystemInstruction, promptGenerationInstruction,
            styleLock, modelName, apiKey, kymaKey, kymaModelName
        );

        for (let k = 0; k < missingIndices.length; k++) {
            const sceneIdx = missingIndices[k];
            if (retryResults[k]) {
                finalScenes[sceneIdx] = retryResults[k];
            } else {
                finalScenes[sceneIdx] = {
                    scriptLine: segmentedLines[sceneIdx],
                    imagePrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)",
                    videoPrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)"
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
    kymaModelName: string = 'qwen-3.7-flash'
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
    enableCharacterConsistency: boolean = false,
    scriptContext: string = '',
    kymaKey?: string,
    kymaModelName: string = 'qwen-3.7-flash'
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
        promptType, styleLock, characterDictionaryStr
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
    const BATCH_SIZE = 5;
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
        // Kyma khỏe thì 5, Gemini Free thì 2 để tránh 429
        const MAX_CONCURRENT = kymaKey ? 5 : 2;
        const pending: AsyncGenerator<ProgressEvent>[] = generators.map((_, i) => consumeGenerator(i));
        const iters = pending.map(g => g[Symbol.asyncIterator]());

        type NextResult = { idx: number, result: IteratorResult<ProgressEvent> };
        const activePromises = new Map<number, Promise<NextResult>>();
        // Start at most MAX_CONCURRENT generators to avoid hitting Gemini rate limits
        // when total batches > MAX_CONCURRENT (e.g. 75 scenes / BATCH_SIZE 4 = 19 batches).
        for (let i = 0; i < Math.min(MAX_CONCURRENT, iters.length); i++) {
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
            } else if (winner.idx + MAX_CONCURRENT < iters.length) {
                const nextIdx = winner.idx + MAX_CONCURRENT;
                const p = iters[nextIdx].next().then(r => ({ idx: nextIdx, result: r }));
                activePromises.set(nextIdx, p);
            }
        }
    }

    for await (const evt of mergeGenerators()) {
        yield evt;
    }

    const filledCount = finalScenes.filter(Boolean).length;
    if (filledCount < sceneLines.length) {
        const missingIndices: number[] = [];
        for (let i = 0; i < sceneLines.length; i++) {
            if (!finalScenes[i]) missingIndices.push(i);
        }
        const missingCount = missingIndices.length;
        console.warn(`Stream thiếu ${missingCount} cảnh. Retry từng scene lẻ...`);

        const retryResults = await retryMissingScenesOneByOne(
            missingIndices, sceneLines,
            batchSystemInstruction, promptGenerationInstruction,
            styleLock, modelName, apiKey, kymaKey, kymaModelName
        );

        for (let k = 0; k < missingIndices.length; k++) {
            const sceneIdx = missingIndices[k];
            if (retryResults[k]) {
                finalScenes[sceneIdx] = retryResults[k];
            } else {
                finalScenes[sceneIdx] = {
                    scriptLine: sceneLines[sceneIdx],
                    imagePrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)",
                    videoPrompt: styleLock ? `${styleLock}, (placeholder - AI retry failed)` : "(placeholder - AI retry failed)"
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
