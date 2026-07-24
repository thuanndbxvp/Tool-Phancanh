# KẾ HOẠCH XỬ LÝ NHÓM LỖI P2 (PLAN-P2-fixes)

## 1. Mục tiêu (Goals)
Thực thi nốt 7 đầu mục cuối cùng thuộc nhóm P2 để mang lại độ hoàn thiện tuyệt đối (100% Spec Coverage) so với bản vẽ gốc `plan1.md`. Nhóm này tập trung vào sự kiên cường (Resilience) trước các dị thường của API và nâng cao UX.

## 2. Danh sách công việc (Work Breakdown)

- **Task 7: Multi-key rotation (Chống 429 Rate Limit)**
  - Cơ chế hiện tại chỉ dùng 1 key random. Nếu dính 429 (Quá tải), toàn bộ tiến trình sẽ sập.
  - Sẽ sửa lại hàm API để nhận 1 danh sách Key. Khi 1 key báo 429, đánh dấu "Cooldown 60s" và tự động rotate sang key khác để chạy tiếp mạch.

- **Task 8: `shouldRetry` và Cứu hộ JSON (`bestEffortParse`)**
  - Không phải lỗi nào cũng nên `Retry`. Nếu lỗi `JSON.parse` (do bị AI cắt cụt), thì Retry vô ích.
  - Bổ sung `bestEffortParse`: Dùng Regex `\{[^{}]*\}` mổ xẻ lấy các Object còn nguyên vẹn trong chuỗi JSON hỏng, cứu được cảnh nào hay cảnh đó thay vì vứt bỏ toàn bộ batch.

- **Task 9: Streaming Response (Trải nghiệm mượt mà)**
  - Tối ưu `onProgress` để thay vì đợi cả batch 5 cảnh tải xong, có thể báo cáo dần tiến độ (Tuy nhiên, do JSON stream rất phức tạp, ta sẽ dùng cơ chế giả lập streaming bằng cách chia nhỏ batch ra hơn nữa hoặc bắt tín hiệu sớm nếu dùng SDK GenAI).

- **Task 10: Tối ưu Token (`max_tokens` per call type)**
  - Thay vì ấn định 8000 cho mọi request (dễ bị AI ngâm request), ta chia nhỏ: 
    - Anchors: `1500`
    - CharDict: `2000`
    - Batch Prompt: `8000` (hoặc `10000` với Flash).

- **Task 11: Fallback cho `segmentByWaterFilling`**
  - Nếu số cảnh tạo ra nhỏ hơn `targetSceneCount` (do Script quá ngắn), sẽ tự động ép chia lại (Stricter logic) bằng cách chẻ nhỏ các câu.

- **Task 13 & 14: Tiện ích chuỗi (Edge cases)**
  - Fallback `Intl.Segmenter` cho Safari đời cũ.
  - Gỡ bỏ cặn BOM (`\uFEFF`) khi parse file SRT.
