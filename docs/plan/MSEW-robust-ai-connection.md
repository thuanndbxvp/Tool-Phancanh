# TÀI LIỆU HƯỚNG DẪN THỰC THI CHI TIẾT (MSEW-robust-ai-connection)
**Role:** Tier 2 Coder
**Lưu ý:** Chép code theo thứ tự.

---

## KHỐI 1: TẠO AI HELPERS MỚI

Tạo file mới **`src/utils/aiHelpers.ts`**:
```typescript
export const parseJsonArray = (text: string, expectedCount?: number): any[] => {
    let t = (text || "").trim();
    
    // Strip markdown
    if (t.startsWith("```")) {
        t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
    
    const candidates = [t];
    const fixed = t.replace(/,+$/, ''); // Xóa dấu phẩy thừa ở cuối
    
    if (fixed && !fixed.endsWith("]")) {
        candidates.push(fixed + "]");
        candidates.push(fixed + '"]');
    }
    
    for (const cand of candidates) {
        try {
            const arr = JSON.parse(cand);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch (e) {
            // Tiep tuc thu
        }
    }
    
    // Thuốc đắng dã tật: bóc tách mảng
    const startIdx = t.indexOf("[");
    const endIdx = t.lastIndexOf("]");
    if (startIdx !== -1 && endIdx > startIdx) {
        try {
            const arr = JSON.parse(t.substring(startIdx, endIdx + 1));
            if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch (e) {
            // Bo qua
        }
    }
    
    throw new Error("Không thể parse dữ liệu từ AI thành mảng JSON.");
};

export const FALLBACK_MODELS = {
    gemini: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    kyma: ['deepseek-v4-flash', 'gpt-4o-mini', 'claude-3-haiku-20240307']
};
```

---

## KHỐI 2: REFACTOR DỊCH VỤ GEMINISERVICE

### 2.1. Cập nhật `src/services/geminiService.ts`
Thêm import:
```typescript
import { parseJsonArray, FALLBACK_MODELS } from "../utils/aiHelpers";
```

Sửa hàm `validateApiKey`:
```typescript
export const validateApiKey = async (apiKey: string, provider: 'gemini' | 'kyma' = 'gemini'): Promise<boolean> => {
    try {
        if (provider === 'gemini') {
            const url = \`https://generativelanguage.googleapis.com/v1beta/models?key=\${apiKey}\`;
            const res = await fetch(url);
            return res.ok;
        } else {
            const res = await fetch('https://kymaapi.com/v1/models', {
                headers: { 'Authorization': \`Bearer \${apiKey}\` }
            });
            return res.ok;
        }
    } catch (error) {
        console.error("Key Validation Failed:", error);
        return false;
    }
};
```

Nâng cấp hàm `withRetry` để hỗ trợ đổi model (thêm tham số thứ 2 cho hàm callback `fn`):
Thay thế hàm `withRetry` hiện tại bằng:
```typescript
// Nâng cấp withRetry: Xoay vòng Key và xoay vòng Model (Fallback)
const withRetry = async <T>(
    fn: (key: string, modelToUse: string) => Promise<T>, 
    keys: string, 
    requestedModel: string,
    fallbackList: string[],
    retries: number = 2, 
    delayMs: number = 2000
): Promise<T> => {
    const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
    let currentKeyIndex = 0;
    
    // Đảm bảo requestedModel nằm ở đầu mảng fallback
    const modelsToTry = [requestedModel, ...fallbackList.filter(m => m !== requestedModel)];
    let currentModelIndex = 0;

    for (let r = 0; r <= retries; r++) {
        try {
            return await fn(keyList[currentKeyIndex], modelsToTry[currentModelIndex]);
        } catch (e) {
            if (r === retries || !shouldRetry(e)) {
                throw e;
            }
            const msg = String((e as Error)?.message || '');
            
            // Xoay vòng Key trước
            if (msg.includes('429') || msg.includes('503')) {
                if (keyList.length > 1) {
                    currentKeyIndex = (currentKeyIndex + 1) % keyList.length;
                    console.warn(\`Hit limit! Rotating to key index \${currentKeyIndex}...\`);
                } else if (modelsToTry.length > 1 && currentModelIndex < modelsToTry.length - 1) {
                    // Nếu chỉ có 1 key, xoay vòng Model
                    currentModelIndex++;
                    console.warn(\`Hit limit! Falling back to model \${modelsToTry[currentModelIndex]}...\`);
                }
            }
            
            await new Promise(res => setTimeout(res, delayMs * (r + 1)));
        }
    }
    throw new Error("Unreachable");
};
```

Cập nhật LUỒNG `enhanceWithAI` (Tìm khối `if (enhanceWithAI && (kymaKey || apiKey))` bên trong `analyzeScriptWithAIHybridStream`):
Sửa lại khối if đó thành:
```typescript
    if (enhanceWithAI && (kymaKey || apiKey)) {
        try {
            yield { type: 'progress', scenes: [], progress: 8, status: "Đang dùng AI nắn chỉnh ranh giới cảnh..." };
            const scriptText = segmentedLines.map((line, i) => \`[Scene \${i + 1}]: \${line}\`).join('\\n\\n');
            const systemInstruction = \`You are a storyboard director. Review the script and adjust the scene boundaries for better semantic flow.
You MUST return EXACTLY \${targetSceneCount} scenes. Do not change any text content, only move words/sentences between adjacent scenes if it improves the flow.
Return ONLY a JSON array of strings, where each string is a scene.\`;

            const attemptEnhance = async (key: string, currentModel: string) => {
                const url = kymaKey ? 'https://kymaapi.com/v1/chat/completions' : \`https://generativelanguage.googleapis.com/v1beta/models/\${currentModel}:generateContent?key=\${key}\`;
                
                if (kymaKey) {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${key}\` },
                        body: JSON.stringify({
                            model: currentModel,
                            messages: [
                                { role: 'system', content: systemInstruction },
                                { role: 'user', content: scriptText }
                            ],
                            temperature: 0.1,
                        })
                    });
                    if (!response.ok) throw new Error(\`Kyma HTTP \${response.status}\`);
                    const data = await response.json();
                    return data.choices?.[0]?.message?.content || "[]";
                } else {
                    const ai = new GoogleGenAI({ apiKey: key });
                    const response = await ai.models.generateContent({
                        model: currentModel,
                        contents: scriptText,
                        config: {
                            systemInstruction,
                            responseMimeType: "application/json"
                        }
                    });
                    return response.text || "[]";
                }
            };

            const textOutput = kymaKey 
                ? await withRetry(attemptEnhance, kymaKey, kymaModelName, FALLBACK_MODELS.kyma, 2)
                : await withRetry(attemptEnhance, apiKey, modelName, FALLBACK_MODELS.gemini, 2);
                
            const adjustedScenes = parseJsonArray(textOutput, targetSceneCount);
            if (adjustedScenes.length === targetSceneCount) {
                segmentedLines = adjustedScenes;
            } else {
                console.warn(\`Enhance fail: expected \${targetSceneCount}, got \${adjustedScenes.length}\`);
            }
        } catch (e) {
            console.warn("AI enhance failed, using default timeline segment", e);
        }
    }
```
*(Ghi chú: Vì thay đổi hàm `withRetry` (thêm modelToUse), các hàm khác xài `withRetry` như `generateBatch`, `fetchSceneAnchors` sẽ báo lỗi TS. Tuy nhiên, Tier 2 hãy TỰ SỬA chữ ký trong các hàm callback đó (như `attemptGemini(k, modelToUse)` và bỏ model tĩnh đi) để dọn sạch lỗi Linter).*

---

## KHỐI 3: GIAO DIỆN KIỂM TRA API

### 3.1. Cập nhật `src/components/modals/ApiSettingsModal.tsx`
Sửa lời gọi `validateApiKey` (thường gắn với nút Kiểm tra):
Tìm chỗ gọi hàm `validateApiKey` và đảm bảo truyền đúng `provider`:
```tsx
const isValid = await validateApiKey(keyToTest, type === 'kyma' ? 'kyma' : 'gemini');
```
Điều này giúp test siêu nhanh mà không tốn token.
