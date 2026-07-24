<!-- Hướng dẫn (Dành cho Tầng 3 - Auditor): 
Báo cáo kiểm định toàn diện.
Auditor chạy CodeGraph MCP để truy vết lỗi.
-->

# Báo cáo Kiểm định (AUDIT-REPORT): <Tên Tính Năng>

## 1. Trạng thái Các Bước (Step Status)
### ✅ Passed Steps (Đạt tiêu chuẩn)
- **Step X:** Lý do đạt (code chuẩn, evidence đầy đủ).

### ⚠️ Warnings (Cảnh báo - Cần chú ý nhưng không fail)
- **Step Y:** <Ví dụ: Test pass nhưng thiếu type hint Python 3.10 ở dòng X>.

### ❌ Failed Steps (Lỗi nặng - Phải làm lại)
- **Step Z:** <Lý do failed>.

## 2. 🎯 Đánh giá Định tuyến Kỹ năng (Skill Routing Issues)
- Tầng 1 đã chọn đúng skill chưa? <Đúng/Sai, lý do>
- Tầng 2 có tuân thủ gọi đúng skill không? <Có/Không>
- Lỗi tìm thấy: <Feedback ngược lại Tầng 1>

## 3. 🔍 CodeGraph Impact Analysis (BẮT BUỘC)
- **Impacted Symbols (từ `codegraph_impact`):** 
  - `<Hàm A bị ảnh hưởng bởi thay đổi ở Hàm B>`
- **Caller Verification (từ `codegraph_callers`):**
  - `<Kiểm tra caller cũ có bị sập do thay đổi signature không>`
- **Symbol Cross-Reference (từ `codegraph_search`):**
  - `<Tìm thấy symbol rác hoặc duplicate không>`
- **Kết luận Scope Creep:** <Phát hiện Coder sửa sai file ngoài phạm vi MSEW hay không?>

## 4. 📊 Rubric Chấm điểm (0 - 10)
- **Tư duy Kiến trúc (Planner):** `<Score>`/10 (MSEW rõ ràng, chính xác)
- **Độ chính xác Code (Coder):** `<Score>`/10 (Gõ chuẩn không sai sót)
- **Tuân thủ Convention & Format:** `<Score>`/10 (Type hints, CRLF, v.v.)
- **Hiệu năng & Bảo mật:** `<Score>`/10 (Tuân thủ ACCEPTANCE)
- **Zero Hallucination (Chống ảo giác):** `<Score>`/10 (Có đủ EVIDENCE 100%)

## 5. Đề xuất Khắc phục (Recommendations)
- **Hành động 1:** <Dành cho Coder>
- **Hành động 2:** <Dành cho Planner>
