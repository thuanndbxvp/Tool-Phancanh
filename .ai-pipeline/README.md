# 🚀 Multi-AI Programming Pipeline (3-Tier) — Windows Edition

## 🧠 Triết lý Cốt lõi: "Architect Thinks, Coder Types"

Pipeline này được thiết kế để giải quyết điểm yếu lớn nhất của các mô hình AI lập trình hiện tại: "Khả năng viết code nhanh nhưng tư duy kiến trúc và định hướng kém khi xử lý dự án lớn".

Thay vì giao toàn bộ công việc cho một AI duy nhất, chúng ta chia tách quá trình phát triển thành 3 tầng chuyên biệt, áp dụng triết lý **"Architect Thinks, Coder Types"**:
- Tầng 1 tập trung toàn bộ "trí não" vào việc phân tích, thiết kế, và vạch ra từng vi-bước (micro-steps).
- Tầng 2 đóng vai trò như một "thợ gõ" siêu tốc, tuân thủ tuyệt đối theo định hướng của Tầng 1 và sử dụng các bộ skill có sẵn.
- Tầng 3 hoạt động như một "kẻ soi lỗi", đảm bảo mọi cam kết chất lượng đều được đáp ứng nghiêm ngặt.

Nếu Tầng 2 phải dừng lại để "suy nghĩ" nên viết code gì, dùng hàm nào, hay import từ đâu — thì đó là lỗi hoàn toàn thuộc về Tầng 1.

---

## 🏗️ Sơ đồ Kiến trúc 3 Tầng (3-Tier ASCII Art)

```text
+-----------------------------------------------------------------------------------+
| TẦNG 1: KIẾN TRÚC SƯ (PLANNER - Gemini Pro / O1)                                  |
| 🧠 100% Tư duy & Thiết kế                                                         |
| 🛠️ Input: Yêu cầu + CodeGraph Snapshot + Repomix Bundle                           |
| 📄 Output: PLAN.md | CONTEXT.md | MSEW.md (Core) | SKILL-ROUTING.md | ACCEPTANCE.md |
+----------------------------------------+------------------------------------------+
                                         |
                                         v (Giao việc qua MSEW.md - Không độ trễ, không tối nghĩa)
                                         |
+----------------------------------------+------------------------------------------+
| TẦNG 2: THỢ GÕ (CODER / TYPIST - Claude Code / Qwen / DeepSeek)                   |
| ⚙️ 100% Tuân thủ & Gọi Skill                                                      |
| 🛠️ Input: Các file từ Tầng 1 + Môi trường Windows + Skill Ecosystem               |
| 📄 Output: Source Code | WORKFLOW-STATUS.md | CHANGELOG-EXEC.md | EVIDENCE.md     |
+----------------------------------------+------------------------------------------+
                                         |
                                         v (Bàn giao Code + Log thực thi)
                                         |
+----------------------------------------+------------------------------------------+
| TẦNG 3: KIỂM ĐỊNH VIÊN (AUDITOR - Cursor + Claude / Gemini)                       |
| 🔍 100% Xác thực & Đánh giá ảnh hưởng                                             |
| 🛠️ Input: Code Tầng 2 + ACCEPTANCE.md + CodeGraph Impact Analysis                 |
| 📄 Output: AUDIT-REPORT.md (Score, Passed/Failed/Warnings, Skill Routing Issues)  |
+-----------------------------------------------------------------------------------+
```

---

## 🪟 Hướng dẫn Quick Start trên Windows

Dự án này được cấu hình **hoàn toàn tương thích** với hệ sinh thái Windows (Windows 10/11, PowerShell, CRLF, UTF-8 with BOM).

1. **Khởi tạo môi trường**:
   Mở PowerShell 7+ (hoặc Windows Terminal) và chạy:
   ```powershell
   .\.ai-pipeline\scripts\init-project.ps1
   ```
2. **Cập nhật tri thức (Repomix & CodeGraph)**:
   ```powershell
   .\.ai-pipeline\scripts\run-codegraph.ps1
   # (Tạo Repomix bundle và cập nhật đồ thị CodeGraph trước khi Planner bắt đầu)
   ```
3. **Quy trình chạy 1 task**:
   - Giao yêu cầu cho Tầng 1 (kèm Repomix output) để sinh ra `MSEW.md`.
   - Chạy lệnh kiểm tra MSEW: `.\.ai-pipeline\scripts\verify-msew-quality.ps1`
   - Gọi Tầng 2 đọc `MSEW.md` và thực thi tuần tự.
   - Gọi Tầng 3 đánh giá thông qua script: `.\.ai-pipeline\scripts\verify-pipeline.ps1`

---

## 🔗 Liên kết Nhanh tới Tài liệu

### Nguyên tắc & Quy định (Rules)
- [Quy tắc Chung (Global)](rules/00-global-rules.md)
- [Quy tắc Kiến trúc sư (Planner)](rules/01-planner-rules.md)
- [Quy tắc Thợ gõ (Coder)](rules/02-coder-rules.md)
- [Quy tắc Kiểm định (Auditor)](rules/03-auditor-rules.md)

### Hệ sinh thái Kỹ năng (Skills)
- [Skill Ecosystem](SKILL-ECOSYSTEM.md)
- *Các protocol gọi skill chi tiết nằm trong thư mục `skills/`*

### Biểu mẫu (Templates)
- *Các template như `MSEW.template.md`, `PLAN.template.md` nằm trong thư mục `templates/`*
