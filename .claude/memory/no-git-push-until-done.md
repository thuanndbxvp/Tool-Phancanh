---
name: no-git-push-until-done
description: All remaining phases are coded locally without pushing; one final push when everything is complete
metadata:
  type: feedback
---

Từ 2026-07-10: Tất cả các phase còn lại (P2-3, P2-4, P3, P4, P5, P6) làm trên máy local, không push git. Sau khi code xong hết mới push 1 lần duy nhất.

**Why:** Tập trung code, tránh rối nhánh. Các nhánh trước đã push riêng lẻ gây chồng chéo.

**How to apply:** Không chạy `git push` cho đến khi user yêu cầu. Chỉ commit local (hoặc không commit). Làm việc trên nhánh hiện tại.
