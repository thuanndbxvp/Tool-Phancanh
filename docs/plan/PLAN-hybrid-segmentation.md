# Tái cấu trúc cơ chế Phân cảnh (Smart Hybrid Segmentation)

## Quyết định của Planner (Trả lời AUDIT-REPORT)
Sau khi nhận được `AUDIT-REPORT` và `BLOCKERS`, tôi với vai trò Tier 1 quyết định như sau:
1. **Blocker 1 & 5 (Chữ ký hàm và AsyncGenerator):** Đồng ý hoàn toàn. Sẽ cập nhật MSEW để sửa trực tiếp hàm `analyzeScriptWithAIStream` (đảm bảo logic `yield` progress). Bỏ qua Promise version.
2. **Blocker 2 (App.tsx chữ ký khác):** Đã map lại chính xác 15 tham số từ code thật, thay thế `segmentationMode` bằng `enhanceWithAI`, và thêm `audioDuration`.
3. **Blocker 3 (Mâu thuẫn 2 file):** Xác nhận `docs/plan/MSEW-hybrid-segmentation.md` là ground truth. Coder bỏ qua thư mục `docs/exec`.
4. **Blocker 4 (TypeScript Error khi xóa segmentationMode):** Quyết định: Xóa hẳn mode cũ vì đây là Breaking Change. Trong App.tsx & ControlPanel, gỡ hoàn toàn state và type `segmentationMode`, thay bằng `enhanceWithAI` (boolean).
5. **Blocker 6 (Mất fallback safety):** Đã bổ sung lại `ensureSceneCount` ngay sau đoạn chia `segmentByTimeline`.
6. **Blocker 7 (Tailwind config):** Đổi class `form-checkbox` thành các class Tailwind tiêu chuẩn (w-4 h-4 rounded text-blue-600) để không phụ thuộc plugin forms.
7. **Blocker 8 (Thiếu file framework):** Sẽ cấp đủ `CONTEXT`, `SKILL-ROUTING`, `ACCEPTANCE`.

## Lý do Tái cấu trúc (Refactor)
Hệ thống cũ có quá nhiều Mode phân mảnh (AI, Chia đều, Dấu câu). Kế hoạch này gom tất cả về **1 Luồng xử lý duy nhất (Smart Timeline)**. 

## Data Flow (Luồng Dữ liệu Mới)
1. **Input**: Text kịch bản + [Audio Duration] HOẶC File SRT.
2. **Pre-processing**: Parse thẳng SRT thành `TimelineBlock` hoặc nội suy TXT bằng WPS.
3. **Core Segmentation**: Gom nhóm dựa trên duration & dấu câu. Có xài `ensureSceneCount` backup.
4. **AI Enhancement**: Nếu bật checkbox, gọi Kyma/Gemini nắn chỉnh ranh giới câu chữ, giữ nguyên số lượng.
5. **Output**: Mảng các cảnh (scenes) đi qua luồng sinh hình ảnh/video bình thường.

## Danh sách file cần sửa
1. `src/types/index.ts`
2. `src/utils/textSegmentation.ts`
3. `src/services/geminiService.ts`
4. `src/App.tsx`
5. `src/components/ControlPanel.tsx`
