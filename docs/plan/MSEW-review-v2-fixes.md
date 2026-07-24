# MSEW-review-v2-fixes — Sửa 3 silent bug P0

> Review vòng 2 — phát hiện 3 lỗi nghiêm trọng ảnh hưởng đến độ chính xác. Sửa theo đúng nguyên tắc "không phát minh tính năng mới".

---

## FIX #6: Fallback water-filling bỏ 80% đầu script

**File:** `src/services/geminiService.ts`
**Mức độ:** 🔴 CỰC CAO (silent bug, mất dữ liệu)

**Vấn đề (dòng 346-350):**
```typescript
const missing = targetSceneCount - segmentedLines.length;
const remainingSentences = sentences.slice(Math.floor(sentences.length * 0.8));  // ← BỎ 20% ĐẦU
const fillScenes = segmentByWaterFilling(remainingSentences, missing);
```

**Sửa:**
```typescript
if (segmentedLines.length < targetSceneCount) {
    console.warn(`AI trả thiếu cảnh (${segmentedLines.length}/${targetSceneCount}), đang fallback bù bằng water-filling...`);
    const missing = targetSceneCount - segmentedLines.length;
    // Lấy đúng phần còn lại SAU cảnh cuối cùng AI đã xử lý
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

---

## FIX #5: Cache hash collision

**File:** `src/utils/cache.ts`
**Mức độ:** 🔴 CAO (silent bug, trả character dict sai)

**Vấn đề (dòng 14, 20):**
```typescript
const hash = hashString(script + model);
// Cache key chỉ dùng 200 ký tự đầu
this.charDict.set(script.substring(0, 200), { hash, data });
```

**Sửa:** Đổi sang FNV-1a 64-bit + dùng 2000 ký tự đầu làm key (hoặc hash toàn bộ):
```typescript
// Hash 64-bit (FNV-1a) — collision cực thấp
const hashString = (str: string): string => {
    let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
        h2 = Math.imul(h2 ^ str.charCodeAt(i), 0x100000001b3 & 0xffffffff);
    }
    return h1.toString(16) + h2.toString(16);
};

// Dùng 2000 ký tự đầu làm key (an toàn hơn 200)
const CACHE_KEY_LEN = 2000;
```

Và cập nhật `getCharacters`/`setCharacters`:
```typescript
getCharacters(script: string, model: string): string | null {
    const hash = hashString(script + model);
    const cached = this.charDict.get(script.substring(0, CACHE_KEY_LEN));
    if (cached && cached.hash === hash) return cached.data;
    return null;
},
setCharacters(script: string, model: string, data: string) {
    const hash = hashString(script + model);
    this.charDict.set(script.substring(0, CACHE_KEY_LEN), { hash, data });
}
```

---

## FIX #9: segmentByIndex nuốt câu giữa

**File:** `src/utils/textSegmentation.ts`
**Mức độ:** 🟡 CAO

**Vấn đề (dòng 50-68):**
- Nếu AI trả anchors có gap (vd `[{0,5}, {10,15}]`) → sentences 6-9 bị mất

**Sửa:** Sau loop, check gap và nối phần bị miss vào cảnh trước/cuối:
```typescript
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

    // Append any remaining sentences (gap handling)
    if (sentences.length > 0 && lastHandledIdx < sentences.length - 1 && scenes.length > 0) {
        const remainder = sentences.slice(lastHandledIdx + 1).map(s => s.text).join(' ');
        if (remainder) {
            scenes[scenes.length - 1] = (scenes[scenes.length - 1] + ' ' + remainder).trim();
        }
    } else if (sentences.length > 0 && scenes.length === 0) {
        // AI trả rỗng
        scenes.push(sentences.map(s => s.text).join(' '));
    }
    return scenes;
};
```

---

## QUY TẮC CỨNG

- ✅ Sửa nguyên đoạn code như trên
- ❌ KHÔNG thêm tính năng mới
- ❌ KHÔNG sửa logic khác ngoài 3 file chỉ định
- ✅ TypeScript pass + Vite build pass
- ✅ Không phá backward compat
