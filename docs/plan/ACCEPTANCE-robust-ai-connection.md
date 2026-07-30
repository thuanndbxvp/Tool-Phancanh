# Tiêu chí Nghiệm thu (ACCEPTANCE): Robust AI Connection

1. **Test Nút Check API**: Mở Cài đặt API, nhập Key Gemini hoặc Kyma rồi nhấn "Kiểm tra". Nó phải phản hồi cực nhanh (dưới 1s) vì chỉ fetch danh sách Model thay vì sinh Content.
2. **Kháng lỗi JSON**: Chọn chế độ "Tăng cường độ chuẩn xác bằng AI". Dù hệ thống AI có trả về text chứa \`\`\`json hay rác, script vẫn không được báo lỗi parse JSON. Quá trình chia cảnh diễn ra bình thường, output vẫn đủ số cảnh.
3. **TypeScript**: `npm run build` không báo lỗi, đặc biệt ở các nơi gọi hàm `withRetry` cũ.
