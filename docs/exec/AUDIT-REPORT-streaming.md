# AUDIT-REPORT — Pre-audit cho Streaming #9

> **Ngày audit:** 2026-07-25
> **Auditor:** TIER2 (theo TIER2_PROMPT.md mục 1 — Pre-Audit bắt buộc)
> **Bản vẽ được audit:** `docs/plan/MSEW-streaming.md` (Tự tạo — Planner không có sẵn)

---

## KẾT LUẬN TỔNG THỂ

**🟢 CHẤP NHẬN TOÀN BỘ** — Bản vẽ khả thi, Gemini SDK verify được. Plan có 3 điều chỉnh nhỏ để giảm complexity.

---

## VERIFY NHANH

| Check | Kết quả |
|-------|---------|
| `node_modules/@google/genai/dist/web/index.d.ts` có `generateContentStream`? | ✅ Có (dòng 4312) |
| `node_modules/@google/genai/dist/node/index.d.ts` có `generateContentStream`? | ✅ Có (dòng 4319) |
| Trả `Promise<AsyncGenerator<GenerateContentResponse>>`? | ✅ Đúng |
| `chunk.text` có sẵn? | ✅ Có (qua GenerateContentResponse) |

---

## ĐIỀU CHỈNH SO VỚI MSEW

### 1. Bỏ `needGenerateBatchKyma` refactor → Dùng code có sẵn

MSEW đề xuất refactor `attemptKyma` → `needGenerateBatchKyma` riêng để share giữa 2 phiên bản. **TIER2 quyết định KHÔNG refactor** vì:
- Tăng diff lớn, rủi ro break generateBatch cũ
- Code Kyma fetch API không phức tạp, duplicate chấp nhận được
- Ưu tiên GO-SIMPLE cho vòng đầu streaming

Thay vào đó: `generateBatchStream` cho Kyma path sẽ wrapper trực tiếp `fetch → JSON.parse → bestEffortParse` → yield từng cái.

### 2. Bỏ AsyncGenerator lồng phức tạp → Wrapper đơn giản

MSEW đề xuất `queue.map((_, i) => async function*() {...})` + workers pattern. **TIER2 quyết định đơn giản hóa**:
- Không dùng generator lồng
- Yield trực tiếp từ hàm `analyzeScriptWithAIStream` bằng cách dùng `await ai.models.generateContentStream` cho từng batch song song
- Mỗi batch là 1 generator riêng → merge kết quả vào final

### 3. Backward compat — `analyzeScriptWithAI` cũ giữ nguyên → thêm `analyzeScriptWithAIStream`

Giữ 2 hàm: cũ (blocking) + mới (streaming). App.tsx sẽ chọn dùng hàm mới. Nếu streaming lỗi → fallback về cũ còn hoạt động.

---

## PHẠM VI CUỐI CÙNG

1. **Thêm `generateBatchStream`** vào `src/services/geminiService.ts`:
   - Gemini: dùng `ai.models.generateContentStream` → yield từng scene ngay khi parse xong
   - Kyma: wrapper non-streaming → yield từng scene sau khi parse toàn bộ

2. **Thêm `analyzeScriptWithAIStream`** (AsyncGenerator):
   - Stream progress events (`{ type: 'progress', scenes, progress, status }`)
   - Stream final event (`{ type: 'final', scenes, provider, model, totalCount }`)
   - Parallel batches với `MAX_CONCURRENCY = 5`

3. **Cập nhật `App.tsx`**:
   - `for await (const evt of analyzeScriptWithAIStream(...))` thay vì `await analyzeScriptWithAI(...)`
   - Handle `progress` event → `setPrompts(incremental)` ngay từng cảnh
   - Handle `final` event → save session + toast

4. **Backward compat:** không sửa `analyzeScriptWithAI` cũ (đã có caller ở chỗ khác? verify trước khi code).

---

## RỦI RO CÒN LẠI

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| JSON incremental parse fail với nested 2+ cấp | 🟢 THẤP | `bestEffortParse` regex từ Fix #8 qoát được 1 cấp |
| Race condition khi nhiều batch yield cùng lúc | 🟡 TB | Mỗi batch tự push vào `finalScenes[globalIdx]` theo index → an toàn |
| App.tsx re-render liên tục gây lag với batch lớn | 🟢 THẤP | React batch update tự xử lý, không vấn đề |
| `ai.models.generateContentStream` reject với schema | 🟡 TB | Test thử trước 1 batch, có thể phải bỏ `responseSchema` và dùng regex parse |
