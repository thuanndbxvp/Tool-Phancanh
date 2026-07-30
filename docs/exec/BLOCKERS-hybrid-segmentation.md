# BLOCKERS — hybrid-segmentation

Trạng thái: **CHỜ PLANNER REVIEW** (Tier 2 đã từ chối code, xem AUDIT-REPORT-hybrid-segmentation.md)

## Blocker #1 — Function không tồn tại [CRITICAL]
- **Type**: Impossible (MSEW tham chiếu symbol không tồn tại)
- **Description**: MSEW refactor `analyzeScriptWithAI` (Promise), nhưng source code chỉ có `analyzeScriptWithAIStream` (async generator)
- **Suggestion**: 
  - (a) Viết lại MSEW Khối 3 theo signature `analyzeScriptWithAIStream` thật
  - (b) Hoặc thêm function MỚI `analyzeScriptWithAIHybrid` giữ nguyên `analyzeScriptWithAIStream`, switch ở App.tsx
- **Awaiting**: Planner chọn approach (a) hay (b)

## Blocker #2 — App.tsx chữ ký khác hoàn toàn [CRITICAL]
- **Type**: Missing Info
- **Description**: MSEW Khối 3 định nghĩa 9 params, App.tsx gọi 14 params (có thêm `referenceImages`, `mode`, `promptType`, ...)
- **Suggestion**: Chốt chữ ký CHÍNH XÁC trong MSEW — list từng parameter name, type, position
- **Awaiting**: Planner rewrite Khối 3 với chữ ký thật từ `analyzeScriptWithAIStream`

## Blocker #3 — 2 MSEW files mâu thuẫn [CRITICAL]
- **Type**: Ambiguous
- **Description**: `docs/plan/MSEW-hybrid-segmentation.md` và `docs/exec/MSEW-hybrid-segmentation.md` có syntax khác nhau (escape, comments)
- **Suggestion**: Xóa 1 file, giữ 1 làm ground truth
- **Awaiting**: Planner xác nhận file nào là canonical

## Blocker #4 — Xóa segmentationMode gây TS error [CRITICAL]
- **Type**: Wrong design
- **Description**: `segmentationMode` đang được dùng ở 5+ nơi (App.tsx, ControlPanel.tsx, geminiService.ts). Xóa sẽ break compile.
- **Suggestion**: Chốt strategy:
  - (a) Breaking change — xóa hết, viết migration note
  - (b) Thêm mode mới làm giá trị thứ 4 (giữ 3 mode cũ)
- **Awaiting**: Planner chọn approach

## Blocker #5 — Promise vs AsyncGenerator mismatch [CRITICAL]
- **Type**: Wrong design
- **Description**: Logic trong MSEW là Promise (return value), nhưng code thật là async generator (yield progress)
- **Suggestion**: Viết lại MSEW Khối 3 dùng `yield { type: 'progress', ... }` thay vì `onProgress(...)` callback
- **Awaiting**: Planner update

## Blocker #6 — Mất fallback safety [HIGH]
- **Type**: Wrong design
- **Description**: Bỏ `ensureSceneCount` mà không thay thế tương đương → scene count có thể sai
- **Suggestion**: Thêm logic `ensureSceneCount` ngay sau `segmentByTimeline(...)` trong MSEW Khối 3
- **Awaiting**: Planner bổ sung

## Blocker #7 — Thiếu Tailwind config check [MEDIUM]
- **Type**: Missing Info
- **Description**: MSEW Khối 4.2 dùng class `form-checkbox`, `bg-gray-800` — cần verify project có Tailwind
- **Suggestion**: 
  - Verify `tailwind.config.js` / `postcss.config.js` tồn tại
  - Hoặc thay bằng class inline / styled-components
- **Awaiting**: Planner confirm Tailwind setup hoặc đổi UI approach

## Blocker #8 — Thiếu CONTEXT/SKILL-ROUTING/ACCEPTANCE [HIGH]
- **Type**: Missing Info
- **Description**: Theo skill `code.md`, coder cần 4 file plan: CONTEXT + MSEW + SKILL-ROUTING + ACCEPTANCE. Mới có MSEW.
- **Suggestion**: Tạo 3 file còn lại trước khi code
- **Awaiting**: Planner viết bổ sung

---

## Tóm tắt trạng thái

| Blocker | Status | Owner |
|---------|--------|-------|
| #1 | OPEN | Planner |
| #2 | OPEN | Planner |
| #3 | OPEN | Planner |
| #4 | OPEN | Planner |
| #5 | OPEN | Planner |
| #6 | OPEN | Planner |
| #7 | OPEN | Planner |
| #8 | OPEN | Planner |

**Tier 2 đang idle — chờ Planner cập nhật MSEW hoặc đưa ra quyết định cụ thể cho từng blocker.**