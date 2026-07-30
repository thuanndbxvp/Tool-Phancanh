# TÀI LIỆU HƯỚNG DẪN THỰC THI CHI TIẾT (MSEW-hybrid-segmentation)
**Role:** Tier 2 Coder
**Lưu ý:** Copy và paste code chính xác 100%. Không tự ý rút gọn. Thực hiện theo đúng cấu trúc từng khối.

---

## KHỐI 1: CẬP NHẬT KIỂU DỮ LIỆU (TYPES)

### 1.1. Sửa file `src/types/index.ts`
Xóa bỏ hoàn toàn định nghĩa `segmentationMode` (nếu có). Thêm interface `TimelineBlock` mới vào cuối file hoặc đầu file:
```typescript
export interface TimelineBlock {
    startTime: number;
    endTime: number;
    text: string;
    isPunctuationEnd: boolean;
}
```

---

## KHỐI 2: XÂY DỰNG THUẬT TOÁN CORE

### 2.1. Cập nhật `src/utils/textSegmentation.ts`
Bổ sung đoạn code sau vào file (có thể giữ lại `tokenizeSentences` nếu đang dùng, hoặc đặt ở dưới cùng file):

```typescript
import { TimelineBlock } from '../types';

export const parseSrtToTimeline = (srtText: string): TimelineBlock[] => {
    const blocks: TimelineBlock[] = [];
    const chunks = srtText.trim().replace(/\r\n/g, '\n').split('\n\n');
    
    for (const chunk of chunks) {
        const lines = chunk.split('\n');
        if (lines.length >= 3) {
            const timeLine = lines[1];
            const text = lines.slice(2).join(' ');
            const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
            
            if (timeMatch) {
                const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
                blocks.push({
                    startTime,
                    endTime,
                    text,
                    isPunctuationEnd: /[.?!]$/.test(text.trim())
                });
            }
        }
    }
    return blocks;
};

export const parseTxtToSyntheticTimeline = (txt: string, audioDuration?: number): TimelineBlock[] => {
    const sentences = tokenizeSentences(txt);
    const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
    const wps = audioDuration ? (totalWords / audioDuration) : 3.5;
    
    const blocks: TimelineBlock[] = [];
    let currentTime = 0;
    
    for (const sentence of sentences) {
        const duration = sentence.wordCount / wps;
        const endTime = currentTime + duration;
        
        let delay = 0;
        if (sentence.text.endsWith(',')) delay = 0.2;
        else if (/[.?!]$/.test(sentence.text)) delay = 0.5;
        
        blocks.push({
            startTime: currentTime,
            endTime: endTime,
            text: sentence.text,
            isPunctuationEnd: /[.?!]$/.test(sentence.text.trim())
        });
        
        currentTime = endTime + delay;
    }
    
    return blocks;
};

export const segmentByTimeline = (timeline: TimelineBlock[], targetSceneCount: number): string[] => {
    if (timeline.length === 0) return [];
    if (targetSceneCount <= 1) return [timeline.map(b => b.text).join(' ')];

    const totalDuration = timeline[timeline.length - 1].endTime;
    const targetSceneDuration = totalDuration / targetSceneCount;
    
    const scenes: string[] = [];
    let currentSceneText: string[] = [];
    let currentSceneStart = timeline[0].startTime;
    
    for (let i = 0; i < timeline.length; i++) {
        const block = timeline[i];
        currentSceneText.push(block.text);
        
        const currentDuration = block.endTime - currentSceneStart;
        
        // Nếu đã đủ thời lượng cảnh và chưa phải cảnh cuối cùng
        if (currentDuration >= targetSceneDuration && scenes.length < targetSceneCount - 1) {
            let shouldBreak = false;
            
            // Ưu tiên ngắt tại dấu câu, hoặc ép ngắt nếu lố quá 4 giây
            if (block.isPunctuationEnd) {
                shouldBreak = true;
            } else if (currentDuration > targetSceneDuration + 4) {
                shouldBreak = true; 
            }
            
            if (shouldBreak) {
                scenes.push(currentSceneText.join(' '));
                currentSceneText = [];
                if (i + 1 < timeline.length) {
                    currentSceneStart = timeline[i + 1].startTime;
                }
            }
        }
    }
    
    if (currentSceneText.length > 0) {
        scenes.push(currentSceneText.join(' '));
    }
    
    return scenes;
};
```

---

## KHỐI 3: REFACTOR SERVICE LAYER (GEMINISERVICE)

### 3.1. Cập nhật `src/services/geminiService.ts`
Sửa lại hàm `analyzeScriptWithAI`. Chú ý thay đổi tham số truyền vào và luồng tiền xử lý văn bản:

**Thay đổi chữ ký (Signature):**
```typescript
import { parseSrtToTimeline, parseTxtToSyntheticTimeline, segmentByTimeline } from '../utils/textSegmentation';

export const analyzeScriptWithAI = async (
    script: string,
    targetSceneCount: number,
    modelName: string,
    apiKey: string,
    enhanceWithAI: boolean, // <-- Thêm tham số này (Thay cho segmentationMode)
    audioDuration?: number, // <-- Thêm tham số này
    styleLock: string = "",
    kymaKey?: string,
    kymaModelName: string = "deepseek-v4-flash",
    onProgress?: (scenes: ScenePrompt[], progress: number, message: string) => void
): Promise<{ scenes: ScenePrompt[], provider: string, model: string }> => {
```

**Thay đổi phần xử lý Text (Pre-segmentation):**
Xoá đoạn check `segmentationMode` cũ, thay bằng:
```typescript
    let timelineBlocks;
    const isSrt = script.includes('-->') && (script.includes(',000') || script.includes('.000') || script.includes('\n1\n'));
    
    if (isSrt) {
        timelineBlocks = parseSrtToTimeline(script);
    } else {
        timelineBlocks = parseTxtToSyntheticTimeline(script, audioDuration);
    }

    let segmentedLines = segmentByTimeline(timelineBlocks, targetSceneCount);

    if (enhanceWithAI) {
        if (onProgress) onProgress([], 5, "Đang dùng AI nắn chỉnh lại ngữ nghĩa các cảnh...");
        const scriptText = segmentedLines.map((line, i) => \`[Scene \${i+1}]: \${line}\`).join('\\n\\n');
        
        const systemInstruction = \`You are a storyboard director. Review the script and adjust the scene boundaries for better semantic flow.
You MUST return EXACTLY \${targetSceneCount} scenes. Do not change any text content, only move words/sentences between adjacent scenes if it improves the flow.
Return ONLY a JSON array of strings, where each string is a scene.\`;
        
        try {
            // Sử dụng Kyma hoặc Gemini để enhance
            const keyToUse = kymaKey || apiKey;
            const url = kymaKey ? 'https://kymaapi.com/v1/chat/completions' : \`https://generativelanguage.googleapis.com/v1beta/models/\${modelName}:generateContent?key=\${apiKey}\`;
            
            let adjustedScenes: string[] = [];
            if (kymaKey) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${kymaKey}\` },
                    body: JSON.stringify({
                        model: kymaModelName,
                        messages: [
                            { role: 'system', content: systemInstruction },
                            { role: 'user', content: scriptText }
                        ],
                        temperature: 0.1,
                    })
                });
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || "[]";
                const cleanJson = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                adjustedScenes = JSON.parse(cleanJson);
            }
            
            if (adjustedScenes.length === targetSceneCount) {
                segmentedLines = adjustedScenes;
            } else {
                console.warn("AI enhance returned wrong scene count. Using default timeline.");
            }
        } catch (e) {
            console.warn("AI enhance failed, using default timeline segment", e);
        }
    }
```
*(Tiếp tục giữ nguyên phần sinh Prompt sau bước này)*

---

## KHỐI 4: CẬP NHẬT STATE & GIAO DIỆN

### 4.1. Cập nhật `src/App.tsx`
Xoá state `segmentationMode` và thay bằng:
```typescript
  const [enhanceWithAI, setEnhanceWithAI] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
```
Sửa props truyền vào `ControlPanel`:
```typescript
            <ControlPanel
              // Xoá props mode cũ
              enhanceWithAI={enhanceWithAI}
              onEnhanceChange={setEnhanceWithAI}
              audioFileName={audioFileName}
              onAudioUpload={(duration, name) => {
                  setAudioDuration(duration);
                  setAudioFileName(name);
              }}
              // Giữ các props khác...
            />
```
Sửa lời gọi `analyzeScriptWithAI` trong hàm `handleGenerate`:
Truyền `enhanceWithAI` và `audioDuration` vào đúng vị trí thay cho mode.

### 4.2. Cập nhật `src/components/ControlPanel.tsx`
Thêm props interface:
```typescript
interface ControlPanelProps {
  // ...
  enhanceWithAI: boolean;
  onEnhanceChange: (val: boolean) => void;
  audioFileName: string | null;
  onAudioUpload: (duration: number | undefined, name: string | null) => void;
}
```

Thay thế cụm render "Phương pháp phân cảnh" (3 nút) bằng đoạn code UI sau:
```tsx
        {/* Tùy chọn Tăng cường */}
        <div className="mt-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input 
                type="checkbox" 
                checked={enhanceWithAI} 
                onChange={(e) => onEnhanceChange(e.target.checked)}
                className="form-checkbox text-blue-500 rounded bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span>🧠 Tăng cường độ chuẩn xác bằng AI (Chậm)</span>
          </label>
        </div>

        {/* Upload Audio tính nội suy */}
        <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700">
          <label className="block text-sm font-medium text-gray-400 mb-2">🎵 Trợ lực độ dài bằng File Audio (Tùy chọn)</label>
          <input 
              type="file" 
              accept="audio/mp3, audio/wav, audio/mpeg" 
              onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                      const url = URL.createObjectURL(file);
                      const audio = new Audio(url);
                      audio.onloadedmetadata = () => {
                          onAudioUpload(audio.duration, file.name);
                          URL.revokeObjectURL(url);
                      };
                  } else {
                      onAudioUpload(undefined, null);
                  }
              }}
              className="block w-full text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-blue-400 hover:file:bg-gray-600"
          />
          {audioFileName && (
              <p className="mt-2 text-xs text-green-400">Đã tải: {audioFileName}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">Giúp tính thời lượng ảo cực chuẩn cho kịch bản TXT thuần.</p>
        </div>
```

---
**END OF SPECIFICATION**
Coder Tier 2 hãy đọc kỹ, copy đúng đoạn code cần thiết để paste vào hệ thống, đảm bảo không làm gãy luồng TypeScript cũ.
