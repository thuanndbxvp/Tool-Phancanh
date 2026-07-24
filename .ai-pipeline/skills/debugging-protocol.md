# 🐛 Giao thức Gỡ lỗi (Debugging Protocol)

## 1. Quy trình Debug 7 Bước
1. **Tiếp nhận:** Đọc mô tả lỗi / issue từ log hoặc user.
2. **Tái tạo (Reproduce):** Chạy lệnh PowerShell để bắt lỗi trực tiếp. Phải có log báo lỗi thì mới qua bước 3.
3. **Phân vùng:** Xác định file hoặc hàm bị lỗi (VD: `src/api/views.py` dòng 45).
4. **Gọi Skill:** Gọi skill `debugging` hoặc `chrome-devtools` tùy ngữ cảnh.
5. **Xây dựng giả thuyết:** Đặt ra 2-3 nguyên nhân có thể gây ra lỗi.
6. **Thử nghiệm & Thu thập Evidence:** Chèn log hoặc sửa mã tạm thời, chạy thử để chứng minh giả thuyết.
7. **Sửa lỗi & Ghi nhận:** Xóa mã debug, áp dụng bản vá cuối cùng, lưu log báo cáo.

## 2. Định tuyến Skill (Skill Routing)
- **Dùng `debugging` khi:** Lỗi logic server, lỗi crash Python (Exception, Traceback), sai dữ liệu cơ sở dữ liệu.
- **Dùng `chrome-devtools` khi:** Lỗi giao diện, lỗi CSS không hiển thị, lỗi API trả về đúng nhưng Frontend không render, Network Waterfall có vấn đề.

## 3. Cách Tái tạo Lỗi và Evidence
KHÔNG BAO GIỜ nói "đã sửa lỗi" nếu chưa chứng minh được lỗi đó tồn tại.
- **Chứng minh lỗi tồn tại (Before):**
  ```powershell
  # Lệnh chạy
  pytest tests/test_login.py
  # Output (báo fail, Exception)
  ```
- **Chứng minh lỗi đã fix (After):**
  ```powershell
  # Lệnh chạy
  pytest tests/test_login.py
  # Output (báo PASSED)
  ```

## 4. Chuẩn mực Log Format (Trong Code)
Khi chèn log để debug, dùng thư viện `logging`:
```python
import logging
logger = logging.getLogger(__name__)

# BẮT BUỘC ghi rõ bối cảnh
logger.error("Failed to parse JSON for user_id=%s. Raw data: %s", user.id, raw_data)
# CẤM DÙNG:
# print("Error parsing")
```
