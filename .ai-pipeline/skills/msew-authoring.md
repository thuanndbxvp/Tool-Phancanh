# 🧠 Hướng dẫn Viết MSEW (MSEW Authoring Protocol)

## 1. MSEW là gì và tại sao nó quan trọng nhất?
**MSEW (Micro-Step Execution Workflow)** là tài liệu cốt lõi nối giữa Tầng 1 (Kiến trúc sư) và Tầng 2 (Thợ gõ).
Nếu Planner viết MSEW tồi, Coder sẽ code tồi. MSEW phải rõ ràng tới mức Coder không cần suy nghĩ gì ngoài việc Copy/Paste và gõ theo.

## 2. Anti-patterns trong MSEW (CẤM VIẾT)
- ❌ *Giao việc chung chung:* "Tạo API đăng nhập cho hệ thống." (Quá to, không biết dùng file nào).
- ❌ *Thiếu dòng cụ thể:* "Thêm hàm validate vào file utils.py." (Thêm vào dòng nào? Import gì?).
- ❌ *Từ ngữ mơ hồ:* "Trang trí button cho đẹp mắt." (Thợ gõ không có mắt thẩm mỹ, phải đưa cụ thể mã màu Hex).

## 3. Template Mẫu cho Các Loại Micro-Step

### A. Thêm một Hàm mới (Add Function)
```markdown
- **Step:** 1
- **File:** `src\api\auth.py`
- **Location:** Cuối file (sau dòng 120)
- **Skill Invocation:** 
  - Primary: `backend-development`
- **Imports:** 
  ```python
  from fastapi import HTTPException
  ```
- **Code:** 
  ```python
  def verify_token(token: str) -> bool:
      if not token:
          raise HTTPException(status_code=401)
      return True
  ```
- **Verify Command:** `pytest tests\test_auth.py`
- **Expected:** 1 passed
```

### B. Sửa đổi Logic (Edit/Refactor)
```markdown
- **Step:** 2
- **File:** `src\utils\parser.py`
- **Location:** Dòng 45-50 (Thay thế toàn bộ hàm `parse_data`)
- **Skill Invocation:**
  - Primary: `planning`
- **Imports:** Không
- **Code (Thay thế bằng):**
  ```python
  def parse_data(raw: dict) -> dict:
      return {k: v for k, v in raw.items() if v is not None}
  ```
- **Verify Command:** `python -c "from src.utils.parser import parse_data; print(parse_data({'a':1, 'b':None}))"`
- **Expected:** `{'a': 1}`
```

## 4. Bài Test Tự Kiểm Tra (The Fresher Test)
Sau khi Planner viết xong MSEW, hãy tự hỏi:
**"Nếu mình đưa tờ giấy này cho một fresher không biết gì về dự án, chỉ biết gõ phím, họ có làm chính xác 100% kết quả mình muốn không?"**
Nếu câu trả lời là "KHÔNG" -> Hãy viết lại MSEW chi tiết hơn.
