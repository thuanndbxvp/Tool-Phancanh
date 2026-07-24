# HƯỚNG DẪN THỰC THI CHI TIẾT LỖI P1 (MSEW-P1-fixes)
**Role:** Tier 2 Coder
**Lưu ý:** Copy và paste code chính xác 100%. Đọc kỹ từng dòng thay thế.

---

## BƯỚC 1: XỬ LÝ `textSegmentation.ts` (Task 1)

Mở file `src/utils/textSegmentation.ts`. 
Tìm hàm `tokenizeSentences` và **thay thế toàn bộ** bằng đoạn code tối ưu vòng lặp sau:

```typescript
export const tokenizeSentences = (text: string): Sentence[] => {
    if (!text) return [];
    
    let segmenter: Intl.Segmenter;
    try {
        segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });
    } catch {
        // Fallback an toàn cho trình duyệt cũ (Safari < 14)
        return text.match(/[^.!?\n]+[.!?\n]+/g)?.map(s => s.trim()).filter(Boolean)
            .map((t, i) => ({ idx: i, text: t, wordCount: t.split(/\s+/).filter(w => w.length > 0).length })) || [];
    }
    
    const result: Sentence[] = [];
    let idx = 0;
    
    // Tối ưu 1 vòng lặp duy nhất thay cho chain.map.filter.map
    for (const seg of segmenter.segment(text)) {
        const trimmed = seg.segment.trim();
        if (trimmed.length === 0) continue;
        const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
        result.push({ idx: idx++, text: trimmed, wordCount });
    }
    
    return result;
};
```

---

## BƯỚC 2: XỬ LÝ `geminiService.ts` (Task 2, 3, 4, 5)

Mở file `src/services/geminiService.ts`.

### 2.1 Cập nhật khai báo hàm `generateBatch` và `fetchSceneAnchors`
Thêm tham số `onFallback?: () => void` vào cuối danh sách biến của 2 hàm này.

**Đối với `generateBatch` (dòng ~37):**
```typescript
export const generateBatch = async (
    batch: string[],
    systemInstruction: string,
    promptGenerationInstruction: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash",
    onFallback?: () => void
): Promise<any[]> => {
```
*Bên trong `generateBatch`, tìm đoạn `catch` của Kyma (khoảng dòng 129) và gọi callback:*
```typescript
    if (kymaKey) {
        try {
            return await withRetry(() => attemptKyma(kymaKey));
        } catch (e) {
            console.warn("Kyma failed for batch, falling back...", e);
            if (onFallback) onFallback();
        }
    }
```

**Đối với `fetchSceneAnchors` (dòng ~150):**
```typescript
const fetchSceneAnchors = async (
    sentences: Sentence[],
    targetSceneCount: number,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash",
    onFallback?: () => void
): Promise<{ fromSentenceIdx: number, toSentenceIdx: number }[]> => {
```
*Bên trong `fetchSceneAnchors`, tìm đoạn `catch` của Kyma và gọi callback:*
```typescript
    if (kymaKey) {
        try { 
            return await withRetry(() => attemptKyma(kymaKey)); 
        } catch (e) { 
            console.warn("Kyma failed for anchors, falling back...", e); 
            if (onFallback) onFallback();
        }
    }
```

### 2.2 Đại tu khối `analyzeScriptWithAI`

Đến hàm chính `analyzeScriptWithAI`. Khai báo biến ghi nhận Provider thực tế ở ngay đầu hàm:
```typescript
export const analyzeScriptWithAI = async (
    script: string,
    targetSceneCount: number,
    modelName: string,
    apiKey: string,
    kymaKey: string,
    kymaModelName: string,
    segmentationMode: 'ai' | 'punctuation' | 'fixed',
    styleLock?: string,
    onProgress?: (scenes: any[], progress: number, status: string) => void
) => {
    let finalProvider = kymaKey ? "Kyma" : "Gemini";
    let finalModel = kymaKey ? kymaModelName : modelName;

    const triggerFallback = () => {
        finalProvider = "Gemini";
        finalModel = modelName;
    };
```

**Thay thế logic Chunking cho Script > 1000 câu (đoạn xử lý `segmentationMode === 'ai'`):**
```typescript
    if (segmentationMode === 'ai') {
        if (onProgress) onProgress([], 5, "Đang dùng AI phân tích điểm neo...");
        
        let anchors: any[] = [];
        // Áp dụng Chunking cho script siêu dài
        if (sentences.length > 1000) {
            const CHUNK_SIZE = 800;
            const chunks = [];
            for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
                chunks.push(sentences.slice(i, i + CHUNK_SIZE));
            }
            
            let offset = 0;
            for (const chunk of chunks) {
                // Tính toán số lượng cảnh mục tiêu cho từng phần dựa trên tỉ lệ độ dài
                const chunkTarget = Math.max(1, Math.round((chunk.length / sentences.length) * targetSceneCount));
                const chunkAnchors = await fetchSceneAnchors(chunk, chunkTarget, modelName, apiKey, kymaKey, kymaModelName, triggerFallback);
                
                anchors = anchors.concat(
                    chunkAnchors.map(a => ({
                        ...a,
                        fromSentenceIdx: a.fromSentenceIdx + offset,
                        toSentenceIdx: a.toSentenceIdx + offset
                    }))
                );
                offset += chunk.length;
            }
        } else {
            anchors = await fetchSceneAnchors(sentences, targetSceneCount, modelName, apiKey, kymaKey, kymaModelName, triggerFallback);
        }

        segmentedLines = segmentByIndex(sentences, anchors);
        
        // ... (Giữ nguyên logic fallback water-filling nếu có) ...
```

**Thay thế Queue Worker + Math.min thay cho Set + Promise.race (đoạn cuối hàm, từ sau `const runBatch = ...`):**
Cập nhật lại tham số khi gọi `generateBatch`:
```typescript
        const batchResults = await generateBatch(
            batch,
            "", 
            promptGenerationInstruction,
            modelName,
            apiKey,
            kymaKey,
            kymaModelName,
            triggerFallback // <--- Truyền callback vào
        );
```

Và thay toàn bộ cơ chế Queue ở đoạn cuối thành:
```typescript
    // Tối ưu Concurrency động và dùng Queue Worker an toàn tuyệt đối
    const MAX_CONCURRENCY = Math.min(5, batches.length);
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

    // Trả về đúng provider thực tế đã chạy
    return { scenes: finalScenes.filter(Boolean), provider: finalProvider, model: finalModel };
};
```

---
**END OF SPECIFICATION**
Coder Tier 2 hãy bắt tay vào thực thi ngay lập tức. Cứ copy đè là chạy!
