# Phân tích Codebase D:\tool-phancanh & Đề xuất Nâng cấp Thuật toán Phân cảnh

> Tài liệu phân tích chi tiết (chưa bao gồm code triển khai). Phiên bản: 2026-07-25.

---

## 1. Tổng quan codebase

**Loại dự án:** SPA React 19 + Vite + TypeScript — Công cụ tạo Storyboard cho video ASMR/tài liệu thời tiền sử.

**Stack:**
- `@google/genai` 1.3.0 — gọi Gemini API
- Kyma API (OpenAI-compatible, model `deepseek-v4-flash`) — provider chính
- React 19, XLSX, JSZip

**Cấu trúc thư mục:**

```
src/
├─ App.tsx                       # State + layout tổng (~428 dòng)
├─ services/geminiService.ts     # Tất cả logic AI (~451 dòng)
├─ utils/
│  ├─ helpers.ts                 # Phân cảnh + export (~294 dòng)
│  └─ constants.ts               # Models + styles
├─ types/index.ts                # Types
└─ components/
   ├─ ControlPanel.tsx           # UI cấu hình
   ├─ WelcomeGuide.tsx
   ├─ modals/ (ApiSettingsModal, LibraryModal, GuideModal)
   ├─ Toast.tsx
   └─ icons/index.tsx
```

**Pipeline hiện tại** trong `analyzeScriptWithAI` (geminiService.ts):

```
┌────────────────────────────────────────────────────────────┐
│  1. PRE-SEGMENTATION (JS)                                  │
│     ├─ mode='ai' → fetchSceneAnchors() → segmentByAnchors │
│     ├─ mode='fixed' → segmentScript() chia đều            │
│     └─ mode='punctuation' → segmentScript() tách câu      │
├────────────────────────────────────────────────────────────┤
│  2. CHARACTER DICTIONARY (nếu bật) — gọi AI riêng         │
├────────────────────────────────────────────────────────────┤
│  3. BATCH PROCESSING — gọi AI từng batch 5 cảnh           │
│     (for loop, sequential, không parallel)                 │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Phân tích chi tiết thuật toán phân cảnh

### 2.1 Ba chế độ hiện tại

| Mode | Cách hoạt động | Ưu điểm | Nhược điểm |
|------|---------------|----------|------------|
| `ai` (🤖 Ngữ nghĩa) | Gửi toàn bộ script → AI trả về `startAnchor` + `endAnchor` (5-7 từ) → JS `findFuzzyIndex` cắt | Chia theo ngữ nghĩa | Chậm, sai lệch khi script > 15k chars, fuzzy matching dễ trượt |
| `fixed` (🔢 Chia đều) | JS thuần: tách câu → gom đều theo `string.length` | Nhanh, deterministic | Lệch độ dài nghiêm trọng (cảnh cuối chứa "mọi thứ còn lại") |
| `punctuation` (📝 Dấu câu) | JS thuần: `split(/[.!?\n]+/)` | Rất nhanh | Không kiểm soát được số cảnh |

### 2.2 Các điểm nghẽn / lỗ hổng nghiêm trọng

#### Lỗi 1: Chế độ `ai` — quality collapse với script dài

`fetchSceneAnchors` (geminiService.ts:132-224) gửi toàn bộ script cho AI và yêu cầu trả về đúng N anchor strings (5-7 từ). Vấn đề:

- Khi script > 15k chars phải chunk, AI consistency giảm mạnh.
- AI thường paraphrase lại anchor thay vì copy verbatim → `findFuzzyIndex()` fail.
- Khi 1 anchor fail, JS fallback dùng con trỏ cursor → chia thành 1 cục lớn → "cảnh cuối quá dài" effect.

#### Lỗi 2: Chế độ `fixed` — cảnh cuối phình to

```typescript
// helpers.ts:122-177
if (scenesCreated === targetSceneCount - 1) {
    const remaining = basicSentences.slice(i).join(" ");
    currentChunk = (currentChunk + " " + remaining).trim();
    break; // ← đây là nguyên nhân cảnh cuối phình
}
```

- Đo dài bằng `string.length` (ký tự) thay vì word count → tiếng Việt có dấu, ký tự đặc biệt làm lệch số từ so với context 8s video.
- Vòng `while` cộng chuỗi ngắn nhất liền kề → có thể merge 2 cảnh ở giữa gây mất cân đối.

#### Lỗi 3: Regex tách câu không robust

```typescript
// helpers.ts:66-74
const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
```

- `[^.!?\n]+` khớp tham lam, không xử lý "Hello.World" (không space).
- Không nhận viết tắt: "v.v.", "Mr.", "Dr.", "TP.HCM".
- Không xử lý dấu "...", "?.", "!?", dấu ngoặc kép tiếng Việt.

#### Lỗi 4: Sequential batch processing

```typescript
// geminiService.ts:411-421
// Vòng for tuần tự, BATCH_SIZE = 5
// 50 cảnh = 10 lần gọi API, mỗi lần ~3-5s → tổng 30-50s
```

Không có Promise.all, không có concurrency control, không cơ chế retry.

#### Lỗi 5: Character Dictionary là 1 API call riêng

```typescript
// geminiService.ts:358-374
// Gọi AI 1 lần nữa với TOÀN BỘ script (kể cả khi script rất dài)
// Với script 10k từ, prompt input ~13k tokens, thêm ~3-5s latency
// Lặp lại mỗi lần user bấm "Tạo lại Storyboard"
```

#### Lỗi 6: Không validate output khi AI trả thiếu

```typescript
// geminiService.ts:425-440
const aiResult = batchResults[j] || {}; // ← silently default {}
// Nếu AI trả 4 items cho batch 5 → cảnh 5 bị rỗng imagePrompt
// Không retry, không warning
```

#### Lỗi 7: Output Token Truncation gây crash ngầm

API của model Kyma (đặc biệt là Deepseek) có giới hạn mặc định về `max_tokens` khá thấp nếu không truyền cấu hình rõ ràng. Khi yêu cầu tạo 5-10 Scene (mỗi Scene rất chi tiết) trong 1 Batch, chuỗi JSON kết quả bị cắt đứt giữa chừng -> Gây lỗi `JSON.parse error` -> Toàn bộ tiến trình crash, ngầm huỷ bỏ các batch tiếp theo và dừng lại (App chỉ giữ lại những cảnh đã chạy được trước đó).

**Phân loại lỗi cần retry vs. không retry:**

| Loại lỗi | Retry? | Lý do |
|----------|--------|-------|
| 429 (rate limit) | Có | Server từ chối tạm thời |
| 500/502/503 (server error) | Có | Server lỗi thoáng qua |
| Timeout / fetch failed | Có | Network không ổn định |
| `JSON.parse` error | **Có, nhưng retry với fallback prompt** | Cùng prompt → lỗi lại |
| Wrong count / validation | Không | Logic prompt sai, retry vô ích |
| 400 (bad request) | Không | Request sai cấu trúc |

Với lỗi `JSON.parse`, retry phải kèm **fallback prompt** (giảm yêu cầu, đơn giản hóa schema, hoặc chia nhỏ batch). Nếu retry 3 lần vẫn fail → fallback dùng best-effort: lấy phần JSON hợp lệ trước đó, parse riêng từng object.

---

## 3. Đề xuất phương án nâng cấp

### 3.1 Tổng quan kiến trúc mới

```
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1: SMART SPLIT (JS - không AI)                        │
│  - Strip SRT timestamps                                     │
│  - Sentence tokenizer (Intl.Segmenter cho tiếng Việt)      │
│  - Boundary detection: paragraph + speaker + time/location  │
│  - Adaptive distribution (fixed / semantic / punctuation)   │
│  - Validation: 100% coverage, max-min deviation < 35%       │
├──────────────────────────────────────────────────────────────┤
│  PHASE 2: ENRICH (AI - 1 LẦN gọi duy nhất)                 │
│  - Single call lấy: character dict + style cues + hints    │
│  - Streaming để UI hiển thị tiến trình ngay                 │
├──────────────────────────────────────────────────────────────┤
│  PHASE 3: PARALLEL BATCH GENERATION                          │
│  - Promise.allSettled với concurrency 3-5                   │
│  - Auto-retry với exponential backoff                       │
│  - Validate output count, retry nếu thiếu                   │
│  - Cache kết quả theo hash(script + style)                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Cải tiến 1 — Smart Segmentation (Hybrid AI mode)

Thay vì AI trả về 5-7 từ anchor string, dùng index-based anchor:

```typescript
// Input cho AI:
"You are a storyboard director.
The script is divided into N sentences.
Each sentence has an index (0-based): [0] '...', [1] '...', etc.

Output JSON array of EXACTLY M objects:
{
  'sceneNumber': 1,
  'fromSentenceIdx': 0,
  'toSentenceIdx': 5
}"
```

**Lợi ích:**
- Không còn fuzzy match → 100% chính xác
- AI chỉ cần đếm số, không phải sinh chuỗi
- Output token giảm ~70%
- Validation: nếu `fromSentenceIdx[i] > toSentenceIdx[i-1]` → tự retry

### 3.3 Cải tiến 2 — Adaptive Distribution (Fixed mode)

Thay thuật toán greedy hiện tại bằng **water-filling algorithm**:

```typescript
// Pseudocode
const totalWords = sentences.reduce((a, s) => a + s.words, 0);
const idealWordsPerScene = totalWords / targetSceneCount;
const minWords = idealWordsPerScene * 0.75;
const maxWords = idealWordsPerScene * 1.35;

// Greedy: thêm câu vào cảnh hiện tại đến khi đạt min
// hoặc vượt max, hoặc gặp semantic boundary
// → boundary mới

// Post-processing: đảm bảo đúng số cảnh
// - Thiếu: split cảnh dài nhất tại giữa
// - Thừa: merge 2 cảnh ngắn nhất liền kề
```

**Kết quả mong đợi với script 12.000 từ, target 20 cảnh:**

| Chỉ số | Code hiện tại | Code mới |
|--------|--------------|----------|
| Độ lệch max/min từ | ~250% (cảnh cuối ~3.000 từ) | < 35% (water-filling) |
| Coverage | 100% | 100% |
| Tốc độ | 5ms | 8ms (vẫn real-time) |
| Hỗ trợ tiếng Việt | Kém (regex) | Tốt (Intl.Segmenter) |

### 3.4 Cải tiến 3 — Intl.Segmenter tokenizer

Thay regex `/[^.!?\n]+[.!?\n]+/g` bằng `Intl.Segmenter('vi')`:

```typescript
const segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });
for (const segment of segmenter.segment(cleaned)) {
  // ...
}
```

**Lợi ích:**
- Built-in browser, không cần thêm dependency
- Tự nhận viết tắt `v.v.`, `TP.HCM`, `Mr.`
- Xử lý dấu `…`, `?.`, `!?`, dấu ngoặc kép tiếng Việt
- Đếm word chính xác thay vì ký tự

### 3.5 Cải tiến 4 — Parallel Batch với Retry (và Tối ưu Token)

```typescript
const DEFAULT_CONCURRENCY = 3;

// Per-call max_tokens config (đề xuất)
const MAX_TOKENS_CONFIG = {
  fetchSceneAnchors: 1500,    // ~10 anchor lines
  fetchCharacterDictionary: 2000,  // ~5-10 chars
  generateBatch_5: 8000,      // 5 scenes × ~1.5k tokens
  generateBatch_8: 10000,     // 8 scenes (Flash mode)
};

async function processBatchesInParallel(scenes, config, onProgress) {
  const batches = chunk(scenes, BATCH_SIZE);
  const results = new Array(batches.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < batches.length) {
      const idx = cursor++;
      results[idx] = await callWithRetry(
        // Bơm max_tokens theo từng call, mặc định 8000 cho batch
        () => generateBatch(batches[idx], {
          ...config,
          max_tokens: config.max_tokens ?? MAX_TOKENS_CONFIG.generateBatch_5,
        }),
        { maxRetries: 3, backoff: 'exponential', onFinalFail: 'best-effort' }
      );
    }
  };

  // 3 workers chạy song song
  await Promise.all(
    Array.from({ length: DEFAULT_CONCURRENCY }, () => worker())
  );
  return results.flat();
}

async function callWithRetry<T>(fn, opts: { maxRetries, backoff, onFinalFail? }) {
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();
      if (Array.isArray(result) && result.length !== BATCH_SIZE) {
        throw new Error(`Wrong count: expected ${BATCH_SIZE}, got ${result.length}`);
      }
      return result;
    } catch (e) {
      // Phân loại lỗi
      if (!shouldRetry(e)) throw e;
      if (attempt === opts.maxRetries) {
        if (opts.onFinalFail === 'best-effort') {
          console.warn('Batch failed final, using best-effort fallback');
          return bestEffortParse(e);
        }
        throw e;
      }
      await sleep(500 * Math.pow(2, attempt));
    }
  }
}

function shouldRetry(error: any): boolean {
  if (error.status === 429 || error.status >= 500) return true;
  if (error.message?.includes('fetch failed')) return true;
  // JSON.parse có thể retry nhưng cần fallback prompt
  if (error.message?.includes('JSON.parse')) return true;
  return false;
}
```

**Lưu ý về Kyma vs Gemini compatibility:**

Kyma API dùng chuẩn OpenAI → param `max_tokens`. Gemini SDK mới dùng `maxOutputTokens`. Cần config cả 2 path:

```typescript
// Gemini path
config: { maxOutputTokens: 8000, ... }

// Kyma path
body: { max_tokens: 8000, ... }
```

**Kết quả:**
- Script 50 cảnh (10 batches): 50s → ~17s (3x nhanh hơn)
- 1 batch fail → retry tự động với exponential backoff, không halt cả pipeline
- Tránh vĩnh viễn lỗi Crash do đứt nửa token JSON nhờ nới lỏng `max_tokens: 8000`
- Best-effort fallback: nếu retry 3 lần vẫn fail, parse riêng từng object từ JSON broken → giảm tỷ lệ mất dữ liệu cuối cùng

### 3.6 Cải tiến 5 — Cache + Skip Redundant Calls

```typescript
const Cache = {
  charDict: new Map(),

  getCharacters(script, model) {
    const hash = hashString(script + model);
    const cached = this.charDict.get(script.substring(0, 200));
    if (cached && cached.hash === hash) return cached.data;
    return null;
  },

  setCharacters(script, model, data) {
    const hash = hashString(script + model);
    this.charDict.set(script.substring(0, 200), { hash, data });
  }
};
```

**Tiết kiệm:** Nếu user bấm "Tạo lại" 5 lần với cùng script → 4 lần skip character dict call.

### 3.7 Cải tiến 6 — Streaming Response (UX win)

```typescript
async function* streamBatch(scenes, config) {
  const stream = await genai.models.generateContentStream({...});

  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk.text;
    const partial = parseIncrementalJsonArray(buffer);
    yield { partial, done: false };
  }
  yield { partial: JSON.parse(buffer), done: true };
}
```

**UX impact:** UI render cảnh đầu tiên trong ~2s thay vì chờ 30s.

### 3.8 Cải tiến 7 — SRT parser riêng

File mới `src/utils/srt.ts`:

```typescript
export function parseSRT(content: string): string {
  return content
    .replace(/^\d+$/gm, '')                                    // strip line numbers
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '')
    .replace(/<[^>]+>/g, '')                                   // strip HTML tags
    .replace(/\{[^}]+\}/g, '')                                 // strip {italic}
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

---

## 4. Bảng so sánh trước/sau

| Tiêu chí | Hiện tại | Đề xuất | Cải thiện |
|---------|---------|---------|-----------|
| Tốc độ phân cảnh 50 cảnh | ~50s | ~17s | 3x nhanh |
| Tốc độ phân cảnh 100 cảnh | ~120s | ~35s | 3.4x nhanh |
| Độ lệch độ dài cảnh (fixed) | ±250% | ±35% | 7x chính xác |
| Hỗ trợ tiếng Việt (viết tắt) | Kém | Tốt | vượt trội |
| Số API call (50 cảnh + char) | 11 | 4 | 2.7x ít hơn |
| Số API call khi bấm "Tạo lại" | 11 | 1 (cache) | 11x |
| Retry khi batch thiếu | Không | 3 lần + backoff | ∞ |
| Streaming UI | Không | Có | UX thay đổi rõ |

---

## 5. Lộ trình triển khai đề xuất

### Giai đoạn 1: Quick wins (1-2 ngày)
1. Thay `sentenceRegex` bằng `Intl.Segmenter` trong `segmentScript`
2. Thay đo `string.length` bằng `word count` trong `fixed` mode
3. Sửa `if (scenesCreated === targetSceneCount - 1)` → dùng water-filling

### Giai đoạn 2: Performance (2-3 ngày)
4. Song song hóa batch processing với Promise.allSettled
5. Thêm retry + exponential backoff + phân loại lỗi (shouldRetry)
6. Bổ sung `max_tokens: 8000` (config theo từng call type) cho tất cả API lên Kyma
7. Bump BATCH_SIZE lên 8 cho Flash, kèm `max_tokens: 10000`

### Giai đoạn 3: Quality (3-4 ngày)
7. Thay anchor string → anchor index cho chế độ 'ai'
8. Validate output count, auto-fill missing
9. Cache character dictionary

### Giai đoạn 4: UX (2-3 ngày)
10. Streaming response với async generator
11. SRT parser riêng
12. Hiển thị số cảnh/câu trong UI ngay khi paste script

---

## 6. Phạm vi đã xác nhận

- **Triển khai:** Phân tích, chưa code
- **Chế độ AI:** Hybrid — JS pre-segment trước, AI xác nhận/index sau
- **Provider:** OK thử nghiệm cache/resume cho video dài

---

## 7. File map tham chiếu

| File | Vai trò hiện tại | Đề xuất |
|------|------------------|---------|
| `src/services/geminiService.ts` | AI pipeline (~451 dòng) | Thêm parallel batches, retry, streaming |
| `src/utils/helpers.ts` | `segmentScript`, `segmentByAnchors`, `findFuzzyIndex` | Tách thành `textSegmentation.ts` riêng |
| `src/types/index.ts` | Types | Thêm `Sentence`, `SegmentationConfig` |
| `src/components/ControlPanel.tsx` | UI cấu hình | Thêm hiển thị sentence count + estimated scenes |
| `src/App.tsx` | State + layout | Cache layer cho sessions |

---

## 8. Câu hỏi mở (nếu muốn triển khai)

1. Caching layer nên dùng localStorage (đơn giản) hay IndexedDB (lưu được script lớn)?
2. Đối với script rất dài (>50k từ), nên chunk sang nhiều session riêng?
3. Có cần thêm chế độ "preview" (chỉ phân cảnh, chưa gọi AI prompt) để user điều chỉnh trước khi generate?
4. Có nên cho user chỉnh tay boundary giữa các cảnh trước khi gọi AI prompt?

---

## 9. Chiến lược Retry chi tiết (bổ sung sau phản hồi)

### 9.1 Bảng quyết định Retry

| HTTP Status / Error Type | Retry? | Backoff | Ghi chú |
|--------------------------|--------|---------|---------|
| 429 Too Many Requests | Có | 1s → 2s → 4s | Rate limit, đợi |
| 500/502/503 | Có | 1s → 2s → 4s | Server lỗi thoáng qua |
| 408 Request Timeout | Có | 1s → 2s → 4s | Network chậm |
| Network `fetch failed` | Có | 1s → 2s → 4s | Mất gói, retry |
| `JSON.parse` error | Có, kèm fallback prompt | 1s → 2s → 4s | Cùng prompt → fail lặp lại |
| Wrong count (validation) | Không | - | Lỗi logic, cần sửa prompt |
| 400 Bad Request | Không | - | Request sai cấu trúc |
| 401/403 Unauthorized | Không | - | Key sai, báo user |
| Cancel/Abort | Không | - | User chủ động hủy |

### 9.2 Fallback chain cho JSON.parse error

Vì lỗi parse có thể do model trả về JSON cụt, retry với cùng prompt thường vô ích. Cần xâu chuỗi fallback:

```
Try 1: original prompt
  ↓ fail
Try 2: simplified prompt (bỏ character consistency, giảm yêu cầu)
  ↓ fail
Try 3: even simpler (chỉ xin scriptLine + 1 prompt trường)
  ↓ fail
Best-effort: parse regex `[\\{[\\s\\S]*?\\}]` lấy từng object, lấp vào scenes
  ↓ fail
Đánh fail cảnh đó, tiếp tục với cảnh khác
```

### 9.3 Đề xuất `max_tokens` per call type

| Call | Input size | Output expected | max_tokens đề xuất |
|------|------------|-----------------|-------------------|
| `fetchSceneAnchors` | N sentences | ~200 tokens (N anchor) | 1500 |
| `fetchCharacterDictionary` | full script | ~500 tokens (5-10 chars) | 2000 |
| `generateBatch` 5 scenes | 5 scriptLines | ~3000 tokens | 8000 |
| `generateBatch` 8 scenes (Flash) | 8 scriptLines | ~4800 tokens | 10000 |

Lý do: cố định 8000 cho mọi call là overkill cho call nhỏ (tốn cost) và thiếu cho call lớn (vẫn cắt).

### 9.4 Multi-key rotation khi 429

Khi gặp 429, thay vì chỉ retry với cùng key, nên rotate sang key khác:

```typescript
async function getActiveKey(): Promise<string> {
  const activeKeys = apiKeys.filter(k => k.isActive);
  // Loại bỏ key vừa bị 429 (đánh dấu cooldown 60s)
  const available = activeKeys.filter(k => !k.cooldownUntil || k.cooldownUntil < Date.now());
  if (available.length === 0) {
    // Reset cooldown nếu tất cả đều cooldown
    apiKeys.forEach(k => k.cooldownUntil = undefined);
    return activeKeys[Math.floor(Math.random() * activeKeys.length)].key;
  }
  return available[Math.floor(Math.random() * available.length)].key;
}
```

Điều này tận dụng tính năng "random key" đã có ở `App.tsx:170-176` nhưng thông minh hơn.

---

## 10. Roadmap triển khai chi tiết (6 Phase)

Lộ trình 4 giai đoạn ở mục 5 được mở rộng thành 6 phase để dễ verify và rollback. Mỗi phase có deliverable rõ ràng và bộ test riêng.

### Phase 1 — Phân cảnh chuẩn xác (1-2 ngày)
**Phạm vi:** Cải tiến 2, 3, 7 (mục 3.3, 3.4, 3.8) + Lỗi 2, 3 (mục 2.2)

- [ ] Tạo `src/utils/textSegmentation.ts` (tách ra từ `helpers.ts`)
- [ ] Thay `sentenceRegex` bằng `Intl.Segmenter('vi')`
- [ ] Thay `string.length` bằng word count
- [ ] Thuật toán **water-filling** thay cảnh cuối phình
- [ ] Tạo `src/utils/srt.ts` parser riêng
- [ ] Unit test với Vitest

**Deliverable:** Phân cảnh `fixed` mode chính xác ±35%, hỗ trợ file `.srt`, không còn regex skip viết tắt.

**Verify:** Script 12k từ, fixed mode = 20 cảnh → max word count / min word count ≤ 1.35.

### Phase 2 — Phân cảnh AI hybrid (2-3 ngày)
**Phạm vi:** Cải tiến 1 (mục 3.2) + Lỗi 1 (mục 2.2)

- [ ] Truyền `sentences[]` kèm index cho AI
- [ ] Đổi prompt anchor từ string → `fromSentenceIdx` / `toSentenceIdx`
- [ ] Validate `fromSentenceIdx[i] > toSentenceIdx[i-1]` → retry
- [ ] Bỏ hàm `findFuzzyIndex` (không cần nữa)
- [ ] Edge case: câu cuối script, paragraph break

**Deliverable:** Mode `ai` không còn fuzzy match, 100% chính xác, output token giảm ~70%.

**Verify:** Script 10k từ, mode `ai` = 15 cảnh → tất cả cảnh có text verbatim, không mất chữ.

**Phụ thuộc:** Cần Phase 1 để có `sentences[]` sẵn sàng.

### Phase 3 — Pipeline chống crash (2-3 ngày)
**Phạm vi:** Cải tiến 4 (mục 3.5) + Lỗi 4, 6, 7 (mục 2.2) + Mục 9.1, 9.3

- [ ] Thêm `MAX_TOKENS_CONFIG` per call type
- [ ] Config `max_tokens` (Kyma path) + `maxOutputTokens` (Gemini path)
- [ ] Hàm `withRetry` + `shouldRetry()` + `onFinalFail='best-effort'`
- [ ] `bestEffortParse()`: regex lấy từng object
- [ ] Promise.allSettled với concurrency 3
- [ ] Bump BATCH_SIZE: 5 → 8 cho Flash

**Deliverable:** Không còn crash bởi JSON truncated, retry thông minh, 3x nhanh hơn.

**Verify:**
- Force 429 (key đã đạt rate limit) → retry & fallback OK
- Force JSON truncation (mock response cụt) → best-effort parse
- Retry 3 lần cùng prompt → fallback prompt đơn giản hơn

### Phase 4 — Tiết kiệm tài nguyên (1-2 ngày)
**Phạm vi:** Cải tiến 5 (mục 3.6) + Mục 9.4

- [ ] Cache layer cho character dict (Map + hash)
- [ ] Cache key theo `hash(script + model)`
- [ ] Multi-key rotation: 429 → rotate sang key khác, cooldown 60s
- [ ] Hiển thị cache hit/miss trong UI (optional)

**Deliverable:** Bấm "Tạo lại" 5 lần → 4 lần skip character dict call.

**Verify:** Mở DevTools → Network → đếm số call `/v1/chat/completions` qua các lần bấm.

### Phase 5 — Streaming UX (2-3 ngày)
**Phạm vi:** Cải tiến 6 (mục 3.7)

- [ ] `generateContentStream` cho Gemini
- [ ] `parseIncrementalJsonArray` chịu partial JSON
- [ ] UI render cảnh đầu tiên trong ~2s
- [ ] Animation mượt khi cảnh mới xuất hiện
- [ ] Fallback: nếu API không hỗ trợ stream → non-stream

**Deliverable:** Cảnh đầu hiển thị trong 2s, không phải chờ toàn bộ.

**Verify:** Thời gian từ lúc bấm "Tạo" đến cảnh 1 hiển thị: 50s → ~2s.

**Phụ thuộc:** Cần Phase 3 (hàm `withRetry` xử lý stream error).

### Phase 6 — Polish & cleanup (1-2 ngày)
**Phạm vi:** Tổng hợp + Test + Tài liệu

- [ ] Unit test mở rộng (`textSegmentation.ts`, `srt.ts`, `withRetry`, `bestEffortParse`)
- [ ] Test với 5 scripts đa dạng (drama, ASMR, marketing, SRT, no-punctuation)
- [ ] Cập nhật `WelcomeGuide` với workflow mới
- [ ] Cập nhật `README.md` với phase roadmap
- [ ] CI: chạy `npm run lint && npm test` trên mỗi phase
- [ ] Lint + type-check pass

**Deliverable:** Production-ready, có docs.

### Tổng quan thời gian

| Phase | Nội dung | Ngày | Phụ thuộc |
|-------|----------|------|-----------|
| 1 | Phân cảnh chuẩn xác | 1-2 | — |
| 2 | AI hybrid anchor | 2-3 | Cần Phase 1 |
| 3 | Pipeline chống crash | 2-3 | Độc lập |
| 4 | Cache + Multi-key | 1-2 | Độc lập |
| 5 | Streaming UX | 2-3 | Cần Phase 3 |
| 6 | Polish | 1-2 | Sau tất cả |
| **Tổng** | | **9-15 ngày** | |

### Thứ tự chạy (parallel-friendly)

```
Phase 1 ──> Phase 2
   │
   └──> (chờ Phase 1 xong)

Phase 3 ──> Phase 5
   │
Phase 4 ──┘
   │
   ▼
Phase 6
```

Phase 1, 3, 4 có thể chạy song song 3 nhánh git khác nhau.

---

## 11. Công nghệ kiểm thử (Vitest)

### 11.1 Cấu hình dự kiến

- **Framework:** Vitest (tương thích Vite, không cần config nhiều)
- **Coverage:** Vitest + @vitest/coverage-v8
- **Mock:** vi.mock cho API calls (Kyma, Gemini)
- **Test patterns:** AAA (Arrange-Act-Assert), tên test `describe('functionName')` + `it('should...')`

### 11.2 Các file test cần tạo

| Phase | File test | Coverage |
|-------|-----------|----------|
| 1 | `src/utils/__tests__/textSegmentation.test.ts` | `tokenizeScript`, `distributeEvenly`, `wordCount` |
| 1 | `src/utils/__tests__/srt.test.ts` | `parseSRT` với 3 input mẫu |
| 2 | `src/services/__tests__/geminiService.test.ts` | `segmentByAnchors` với index-based |
| 3 | `src/utils/__tests__/withRetry.test.ts` | retry logic, `shouldRetry`, `bestEffortParse` |
| 4 | `src/utils/__tests__/cache.test.ts` | cache hit/miss, TTL |
| 6 | `src/utils/__tests__/integration.test.ts` | E2E pipeline test |

### 11.3 Test cases mẫu cho Phase 1

```typescript
describe('textSegmentation', () => {
  describe('tokenizeScript', () => {
    it('should split Vietnamese text into sentences correctly', () => {
      // Test với "v.v.", "TP.HCM", "..."
    });
    it('should handle SRT timestamps', () => {
      // Test strip "00:00:01.000 --> 00:00:02.000"
    });
    it('should preserve word count', () => {
      // Test: len(words) === words.length
    });
  });

  describe('distributeEvenly', () => {
    it('should produce exactly targetSceneCount scenes', () => {
      // Test 100 sentence vs 20 target
    });
    it('should have max/min word ratio within 1.35', () => {
      // Test độ lệch
    });
    it('should not lose any sentence', () => {
      // Test coverage 100%
    });
  });
});
```

### 11.4 Lệnh chạy test

```bash
npm install -D vitest @vitest/coverage-v8
# Thêm script vào package.json: "test": "vitest"
npm test                 # chạy tất cả
npm test -- --coverage   # với coverage
npm test textSegmentation  # chạy 1 file
```

---

*Tài liệu này là phân tích, không chứa code triển khai. Khi sẵn sàng code, dựa trên roadmap 6 phase ở mục 10.*
