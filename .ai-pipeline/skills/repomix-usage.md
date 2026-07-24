# 📦 Hướng dẫn Sử dụng Repomix

Repomix là công cụ đóng gói (bundle) toàn bộ mã nguồn của dự án thành một file văn bản duy nhất để AI (Planner) có thể đọc toàn bộ context.

## 1. Repomix trên Windows
Repomix chạy thông qua npx (Node.js). Phải đảm bảo đã cài Node.js trên Windows.

## 2. Các Lệnh Repomix (PowerShell)
Luôn chạy lệnh trong thư mục gốc của dự án.

```powershell
# Bundle cơ bản (mặc định tạo ra file repomix-output.xml hoặc .txt)
npx repomix

# Tùy chỉnh include và exclude (Rất quan trọng để tránh quá tải token)
npx repomix --include "src/**/*.py, tests/**/*.py" --exclude "venv, __pycache__, .git, *.pyc" --output CONTEXT_BUNDLE.md
```

## 3. Đưa Output vào `CONTEXT.md`
- **Tầng 1 (Planner):** Trách nhiệm của bạn là sinh ra file `CONTEXT.md` sạch sẽ.
- File `CONTEXT.md` không nên là bản copy paste y nguyên 10MB của Repomix.
- Planner phải đọc bundle của Repomix, lọc ra những class/function liên quan đến Task hiện tại, và tóm tắt lại vào `CONTEXT.md` để Tầng 2 dễ đọc.

## 4. Best Practices với Repomix
- Luôn exclude thư mục `venv`, `node_modules`, và `.ai-pipeline` để tránh token rác.
- Khuyên dùng định dạng `.md` hoặc `.xml` khi chạy lệnh để Planner dễ parse cấu trúc file.
