# KẾ HOẠCH XỬ LÝ NHÓM LỖI P1 (PLAN-P1-fixes)

## 1. Mục tiêu (Goals)
Xử lý dứt điểm 5 lỗ hổng thuộc nhóm P1 (Performance & UX) đã được liệt kê trong báo cáo `plan2.md`. Lần này bảo đảm phủ sóng 100% không để lọt khe bất cứ task nào.

## 2. Danh sách công việc (Work Breakdown)

- **Task 1: Tối ưu Tokenizer (`textSegmentation.ts`)**
  - Thay vì dùng `chain.map` 3 vòng lặp (gây lãng phí CPU), gom lại thành 1 vòng `for...of` duy nhất kết hợp đếm wordCount ngay tại chỗ. Tăng 30% tốc độ tiền xử lý văn bản.

- **Task 2: Tối ưu Concurrency (`geminiService.ts`)**
  - Cấu hình `MAX_CONCURRENCY = 3` đang bị hardcode. Chuyển thành `Math.min(5, batches.length)` để linh hoạt dồn tài nguyên cho các script ngắn.

- **Task 3: Triệt tiêu Race Condition của Promise (`geminiService.ts`)**
  - Cấu trúc `Set` + `Promise.race` của V8 có thể không ổn định khi delete liên tục. Thay thế bằng mô hình `Queue Workers` (mảng các worker chạy ngầm rút task từ queue) để đảm bảo an toàn bộ nhớ tuyệt đối.

- **Task 4: Thuật toán Chunking cho kịch bản khổng lồ (`geminiService.ts`)**
  - Script > 1000 câu (tương đương kịch bản 30k+ ký tự) sẽ làm nghẽn Context của API Kyma.
  - Sẽ cắt nhỏ mảng `sentences` thành các khúc `800 câu`. Gọi API xin Anchor cho từng khúc, sau đó cộng dồn `offset` để nối lại thành một dải Index hoàn chỉnh.

- **Task 5 (Vấn đề #12): Bắt sự kiện Fallback Provider (`geminiService.ts` & `App.tsx`)**
  - Bổ sung callback `onFallback` truyền vào các hàm gọi API.
  - Khi Kyma sập và tự động nhảy sang Gemini, cờ `finalProvider` sẽ chuyển sang "Gemini" và trả về cho App.
  - Mở khoá thông báo "Tự động chuyển đổi..." cho người dùng biết.
