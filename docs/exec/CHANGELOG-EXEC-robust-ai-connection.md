# CHANGELOG EXEC: Robust AI Connection

| Step | File | Lines Changed | Status | Notes |
|------|------|---------------|--------|-------|
| 1 | src/utils/aiHelpers.ts (new) | +44 / -0 | DONE | parseJsonArray + FALLBACK_MODELS |
| 2.1 | src/services/geminiService.ts | +10 / -8 | DONE | validateApiKey list models |
| 2.2 | src/services/geminiService.ts | +25 / -16 | DONE | withRetry thêm modelToUse |
| 2.3 | src/services/geminiService.ts | +50 / -28 | DONE | enhanceWithAI dùng parseJsonArray + withRetry + FALLBACK_MODELS |
| 2.4 | src/services/geminiService.ts | +12 / -8 | DONE | 4 callsite + 6 attempt callback Gemini/Kyma |
| 3.1 | src/components/modals/ApiSettingsModal.tsx | +1 / -1 | DONE | truyền provider='gemini' |
| AUDIT | tsc, vite build, lints | - | PASS | 801 KB → 225 KB gzipped |
