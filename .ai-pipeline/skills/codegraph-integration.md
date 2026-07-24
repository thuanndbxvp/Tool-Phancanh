# 🕸️ Tích hợp CodeGraph MCP (CodeGraph Integration)

## 1. Giới thiệu CodeGraph MCP
Khác với CLI xuất JSON ở phiên bản trước, **CodeGraph MCP** cung cấp khả năng truy vấn *semantic code intelligence* trực tiếp cho AI agents. Vì CodeGraph tự động đồng bộ (auto-sync) khi file thay đổi, các Agent có thể hỏi trực tiếp codebase theo thời gian thực mà không sợ state bị cũ.

Để kích hoạt toàn bộ tools trên Windows, hãy chạy:
```powershell
[System.Environment]::SetEnvironmentVariable('CODEGRAPH_MCP_TOOLS', 'all', 'User')
```

## 2. Danh mục 7 CodeGraph MCP Tools

| Tool | Chức năng | Ai dùng? | Mục đích / Khi nào dùng? |
| :--- | :--- | :--- | :--- |
| `codegraph_explore` | Lấy tổng quan (files, call paths, blast radius) | Tầng 1 | BẮT BUỘC dùng đầu tiên để lấy cái nhìn toàn cảnh về module. |
| `codegraph_search` | Tìm kiếm symbol (hàm/class) theo tên | Tầng 1, 2, 3 | Dùng để tìm file/dòng code của 1 hàm bất kỳ. |
| `codegraph_node` | Lấy code chi tiết của 1 symbol | Tầng 1, 2 | Xem chi tiết logic hàm hiện tại. |
| `codegraph_callers` | Tìm tất cả các hàm đang gọi tới hàm X | Tầng 1, 3 | BẮT BUỘC để xem "nếu sửa hàm này thì ai chết". |
| `codegraph_callees` | Tìm tất cả các hàm mà hàm X đang gọi | Tầng 1, 2 | Xem hàm này đang phụ thuộc những ai. |
| `codegraph_impact` | Phân tích side-effect lan truyền | Tầng 3 | BẮT BUỘC Auditor chạy để dò tìm Scope Creep. |
| `codegraph_files` / `status` | Utility xem file tree và trạng thái index | Tầng 1 | Verify cấu trúc thư mục. |

## 3. Quy tắc Bắt buộc cho Từng Tầng

- **Tầng 1 (Kiến trúc sư - Planner):**
  - **BẮT BUỘC** gọi theo thứ tự: `codegraph_explore` ➔ `codegraph_search` ➔ `codegraph_callers` TRƯỚC khi bắt tay vào viết MSEW.
  - Phải đưa kết quả quét vào file `CONTEXT.md`.
  
- **Tầng 2 (Thợ gõ - Coder):**
  - **CÓ THỂ** dùng `codegraph_node`, `codegraph_search`, `codegraph_callees` để verify xem code mình chuẩn bị viết có match với signature cũ không. 
  - **KHÔNG ĐƯỢC PHÉP** lợi dụng CodeGraph để tự ý refactor các caller bên ngoài phạm vi MSEW.
  
- **Tầng 3 (Kiểm định viên - Auditor):**
  - **BẮT BUỘC** chạy `codegraph_impact` + `codegraph_callers` + `codegraph_search` sau khi Coder xong việc.
  - Nếu CodeGraph báo có file ngoài MSEW bị ảnh hưởng ➔ Fail ngay lập tức (Lỗi Scope Creep).

## 4. Prompts Mẫu (Dành cho AI Agents)

**Prompt cho Gemini (Planner):**
> "Hãy invoke tool `codegraph_explore` với query 'UserService login' để xem luồng đăng nhập. Sau đó dùng `codegraph_callers` lên hàm 'validate_password' để biết có bao nhiêu endpoint sẽ sập nếu ta đổi signature của hàm này."

**Prompt cho Claude Code (Coder):**
> "Tôi sẽ dùng `codegraph_node` để đọc code cũ của hàm X, sau đó ghi đè đoạn code theo đúng MSEW, và cuối cùng dùng `codegraph_callees` để check xem tôi đã gọi đủ thư viện chưa."

**Prompt cho Cursor (Auditor):**
> "Hãy gọi tool `codegraph_impact` đối với symbol 'UserService'. Trả về danh sách những hàm bị ảnh hưởng và ghi vào AUDIT-REPORT."

## 5. Ví dụ MSEW Step Tích Hợp CodeGraph (Pre-check & Post-verify)
```markdown
### Step 1: Thay đổi signature hàm verify_token
**File**: `src\api\auth.py`
**Vị trí**: Dòng 45

**Pre-check (CodeGraph)**:
- `codegraph_callers`: "verify_token" ➔ Expect: 5 callers (chỉ verify, chưa sửa)
- `codegraph_node`: "verify_token" ➔ Xác nhận code gốc có 1 tham số.

**Skill Invocation**: 
  - Primary: `backend-development`

**Import cần thêm**: Không
**Code cần viết**: 
```python
def verify_token(token: str, strict: bool = False) -> bool:
```

**Post-verify (CodeGraph)**:
- `codegraph_impact`: "verify_token" ➔ Xác nhận không có impact ngoài 5 callers cũ do tham số mới có giá trị default.

**Verify command**: `pytest tests\test_auth.py`
**Expected output**: 5 passed
```
