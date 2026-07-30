# WORKFLOW STATUS v2 — hybrid-segmentation

## Steps Completed
- [x] Khối A: segmentByTimeline — early-cut với min_target (target-2.5s) + max_target (target+4s)
- [x] Khối B: ControlPanel — xóa 3 nút cũ, thêm Smart Hybrid UI với audio gate
- [x] Khối C: App.tsx — bỏ useHybridMode flag, auto-detect SRT/TXT, validate gate
- [x] Khối D: Self-audit (tsc + vite + lint) — PASS

## Early-Cut Strategy Logic
```
const minTarget = Math.max(0, targetSceneDuration - 2.5);
const maxTarget = targetSceneDuration + 4;

if (currentDuration >= maxTarget) {
    // HARD LIMIT: cắt cứng
    shouldBreak = true;
} else if (currentDuration >= minTarget && !isLastScene) {
    // VÙNG EARLY-CUT: chỉ cắt khi gặp dấu câu
    if (block.isPunctuationEnd) shouldBreak = true;
}
```

## UI Refactor
- ❌ Xóa: 3 nút Segmentation (AI / Chia đều / Dấu câu)
- ✅ Thêm: Block "Smart Hybrid Timeline" với:
  - Input số lượng cảnh
  - Gợi ý optimal scene count (auto-fill)
  - Audio file upload (mp3/wav/mpeg)
  - Manual duration input (giây) — thay thế audio nếu không có file
  - Cảnh báo đỏ khi TXT thiếu audio
- ✅ Validate gate: TXT mà không có audio → toast error "Thiếu Audio"
- ✅ Auto-detect SRT vs TXT khi upload

## Files Changed
- src/utils/textSegmentation.ts: segmentByTimeline early-cut logic (+13, -7)
- src/components/ControlPanel.tsx: interface + UI block (+85, -50)
- src/App.tsx: state + validate + stream switch (+30, -25)

## Tier 2 Note
Đã đụng block JSX lớn trong ControlPanel → lỗi cú pháp khó debug.
Fix bằng cách: thêm wrapper `<div>` cho button để bù vào structure.
Comment JSX không được chứa `<div>` (vẫn được parse) — dùng `//` thay vì `{/* */}`.