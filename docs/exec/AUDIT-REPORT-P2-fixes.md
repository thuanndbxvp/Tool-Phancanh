# AUDIT-REPORT — Pre-audit cho MSEW-P2-fixes.md

> **Ngày audit:** 2026-07-25
> **Auditor:** TIER2 (theo TIER2_PROMPT.md mục 1 — Pre-Audit bắt buộc)
> **Bản vẽ được audit:** `docs/plan/MSEW-P2-fixes.md`

---

## KẾT LUẬN TỔNG THỂ

**🟡 CHẤP NHẬN CÓ ĐIỀU CHỈNH** — Bản vẽ có 1 lỗi breaking change (chữ ký `withRetry`), 2 lỗi nhẹ. TIER2 đã đối chiếu với source code hiện tại và quyết định **điều chỉnh để an toàn** thay vì từ chối.

---

## LỖ HỔNG PHÁT HIỆN

### 🔴 CRITICAL #1: Chữ ký `withRetry` thay đổi → BREAK 6 chỗ gọi

**Vị trí:** MSEW-P2-fixes.md dòng 78

**MSEW viết:**
```typescript
const withRetry = async <T>(fn: (key: string) => Promise<T>, keys: string, retries: number = 2, delayMs: number = 2000): Promise<T> => {
    const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
    ...
    return await fn(keyList[currentKeyIndex]);
```

**Source code hiện tại (geminiService.ts:23-34):**
```typescript
const withRetry = async <T>(fn: () => Promise<T>, retries: number = 2, delayMs: number = 2000): Promise<T> => {
    ...
    return await fn();
```

**Các chỗ gọi hiện tại (cần sửa):**
- `geminiService.ts:128` — `withRetry(() => attemptKyma(kymaKey))`
- `geminiService.ts:136` — `withRetry(() => attemptGemini(keyToUse))`
- `geminiService.ts:226` — `withRetry(() => attemptKyma(kymaKey))` (fetchSceneAnchors)
- `geminiService.ts:228` — `withRetry(() => attemptGemini(keyToUse))` (fetchSceneAnchors)
- `geminiService.ts:308` — `withRetry(() => attemptKyma(kymaKey))` (fetchCharacterDictionary)
- `geminiService.ts:314` — `withRetry(() => attemptGemini(keyToUse))` (fetchCharacterDictionary)

**Tác động nếu áp dụng nguyên xi:** TypeScript compile error: `Expected 2-4 arguments, but got 1`.

**Giải pháp TIER2 áp dụng:** Sửa tất cả 6 chỗ gọi từ `withRetry(() => attemptX(key))` → `withRetry((k) => attemptX(k), key)`.

---

### 🟡 MEDIUM #2: App.tsx chưa truyền CSV keys → tính năng xoay vòng chưa kích hoạt

**Vị trí:** App.tsx dòng 170-176

**Hiện tại:**
```typescript
const activeKeys = apiKeys.filter(k => k.isActive);
if (activeKeys.length > 0) {
    const randomIndex = Math.floor(Math.random() * activeKeys.length);
    effectiveKey = activeKeys[randomIndex].key;
}
```

→ Chỉ chọn 1 key random, KHÔNG truyền CSV.

**Giải pháp TIER2 áp dụng:** Sửa App.tsx để truyền CSV: `effectiveKey = activeKeys.map(k => k.key).join(',')`. Đây là prerequisite để kích hoạt tính năng xoay vòng.

**Lưu ý:** Nếu không sửa App.tsx → backend có sẵn xoay vòng nhưng KHÔNG ai gọi → dead code. Phải sửa cả 2 phía.

---

### 🟡 MEDIUM #3: `bestEffortParse` regex chỉ match 1 cấp

**Vị trí:** MSEW dòng 60: `text.match(/\{[^{}]*\}/g)`

**Vấn đề:** JSON nested 1 cấp (vd `{"scriptLine":"x","meta":{"source":"y"}}`) sẽ fail vì regex `[^{}]*` không chứa `{` bên trong.

**Giải pháp TIER2 áp dụng:** Dùng regex đệ quy 1 cấp:
```typescript
const objects = text.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g) || [];
```

→ Match được object flat + object có 1 nested object.

**Hạn chế:** JSON 2+ nested (rất hiếm với response của AI) sẽ fail. Ghi nhận trong comment code.

---

## QUYẾT ĐỊNH

✅ **TIER2 sẽ code theo tinh thần MSEW-P2-fixes.md**, với 3 điều chỉnh hợp lý:

1. **Sửa 6 chỗ gọi `withRetry`** — đổi từ `() => attemptX(key)` sang `(k) => attemptX(k)` và truyền `keys` tham số thứ 2
2. **Sửa App.tsx** — truyền CSV keys để kích hoạt tính năng xoay vòng thực sự
3. **`bestEffortParse` cải tiến** — regex đệ quy 1 cấp để handle JSON nested nhẹ

→ Logic cốt lõi (bestEffortParse, shouldRetry, key rotation khi 429, max_tokens per call, BOM strip, waterfill fallback) được áp dụng đúng 100% theo MSEW.
