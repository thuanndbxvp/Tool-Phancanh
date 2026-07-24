<!-- Hướng dẫn (Dành cho Tầng 1 - Planner): 
ĐÂY LÀ FILE QUAN TRỌNG NHẤT. 
Cung cấp hướng dẫn chính xác tới từng dòng, không có bất kỳ từ ngữ mơ hồ nào.
Mọi command kiểm thử (Verify) đều phải dùng PowerShell syntax.
-->

# MSEW: <Feature Name>

## Prerequisites (Điều kiện tiên quyết)
- **Repomix bundle:** `.\CONTEXT_BUNDLE.md`
- **Branch:** `<tên nhánh nếu có>`
- **Python venv activated:** Bắt buộc Tầng 2 phải gọi: `.\venv\Scripts\Activate.ps1`

## Skill Routing Summary
| Step | Tiêu đề Step | Primary Skill | Reference Skill | Fallback Skill |
|------|--------------|---------------|-----------------|----------------|
| 1 | <Mô tả ngắn> | `<skill-1>` | `<skill-2>` | `<skill-3>` |

## Files KHÔNG được đụng (Do Not Touch)
- `<đường\dẫn\tới\file.py>` — Lý do: <Chứa logic core đang chạy production>

---

## Micro-Steps

### Step 1: <Tên công việc cụ thể>
**File:** `<đường\dẫn\file.py>`
**Vị trí:** Dòng <X> đến <Y> (sau hàm `<tên_hàm>`)
**Skill Invocation:**
  - **Primary:** `<skill>` — <lý do tại sao Coder phải invoke skill này>
  - **Reference:** `<skill or none>`
  - **Fallback:** `<skill or none>`

**Pre-check (CodeGraph):**
- `codegraph_callers`: `<function>` ➔ expect `<count>` callers
- `codegraph_node`: `<symbol>` ➔ verify signature

**Import cần thêm:**
```python
<Chèn import chính xác>
```

**Code cần viết (hoặc sửa đổi):**
```python
<Đoạn mã code hoàn chỉnh cần Tầng 2 gõ vào>
```

**Post-verify (CodeGraph):**
- `codegraph_impact`: `<symbol>` ➔ không có impact ngoài scope
- `codegraph_callers`: `<function>` ➔ vẫn `<count>` callers

**KHÔNG được sửa (Do not modify):**
- <Ghi chú những logic quanh đó tuyệt đối không được động vào>

**Verify command (PowerShell):**
```powershell
pytest tests\test_<tên>.py::test_<hàm> -v
```

**Expected output:**
```text
<Output mong đợi, ví dụ: PASSED>
```

**Nếu fail:** 
- Invoke skill `debugging`. 
- Báo cáo vào file `BLOCKERS.md`. 
- **CẤM TỰ SỬA CODE KHÁC.**

---

### Step 2: <Tương tự>
<Copy nguyên khối block phía trên để tạo step 2>
