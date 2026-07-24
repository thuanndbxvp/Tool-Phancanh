# 🐍 Giao thức Dự án Python (Python Project Protocol)

## 1. Môi trường & Convention (Python 3.10+)
Toàn bộ dự án tuân thủ tiêu chuẩn Python 3.10 trở lên.
- Sử dụng Type Hints bắt buộc: `list[str]`, `dict[str, Any]`, `str | None`.
- Không sử dụng các module cũ (e.g., `typing.List`, `typing.Dict`).
- Sử dụng Data Classes (`@dataclass`) hoặc Pydantic cho các object cấu trúc dữ liệu.
- Định dạng code bằng **Black** và **Ruff**.

## 2. Cấu trúc Thư mục Chuẩn
```text
project_root/
├── .ai-pipeline/      # Cấu hình AI Pipeline
├── src/               # Source code chính
│   └── app_name/      # Package name
├── tests/             # Unit & Integration tests
├── docs/              # Tài liệu dự án
├── requirements.txt   # (hoặc pyproject.toml)
└── venv/              # Virtual Environment (không commit)
```

## 3. Quản lý Môi trường Ảo (Virtual Environment) trên Windows

### A. Dùng `venv` (Standard)
```powershell
# Tạo môi trường
python -m venv venv

# Kích hoạt môi trường (PowerShell)
.\venv\Scripts\Activate.ps1

# Cài đặt dependency
pip install -r requirements.txt
```

### B. Dùng `poetry`
```powershell
# Khởi tạo và cài đặt
poetry install

# Chạy lệnh trong môi trường ảo
poetry run python src/app_name/main.py

# Hoặc kích hoạt shell
poetry shell
```

### C. Dùng `uv` (Khuyên dùng vì tốc độ siêu nhanh)
```powershell
# Tạo môi trường với uv
uv venv

# Kích hoạt (PowerShell)
.\.venv\Scripts\Activate.ps1

# Cài đặt siêu tốc
uv pip install -r requirements.txt
```

## 4. Xử lý Lỗi Phổ Biến trên Windows
- Lỗi Execution Policy khi chạy `Activate.ps1`:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- Lỗi encoding khi đọc file: Luôn dùng `open("file.txt", "r", encoding="utf-8")`.
