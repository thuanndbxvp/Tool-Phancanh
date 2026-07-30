# CONTEXT: Tăng cường tính ổn định và bảo lỗi AI (Robust AI Connection)

## Trạng thái hiện tại
`tool-phancanh` đang sử dụng API của Gemini (qua SDK) và Kyma (qua fetch). Tuy nhiên, khả năng chịu lỗi chưa tốt:
- Thường xuyên bị lỗi parse JSON nếu AI sinh ra cấu trúc sai lệch hoặc bị cắt nửa chừng.
- Khi bị lỗi 429 (Rate Limit) hoặc 503 (Overloaded), hệ thống có retry key, nhưng **chưa tự động fallback sang Model thấp hơn/khác** để cứu vãn luồng xử lý.
- Việc test API key đang sử dụng hàm sinh nội dung (generateContent('ping')), gây lãng phí quota/token.
- Khối lệnh `enhanceWithAI` (mới thêm trong Hybrid Segmentation) đang dùng fetch rất thô, không có cơ chế retry hay parse JSON an toàn.

## Mục tiêu
Học hỏi từ kiến trúc của app `auto-edit-video`, chúng ta sẽ áp dụng các kỹ thuật sau để đạt 100% tỷ lệ thành công khi gọi AI:
1. **Robust JSON Parsing**: Parse mảng JSON thông minh, tự động thêm dấu đóng ngoặc `]` nếu bị cắt ngang, và chiết xuất mảng nằm giữa văn bản rác.
2. **Model Fallback**: Tự động chuyển từ model to (vd: gemini-2.5-flash) sang model nhỏ hơn/khác nếu model ưu tiên bị Rate Limit hoặc Timeout, song song với tính năng đổi Key hiện có.
3. **List Models for Validation**: Thay đổi hàm `validateApiKey` sang việc fetch danh sách model (cực nhanh, nhẹ, không tốn quota).
4. **Áp dụng Retry & Robust Parse cho `enhanceWithAI`**: Bọc toàn bộ lời gọi AI trong `enhanceWithAI` qua cơ chế này để không bao giờ chết sảng.
