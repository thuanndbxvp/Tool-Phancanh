# Refactoring and Bug Fix Plan

Dựa trên yêu cầu của bạn, chúng ta cần tái cấu trúc (refactor) toàn diện ứng dụng và khắc phục 2 lỗi nghiêm trọng liên quan đến quá trình xử lý kịch bản của AI (lỗi "nuốt kịch bản" và lỗi "chia phân cảnh không đều").

## Nguyên nhân của 2 lỗi hiện tại
- **Lỗi 1 (Nuốt kịch bản)**: Hiện tại, ứng dụng đang gửi toàn bộ kịch bản (có thể dài hàng ngàn chữ) vào AI trong một lần gọi và yêu cầu AI tự chia đoạn, đồng thời viết prompt cho từng đoạn. Do AI có giới hạn về độ dài output (output token limit) và dễ bị "ảo giác" (hallucinate) hoặc tóm tắt khi xử lý văn bản dài, dẫn đến việc văn bản gốc bị cắt xén, thiếu sót hoặc AI chỉ trả về các tiêu đề ngắn gọn để tiết kiệm token.
- **Lỗi 2 (Chia phân cảnh không đều)**: AI không giỏi trong việc đếm từ và đếm đoạn chính xác. Khi yêu cầu AI chia kịch bản dài thành đúng 10 đoạn đều nhau, AI thường cắt vụn phần đầu và "nhồi nhét" toàn bộ nội dung còn lại vào đoạn cuối cùng. Ngoài ra, hàm fallback `adjustSceneCount` hiện tại gộp/cắt chuỗi một cách cơ học dựa trên độ dài (string length) khiến các đoạn bị lệch độ dài nghiêm trọng.

## Giải pháp (Bug Fixes)
Chúng ta sẽ thay đổi luồng xử lý (pipeline) của việc phân cảnh:
1. **Tiền xử lý (Pre-segmentation) bằng Code (KHÔNG dùng AI)**:
   - Sử dụng Javascript để cắt kịch bản thành các câu/đoạn nhỏ một cách chính xác dựa trên dấu câu (dấu chấm, phẩy, xuống dòng).
   - Nếu ở chế độ **"Số cảnh cố định" (Fixed)**: Code sẽ tính toán số lượng chữ trung bình cho mỗi cảnh (Ví dụ: 2000 chữ / 10 cảnh = 200 chữ/cảnh), sau đó tự động gom các câu lại sao cho mỗi cảnh đạt độ dài xấp xỉ 200 chữ. Điều này đảm bảo 100% số cảnh chia ra **đều nhau** (Sửa Lỗi 2).
   - Code thực hiện phân đoạn đảm bảo **không một chữ nào bị nuốt** (Sửa Lỗi 1).
2. **Xử lý Batch AI (Batch Processing)**:
   - Thay vì gửi 1 cục kịch bản khổng lồ, ứng dụng sẽ gửi từng danh sách các cảnh (đã được cắt đều) cho AI (ví dụ: mỗi lần gửi 5 cảnh).
   - Nhiệm vụ của AI lúc này chỉ đơn giản là: "Đọc 5 cảnh này và viết Prompt hình ảnh/video cho nó".
   - Cách này giúp AI tập trung, output ngắn, không vi phạm token limit và chất lượng prompt cao hơn.

## Refactor Toàn diện (Refactoring Strategy)
File `App.tsx` hiện tại quá lớn (~1500 dòng), chứa tất cả UI, Logic, Types, Modals, và SVGs.
Chúng ta sẽ chuyển cấu trúc dự án sang chuẩn React hiện đại bằng cách tạo thư mục `src` và chia nhỏ file:

- **`src/types/index.ts`**: Chứa toàn bộ Interfaces (`ScenePrompt`, `ApiKeyData`, `SavedSession`,...).
- **`src/utils/helpers.ts`**: Chứa các hàm tiện ích (`exportToExcel`, `getTimestamp`, logic tiền xử lý kịch bản `segmentScript`).
- **`src/services/geminiService.ts`**: Cập nhật hàm gọi AI để hỗ trợ xử lý mảng kịch bản đầu vào (Batch processing).
- **`src/components/icons.tsx`**: Lưu trữ toàn bộ các SVG icons (UploadIcon, DocumentIcon,...).
- **`src/components/modals/`**: Tách các modals (`ApiSettingsModal`, `LibraryModal`, `GuideModal`).
- **`src/components/ControlPanel.tsx`**: Tách phần bảng điều khiển.
- **`src/components/WelcomeGuide.tsx`**: Tách phần hướng dẫn.
- **`src/App.tsx`**: File chính chỉ dùng để quản lý state và layout tổng thể.
- **`index.html` & `index.tsx`**: Cập nhật đường dẫn cho phù hợp với thư mục `src/`.

## User Review Required
> [!IMPORTANT]
> **Về việc tạo thư mục `src`**: Dự án của bạn hiện tại các file code đang để ở ngoài thư mục gốc (`d:\tool-phancanh`). Việc refactor này sẽ di chuyển toàn bộ code vào bên trong một thư mục mới là `d:\tool-phancanh\src\`. Điều này là chuẩn mực (best practice) của các dự án Vite/React.
> Vui lòng xác nhận bạn đồng ý với cấu trúc thư mục mới này và giải pháp kỹ thuật đã nêu ở trên để mình bắt đầu tiến hành.

## Proposed Changes

### 1. File cấu hình & Root
#### [MODIFY] `index.html` (Cập nhật đường dẫn file index)
#### [NEW] `src/index.tsx` (Di chuyển từ root)
#### [DELETE] `index.tsx`

### 2. Utils & Types
#### [NEW] `src/types/index.ts`
#### [NEW] `src/utils/helpers.ts`
#### [NEW] `src/utils/constants.ts` (Style presets, Models)

### 3. Components
#### [NEW] `src/components/icons/index.tsx`
#### [NEW] `src/components/modals/ApiSettingsModal.tsx`
#### [NEW] `src/components/modals/LibraryModal.tsx`
#### [NEW] `src/components/modals/GuideModal.tsx`
#### [NEW] `src/components/ControlPanel.tsx`
#### [NEW] `src/components/WelcomeGuide.tsx`
#### [NEW] `src/components/Toast.tsx`

### 4. Main App & Services
#### [MODIFY] `src/services/geminiService.ts`
#### [NEW] `src/App.tsx`
#### [DELETE] `App.tsx`

## Verification Plan
1. **Automated Tests**: Chạy câu lệnh `npm run lint` để đảm bảo code refactor không gặp lỗi về logic và interface.
2. **Manual Verification**: 
   - Khởi chạy app.
   - Paste một script rất dài (khoảng 1000 - 2000 chữ).
   - Chọn "Số cảnh cố định" là 5.
   - Bấm "Tạo Storyboard Pro" và kiểm tra:
     - Số lượng phân cảnh đầu ra có đúng là 5 hay không.
     - Độ dài của các đoạn kịch bản (`scriptLine`) có xấp xỉ nhau (đều nhau) không.
     - Có bị mất/sót đoạn văn nào từ kịch bản gốc không.
