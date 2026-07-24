# Hướng dẫn Khởi tạo Kiến thức Nghiệp vụ (Domain Knowledge Generator)

> **Dành cho:** AI Tầng 1 (Planner / Architect)
> **Thời điểm kích hoạt:** Ngay khi User bắt đầu dự án mới và đưa ra mô tả ngắn gọn về phần mềm.

## 🎯 Nhiệm vụ của bạn (Tầng 1)
Là Kiến trúc sư Hệ thống, bạn không được phép code ngay. Khi User cung cấp ý tưởng dự án (ví dụ: "Làm app ERP cho SME" hoặc "Làm phần mềm render video"), bạn phải dựa vào file này để phân tích và **TỰ ĐỘNG SINH RA file `docs/DOMAIN-KNOWLEDGE.md`** cho dự án đó.

File được sinh ra chính là "Bộ não Nghiệp vụ". Nó sẽ được dùng xuyên suốt để Tầng 1 thiết kế Kiến trúc (PLAN) và Tầng 3 làm Tester/Kiểm toán (AUDIT).

---

## 📝 CẤU TRÚC FILE `DOMAIN-KNOWLEDGE.md` CẦN TẠO

Dưới đây là bộ khung (Blueprint) BẮT BUỘC mà bạn phải điền thông tin dựa trên ý tưởng của User:

```markdown
# Domain Knowledge: [Tên Dự Án]

> **Bảo mật:** Tầng 1 dùng để thiết kế. Tầng 3 dùng để kiểm định logic. Cấm Tầng 2 (Thợ gõ) đọc file này để tránh bị quá tải thông tin nghiệp vụ (Overthinking).

## 1. Định vị Hệ thống (Core Identity)
- **Lĩnh vực (Domain):** [Tài chính, Y tế, MMO, Video Editing...]
- **Chân dung Khách hàng (User Persona):** [Họ là ai? Thói quen thao tác của họ là gì? (Ví dụ: Kế toán thích xài phím tắt, Editor thích kéo thả)]
- **Giá trị cốt lõi:** [App này giải quyết bài toán cốt tử nào?]

## 2. Hóa thân Chuyên gia (Expertise Personas)
*(Tầng 1 phải tự phân tích xem app này cần những chuyên gia nào để thiết kế cho chuẩn. Ví dụ làm ERP thì cần "Kế toán trưởng" và "Giám đốc Kho").*

### Chuyên gia 1: [Chức danh - VD: Chuyên gia YouTube MMO]
- **Tư duy cốt lõi:** [Liệt kê các rào cản, luật chơi, thuật toán của nền tảng]
- **Thuật ngữ (Jargons):** [VRAM, Content ID, Hash, Proxy...]
- **Định hướng thiết kế (UI/UX & Logic):** [Giao diện cần Dark mode, tốc độ load phải dưới 1s, luồng xử lý không được block UI...]

### Chuyên gia 2: [Chức danh - VD: Video Editor]
- **Tư duy cốt lõi:** ...
- **Thuật ngữ:** ...
- **Định hướng thiết kế:** ...

## 3. Chốt chặn Nghiệp vụ (Dành cho Tầng 3 - QA/Auditor)
*(Tầng 1 liệt kê các "Red flags" - Những lỗi logic kinh điển trong ngành này mà Tầng 3 cần phải "săn lùng" khi audit code).*
- **Logic sống còn 1:** [VD: Không bao giờ dùng Float cho tiền tệ, bắt buộc dùng Decimal]
- **Logic sống còn 2:** [VD: Khi hủy đơn hàng, tiền phải được cộng lại vào ví User]
- **Logic sống còn 3:** [VD: Các tác vụ nặng như Render/Query DB lớn bắt buộc phải dùng Thread riêng biệt]
```

---

## ⚠️ Quy tắc Thực thi cho Tầng 1
1. **Chủ động suy luận:** Nếu User chỉ nói "Làm phần mềm Kế toán", bạn phải tự hiểu và liệt kê các nguyên tắc như "Bút toán kép", "Không xóa cứng dữ liệu"... vào file. Không đợi User phải mớm từng chữ.
2. **Ngắn gọn, sắt đá:** Viết dưới dạng Bullet point để Tầng 3 (Auditor) dễ dàng đọc hiểu như một danh sách Checklist lúc làm nhiệm vụ QA.
3. Sau khi tạo xong file `docs/DOMAIN-KNOWLEDGE.md`, hãy báo cáo lại cho User để chốt nghiệp vụ trước khi tiến hành viết bản vẽ Kiến trúc (PLAN).
