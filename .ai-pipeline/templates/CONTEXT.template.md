<!-- Hướng dẫn (Dành cho Tầng 1 - Planner): 
Điền các thông tin bối cảnh hiện tại của dự án.
Phải chèn Repomix bundle và phân tích CodeGraph MCP.
-->

# Bối cảnh Hệ thống (CONTEXT): <Tên Tính Năng>

## 1. Tri thức Tổng hợp
- **Đường dẫn Repomix Bundle:** `.\CONTEXT_BUNDLE.md`

## 2. Codebase Analysis (via CodeGraph MCP)

### Discovery (từ `codegraph_explore`)
- <Tóm tắt kết quả tổng quan về module>

### Related Symbols (từ `codegraph_search`)
- `<symbol>` at `<file:line>`
- `<symbol2>` at `<file:line>`

### Callers Analysis (từ `codegraph_callers`)
- `<function>`: N callers
  - `<caller1>`
  - `<caller2>`

### Callees Analysis (từ `codegraph_callees`)
- `<function>` calls:
  - `<callee1>`
  - `<callee2>`

## 3. Các File liên quan và Vai trò
- `src\<module>\<file1>.py`: <Vai trò>
- `tests\<module>\test_<file1>.py`: <Vai trò>

## 4. Dependencies
- **External:** <Ví dụ: fastapi, sqlalchemy>
- **Internal:** <Ví dụ: src.utils.logger>

## 5. Ràng buộc (Constraints)
- **Môi trường:** Chạy trên Windows 10/11 (PowerShell/CMD).
- **Line Ending:** CRLF.
- **Khác:** <Ràng buộc khác>
