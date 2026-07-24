<!-- Hướng dẫn (Dành cho Tầng 1 - Planner): 
Xác định các Skill được gọi từ Tầng 2 để phục vụ MSEW.
Tham khảo bảng Matrix trong SKILL-ECOSYSTEM.md
-->

# Phân bổ Kỹ năng (SKILL-ROUTING): <Tên Tính Năng>

## 1. Chiến lược tổng thể (Overall Strategy)
- <Giải thích tại sao cụm tính năng này cần nhóm skill này. Ví dụ: Làm API thanh toán nên cần phối hợp `payment-integration` và `databases`>

## 2. Bảng Phân bổ theo Step (Per-step Mapping)
| MSEW Step | Task ID / Tên | Primary Skill | Reference Skill | Fallback Skill | Lý do định tuyến |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Step 1 | Init Schema | `databases` | `backend-development` | `planning` | Thao tác trên models |
| Step 2 | Add API Route | `backend-development` | `None` | `None` | Viết logic backend |
| Step 3 | UI Form | `frontend-development` | `ui-styling` | `aesthetic` | Xử lý giao diện |

## 3. Các kỹ năng xuyên suốt (Cross-cutting Skills)
- Những skill có thể gọi ở bất kỳ step nào nếu gặp rủi ro:
  - `debugging`: Khi fail verify command.
  - `code-review`: Khi chuẩn bị commit nếu cần.
