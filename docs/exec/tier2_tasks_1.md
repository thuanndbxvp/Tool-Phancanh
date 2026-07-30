# Kế hoạch Thực thi cho Tier 2 (Smart Hybrid Segmentation)

Dựa trên tài liệu `implementation_plan_1.md`, đây là danh sách chi tiết các công việc cần thực hiện dành cho Tier 2 (Coder). Bạn cần thực hiện cẩn thận theo từng nhiệm vụ dưới đây:

## Nhiệm vụ 1: Cập nhật Kiểu Dữ liệu (Types)
**File**: `src/types/index.ts`
- **Thực hiện**: 
  - Xoá bỏ hoàn toàn type liên quan đến `segmentationMode` (vì ứng dụng sẽ chỉ chạy 1 luồng duy nhất).
  - Bổ sung interface `TimelineBlock` mới:
    ```typescript
    export interface TimelineBlock {
      startTime: number;
      endTime: number;
      text: string;
      isPunctuationEnd: boolean; // Đánh dấu block này kết thúc bằng dấu câu (., ?, !)
    }
    ```

## Nhiệm vụ 2: Xây dựng Thuật toán Core (Text Segmentation)
**File**: `src/utils/textSegmentation.ts`
- **Thực hiện**: Bổ sung bộ 3 hàm xử lý timeline sau (bạn cần tự viết logic bên trong dựa trên mô tả):
  1. `parseSrtToTimeline(srtText: string): TimelineBlock[]`
     - Viết logic đọc chuỗi file SRT chuẩn, bóc tách `startTime`, `endTime`, `text` và check `isPunctuationEnd` để trả về mảng `TimelineBlock`.
  2. `parseTxtToSyntheticTimeline(txt: string, audioDuration?: number): TimelineBlock[]`
     - Tính `WPS` (Words Per Second). Nếu có `audioDuration` thì `WPS = tổng số từ / audioDuration`. Nếu không, mặc định `WPS = 3.5`.
     - Phân tích chuỗi text thành các block ảo, cộng dồn mốc thời gian dựa vào số từ.
     - Phạt thời gian chờ (delay): +0.2s cho dấu `,` và +0.5s cho dấu `. / ? / !`.
  3. `segmentByTimeline(timeline: TimelineBlock[], targetSceneCount: number): string[]`
     - Gom các `TimelineBlock` lại thành đúng `targetSceneCount` cảnh (scenes).
     - Thời lượng mục tiêu mỗi cảnh = Tổng thời lượng / Số cảnh.
     - Ưu tiên cắt cảnh ở những block có `isPunctuationEnd === true` (có thể du di tối đa 4 giây để tìm được dấu câu).

## Nhiệm vụ 3: Tích hợp Service Layer
**File**: `src/services/geminiService.ts`
- **Thực hiện**: Cập nhật hàm `analyzeScriptWithAI`.
  - Thay đổi Parameters: Bỏ tham số `segmentationMode`, thêm tham số `enhanceWithAI: boolean` và `audioDuration?: number`.
  - **Quy trình xử lý mới trong hàm**:
    1. Kiểm tra đầu vào: Gọi `parseSrtToTimeline` (nếu là SRT) hoặc `parseTxtToSyntheticTimeline` (nếu là TXT).
    2. Gọi `segmentByTimeline` để ra mảng `string[]` cơ sở.
    3. Kiểm tra cờ `enhanceWithAI`:
       - Nếu `true`: Đưa mảng `string[]` vừa gom lên cho API AI (Gemini/Kyma) review, nhờ nắn chỉnh lại ranh giới giữa các cảnh sao cho logic về mặt ngữ nghĩa (Giữ nguyên `targetSceneCount`).
       - Nếu `false`: Trả về mảng `string[]` đó để dùng luôn (nhanh, rẻ).

## Nhiệm vụ 4: Cập nhật App State & Root Component
**File**: `src/App.tsx`
- **Thực hiện**:
  - Gỡ bỏ state `segmentationMode`.
  - Khai báo thêm các states mới:
    ```typescript
    const [enhanceWithAI, setEnhanceWithAI] = useState<boolean>(false);
    const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
    const [audioFileName, setAudioFileName] = useState<string | null>(null);
    ```
  - Cập nhật luồng truyền props và gọi hàm phân cảnh để đẩy các giá trị `enhanceWithAI`, `audioDuration` vào đúng chỗ.

## Nhiệm vụ 5: Cập nhật Giao diện (UI)
**File**: `src/components/ControlPanel.tsx`
- **Thực hiện**:
  - Gỡ bỏ toàn bộ code render 3 nút bấm chọn Phương pháp phân cảnh cũ.
  - Tại khu vực chọn "Số lượng cảnh", thiết kế thêm UI:
    - 1 Checkbox: `🧠 Tăng cường độ chuẩn xác bằng AI (Chậm)`. Tick thì set prop `enhanceWithAI` thành `true`.
    - 1 Nút upload file: `🎵 File Audio (Tùy chọn)`.
      - Khi user upload audio, dùng `new Audio()` để load metadata, lấy `duration` của file.
      - Hiển thị tên file và thời lượng (giây) ra UI. Kèm đoạn text nhỏ giải thích: *"Dùng để tính thời lượng ảo cho kịch bản TXT"*.
      - Gọi hàm đẩy `audioDuration` và `audioFileName` ngược lên `App.tsx`.

> Chú ý: Nhớ test cẩn thận các trường hợp TXT chay, TXT + Audio, và file SRT sau khi hoàn thiện code. 
