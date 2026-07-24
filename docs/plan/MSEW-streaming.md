# MSEW-STREAMING — Streaming Response Real-time (Issue #9)

> **Ngày tạo:** 2026-07-25
> **Tác giả:** TIER2 (Planner không có MSEW sẵn, TIER2 tự tạo ngắn gọn theo TIER2 mục 3)
> **Phạm vi:** Streaming response cho `generateBatch` (Kyma) + Gemini UI tương ứng
> **Yêu cầu gốc:** plan1.md §3.7

---

## MỤC TIÊU

User nhìn thấy cảnh đầu tiên xuất hiện trong ~2-3s thay vì phải đợi cả batch 5 cảnh (~10-15s).

**Hiện tại:** `onProgress` bắn 1 lần / batch (5 cảnh) → user thấy 5 cảnh cùng lúc.
**Mong muốn:** `onProgress` bắn 1 lần / cảnh → user thấy từng cảnh lần lượt.

---

## BƯỚC 1: Thêm `generateBatchStream` cho Gemini (Kyma KHÔNG stream — fallback)

Mở `src/services/geminiService.ts`. Thêm hàm mới ngay sau `generateBatch` cũ:

```typescript
// Streaming variant: trả về từng scene ngay khi Gemini parse xong
const generateBatchStream = async function* (
    scenesBatch: string[],
    systemInstruction: string,
    promptGenerationInstruction: string,
    modelName: string,
    keyToUse: string,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash",
    onFallback?: () => void
): AsyncGenerator<{ index: number, scene: any }> {
    // Kyma không hỗ trợ streaming → fallback sang non-streaming wrapper
    if (kymaKey) {
        try {
            const all = await withRetry(
                (k) => needGenerateBatchKyma(k, scenesBatch, systemInstruction, promptGenerationInstruction, kymaModelName),
                kymaKey
            );
            for (let i = 0; i < all.length; i++) {
                yield { index: i, scene: all[i] };
            }
            return;
        } catch (e) {
            console.warn("Kyma failed for stream batch, falling back to Gemini stream...", e);
            if (onFallback) onFallback();
        }
    }

    // Gemini streaming - dùng generateContentStream
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
                    properties: {
                        scriptLine: { type: Type.STRING },
                        imagePrompt: promptGenerationInstruction.includes("imagePrompt") ? { type: Type.STRING } : undefined,
                        videoPrompt: !promptGenerationInstruction.includes("imagePrompt") ? { type: Type.STRING } : undefined,
                    },
                    required: ["scriptLine"]
                }
            }
        }
    });

    let buffer = '';
    let index = 0;
    for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        buffer += chunkText;
        // Tìm các object JSON hoàn chỉnh trong buffer
        const matches = buffer.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (matches) {
            for (const m of matches) {
                try {
                    const scene = JSON.parse(m);
                    yield { index: index++, scene };
                    // Xóa phần đã yield khỏi buffer
                    buffer = buffer.replace(m, '');
                } catch {
                    // Object chưa hoàn chỉnh, đợi chunk tiếp
                }
            }
        }
    }
};
```

**Lưu ý:** Cần refactor `attemptKyma` ra thành `needGenerateBatchKyma` riêng (shared giữa `generateBatch` cũ và `generateBatchStream` mới) để tránh duplicate code.

---

## BƯỚC 2: Refactor `analyzeScriptWithAI` để dùng streaming

Khai báo `analyzeScriptWithAIStream` mới (giữ hàm cũ làm wrapper backward-compat):

```typescript
export const analyzeScriptWithAIStream = async function* (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string,
    styleLock: string,
    mode: string,
    segmentationMode: 'ai' | 'punctuation' | 'fixed',
    modelName: string,
    targetSceneCount: number,
    promptType: 'image' | 'video',
    aspectRatio: string,
    enableAspectRatio: boolean,
    enableCharacterConsistency: boolean,
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash",
    onProgress?: (scenes: any[], progress: number, statusText: string) => void
): AsyncGenerator<{ type: 'progress' | 'final', scenes?: any[], progress?: number, status?: string, provider?: string, model?: string, totalCount?: number }> {
    // ... (giữ nguyên logic 1. PRE-SEGMENTATION, 1.5 CHARACTER DICT, 2. PROMPT_INSTRUCTION) ...

    const finalProvider = ...;
    const finalModel = ...;
    const triggerFallback = () => { ... };

    // 3. STREAMING BATCH PROCESSING
    const batches = ...;
    const MAX_CONCURRENCY = Math.min(5, batches.length);
    let finalScenes: any[] = new Array(segmentedLines.length);
    let completedCount = 0;

    // Yield thông báo bắt đầu
    yield { type: 'progress', scenes: [], progress: 15, status: `Đang sinh prompt real-time (0/${segmentedLines.length} cảnh)...` };

    const queue = batches.map((_, i) => async function*() {
        const batch = batches[i];
        let batchIdx = 0;
        for await (const { index, scene } of generateBatchStream(batch, ..., triggerFallback)) {
            const globalIdx = i * BATCH_SIZE + index;
            finalScenes[globalIdx] = {
                scriptLine: batch[index],
                imagePrompt: (styleLock && scene.imagePrompt) ? `${styleLock}, ${scene.imagePrompt}` : scene.imagePrompt || "",
                videoPrompt: (styleLock && scene.videoPrompt) ? `${styleLock}, ${scene.videoPrompt}` : scene.videoPrompt || "",
            };
            completedCount++;
            yield {
                type: 'progress' as const,
                scenes: [...finalScenes.filter(Boolean)],
                progress: Math.floor((completedCount / segmentedLines.length) * 85) + 15,
                status: `Đang sinh prompt real-time (${completedCount}/${segmentedLines.length} cảnh)...`
            };
            batchIdx++;
        }
    }());

    // Chạy song song các batch
    const workers = Array.from({ length: MAX_CONCURRENCY }, async () => {
        while (queue.length > 0) {
            const gen = queue.shift();
            if (gen) {
                for await (const evt of gen) {
                    yield evt;
                }
            }
        }
    });

    // Yield final
    yield { type: 'final', scenes: finalScenes.filter(Boolean), provider: finalProvider, model: finalModel, totalCount: segmentedLines.length };
};
```

**Cảnh báo:** Async generator + concurrent workers phức tạp. Cần dùng `Promise.all(workers.map(async (w) => { for await (const evt of w()) yield evt; }))` pattern.

---

## BƯỚC 3: App.tsx nhận AsyncGenerator

Thay đoạn gọi `analyzeScriptWithAI` thành `analyzeScriptWithAIStream`:

```typescript
const gen = analyzeScriptWithAIStream(
    scenario, refImagesForService, effectiveKey, activeStylePrompt,
    mode, segmentationMode, selectedModel, targetSceneCount,
    promptType, aspectRatio, enableAspectRatio, enableCharacterConsistency,
    kymaKey, selectedKymaModel || 'deepseek-v4-flash'
);

for await (const evt of gen) {
    if (evt.type === 'progress' && evt.scenes) {
        setBuildProgress(evt.progress!);
        setBuildStatus(evt.status!);
        const incremental = evt.scenes.map((item: any, index: number) => ({
            id: `scene-${index}`,
            imagePrompt: item.imagePrompt,
            videoPrompt: item.videoPrompt,
            scriptLine: item.scriptLine
        }));
        setPrompts(incremental);
    } else if (evt.type === 'final') {
        const newPrompts = evt.scenes!.map((item: any, index: number) => ({
            id: `scene-${index}`,
            imagePrompt: item.imagePrompt,
            videoPrompt: item.videoPrompt,
            scriptLine: item.scriptLine
        }));
        setPrompts(newPrompts);
        saveSession(newPrompts, scriptFileName || "Manual Scenario");
        if (evt.provider !== expectedProvider || evt.model !== expectedModel) {
            addToast('info', 'Tự động chuyển đổi', `Dùng ${evt.provider} (${evt.model}) do cấu hình ban đầu gặp lỗi.`);
        }
        addToast('success', 'Thành công', `Đã tạo ${newPrompts.length} cảnh bằng ${evt.provider} (${evt.model}).`);
    }
}
```

---

## GIỚI HẠN

1. **Streaming chỉ áp dụng cho Gemini** — Kyma API không có `stream` parameter trong chat/completions (xác minh tại [kymaapi.com docs](https://kymaapi.com))
2. **JSON parse incremental** không hoàn hảo với nested object phức tạp. Code đã dùng regex khớp ngoặc để handle 1 cấp nested (giống `bestEffortParse`)
3. **Backward compat** — giữ `analyzeScriptWithAI` cũ làm wrapper gọi `analyzeScriptWithAIStream` và yield final only → không break nếu sếp chưa muốn dùng streaming

---

## RỦI RO

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Kyma API không support stream | 🟡 TB | Wrapper fallback non-streaming rồi yield từng cái |
| Async generator + concurrent workers syntax phức tạp | 🟡 TB | Test thử với 1 batch trước khi chạy parallel |
| JSON incremental parse fail | 🟢 THẤP | best-effort regex có sẵn từ Fix #8 |
| App.tsx re-render liên tục với batch lớn | 🟢 THẤP | Đã có filter(Boolean) + progress callback để giảm tải |

---

**END OF SPECIFICATION**
