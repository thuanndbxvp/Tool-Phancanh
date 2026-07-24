# 🪄 Giao thức Gọi Skill (Skill Invocation Protocol)

## 1. Cách Gọi Skill trong Môi Trường Claude Code (hoặc Tương Đương)
Tầng 2 (Coder) KHÔNG ĐƯỢC làm việc "tay không". Mọi hành động lập trình phải được kẹp trong ngữ cảnh của một **Skill**.

**Cú pháp suy nghĩ & gọi:**
Trước khi thực hiện một cụm logic, Tầng 2 phải có bước thông báo nội bộ:
```text
[SKILL INVOCATION]
Target Skill: frontend-development
Reason: Thực thi Step 3 trong MSEW (Sửa component React).
```

## 2. Ví dụ Gọi Skill Cụ Thể

- **Skill `databases`:**
  - *Khi nào:* Tạo model SQLAlchemy, viết câu query, tạo file migration.
  - *Hành động:* Khởi tạo kết nối DB, sinh câu SQL.

- **Skill `ui-styling`:**
  - *Khi nào:* Viết file `.css`, chỉnh sửa Tailwind classes trong HTML.
  - *Hành động:* Thiết kế layout mượt, đảm bảo responsive.

## 3. Anti-Patterns (Cấm kỵ khi gọi Skill)
- ❌ **Gọi rồi không dùng:** Declare gọi skill `aesthetic` nhưng chỉ sửa 1 lỗi logic biến `a = b` (sai mục đích).
- ❌ **Gọi tạp nham:** Gọi một lúc 3 skills `backend-development, payment-integration, chrome-devtools` cho 1 step nhỏ. Việc này làm rối Context (nhiễu). Mỗi Step chỉ dùng 1 Primary Skill (hoặc 1 Fallback).

## 4. Ghi nhận Bằng chứng (Evidence) cho Tầng 3
Để Auditor (Tầng 3) biết bạn có thực sự gọi Skill hay không, sau mỗi step, Tầng 2 BẮT BUỘC ghi vào `SKILL-USAGE.md`:
```markdown
- **Step 4:** 
  - Skill requested by Planner: `backend-development`
  - Skill actually invoked: `backend-development`
  - Status: Thành công.
```
Nếu Coder phải dùng Fallback vì Primary hỏng, phải giải thích lý do ngắn gọn.
