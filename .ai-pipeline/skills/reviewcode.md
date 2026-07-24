---
description: Khảo sát mã nguồn và phân tích kiến trúc (Dành cho mọi AI)
argument-hint: <thư-mục-hoặc-tính-năng> (Ví dụ: "ui/" hoặc "core/pipeline")
---

# Lệnh Khảo Sát Codebase (Codebase Review/Survey)

**Vai trò:** Bạn đang thực hiện nhiệm vụ Khảo sát (Surveyor). Dù bạn đang đóng vai Tầng 1 (Kiến trúc sư) hay Tầng 2 (Kỹ sư), khi lệnh này được gọi, mục tiêu duy nhất của bạn là **ĐỌC, PHÂN TÍCH và BÁO CÁO**, tuyệt đối **KHÔNG SỬA CODE**.

## 🎯 Mục Tiêu
Cung cấp cho User (hoặc cho chính bạn trong các bước suy luận sau) một bức tranh toàn cảnh về dự án hoặc một module cụ thể.

## 🛠 Hướng Dẫn Thực Thi (4 Bước Bắt Buộc)

### Bước 1: Quét Cấu Trúc Bằng CodeGraph
- Nếu User nhập `$ARGUMENTS` (ví dụ: `khảo sát ui/`), hãy giới hạn phạm vi khảo sát trong thư mục/module đó.
- Nếu `$ARGUMENTS` rỗng, hãy khảo sát toàn bộ dự án.
- **Hành động:** Sử dụng công cụ `codegraph_files` để lấy cây thư mục. Chú ý các file cốt lõi (entry point) như `main.py`, `app.py`, `layout.tsx` hoặc các thư mục lớn như `core/`, `ui/`, `app/`.

### Bước 2: Phân Tích Tech Stack & Dependencies
- Đọc file `requirements.txt`, `Pipfile`, `package.json`, hoặc `pyproject.toml` (nếu có).
- Xác định các thư viện lõi.

### Bước 3: Phân Tích Điểm Neo & Kiến Trúc (Deep Dive)
- Sử dụng `codegraph_search` để tìm các class quan trọng.
- Sử dụng `codegraph_node` và `codegraph_context` để hiểu các Class/Hàm này giao tiếp với nhau như thế nào. 
- *Mẹo:* Tìm kiếm các Design Pattern đang được dùng (Ví dụ: Singleton cho AppState, Event-Bus cho tín hiệu, v.v.).

### Bước 4: Xuất Báo Cáo (Report)
Đừng viết báo cáo ra file, hãy **in trực tiếp ra màn hình Chat** bằng định dạng Markdown đẹp mắt với cấu trúc sau:

```markdown
# 🔍 Báo Cáo Khảo Sát Codebase: [Tên Module / Toàn bộ dự án]

## 1. 🏗️ Kiến trúc & Tech Stack
- **Libraries/Frameworks chính:** ...
- **Design Patterns phát hiện được:** ...

## 2. 📂 Cấu trúc Module Cốt lõi
- `thư_mục_A/`: (Làm nhiệm vụ gì)
- `thư_mục_B/`: (Làm nhiệm vụ gì)

## 3. 🧠 Điểm Neo Logic (Entry Points)
- (Chỉ ra file nào chạy đầu tiên, Class nào nắm giữ trạng thái toàn cục).

## 4. 💡 Đánh giá & Đề xuất (Health Check)
- Code có sạch không? Có bị phình to (God object) ở đâu không?
- (Đề xuất refactor nếu thấy cần thiết).
```

## ⚠️ Luật Cấm Kỵ (ABSOLUTE RULES)
- ❌ **CẤM** sửa, xóa, hoặc tạo file code mới.
- ❌ **CẤM** dùng công cụ `Read` để đọc bừa bãi toàn bộ nội dung file (tốn token). Chỉ dùng `CodeGraph` (như `codegraph_context` hoặc `codegraph_node`) để lấy thông tin mã nguồn một cách thông minh.
