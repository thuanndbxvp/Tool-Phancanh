# KẾ HOẠCH TÁI CẤU TRÚC: Robust AI Connection (PLAN)

## 1. Cơ chế Parse JSON Siêu Cường (Robust JSON Parsing)
- Xây dựng một helper function `parseJsonArray(text, expectedCount)` để thay thế cho `JSON.parse` thuần túy và `bestEffortParse` sơ sài hiện tại.
- Kỹ thuật:
  - Cắt bỏ Markdown ` ```json `.
  - Nếu text không kết thúc bằng `]`, thử tự động chèn thêm `]` hoặc `"]` để cứu vãn.
  - Tìm vị trí `[` đầu tiên và `]` cuối cùng để bóc tách mảng JSON lõi, vứt bỏ toàn bộ chữ rác do model tự sinh.

## 2. Model Fallback & Retry (Tự động chuyển Model)
- Cấu hình mảng fallback models mặc định cho Gemini (vd: `['gemini-2.5-flash', 'gemini-1.5-flash']`).
- Trong hàm `withRetry` hoặc `attemptGemini/Kyma`, nếu gặp lỗi 429/500/503:
  - Thử lại với Key khác (logic cũ).
  - Nếu hết Key, thử lại với Model tiếp theo trong mảng Fallback trước khi báo lỗi.

## 3. Nâng cấp API Validation (List Models)
- Thay vì gọi `generateContent('ping')` tốn thời gian và quota, sẽ gọi GET thẳng vào API lấy danh sách models (với Gemini là `https://generativelanguage.googleapis.com/v1beta/models?key=...`).
- Nếu trả về JSON hợp lệ, kết luận API Key sống. Rất nhẹ và nhanh. Cập nhật UI (Settings Modal) để xài cơ chế này.

## 4. Tái cấu trúc khối EnhanceWithAI
- Bọc phần code `fetch` trong `enhanceWithAI` (bên trong hàm `analyzeScriptWithAIHybridStream`) bằng cấu trúc `withRetry` và sử dụng `parseJsonArray` để triệt tiêu lỗi phân cảnh.

## 5. Danh sách file sẽ thay đổi
1. `src/utils/aiHelpers.ts` (File mới: Chứa helper parse JSON và constant models).
2. `src/services/geminiService.ts` (Import helper, refactor `withRetry` và `validateApiKey`, sửa Concurrency).
3. `src/components/modals/ApiSettingsModal.tsx` (Xử lý UI Check API).

## 6. Sửa lỗi sập luồng Rate Limit (20-25 cảnh)
- Cập nhật luồng `mergeGenerators` trong `geminiService.ts` để thay đổi `MAX_CONCURRENT` động. Nếu dùng Gemini Free Key, hạ xuống 2 (thay vì 5) để không bị đè bẹp bởi lỗi 429 Too Many Requests.
- Nâng thời gian retry (Exponential Backoff) trong hàm `generateBatchStream` khi gọi Gemini lên cao hơn (chờ 5s, 10s, 15s thay vì 2s, 4s) để có đủ thời gian reset Quota 15 RPM.
