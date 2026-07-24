<!-- Hướng dẫn (Dành cho Tầng 1 - Planner): 
Định nghĩa tiêu chí để Auditor (Tầng 3) nghiệm thu công việc.
-->

# Tiêu chí Nghiệm thu (ACCEPTANCE): <Tên Tính Năng>

## 1. Tiêu chuẩn Chức năng (Functional Criteria)
- [ ] Tính năng A hoạt động đúng như thiết kế.
- [ ] API trả về response Code 200/201 kèm dữ liệu đúng chuẩn.
- [ ] Giao diện (nếu có) hiển thị đúng theo mô tả.

## 2. Tiêu chuẩn Phi chức năng (Non-functional)
- **Hiệu năng:** <Ví dụ: Thời gian phản hồi API < 200ms>
- **Bảo mật:** <Ví dụ: Không rò rỉ JWT token trong logs, không SQL injection>
- **Giao diện:** <Ví dụ: Không vỡ layout trên màn hình 1080p>

## 3. Mục tiêu Test Coverage
- Mức coverage yêu cầu tối thiểu: `<80%>`
- File cần đạt coverage 100%: `<src\api\auth.py>`

## 4. Các bước Manual Verification (Windows)
(Dành cho Tầng 3 Auditor tự chạy bằng PowerShell)
```powershell
# Bước 1: Khởi động app
.\venv\Scripts\Activate.ps1
uvicorn src.main:app --reload

# Bước 2: Dùng curl (PowerShell version) gọi thử API
Invoke-RestMethod -Uri "http://localhost:8000/api/test" -Method Get

# Bước 3: Đảm bảo có dữ liệu Json trả về hợp lệ.
```
