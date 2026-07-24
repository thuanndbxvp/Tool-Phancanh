# 🛠️ Hệ sinh thái Kỹ năng (Skill Ecosystem)

Tài liệu này định nghĩa hệ sinh thái Skill được tích hợp sẵn (thông qua Claude Code plugin và các custom skill) phục vụ cho Pipeline 3 Tầng.

## 1. Danh mục đầy đủ (~30 Skills)

Các kỹ năng (skills) được chia thành 7 nhóm domain chính:

**A. Planning & Phân tích (Planning)**
1. `planning`: Phân rã công việc.
2. `sequential-thinking`: Lập luận từng bước, phân tích nguyên nhân - kết quả.
3. `problem-solving`: Phân tích rủi ro và tìm giải pháp thay thế.
4. `research`: Thu thập thông tin nền.
5. `docs-seeker`: Tra cứu tài liệu chuyên sâu.
6. `repomix`: Gọi bundle toàn bộ codebase để nạp context lớn.

**B. Phát triển Backend (Backend)**
7. `backend-development`: Skill cốt lõi xử lý API, logic server.
8. `databases`: Viết và tối ưu SQL/ORM, schema design.
9. `better-auth`: Tích hợp xác thực, phân quyền.
10. `payment-integration`: Xử lý Stripe/PayPal, quản lý transaction.

**C. Phát triển Frontend (Frontend)**
11. `frontend-development`: Skill cốt lõi cho UI logic.
12. `frontend-design`: Phân tích UX/UI, accessibility.
13. `ui-styling`: CSS/SCSS/Tailwind, theme, layout.
14. `aesthetic`: Cân chỉnh màu sắc, animation, độ mịn (UI-UX Pro Max).
15. `threejs`: Vẽ 3D, WebGL.
16. `web-frameworks`: Setup React/Vue/Svelte/NextJS.
17. `mobile-development`: React Native / Expo (nếu có).

**D. DevOps & Vận hành (DevOps)**
18. `devops`: Setup Docker, CI/CD, deployment.
19. `chrome-devtools`: Kiểm tra hiệu năng, network waterfall.
20. `debugging`: Truy vết lỗi tổng quát.
21. `code-review`: Scan security, code smell, linter issues.

**E. Xử lý Nội dung & AI (Content)**
22. `ai-multimodal`: Tích hợp model LLM/Vision.
23. `media-processing`: Xử lý ảnh/video/audio (ffmpeg/Pillow).
24. `document-skills`: Parse PDF/Word/Excel.
25. `shopify`: Tương tác API e-commerce.

**F. MCP (Model Context Protocol)**
26. `mcp-builder`: Xây dựng custom MCP server.
27. `mcp-management`: Quản lý kết nối và routing MCP.

**G. Meta & Công cụ Nội bộ (Meta)**
28. `common`: Utility cơ bản.
29. `claude-code`: Giao tiếp plugin core.
30. `skill-creator`: Tự động viết thêm skill mới.
31. `template-skill` / `google-adk-python`: Template mẫu.
32. Các workflow files: `ask.md`, `bootstrap.md`, `brainstorm.md`, `code.md`, `cook.md`, `debug.md`, `fix.md`, `journal.md`, `plan.md`, `scout.md`, `test.md`, `use-mcp.md`, `watzup.md`.

---

## 2. Bảng Skill Decision Matrix (Task Pattern → Skill)

| Task Pattern (Loại công việc) | Primary Skill (Chính) | Reference / Fallback Skill |
| :--- | :--- | :--- |
| **Thiết kế CSDL / ORM Models** | `databases` | `backend-development` |
| **Viết API Endpoints** | `backend-development` | `docs-seeker` |
| **Làm mượt UI, thêm hiệu ứng** | `aesthetic` | `ui-styling`, `frontend-design` |
| **Dựng Component React/Vue** | `frontend-development` | `ui-styling` |
| **Tích hợp cổng thanh toán** | `payment-integration` | `backend-development` |
| **Tìm lỗi Timeout / Lỗi Logic** | `debugging` | `sequential-thinking` |
| **Phân tích Dependency lớn** | `repomix` | `planning` |
| **Xây dựng module AI** | `ai-multimodal` | `media-processing` |
| **Code Analysis & Impact** | `codegraph_impact` | `codegraph_explore` |

---

## 3. Các Skill Combos Thông dụng

- **Backend Pro:** `backend-development` + `databases` + `better-auth` (Khi làm API có bảo mật và DB).
- **Frontend Pro Max:** `frontend-development` + `ui-styling` + `aesthetic` (Khi làm giao diện mượt, chuẩn UI/UX).
- **Deep Debugging:** `sequential-thinking` + `debugging` + `code-review` (Khi tìm lỗi không rõ nguyên nhân).
- **Payment Lifecycle:** `payment-integration` + `databases` + `backend-development` (Cực kỳ quan trọng để không sai sót giao dịch).
- **Refactor + CodeGraph:** `codegraph_callers` + `codegraph_impact` (Xác định phạm vi refactor).
- **Debug + CodeGraph:** `codegraph_explore` + `codegraph_callees` (Truy vết lỗi logic qua dependency).
- **Audit + CodeGraph (BẮT BUỘC):** `codegraph_impact` (Đánh giá side-effect).

---

## 4. Ưu tiên Skill theo 3 Tầng

- **Tầng 1 (Planner):** Chủ yếu sử dụng nhóm Planning, Meta, MCP, DevOps (để lấy context, vẽ kiến trúc), và RepoMix/CodeGraph.
- **Tầng 2 (Coder):** Chủ yếu sử dụng nhóm Backend, Frontend, Content. Gọi chính xác skill được MSEW chỉ định.
- **Tầng 3 (Auditor):** Chủ yếu sử dụng nhóm DevOps (`code-review`, `debugging`), CodeGraph impact, và Testing.
