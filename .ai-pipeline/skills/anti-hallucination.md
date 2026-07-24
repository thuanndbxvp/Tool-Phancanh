# 🛑 Giao thức Chống Ảo Giác (Anti-Hallucination Protocol)

Ảo giác (Hallucination) là khi AI (Coder Tầng 2 hoặc Planner Tầng 1) tự bịa ra thông tin không có thật, đoán kết quả mà chưa chạy lệnh, hoặc cho rằng một hàm tồn tại trong khi nó không có.

## 1. "Báo cáo Ảo" là gì?
- **Ví dụ 1:** "Hệ thống chạy mượt mà sau khi sửa" (Trong khi chưa hề gọi lệnh chạy).
- **Ví dụ 2:** "File cấu hình đã được thêm thành công" (Nhưng lưu sai đường dẫn).

## 2. BẮT BUỘC Evidence (Bằng chứng)
Bất cứ khi nào khai báo một hành động đã xong, Tầng 2 BẮT BUỘC phải paste **Command** đã chạy và **Output** thực tế (Terminal log) vào file `EVIDENCE.md`.
```markdown
# Ví dụ Evidence chuẩn:
**Command:**
`pwsh -Command "python -c 'import sys; print(sys.version)'"`

**Output:**
`3.10.11 (tags/v3.10.11:7d4cc5a, Apr  5 2023, 00:38:17) [MSC v.1927 64 bit (AMD64)] on win32`
```

## 3. Từ Vựng BỊ CẤM (Banned Words)
Cấm sử dụng các từ thể hiện sự phỏng đoán trong tài liệu và báo cáo:
- ❌ "seems" (có vẻ như)
- ❌ "should" (chắc là sẽ chạy)
- ❌ "might" (có thể)
- ❌ "probably" (có lẽ)

**Thay vào đó, dùng:**
- ✅ "Confirmed by output:" (Được xác nhận qua output:)
- ✅ "Tested with result:" (Đã test với kết quả:)

## 4. Quy tắc "UNKNOWN"
Nếu bạn (AI) không chắc chắn về cấu trúc file, thư viện, hoặc môi trường, hãy nói ngay:
`UNKNOWN: Tôi không có dữ liệu về X. Xin hãy chạy lệnh [Y] để cung cấp thông tin.`
Tuyệt đối không đoán mò tên file hay tên hàm.
