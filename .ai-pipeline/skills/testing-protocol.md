# 🧪 Giao thức Kiểm thử (Testing Protocol)

## 1. Tiêu chuẩn Kiểm thử (pytest)
Toàn bộ hệ thống test viết bằng `pytest`.
- Thư mục test BẮT BUỘC đặt tên là `tests/` ở root dự án.
- Tên file test bắt đầu bằng `test_*.py`.
- Tên hàm test bắt đầu bằng `test_*()`.

## 2. Test Coverage
- **Bắt buộc:** Tối thiểu 80% line coverage đối với code mới.
- **Công cụ:** `pytest-cov`.

## 3. Fixtures và Mocking Pattern
- Mọi dữ liệu giả (mock data) hoặc đối tượng dùng chung phải được đưa vào `conftest.py` dưới dạng `@pytest.fixture`.
- Cấm gọi CSDL thật, API bên ngoài thật trong Unit Test. Phải dùng `unittest.mock.patch` hoặc `pytest-mock` (`mocker`).

Ví dụ Mocking đúng chuẩn:
```python
def test_fetch_user(mocker):
    # Mock hàm gọi database
    mock_db = mocker.patch("src.db.operations.get_user_by_id")
    mock_db.return_value = {"id": 1, "name": "Test"}
    
    # Assert
    assert process_user(1) == "Test"
    mock_db.assert_called_once_with(1)
```

## 4. Lệnh chạy Test trên Windows PowerShell
```powershell
# Chạy toàn bộ test
pytest

# Chạy test chi tiết với print logs (-v -s)
pytest -v -s

# Chạy test cho một file cụ thể
pytest tests\test_auth.py

# Chạy test và tạo báo cáo Coverage
pytest --cov=src --cov-report=term-missing
```
