# AUDIT-REPORT — Bug "20 cảnh → 15 cảnh rồi dừng"

> **Ngày audit:** 2026-07-25
> **Auditor:** TIER2 (theo TIER2_PROMPT.md mục 1 — Pre-Audit bắt buộc)
> **Phạm vi:** Phân tích nguyên nhân vì sao app chia ít hơn targetSceneCount

---

## KẾT LUẬN TỔNG THỂ

**🔴 ĐÃ TÌM RA NGUYÊN NHÂN** — Có **4 bug chồng chéo**, trong đó **1 bug nghiêm trọng** khiến fallback không hoạt động.

---

## NGUYÊN NHÂN GỐC RỄ

### 🔴 CRITICAL #1: `lastHandledIdx = sentences.length - 1` → fallback water-filling KHÔNG chạy

**Vị trí:** `src/services/geminiService.ts:540-551`

**Code hiện tại:**
```typescript
if (segmentByIndex.length < targetSceneCount) {
    const missing = targetSceneCount - segmentedLines.length;
    const lastHandledIdx = anchors.length > 0
        ? Math.max(...anchors.map(a => a.toSentenceIdx))
        : -1;
    const remainingSentences = sentences.slice(lastHandledIdx + 1);
    if (remainingSentences.length > 0) {
        const fillScenes = segmentByWaterFilling(remainingSentences, missing);
        segmentedLines = segmentedLines.concat(fillScenes);
    }
}
```

**BUG TRONG `segmentByIndex` (dòng 89):**
```typescript
if (i === aiIndices.length - 1) toIdx = sentences.length - 1;
```

→ **Anchor cuối cùng LUÔN LUÔN có `toSentenceIdx = sentences.length - 1`** (ép theo code)

→ `Math.max(...anchors.map(a => a.toSentenceIdx))` = `sentences.length - 1`

→ `remainingSentences = sentences.slice(sentences.length)` = **MẢNG RỖNG**

→ `if (remainingSentences.length > 0)` = **FALSE**

→ **Fallback water-filling KHÔNG BAO GIỜ chạy khi AI trả thiếu!**

### Ví dụ cụ thể

Script có 220 câu. User yêu cầu 20 cảnh. AI trả 15 anchors:

| Bước | Kết quả |
|------|---------|
| `fetchSceneAnchors(sentences, 20)` | AI trả 15 anchors |
| `segmentByIndex(sentences, 15 anchors)` | Tạo 15 scenes |
| `i === 14 (anchor cuối)` → `toIdx = 219` | Anchor #15 chứa câu 215-219 |
| `lastHandledIdx = 219` | = `sentences.length - 1` |
| `remainingSentences = sentences.slice(220)` | = `[]` (rỗng) |
| `if (remainingSentences.length > 0)` | FALSE → skip |
| **Output** | **15 scenes** (KHÔNG đạt 20) |

### Tác động

- App **IM LẶNG** chia thiếu cảnh — không báo lỗi
- User không biết bị thiếu → tiếp tục dùng kết quả sai
- Plan2.md đánh giá 100% spec → **sai**

---

## BUGS PHỤ

### 🟡 #2: `raceGenerators` dead code vẫn còn trong file

**Vị trí:** `src/services/geminiService.ts:821-843`

Code đã comment "BỎ approach phức tạp" nhưng không xóa → tăng diff, gây khó đọc. Không gây lỗi runtime nhưng là dead code.

### 🟡 #3: `mergeGenerators` + `consumeGenerator` định nghĩa 2 lần concept tương tự

Code dùng `consumeGenerator` thay vì `raceGenerators` nhưng cả 2 đều còn trong file → rủi ro ai đó tưởng nhầm và dùng hàm sai.

### 🟢 #4: Prompt Gemini không đủ rõ ràng về việc trả ĐÚNG `targetSceneCount`

**Vị trí:** `src/services/geminiService.ts:196-202`

```typescript
const systemInstruction = `You are a storyboard director. Divide the script into EXACTLY ${targetSceneCount} logical scenes.
...
Return ONLY a JSON array of exactly ${targetSceneCount} objects:`;
```

→ Prompt có "EXACTLY" và "exactly" nhưng AI Gemini thỉnh thoảng vẫn trả thiếu. Cần thêm penalty nặng hơn.

---

## GIẢI PHÁP

### Fix #1 (CHÍNH): Re-segment TOÀN BỘ bằng water-filling khi AI trả thiếu

Thay vì dựa vào `remainingSentences` (luôn rỗng), dùng `segmentedLines` hiện có + **re-segment LẠI TOÀN BỘ** script theo `targetSceneCount` mới khi AI trả thiếu quá 20%.

**Pseudocode:**
```typescript
if (segmentedLines.length < targetSceneCount) {
    console.warn(`AI trả thiếu cảnh (${segmentedLines.length}/${targetSceneCount})`);
    
    // Nếu thiếu ít (< 20%) → chỉ chia lại phần dài nhất
    // Nếu thiếu nhiều (≥ 20%) → re-segment TOÀN BỘ bằng water-filling
    const ratio = segmentedLines.length / targetSceneCount;
    
    if (ratio < 0.8) {
        // Re-segment toàn bộ
        segmentedLines = segmentByWaterFilling(sentences, targetSceneCount);
        console.warn(`Re-segmented toàn bộ → ${segmentedLines.length} scenes`);
    } else {
        // Chỉ chia lại scene dài nhất
        let maxLen = 0, maxIdx = 0;
        segmentedLines.forEach((line, i) => {
            const len = line.split(/\s+/).length;
            if (len > maxLen) { maxLen = len; maxIdx = i; }
        });
        // Tách scene dài nhất thành 2
        const longest = segmentedLines[maxIdx];
        const halfIdx = Math.floor(longest.length / 2);
        // Tìm vị trí tách gần nhất (tại dấu câu)
        let splitAt = longest.lastIndexOf('. ', halfIdx);
        if (splitAt < 0) splitAt = halfIdx;
        const part1 = longest.slice(0, splitAt + 1).trim();
        const part2 = longest.slice(splitAt + 1).trim();
        if (part1 && part2) {
            segmentedLines.splice(maxIdx, 1, part1, part2);
        }
    }
}
```

### Fix #2: Xóa dead code `raceGenerators`

### Fix #3 (Optional): Tăng cường prompt Gemini

Thêm vào systemInstruction:
```
CRITICAL: You MUST return EXACTLY ${targetSceneCount} objects. If the script has fewer logical breaks, divide longer scenes but NEVER return fewer than ${targetSceneCount} objects.
```

---

## ĐÁNH GIÁ RỦI RO

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Re-segment toàn bộ mất thông tin từ AI | 🟡 TB | Vẫn giữ segment AI cho ≥ 80% case, chỉ fallback khi thiếu nhiều |
| Chia lại scene dài nhất có thể cắt giữa chừng | 🟢 THẤP | Tìm vị trí tách tại dấu câu gần nhất |
| Re-segment toàn bộ bỏ qua "ý đồ" AI | 🟡 TB | Log warning để user biết |

---

## KẾ HOẠCH SỬA

1. **Fix #1 (chính):** Áp dụng logic mới trong `analyzeScriptWithAI` + `analyzeScriptWithAIStream`
2. **Fix #2:** Xóa `raceGenerators` dead code (dòng 821-843)
3. **Fix #3:** Tăng cường prompt Gemini (optional, làm sau nếu cần)

---

**AUDIT HOÀN TẤT. SẴN SÀNG SỬA.**
