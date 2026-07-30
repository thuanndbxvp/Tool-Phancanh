# Tiêu chí Nghiệm thu (ACCEPTANCE): Hybrid Segmentation

1. **Khởi chạy thành công**: Ứng dụng không bị crash, không bị lỗi compile TypeScript ở `App.tsx` hoặc `ControlPanel.tsx`.
2. **Giao diện**: Không còn 3 nút "Phương pháp phân cảnh". Thay vào đó là 1 checkbox "Tăng cường độ chuẩn xác bằng AI" và 1 nút upload File Audio.
3. **Luồng TXT mặc định**: Dán 1 kịch bản dài khoảng 200 chữ. Chọn 10 cảnh. Bấm "Tạo". Ứng dụng phải xuất ra đúng 10 cảnh.
4. **Luồng TXT + Audio**: Upload kịch bản TXT, sau đó upload 1 file Audio (mp3) có độ dài khoảng 60 giây. Bấm "Tạo". Ứng dụng nội suy độ dài dựa trên 60s và sinh ra đúng 10 cảnh.
5. **Luồng AI Enhance**: Check vào ô "Tăng cường AI". Bấm "Tạo". Output Progress phải hiện dòng trạng thái "Đang dùng AI nắn chỉnh lại ngữ nghĩa các cảnh...". Sau khi chạy xong vẫn phải giữ nguyên đúng số lượng cảnh đã cài đặt.
