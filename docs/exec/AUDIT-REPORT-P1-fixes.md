# AUDIT-REPORT — Pre-audit cho MSEW-P1-fixes.md

> **Ngày audit:** 2026-07-25
> **Auditor:** TIER2 (theo TIER2_PROMPT.md mục 1 — Pre-Audit bắt buộc)
> **Bản vẽ được audit:** `docs/plan/MSEW-P1-fixes.md`

---

## KẾT LUẬN TỔNG THỂ

**🟡 CHẤP NHẬN CÓ ĐIỀU KIỆN** — Bản vẽ có 1 lỗi nghiêm trọng (chữ ký hàm sai) và 2 lỗi nhẹ. TIER2 đã đối chiếu với source code hiện tại và quyết định **điều chỉnh hợp lý** (giữ backward compat) thay vì từ chối hoàn toàn.

---

## LỖ HỔNG PHÁT HIỆN

### 🔴 CRITICAL #1: Chữ ký `analyzeScriptWithAI` trong MSEW không khớp App.tsx

**Vị trí:** MSEW-P1-fixes.md dòng 102-112

**MSEW viết:**
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
```

**Source code hiện tại (geminiService.ts:309-325):**
```typescript
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
```

**App.tsx dòng 202-228 đang gọi 16 tham số:**
```typescript
const results = await analyzeScriptWithAI(
    scenario,              // script
    refImagesForService,   // referenceImages
    effectiveKey,          // apiKey
    activeStylePrompt,     // styleLock
    mode,                  // mode
    segmentationMode,      // segmentationMode
    selectedModel,         // modelName
    targetSceneCount,      // targetSceneCount
    promptType,            // promptType
    aspectRatio,           // aspectRatio
    enableAspectRatio,     // enableAspectRatio
    enableCharacterConsistency, // enableCharacterConsistency
    kymaKey,               // kymaKey
    selectedKymaModel || 'deepseek-v4-flash', // kymaModelName
    (newScenes, progress, status) => {...} // onProgress
);
```

**Tác động nếu áp dụng nguyên xi MSEW:**
- App.tsx crash ngay khi user nhấn "Tạo Storyboard"
- Mất hoàn toàn tính năng referenceImages, promptType, aspectRatio, character consistency
- Backward compat = 0%

**Giải pháp TIER2 áp dụng:** GIỮ NGUYÊN chữ ký 16 tham số hiện tại, chỉ thêm logic P1 bên trong.

---

### 🟡 MEDIUM #2: `fetchCharacterDictionary` không có `triggerFallback`

**Vị trí:** MSEW chỉ thêm callback cho `generateBatch` và `fetchSceneAnchors`, không thêm cho `fetchCharacterDictionary`.

**Tác động:** Khi Kyma fail ở character dict → fallback Gemini → `finalProvider` không update → toast "Tự động chuyển đổi" hiển thị sai.

**Giải pháp TIER2 áp dụng:** Thêm `onFallback?: () => void` cho `fetchCharacterDictionary` (mở rộng tinh thần MSEW, không phá logic cốt lõi).

---

### 🟡 LOW #3: `generateBatch` thành export không cần thiết

**Vị trí:** MSEW dòng 51 đổi `const generateBatch` → `export const generateBatch`.

**Tác động:** Không có (vì App.tsx không gọi trực tiếp), nhưng thay đổi API public không có lý do → có thể confuse developer khác.

**Giải pháp TIER2 áp dụng:** GIỮ `const generateBatch` (không export).

---

## QUYẾT ĐỊNH

✅ **TIER2 sẽ code theo tinh thần MSEW-P1-fixes.md**, với 3 điều chỉnh hợp lý:
1. GIỮ chữ ký `analyzeScriptWithAI` 16 tham số (backward compat)
2. Thêm `onFallback` cho `fetchCharacterDictionary` (mở rộng nhất quán)
3. GIỮ `generateBatch` là `const` private (không export)

→ Logic cốt lõi (queue workers, chunking, callback trigger) được áp dụng đúng 100% theo MSEW.
