# 📜 Quy tắc Chung Toàn Hệ Thống (Global Rules)

Quy tắc này áp dụng cho TẤT CẢ các Tầng (1 và 2). Không có ngoại lệ.

## 1. Ngôn ngữ (Language)
- **Code (Tên biến, hàm, class, schema):** 100% Tiếng Anh.
- **Tài liệu (Plan, MSEW, Audit, README):** Tiếng Việt rõ ràng, mạch lạc, dùng thuật ngữ IT tiếng Anh mà không cần dịch (ví dụ: "Tạo endpoint", không viết "Tạo điểm cuối").
- **Comment / Docstring trong code:** Tiếng Việt (hoặc Tiếng Anh nếu dự án bắt buộc thống nhất Tiếng Anh 100%, hãy hỏi Planner ở Phase 0).

## 2. Các hành vi BỊ CẤM Tuyệt Đối ❌
- **Cấm Hardcode Secrets:** Không để lộ API Key, JWT Secret, mật khẩu DB trong code. Bắt buộc dùng `os.getenv` hoặc thư viện `.env`.
- **Cấm `print` để Debug trên Production:** Sử dụng logging module của Python (`logger.info`, `logger.error`). `print` chỉ được dùng tạm thời trong script nháp (scratch).
- **Cấm `except: pass` hoặc `except Exception as e: pass`:** Bắt buộc bắt ngoại lệ cụ thể, và phải log lỗi ra hoặc raise tiếp. Swallowing errors (nuốt lỗi) là tội ác.

## 3. Yêu cầu Code BẮT BUỘC ✅
- **Python Type Hints:** Bắt buộc sử dụng Type Hints của Python 3.10+ (vd: `list[str]`, `str | None` thay vì `Union` từ `typing`).
- **Docstrings:** Bắt buộc có docstring chuẩn (Google format hoặc Sphinx) cho mọi public functions, classes, và modules phức tạp.

## 4. Định dạng và Tiêu chuẩn (Formatting)
- **Linter & Formatter:** Bắt buộc tuân theo chuẩn của **Black** (formatting), **Ruff** (linting), và **isort** (import sorting).
- **Git Commit Messages:** Tuân thủ Conventional Commits format:
  - `feat: [Mô tả]`
  - `fix: [Mô tả]`
  - `refactor: [Mô tả]`
  - `docs: [Mô tả]`
  - `test: [Mô tả]`
  - (Mở rộng cho Tầng 2: Thêm `Skills used: [skill1, skill2]` ở body của commit message).

## 5. Quy tắc Anti-Hallucination (Chống Ảo Giác)
- **Evidence-based (Dựa trên bằng chứng):** Mọi khẳng định (ví dụ: "Đã sửa xong lỗi", "Hàm này chạy mất 10ms") đều BẮT BUỘC phải có Evidence kèm theo (Log terminal, kết quả chạy test, screenshot nếu có thể).
- Nếu không chắc chắn, không được đoán. Bắt buộc gọi skill `docs-seeker` hoặc `research`, hoặc yêu cầu user cung cấp thêm file.

## 6. Môi trường Windows-Specific 🪟
- **Đường dẫn (Path convention):** Hiểu và dùng dấu `\` cho các script điều hành, PowerShell. Chấp nhận dấu `/` trong code Python (vì Python tự xử lý đa nền tảng), nhưng tuyệt đối không giả định đang ở môi trường `/home` hay `/tmp` của Linux.
- **Line Ending:** CRLF. Tầng 2 phải chú ý nếu tự gen code thì giữ nguyên line ending của file hiện tại (thường là CRLF trên Windows).
- **Encoding:** UTF-8 (Bắt buộc giữ BOM nếu file gốc có BOM để tránh lỗi hiển thị trên Notepad/Visual Studio).
