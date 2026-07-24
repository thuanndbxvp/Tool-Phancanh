# HƯỚNG DẪN THỰC THI CHI TIẾT LỖI P2 (MSEW-P2-fixes)
**Role:** Tier 2 Coder
**Lưu ý:** Copy và paste code chính xác 100%. Đọc kỹ từng dòng thay thế.

---

## BƯỚC 1: XỬ LÝ `srtParser.ts` VÀ `textSegmentation.ts` (Task 11, 14)

### 1.1 Mở `src/utils/srtParser.ts`
Cập nhật hàm `parseSRT` thêm dòng xoá BOM và chỉnh regex xóa số dòng:
```typescript
export const parseSRT = (content: string): string => {
    return content
        .replace(/^\uFEFF/, '')  // Loại bỏ cặn BOM UTF-8
        .replace(/^\d+\r?\n/gm, '')  // Xoá số có newline theo sau (chính xác hơn Regex cũ)
        .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\{[^}]+\}/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
```

### 1.2 Mở `src/utils/textSegmentation.ts`
Tìm hàm `segmentByWaterFilling`, bổ sung fallback chia ép buộc ở cuối hàm (ngay trước `return scenes;`):
```typescript
    if (currentScene.length > 0) {
        scenes.push(currentScene.join(' '));
    }
    
    // Fallback: Tránh trường hợp tạo ra quá ít cảnh so với yêu cầu
    if (scenes.length < targetSceneCount && sentences.length >= targetSceneCount) {
        const fallbackScenes: string[] = [];
        const sentencesPerScene = Math.max(1, Math.floor(sentences.length / targetSceneCount));
        for (let i = 0; i < sentences.length; i += sentencesPerScene) {
             fallbackScenes.push(sentences.slice(i, i + sentencesPerScene).map(s => s.text).join(' '));
        }
        // Ép số lượng cảnh bằng đúng target
        while(fallbackScenes.length > targetSceneCount) {
             const last = fallbackScenes.pop();
             fallbackScenes[fallbackScenes.length - 1] += " " + last;
        }
        return fallbackScenes;
    }

    return scenes;
```

---

## BƯỚC 2: ĐẠI PHẪU CỨU HỘ VÀ XOAY VÒNG KEY (`geminiService.ts`)

Mở `src/services/geminiService.ts`. 

### 2.1 Thêm công cụ Cứu hộ JSON và Phân loại lỗi (Đầu file)
Thêm 2 hàm này ngay dưới khai báo `const BATCH_SIZE = 5;`:
```typescript
// Hàm cứu hộ: Mổ xẻ lấy các Object còn nguyên vẹn trong JSON hỏng
const bestEffortParse = (text: string): any[] => {
    const objects = text.match(/\{[^{}]*\}/g) || [];
    return objects.map(o => {
        try { return JSON.parse(o); } catch { return null; }
    }).filter(Boolean);
};

// Hàm phân loại lỗi: Không phải lỗi nào cũng nên thử lại
const shouldRetry = (e: any): boolean => {
    const msg = String(e?.message || e || '');
    if (msg.includes('JSON')) return false;  // Lỗi đứt JSON thì Retry vô ích, phải parse best-effort
    if (msg.includes('400')) return false;   // Bad request thì bỏ qua
    return true; // 429, 500, timeout... thì retry
};
```

### 2.2 Nâng cấp `withRetry` hỗ trợ xoay vòng Key (Task 7)
Sửa hàm `withRetry` cũ thành:
```typescript
const withRetry = async <T>(fn: (key: string) => Promise<T>, keys: string, retries: number = 2, delayMs: number = 2000): Promise<T> => {
    const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
    let currentKeyIndex = 0;

    for (let r = 0; r <= retries; r++) {
        try {
            return await fn(keyList[currentKeyIndex]);
        } catch (e) {
            if (r === retries || !shouldRetry(e)) {
                throw e; 
            }
            // Nếu 429 (Quá tải), tự động đảo sang Key tiếp theo trong mảng
            const msg = String((e as Error)?.message || '');
            if (msg.includes('429') && keyList.length > 1) {
                currentKeyIndex = (currentKeyIndex + 1) % keyList.length;
                console.warn(`Hit 429! Rotating to key index ${currentKeyIndex}...`);
            }
            
            await new Promise(res => setTimeout(res, delayMs * (r + 1)));
            console.warn(`Retry ${r+1}/${retries} after error:`, e);
        }
    }
    throw new Error("Unreachable");
};
```

### 2.3 Cập nhật lời gọi `attemptKyma` (Cấp phát Token - Task 10)
Sửa TẤT CẢ các chỗ gọi `withRetry` trong toàn bộ file (ở `generateBatch`, `fetchSceneAnchors`, `fetchCharacterDictionary`).
Đồng thời **áp dụng Token linh hoạt** vào `attemptKyma`.

**Trong `fetchSceneAnchors`:**
- Ở hàm `attemptKyma(key: string)`, set: `max_tokens: 1500`
- Ở đoạn gọi `withRetry`, sửa thành:
```typescript
    if (kymaKey) {
        try { 
            return await withRetry((k) => attemptKyma(k), kymaKey); 
        } catch (e) { 
            console.warn("Kyma failed for anchors, falling back...", e); 
            if (onFallback) onFallback();
        }
    }
```

**Trong `fetchCharacterDictionary`:**
- Ở hàm `attemptKyma(key: string)`, set: `max_tokens: 2000`
- Đoạn gọi `withRetry` sửa tương tự như trên.

**Trong `generateBatch`:**
- Chèn logic Cứu hộ JSON (`bestEffortParse`) vào `attemptKyma` và set tokens:
```typescript
    const attemptKyma = async (key: string) => {
        // ... gọi fetch ...
        body: JSON.stringify({
            // ...
            max_tokens: kymaModelName.includes('flash') ? 10000 : 8000 // Token cao cho Batch
        })
        
        // ... lấy text ...
        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.warn("JSON parse failed, attempting best-effort salvage...");
            const salvaged = bestEffortParse(text);
            if (salvaged.length > 0) return salvaged;
            throw parseError; // Vô phương cứu chữa
        }
    };
```
- Gọi `withRetry` truyền theo keylist:
```typescript
    if (kymaKey) {
        try {
            return await withRetry((k) => attemptKyma(k), kymaKey);
        } catch (e) {
//...
```

---
**END OF SPECIFICATION**
Tier 2 Coder hãy đối chiếu mã nguồn cũ và áp dụng đúng vị trí các hàm cứu hộ (bestEffortParse) và cơ chế đảo Key.
