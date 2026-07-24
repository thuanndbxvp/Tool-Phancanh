# AUDIT-REPORT — Bug "App gọi Gemini khi không add key" + "15/25 cảnh"

> **Ngày audit:** 2026-07-25
> **Auditor:** TIER2 (theo TIER2_PROMPT.md mục 1)
> **Triệu chứng:**
> 1. Toast "Đã tạo 15/25 cảnh bằng Gemini (User Key)" mặc dù user không add Gemini key
> 2. Có thông báo lỗi liên quan API key

---

## KẾT LUẬN

**🔴 CÓ 3 BUGS NGHIÊM TRỌNG** liên quan đến luồng xử lý khi user chỉ add Kyma key (không add Gemini key).

---

## BUG #1: `triggerFallback()` set `finalProvider = "Gemini (User Key)"` ngay cả khi `apiKey` rỗng

**Vị trí:** `src/services/geminiService.ts:684-686` (analyzeScriptWithAIStream) + `497-500` (analyzeScriptWithAI)

**Code hiện tại:**
```typescript
const triggerFallback = () => {
    finalProvider = "Gemini (User Key)";
    finalModel = modelName;
};
```

**BUG:** Khi Kyma fail → `triggerFallback()` được gọi → set `finalProvider = "Gemini (User Key)"` NGAY CẢ KHI `apiKey` rỗng → user thấy toast "Gemini (User Key)" → bối rối.

**Fix:** Kiểm tra `apiKey` rỗng trước khi set:
```typescript
const triggerFallback = () => {
    if (apiKey) {
        finalProvider = "Gemini (User Key)";
        finalModel = modelName;
    } else {
        throw new Error("Kyma thất bại và không có Gemini key để fallback.");
    }
};
```

---

## BUG #2: Gemini path được gọi với `effectiveKey` rỗng → crash với "API key not valid"

**Vị trí:** `src/services/geminiService.ts:253` (generateBatchStream) + `322` (fetchSceneAnchors.attemptGemini)

**Code hiện tại:**
```typescript
const ai = new GoogleGenAI({ apiKey: keyToUse.split(',')[0].trim() });
```

**BUG:** Khi `keyToUse = ""` (empty), `split(',')[0].trim() = ""` → `new GoogleGenAI({ apiKey: "" })` → throw error "API key not valid".

**Fix:** Thêm guard ở đầu `analyzeScriptWithAIStream` và `analyzeScriptWithAI`:
```typescript
if (!kymaKey && !apiKey) {
    throw new Error("Không có API key. Vui lòng cấu hình Kyma hoặc Gemini key.");
}
```

---

## BUG #3: Khi stream bị ngắt giữa chừng → `finalScenes` thiếu → KHÔNG có `ensureSceneCount` cho `finalScenes`

**Vị trí:** `src/services/geminiService.ts:864-869` (analyzeScriptWithAIStream final yield)

**Code hiện tại:**
```typescript
yield {
    type: 'final',
    scenes: finalScenes.filter(Boolean),  // Có thể thiếu nếu stream bị ngắt
    provider: finalProvider,
    model: finalModel,
    totalCount: segmentedLines.length  // Đúng target
};
```

**BUG:** 
- `ensureSceneCount` ở vòng 2.4 chỉ áp dụng cho `segmentedLines` (pre-segmentation)
- KHI STREAM BỊ NGẮT giữa chừng (vd Gemini timeout, token limit, network drop) → `finalScenes.filter(Boolean).length < segmentedLines.length`
- `totalCount = segmentedLines.length = 25` nhưng `scenes.length = 15`
- → toast "Đã tạo 15/25 cảnh" → user thấy thiếu

**Fix:** Sau khi stream xong, check thiếu → fill bằng water-filling:
```typescript
const filledScenes = finalScenes.filter(Boolean);
if (filledScenes.length < segmentedLines.length) {
    console.warn(`Stream chỉ nhận ${filledScenes.length}/${segmentedLines.length} scenes, filling missing...`);
    const missingCount = segmentedLines.length - filledScenes.length;
    const filledIndices = new Set(filledScenes.map((_, i) => 
        finalScenes.findIndex(s => s === filledScenes[i])
    ));
    const missingIndices: number[] = [];
    for (let i = 0; i < segmentedLines.length; i++) {
        if (!finalScenes[i]) missingIndices.push(i);
    }
    
    // Water-fill missing positions using remaining script
    const remainingScript = missingIndices.map(i => segmentedLines[i]);
    const fills = segmentByWaterFilling(
        remainingScript.map((text, k) => ({ idx: k, text, wordCount: text.split(/\s+/).length })),
        missingCount
    );
    
    // Place fills into missing indices
    for (let k = 0; k < missingIndices.length && k < fills.length; k++) {
        finalScenes[missingIndices[k]] = {
            scriptLine: fills[k],
            imagePrompt: styleLock ? `${styleLock}, (placeholder - AI stream interrupted)` : "(placeholder)",
            videoPrompt: styleLock ? `${styleLock}, (placeholder - AI stream interrupted)` : "(placeholder)"
        };
    }
}
```

**Hoặc đơn giản hơn:** Re-run streaming cho phần missing. Nhưng tốn time. **Trade-off: ưu tiên tốc độ (fill placeholder)** vì user đã chờ rồi.

---

## BUG #4: `expectedProvider` trong App.tsx quá đơn giản

**Vị trí:** `src/App.tsx:198`

**Code hiện tại:**
```typescript
const expectedProvider = kymaKey ? 'Kyma' : 'Gemini';
```

**BUG:** Không tính tới trường hợp fallback. Khi Kyma fail → Gemini → toast "Tự động chuyển đổi" hiển thị → user nghĩ app đổi ý.

**Fix:** Tạo toast ban đầu thông minh hơn:
```typescript
const initialMessage = kymaKey
    ? `Đang thử Kyma trước (${selectedKymaModel || 'deepseek-v4-flash'}), fallback Gemini nếu lỗi.`
    : `Đang dùng Gemini (${selectedModel}).`;
addToast('info', 'Đang phân cảnh...', initialMessage);
```

---

## TÓM TẮT ƯU TIÊN FIX

| # | Mức độ | Bug | Effort |
|---|--------|-----|--------|
| 1 | 🔴 CRITICAL | `triggerFallback` không check `apiKey` rỗng | 2 phút |
| 2 | 🔴 CRITICAL | Gemini path được gọi với empty key | 3 phút |
| 3 | 🔴 HIGH | Stream bị ngắt → thiếu cảnh, không fill | 10 phút |
| 4 | 🟡 MEDIUM | Toast initial message không rõ | 2 phút |

**Tổng effort: ~17 phút**

---

**AUDIT HOÀN TẤT. SẴN SÀNG SỬA.**
