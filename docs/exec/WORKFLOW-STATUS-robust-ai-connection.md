# WORKFLOW STATUS: Robust AI Connection

| Bước | Mô tả | Trạng thái |
|------|-------|-----------|
| 1 | Tạo `src/utils/aiHelpers.ts` (parseJsonArray + FALLBACK_MODELS) | [x] done |
| 2.1 | Import + `validateApiKey` mới (list models) | [x] done |
| 2.2 | Nâng cấp `withRetry` (modelToUse callback + rotate) | [x] done |
| 2.3 | Cập nhật `enhanceWithAI` dùng `parseJsonArray` + `withRetry` | [x] done |
| 2.4 | Fix các callers cũ của `withRetry` (4 callsite, 6 attempt callback) | [x] done |
| 3.1 | `ApiSettingsModal` - truyền provider `'gemini'` vào `validateApiKey` | [x] done |
| Audit | tsc + vite build + lints | [x] PASS |

Last update: 2026-07-31
Status: DONE
