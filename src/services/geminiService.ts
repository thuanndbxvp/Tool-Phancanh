import { GoogleGenAI, Type } from "@google/genai";
import { segmentScript, segmentByAnchors, SceneAnchor } from "../utils/helpers";

const getFallbackKeys = () => {
    const encKeys = [
        "azNNaDRTQXZpTG44a19WWTludkVrV2laVjRUaHVFM3FDeVNheklB"  // Key 2
    ];
    return encKeys.map(enc => atob(enc).split('').reverse().join(''));
};

const FALLBACK_API_KEYS = getFallbackKeys();
const FALLBACK_KYMA_KEY = atob("ZWl5Q3htQVVYWmt2Q1dFRlBKNmZmZHd1dGlxR1BNY3F6dWRxYTdybGl3SUFpQ0MyLWtz").split('').reverse().join('');

export const validateApiKey = async (apiKey: string, modelName: string = 'gemini-3-flash-preview'): Promise<boolean> => {
    try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({
            model: modelName,
            contents: 'ping',
        });
        return true;
    } catch (error) {
        console.error("Key Validation Failed:", error);
        return false;
    }
};

const BATCH_SIZE = 5;

// Batched AI generation to avoid token limits and skipped text
const generateBatch = async (
    scenesBatch: string[], 
    systemInstruction: string,
    promptGenerationInstruction: string,
    modelName: string, 
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini"
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

    const attemptGemini = async (key: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelName,
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
        return JSON.parse(text.trim());
    };

    const attemptKyma = async (key: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: kymaModelName,
                messages: [
                    { role: 'system', content: batchSystemInstruction },
                    { role: 'user', content: `Generate prompts for these lines:\n${batchInput}` }
                ],
                temperature: 0.7
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
        return JSON.parse(text);
    };

    if (kymaKey) {
        try {
            return await attemptKyma(kymaKey);
        } catch (e) {
            console.warn("Kyma failed for batch, falling back...", e);
        }
    }

    if (keyToUse) {
        try {
            return await attemptGemini(keyToUse);
        } catch (e) {
            console.warn("User key failed for batch, falling back...", e);
        }
    }

    const platformKey = process.env.GEMINI_API_KEY;
    if (platformKey) {
        try {
            return await attemptGemini(platformKey);
        } catch(e) {}
    }

    for (const fb of FALLBACK_API_KEYS) {
        try {
            return await attemptGemini(fb);
        } catch(e) {}
    }
    
    try {
        return await attemptKyma(FALLBACK_KYMA_KEY);
    } catch(e) {}

    throw new Error("Tất cả API đều lỗi khi xử lý batch.");
};

const fetchSceneAnchors = async (
    script: string,
    targetSceneCount: number,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini"
): Promise<SceneAnchor[]> => {
    const systemInstruction = `You are a storyboard director. Divide the provided script into EXACTLY ${targetSceneCount} logical scenes. 
DO NOT rewrite the script. For each scene, return ONLY:
1. "sceneNumber": The scene number.
2. "startAnchor": The FIRST 5-7 words of the scene EXACTLY as they appear in the script.
3. "endAnchor": The LAST 5-7 words of the scene EXACTLY as they appear in the script.

Your response MUST be a JSON array of objects.`;

    const schemaProperties: any = {
        sceneNumber: { type: Type.INTEGER },
        startAnchor: { type: Type.STRING },
        endAnchor: { type: Type.STRING },
    };
    
    const attemptGemini = async (key: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelName,
            contents: `Script to divide into ${targetSceneCount} scenes:\n\n${script}`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: schemaProperties,
                        required: ["sceneNumber", "startAnchor", "endAnchor"]
                    }
                }
            }
        });
        const text = response.text;
        if (!text) throw new Error("AI không phản hồi.");
        return JSON.parse(text.trim());
    };

    const attemptKyma = async (key: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: kymaModelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Script to divide into ${targetSceneCount} scenes:\n\n${script}` }
                ],
                temperature: 0.2
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
        return JSON.parse(text);
    };

    if (kymaKey) {
        try { return await attemptKyma(kymaKey); } catch (e) { console.warn("Kyma failed for anchors, falling back...", e); }
    }
    if (keyToUse) {
        try { return await attemptGemini(keyToUse); } catch (e) { console.warn("User key failed for anchors, falling back...", e); }
    }
    
    const platformKey = process.env.GEMINI_API_KEY;
    if (platformKey) {
        try { return await attemptGemini(platformKey); } catch(e) {}
    }

    for (const fb of FALLBACK_API_KEYS) {
        try { return await attemptGemini(fb); } catch(e) {}
    }
    try { return await attemptKyma(FALLBACK_KYMA_KEY); } catch(e) {}

    throw new Error("Tất cả API đều lỗi khi phân tích điểm neo.");
};

const fetchCharacterDictionary = async (
    script: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini"
): Promise<string> => {
    const systemInstruction = `You are a script analyst. Read the script and identify the main characters. 
For each character, write a concise 1-sentence visual description (age, gender, hair, clothing, key features) that fits the story.
Return a JSON object where the key is the character's name and the value is their visual description.
Example: {"John": "30yo man, short brown hair, wearing a suit", "Mary": "25yo woman, long blonde hair, red dress"}`;

    const attemptGemini = async (key: string) => {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: modelName,
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

    const attemptKyma = async (key: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: kymaModelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: `Script:\n\n${script}` }
                ],
                temperature: 0.3
            })
        });
        if (!response.ok) throw new Error(`Kyma API Error: ${response.status}`);
        const data = await response.json();
        let text = data.choices[0].message.content;
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            text = match[0];
        } else {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        return text;
    };

    if (kymaKey) {
        try { return await attemptKyma(kymaKey); } catch (e) { console.warn("Kyma failed for characters, falling back...", e); }
    }
    if (keyToUse) {
        try { return await attemptGemini(keyToUse); } catch (e) { console.warn("User key failed for characters, falling back...", e); }
    }
    
    const platformKey = process.env.GEMINI_API_KEY;
    if (platformKey) {
        try { return await attemptGemini(platformKey); } catch(e) {}
    }

    for (const fb of FALLBACK_API_KEYS) {
        try { return await attemptGemini(fb); } catch(e) {}
    }
    try { return await attemptKyma(FALLBACK_KYMA_KEY); } catch(e) {}

    throw new Error("Tất cả API đều lỗi khi phân tích nhân vật.");
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
    
    // 1. PRE-SEGMENTATION IN JS (Fixes Bug 1 & Bug 2)
    if (onProgress) onProgress([], 5, "Đang tiền xử lý kịch bản...");
    let segmentedLines: string[] = [];
    if (segmentationMode === 'ai') {
        if (onProgress) onProgress([], 10, "Đang dùng AI phân tích điểm neo (Phase 1)...");
        const anchors = await fetchSceneAnchors(script, targetSceneCount, modelName, apiKey, kymaKey, kymaModelName);
        segmentedLines = segmentByAnchors(script, anchors);
    } else {
        segmentedLines = segmentScript(script, segmentationMode, targetSceneCount);
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
            // charDict is a JSON string like {"Hung": "..."}
            const parsedDict = JSON.parse(charDict);
            let dictText = "";
            for (const [char, desc] of Object.entries(parsedDict)) {
                dictText += `- ${char}: ${desc}\n`;
            }
            if (dictText) {
                characterDictionaryStr = `\n   - **CHARACTER CONSISTENCY MANDATE**: When any of the following characters appear in the scene, you MUST incorporate their EXACT visual description into your prompt to ensure consistency across all scenes:\n${dictText}`;
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

    // 3. BATCH PROCESSING
    let finalScenes: any[] = [];
    
    // We determine the provider just by checking what key was passed, but the actual provider is resolved per batch.
    // We'll just assume the first successful batch provider is the provider for all.
    let usedProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    let usedModel = kymaKey ? kymaModelName : modelName;

    for (let i = 0; i < segmentedLines.length; i += BATCH_SIZE) {
        const batch = segmentedLines.slice(i, i + BATCH_SIZE);
        const batchResults = await generateBatch(
            batch, 
            "", // System instruction is built in generateBatch
            promptGenerationInstruction, 
            modelName, 
            apiKey, 
            kymaKey, 
            kymaModelName
        );
        
        // Sometimes AI returns fewer or more items despite instructions. 
        // We will map strictly by aligning array indexes if sizes mismatch, but ideally they match.
        for (let j = 0; j < batch.length; j++) {
            const aiResult = batchResults[j] || {};
            
            // Forcefully prepend the style using JS
            const rawImagePrompt = aiResult.imagePrompt || "";
            const rawVideoPrompt = aiResult.videoPrompt || "";
            
            const finalImagePrompt = (styleLock && rawImagePrompt) ? `${styleLock}, ${rawImagePrompt}` : rawImagePrompt;
            const finalVideoPrompt = (styleLock && rawVideoPrompt) ? `${styleLock}, ${rawVideoPrompt}` : rawVideoPrompt;

            finalScenes.push({
                scriptLine: batch[j], // guarantee original script text
                imagePrompt: finalImagePrompt,
                videoPrompt: finalVideoPrompt
            });
        }
        
        if (onProgress) {
            // progress ranges from 10% (after Phase 1) to 100%
            const startProgress = segmentationMode === 'ai' ? 10 : 5;
            const batchProgress = Math.floor(((finalScenes.length / segmentedLines.length) * (100 - startProgress)) + startProgress);
            onProgress([...finalScenes], batchProgress, `Đang sinh prompt (${finalScenes.length}/${segmentedLines.length} cảnh)...`);
        }
    }

    return { scenes: finalScenes, provider: usedProvider, model: usedModel };
};
