# 🕸️ Hướng dẫn Sử dụng CodeGraph

CodeGraph là công cụ phân tích dependency và impact (side-effects) siêu tốc dựa trên SQLite.

## 1. Mục đích Sử dụng trong Pipeline
- **Tầng 1 (Planner):** Dùng `codegraph_context` để lấy bức tranh toàn cảnh trước khi lên PLAN.md. Tránh việc gọi một hàm mà không biết nó ảnh hưởng tới đâu.
- **Tầng 3 (Auditor):** Dùng `codegraph_impact` để kiểm định xem những file mà Tầng 2 vừa sửa có phá vỡ module nào khác không.

## 2. Command CodeGraph trên Windows (PowerShell)
Nếu CodeGraph được cài đặt dưới dạng CLI:

```powershell
# Quét codebase và xây dựng/cập nhật index SQLite
codegraph index .\src\

# Lấy context của một file/hàm cụ thể (Xuất JSON)
codegraph context "src\api\auth.py" --format json > codegraph_snapshot.json

# Phân tích ảnh hưởng của một hàm nếu bị sửa
codegraph impact "verify_token"
```

## 3. Cách Tầng 1 tận dụng CodeGraph Snapshot
Planner phải đọc nội dung JSON (hoặc Markdown) do CodeGraph xuất ra và đưa vào `CONTEXT.md`:
```markdown
## CodeGraph Snapshot
- **Hàm `verify_token`:** Được gọi bởi 12 hàm khác trong `views.py`.
- => Nếu sửa hàm này, phải sửa cả 12 hàm kia. Cần cập nhật MSEW.
```

## 4. Tuyệt đối: PowerShell Không Dùng Bash
Lưu ý: Không dùng cú pháp `codegraph index ./src/ > out.json &` kiểu bash. Sử dụng cú pháp redirection hoặc Start-Job thuần của Windows.
