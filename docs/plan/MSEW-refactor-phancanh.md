# TÀI LIỆU HƯỚNG DẪN THỰC THI CHI TIẾT (MSEW-refactor-phancanh)
**Role:** Tier 2 Coder
**Lưu ý:** Copy và paste code chính xác 100%. Không tự ý rút gọn.

---

## KHỐI 1: TẠO CÁC TIỆN ÍCH (UTILITIES)

### 1.1. Tạo file `src/utils/srtParser.ts` (Giai đoạn 4)
Tạo mới file này để dọn dẹp file SRT triệt để:
```typescript
export const parseSRT = (content: string): string => {
  return content
    .replace(/^\d+$/gm, '')                                    // Xoá số thứ tự dòng
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '') // Xoá timestamp
    .replace(/<[^>]+>/g, '')                                   // Xoá thẻ HTML
    .replace(/\{[^}]+\}/g, '')                                 // Xoá style e.g {italic}
    .replace(/\n{3,}/g, '\n\n')                                // Chuẩn hoá khoảng trắng
    .trim();
};
```

### 1.2. Tạo file `src/utils/cache.ts` (Giai đoạn 3)
Tạo mới file này để cache Character Dictionary, giảm thiểu gọi API dư thừa:
```typescript
// Băm chuỗi đơn giản để tạo Hash
const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return hash.toString();
};

export const Cache = {
    charDict: new Map<string, { hash: string, data: string }>(),

    getCharacters(script: string, model: string): string | null {
        const hash = hashString(script + model);
        const cached = this.charDict.get(script.substring(0, 200));
        if (cached && cached.hash === hash) return cached.data;
        return null;
    },

    setCharacters(script: string, model: string, data: string) {
        const hash = hashString(script + model);
        this.charDict.set(script.substring(0, 200), { hash, data });
    }
};
```

### 1.3. Tạo file `src/utils/textSegmentation.ts` (Giai đoạn 1)
Tạo file này để thay thế hoàn toàn logic băm chuỗi bằng Regex cũ:
```typescript
export interface Sentence {
    idx: number;
    text: string;
    wordCount: number;
}

export const tokenizeSentences = (text: string): Sentence[] => {
    if (!text) return [];
    // Sử dụng bộ băm chuẩn của trình duyệt (cực tốt cho tiếng Việt)
    const segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(text));
    
    return segments
        .map(s => s.segment.trim())
        .filter(s => s.length > 0)
        .map((text, idx) => ({
            idx,
            text,
            wordCount: text.split(/\s+/).filter(w => w.length > 0).length
        }));
};

export const segmentByWaterFilling = (sentences: Sentence[], targetSceneCount: number): string[] => {
    if (sentences.length === 0) return [];
    
    const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
    const idealWords = Math.max(1, totalWords / targetSceneCount);
    
    const scenes: string[] = [];
    let currentScene: string[] = [];
    let currentWords = 0;
    
    for (let i = 0; i < sentences.length; i++) {
        currentScene.push(sentences[i].text);
        currentWords += sentences[i].wordCount;
        
        if (currentWords >= idealWords && scenes.length < targetSceneCount - 1) {
            scenes.push(currentScene.join(' '));
            currentScene = [];
            currentWords = 0;
        }
    }
    
    if (currentScene.length > 0) {
        scenes.push(currentScene.join(' '));
    }
    return scenes;
};

export const segmentByIndex = (sentences: Sentence[], aiIndices: { fromSentenceIdx: number, toSentenceIdx: number }[]): string[] => {
    const scenes: string[] = [];
    let lastHandledIdx = -1;

    for (let i = 0; i < aiIndices.length; i++) {
        let fromIdx = aiIndices[i].fromSentenceIdx;
        let toIdx = aiIndices[i].toSentenceIdx;
        
        if (fromIdx > lastHandledIdx + 1) fromIdx = lastHandledIdx + 1;
        if (toIdx < fromIdx) toIdx = fromIdx;
        if (toIdx >= sentences.length) toIdx = sentences.length - 1;
        if (i === aiIndices.length - 1) toIdx = sentences.length - 1;

        const sceneTexts = sentences.slice(fromIdx, toIdx + 1).map(s => s.text);
        scenes.push(sceneTexts.join(' '));
        lastHandledIdx = toIdx;
    }
    return scenes;
};
```

---

## KHỐI 2: REFACTOR GEMINISERVICE.TS (Giai đoạn 2 & 3)

Mở `src/services/geminiService.ts`. Xoá import cũ `segmentScript`, `segmentByAnchors`, v.v. Thay bằng:
```typescript
import { tokenizeSentences, segmentByWaterFilling, segmentByIndex, Sentence } from "../utils/textSegmentation";
import { Cache } from "../utils/cache";
```

### 2.1. Thêm hàm `withRetry` (Dòng đầu file)
```typescript
const withRetry = async <T>(fn: () => Promise<T>, retries: number = 2, delayMs: number = 2000): Promise<T> => {
    for (let r = 0; r <= retries; r++) {
        try {
            return await fn();
        } catch (e) {
            if (r === retries) throw e;
            await new Promise(res => setTimeout(res, delayMs * (r + 1)));
            console.warn(\`Retry \${r+1}/\${retries} after error:\`, e);
        }
    }
    throw new Error("Unreachable");
};
```

### 2.2. Cập nhật `fetchSceneAnchors` (Dùng Index thay cho String)
Sửa nội dung `fetchSceneAnchors`:
```typescript
const fetchSceneAnchors = async (
    sentences: Sentence[],
    targetSceneCount: number,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash"
): Promise<{ fromSentenceIdx: number, toSentenceIdx: number }[]> => {
    const scriptText = sentences.map(s => \`[\${s.idx}] \${s.text}\`).join('\\n');
    
    const systemInstruction = \`You are a storyboard director. Divide the script into EXACTLY \${targetSceneCount} logical scenes.
The script is provided as a numbered list of sentences: [0] "...", [1] "...".
Return ONLY a JSON array of exactly \${targetSceneCount} objects:
{
  "sceneNumber": 1,
  "fromSentenceIdx": 0,
  "toSentenceIdx": 5
}\`;

    const schemaProperties: any = {
        sceneNumber: { type: Type.INTEGER },
        fromSentenceIdx: { type: Type.INTEGER },
        toSentenceIdx: { type: Type.INTEGER },
    };

    // ... Giữ nguyên logic attemptGemini ...
    
    const attemptKyma = async (key: string) => {
        const response = await fetch('https://kymaapi.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${key}\` },
            body: JSON.stringify({
                model: kymaModelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: \`Script:\\n\\n\${scriptText}\` }
                ],
                temperature: 0.2,
                max_tokens: 8000
            })
        });
        if (!response.ok) throw new Error(\`Kyma API Error: \${response.status}\`);
        const data = await response.json();
        // ... (xử lý parse text giống hệt cũ) ...
        return JSON.parse(text);
    };

    if (kymaKey) {
        try { return await withRetry(() => attemptKyma(kymaKey)); } catch (e) { console.warn("Kyma anchors failed"); }
    }
    if (keyToUse) {
        try { return await withRetry(() => attemptGemini(keyToUse)); } catch (e) { console.warn("Gemini anchors failed"); }
    }
    throw new Error("Lỗi phân tích điểm neo (Anchors).");
};
```

### 2.3. Áp dụng Cache vào `fetchCharacterDictionary`
Trong `fetchCharacterDictionary`, bao bọc API bằng Cache:
```typescript
    const cached = Cache.getCharacters(script, kymaKey ? kymaModelName : modelName);
    if (cached) return cached;
    
    // ... gọi API ...
    
    // Sau khi có kết quả (trước khi return text)
    Cache.setCharacters(script, kymaKey ? kymaModelName : modelName, text);
    return text;
```
Nhớ thêm `max_tokens: 8000` vào `body` của `attemptKyma` trong hàm này.

### 2.4. Đại phẫu `analyzeScriptWithAI` (Song song + Validations)
Cập nhật phần đầu (Pre-segmentation):
```typescript
    const sentences = tokenizeSentences(script);
    let segmentedLines: string[] = [];

    if (segmentationMode === 'ai') {
        if (onProgress) onProgress([], 5, "Đang dùng AI phân tích điểm neo...");
        // Bỏ logic chunk text thô đi, giờ truyền mảng sentences vào thẳng.
        // Nếu sentences quá dài (vd > 1000 câu), mới cần chunk mảng sentences. Tạm thời cứ pass thẳng.
        const anchors = await fetchSceneAnchors(sentences, targetSceneCount, modelName, apiKey, kymaKey, kymaModelName);
        segmentedLines = segmentByIndex(sentences, anchors);
        
        // Validation: Nếu AI trả thiếu số lượng, fallback tự băm bằng Water-filling phần còn thiếu.
        if (segmentedLines.length < targetSceneCount) {
             console.warn("AI trả thiếu cảnh, đang fallback...");
             // (Logic auto-fill)
        }
    } else if (segmentationMode === 'punctuation') {
        segmentedLines = sentences.map(s => s.text);
    } else {
        segmentedLines = segmentByWaterFilling(sentences, targetSceneCount);
    }
```

Cập nhật phần vòng lặp sinh Prompt (Parallel):
```typescript
    const batches = [];
    for (let i = 0; i < segmentedLines.length; i += BATCH_SIZE) {
        batches.push(segmentedLines.slice(i, i + BATCH_SIZE));
    }

    const MAX_CONCURRENCY = 3;
    let finalScenes: any[] = new Array(segmentedLines.length);
    let completedScenesCount = 0;

    const runBatch = async (batchIdx: number) => {
        const batch = batches[batchIdx];
        // Đảm bảo generateBatch có max_tokens: 8000 và withRetry
        const batchResults = await generateBatch(batch, "", promptGenerationInstruction, modelName, apiKey, kymaKey, kymaModelName);
        
        for (let j = 0; j < batch.length; j++) {
            const aiResult = batchResults[j] || {};
            const rawImagePrompt = aiResult.imagePrompt || "";
            const rawVideoPrompt = aiResult.videoPrompt || "";
            
            finalScenes[batchIdx * BATCH_SIZE + j] = {
                scriptLine: batch[j],
                imagePrompt: (styleLock && rawImagePrompt) ? \`\${styleLock}, \${rawImagePrompt}\` : rawImagePrompt,
                videoPrompt: (styleLock && rawVideoPrompt) ? \`\${styleLock}, \${rawVideoPrompt}\` : rawVideoPrompt
            };
        }
        
        completedScenesCount += batch.length;
        if (onProgress) {
            const progress = Math.floor(((completedScenesCount / segmentedLines.length) * 85) + 15);
            onProgress([...finalScenes.filter(Boolean)], progress, \`Đang sinh prompt (\${completedScenesCount}/\${segmentedLines.length} cảnh)...\`);
        }
    };

    const executing = new Set<Promise<void>>();
    for (let i = 0; i < batches.length; i++) {
        const p = runBatch(i).finally(() => executing.delete(p));
        executing.add(p);
        if (executing.size >= MAX_CONCURRENCY) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);

    return { scenes: finalScenes.filter(Boolean), provider: usedProvider, model: usedModel };
```

---
**END OF SPECIFICATION**
Coder Tier 2 hãy đọc kỹ, thực thi và kiểm tra Linter cẩn thận.
