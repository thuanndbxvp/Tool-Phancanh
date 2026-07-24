# KẾ HOẠCH TÁI CẤU TRÚC TOÀN DIỆN (PLAN-refactor-phancanh)

## 1. Mục tiêu (Goals)
Bám sát 100% tài liệu `docs/plan1.md`, đập đi xây lại toàn bộ Engine phân cảnh để đạt được:
- **Tốc độ:** Tăng 3x nhờ Parallel Batching (Giai đoạn 2).
- **Độ chính xác:** 100% nhờ dùng `Intl.Segmenter` (Giai đoạn 1) và Index-based AI anchors (Giai đoạn 3).
- **Độ ổn định:** Zero crash nhờ `withRetry` và `max_tokens: 8000`.
- **Tiết kiệm API:** Cache Character Dictionary (Giai đoạn 3).
- **Trải nghiệm:** SRT Parser riêng (Giai đoạn 4).

## 2. Kiến trúc mới & Cấu trúc thư mục
Chúng ta sẽ chia nhỏ `helpers.ts` và `geminiService.ts` đang quá tải.
- `src/utils/srtParser.ts` (MỚI): Xử lý dọn dẹp file SRT (Strip time, HTML).
- `src/utils/textSegmentation.ts` (MỚI): Tách riêng logic băm câu (Intl.Segmenter) và thuật toán Water-filling.
- `src/utils/cache.ts` (MỚI): Chứa memory cache để lưu Character Dictionary.
- `src/services/geminiService.ts` (SỬA): Chỉ tập trung gọi AI. Sẽ áp dụng `Promise.all` + `withRetry`.

## 3. Lộ trình thực thi cho Tier 2
Tier 2 sẽ thực thi tuần tự 4 khối công việc (tương đương 4 Giai đoạn trong `plan1.md`):
- **Khối 1 (Utilities):** Tạo `srtParser.ts`, `cache.ts`, `textSegmentation.ts`.
- **Khối 2 (AI Anchor & Char Dict):** Sửa `fetchSceneAnchors` sang Index-based, áp dụng cache vào `fetchCharacterDictionary`.
- **Khối 3 (Core Service):** Viết lại `generateBatch` và `analyzeScriptWithAI` (Áp dụng Parallel, Retry, max_tokens).
- **Khối 4 (App.tsx):** Cập nhật UI để tương thích với luồng mới (Hiển thị số câu/cảnh).
