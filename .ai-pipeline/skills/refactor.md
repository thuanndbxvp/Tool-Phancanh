---
description: Thực hiện Refactor (Tái cấu trúc) code một cách an toàn mà không làm thay đổi logic nghiệp vụ.
---

# LỆNH REFACTOR (MÔ HÌNH 2 TẦNG)
Lệnh `/refactor` được sử dụng để làm sạch code, tái cấu trúc thư mục, hoặc áp dụng Clean Code/SOLID mà **TUYỆT ĐỐI KHÔNG ĐƯỢC** làm thay đổi logic nghiệp vụ hiện tại. 
Tùy vào bạn đang đóng vai Tầng nào, hãy hành xử theo đúng kịch bản dưới đây:

# QUY TRÌNH THỰC THI THEO 2 TẦNG

## Kịch bản A: Nếu bạn là Tầng 1 (Planner / Kiến Trúc Sư)
Khi User gọi `/refactor` với bạn, nhiệm vụ của bạn là **Chẩn đoán & Lên Phác Đồ**:
1. Đọc kỹ file/đoạn code bị bốc mùi (Code Smell) hoặc cấu trúc thư mục lộn xộn.
2. Thiết kế phương án cấu trúc mới (tách Component, áp dụng Hook, Repository Pattern...).
3. Sinh ra 2 file: 
   - `docs/plan/PLAN-refactor-xxx.md`: Giải thích vì sao cần sửa, kiến trúc mới sẽ trông như thế nào.
   - `docs/plan/MSEW-refactor-xxx.md`: Hướng dẫn cắt dán code chi tiết để Tầng 2 thi công.
   *(Nhắc User copy lệnh `/code refactor-xxx` cho Tầng 2)*

## Kịch bản B: Nếu bạn là Tầng 2 (Kỹ Sư Thực Thi)
Khi User gọi lệnh refactor với bạn, nhiệm vụ của bạn là **Thi Công & Tự Nghiệm Thu**:
1. Đọc kỹ bản vẽ `MSEW-refactor-xxx.md` (nếu có), hoặc đọc trực tiếp yêu cầu của User.
2. Chỉnh sửa code theo đúng nguyên tắc thép:
   - KHÔNG thêm tính năng mới.
   - KHÔNG xóa comment giải thích logic cũ.
   - Dùng CodeGraph (nếu có) để đảm bảo không làm break những file đang `import` hàm bị sửa.
3. Ngay sau khi sửa xong, **Tự động Audit**:
   - Trả lời 2 câu hỏi sinh tử: "Nó có làm gãy tính năng cũ không?" và "Linter có đang báo lỗi đỏ không?".
   - Nếu sạch sẽ, hô "PASS" bằng Tiếng Việt. Nếu có lỗi, tự động fix lại ngay lập tức.

---
*Cách dùng lệnh:*
`/refactor <tên-file> [chi-tiết-muốn-refactor]`
Ví dụ: `/refactor src/app/layout.tsx tách cái Sidebar ra thành component riêng`
