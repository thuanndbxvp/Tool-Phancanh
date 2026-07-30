# AUDIT REPORT: MSEW-hybrid-segmentation

**Auditor**: Tier 2 (Coder + Auditor)
**Ngày**: 2026-07-31
**Verdict**: ❌ **TỪ CHỐI TIẾN HÀNH CODE** — MSEW chứa 8 vấn đề nghiêm trọng so với source code hiện tại

---

## Tóm tắt

MSEW mô tả việc refactor function `analyzeScriptWithAI` (Promise-based) sang dùng TimelineBlock + parseSrt. Tuy nhiên **source code hiện tại KHÔNG CÓ function này** — chỉ có `analyzeScriptWithAIStream` (async generator). Toàn bộ 4 Khối trong MSEW sẽ làm gãy compile/runtime.

---

## Vấn đề #1 — Function name & shape sai hoàn toàn [CRITICAL]

| | MSEW yêu cầu | Source code thực tế |
|---|---|---|
| Function | `analyzeScriptWithAI` | **`analyzeScriptWithAIStream`** (async generator) |
| Return | `Promise<{ scenes, provider, model }>` | `AsyncGenerator<{ type, scenes?, progress?, ... }>` |
| Số params | 8 tham số | 14 tham số |

**File**: `src/services/ggeminiService.ts:671-686`
```typescript
// Code thật
export const analyzeScriptWithAIStream = async function* (
    script, referenceImages, apiKey, styleLock, mode,
    segmentationMode, modelName, targetSceneCount, ...
) { ... }
```

**File**: `src/App.tsx:12, 202-217` — App.tsx import + gọi `analyzeScriptWithAIStream`, không hề biết đến `analyzeScriptWithAI`.

**Impact**: Nếu code theo MSEW (refactor function không tồn tại), sẽ:
- KHÔNG thay đổi được flow hiện tại (App.tsx vẫn gọi stream function)
- KHÔNG có error compile (vì MSEW giả định thêm function mới) → silent break
- Hoặc nếu coder "khôn ngoan" rename → break App.tsx ngay lập tức

---

## Vấn đề #2 — App.tsx dùng chữ ký HOÀN TOÀN KHÁC [CRITICAL]

MSEW đề xuất chữ ký:
```typescript
export const analyzeScriptWithAI = async (
    script, targetSceneCount, modelName, apiKey,
    enhanceWithAI, audioDuration, styleLock, kymaKey, kymaModelName,
    onProgress
)
```

App.tsx thực tế gọi (`src/App.tsx:202-217`):
```typescript
analyzeScriptWithAIStream(
    scenario,
    refImagesForService,    // ← MSEW không có tham số này
    effectiveKey,
    activeStylePrompt,
    mode,
    segmentationMode,       // ← sẽ bị xóa theo MSEW
    selectedModel,
    targetSceneCount,
    promptType,
    aspectRatio,
    enableAspectRatio,
    enableCharacterConsistency,
    kymaKey,
    selectedKymaModel || 'deepseek-v4-flash'
);
```

→ Thứ tự tham số, số lượng, tên biến đều khác. Apply MSEW sẽ break compile 13+ props.

---

## Vấn đề #3 — Hai phiên bản MSEW mâu thuẫn NHAU [CRITICAL]

`docs/plan/MSEW-hybrid-segmentation.md` và `docs/exec/MSEW-hybrid-segmentation.md` chứa cùng logic, nhưng `docs/exec` có:
- Thêm `// Giữ các props khác như cũ...` comment trong App.tsx
- Thay đổi cú pháp import (escape `\\n\\n` thay vì `\n\n`)
- Ký hiệu khác trong JSON.stringify (single quotes trong string interpolation)

→ Coder không biết copy từ file nào.

---

## Vấn đề #4 — MSEW xóa `segmentationMode` → App.tsx vỡ compile [CRITICAL]

MSEW Khối 4.1: "Xoá state `segmentationMode`". Nhưng:
- App.tsx:24 — `const [segmentationMode, setSegmentationMode] = useState<'ai'|'punctuation'|'fixed'>('fixed');`
- App.tsx:208 — truyền vào `analyzeScriptWithAIStream`
- App.tsx:361-362 — truyền vào `<ControlPanel>`
- ControlPanel.tsx:20-21 — khai báo prop
- ControlPanel.tsx:42 — destructure
- ControlPanel.tsx:252-266 — render 3 nút Mode

**Nếu xóa `segmentationMode` ở App.tsx mà không đụng ControlPanel** → ControlPanel.tsx sẽ thiếu 2 props required → TS compile error.

**Nếu đụng ControlPanel theo Khối 4.2 (xóa 3 nút)** → Phải xử lý 4 reference sites trong file. MSEW Khối 4.2 không nói rõ phải xóa prop trong interface — chỉ nói "xóa 3 nút Mode" + "thêm 4 props mới".

---

## Vấn đề #5 — `analyzeScriptWithAI` Promise vs `analyzeScriptWithAIStream` AsyncGenerator [CRITICAL]

MSEW Khối 3 định nghĩa logic **bên trong** `analyzeScriptWithAI` Promise:
```typescript
let segmentedLines = segmentByTimeline(timelineBlocks, targetSceneCount);
if (enhanceWithAI) { /* gọi AI */ }
```

Stream function thực tế dùng `yield` để phát progress events cho UI:
```typescript
yield { type: 'progress', scenes: [], progress: 5, status: "..." };
```

MSEW không chỉ ra cách **integrate vào async generator** (vì code mẫu là Promise). Nếu copy y nguyên vào stream → yield timing bị hỏng, UI không nhận được progress update.

---

## Vấn đề #6 — Phụ thuộc ẩn vào `fetchSceneAnchors` & `ensureSceneCount` [HIGH]

MSEW Khối 3 bỏ hoàn toàn luồng AI pre-segmentation cũ (line 517-555 geminiService.ts):
```typescript
if (segmentationMode === 'ai') {
    anchors = await fetchSceneAnchors(...);   // ← Sẽ mất
    segmentedLines = segmentByIndex(...);     // ← Sẽ mất
    if (segmentedLines.length < targetSceneCount) {
        segmentedLines = ensureSceneCount(...); // ← Sẽ mất
    }
}
```

Nếu user muốn "AI enhance" mà vẫn KHÔNG có AI khả dụng (vd user không có Kyma/Gemini key) → fallback hoàn toàn về timeline thuần, **mất luôn `ensureSceneCount` safety net** → scene count có thể sai.

---

## Vấn đề #7 — Thiếu thư viện mới cần cài [MEDIUM]

MSEW không đề cập nhưng UI mới (Khối 4.2) dùng:
- `URL.createObjectURL`, `new Audio(url)`, `audio.onloadedmetadata` → **đã có sẵn trong browser**, không cần cài. ✅
- `form-checkbox` Tailwind class → **cần verify đã enable Tailwind ở project** (chưa xác nhận).

---

## Vấn đề #8 — Thiếu file CONTEXT/ACCEPTANCE/SKILL-ROUTING [HIGH]

Theo skill `code.md`:
```
7. docs/plan/CONTEXT-$ARGUMENTS.md
8. docs/plan/MSEW-$ARGUMENTS.md ⭐ YOUR BIBLE
9. docs/plan/SKILL-ROUTING-$ARGUMENTS.md
10. docs/plan/ACCEPTANCE-$ARGUMENTS.md
```

Search kết quả:
- ✅ `MSEW-hybrid-segmentation.md` (x2)
- ❌ `CONTEXT-hybrid-segmentation.md` — **không tồn tại**
- ❌ `SKILL-ROUTING-hybrid-segmentation.md` — **không tồn tại**
- ❌ `ACCEPTANCE-hybrid-segmentation.md` — **không tồn tại**

→ Không có tiêu chí acceptance để verify khi xong. Không có skill routing để biết khi nào invoke skill nào.

---

## Tổng kết Blocker

| # | Loại | Mô tả ngắn |
|---|---|---|
| 1 | CRITICAL | MSEW refactor function không tồn tại |
| 2 | CRITICAL | App.tsx dùng chữ ký hoàn toàn khác |
| 3 | CRITICAL | 2 file MSEW mâu thuẫn |
| 4 | CRITICAL | Xóa segmentationMode gây TS compile error |
| 5 | CRITICAL | Logic trong Promise không map được vào AsyncGenerator |
| 6 | HIGH | Mất fallback safety net |
| 7 | MEDIUM | Thiếu Tailwind config check |
| 8 | HIGH | Thiếu CONTEXT/SKILL-ROUTING/ACCEPTANCE |

---

## Khuyến nghị cho Planner (Tầng 1)

**KHÔNG code theo MSEW hiện tại.** Vui lòng:

1. **Đồng bộ 2 file MSEW** (`docs/plan/` và `docs/exec/`) — chọn 1 version làm ground truth, xóa cái kia.

2. **Viết lại Khối 3 dựa trên `analyzeScriptWithAIStream`** (async generator):
   - Đổi tên signature cho khớp với code thật
   - Hoặc thêm một function mới `analyzeScriptWithAIHybrid` (không phá vỡ code cũ) và bổ sung switch ở App.tsx
   - Tích hợp `yield` progress event trong pre-segmentation stage

3. **Làm rõ chiến lược xóa `segmentationMode`**:
   - Option A: Bỏ hẳn, mặc định mode mới (breaking change → cần migration note)
   - Option B: Giữ nhưng rename type, backward-compat alias
   - Option C: Thêm mode mới `hybrid` là giá trị thứ 4, giữ 3 mode cũ

4. **Tạo các file thiếu**:
   - `docs/plan/CONTEXT-hybrid-segmentation.md` — capture current state
   - `docs/plan/SKILL-ROUTING-hybrid-segmentation.md` — chỉ định skill nào invoke khi nào
   - `docs/plan/ACCEPTANCE-hybrid-segmentation.md` — checklist pass/fail có thể verify

5. **Verify UI**:
   - Project đang dùng Tailwind chưa? `tailwind.config.js` có không?
   - Nếu không → MSEW Khối 4.2 sẽ fail style class

6. **Xác nhận thư viện cần thêm** (nếu có): Nếu không có → ghi rõ "0 npm cần cài".

---

## Trạng thái tôi đang chờ

Tôi **DỪNG LẠI** theo TIER2_PROMPT.md quy tắc 1. Khi nào Planner chốt lại các blocker trên, tôi sẽ tiến hành code.

Tạo file `docs/exec/BLOCKERS-hybrid-segmentation.md` để track tiến độ chờ.