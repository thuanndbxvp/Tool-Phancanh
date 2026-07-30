# TÀI LIỆU HƯỚNG DẪN THỰC THI CHI TIẾT (MSEW-hybrid-segmentation)
**Role:** Tier 2 Coder
**Lưu ý:** Copy và paste code chính xác 100%.

---

## KHỐI 1: CẬP NHẬT KIỂU DỮ LIỆU (TYPES)

### 1.1. Sửa file `src/types/index.ts`
Xóa bỏ hoàn toàn định nghĩa type `segmentationMode`. Thêm interface mới:
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
Bổ sung đoạn code sau (vẫn giữ các hàm cũ như `tokenizeSentences`, `ensureSceneCount`):
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
        
        if (currentDuration >= targetSceneDuration && scenes.length < targetSceneCount - 1) {
            let shouldBreak = false;
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
Thêm import mới:
```typescript
import { parseSrtToTimeline, parseTxtToSyntheticTimeline, segmentByTimeline, tokenizeSentences, ensureSceneCount, Sentence } from "../utils/textSegmentation";
```

**Sửa chữ ký hàm `analyzeScriptWithAIStream`:**
Thay thế toàn bộ hàm `analyzeScriptWithAIStream` (từ đoạn `export const analyzeScriptWithAIStream = ...` cho đến hết phần 1. PRE-SEGMENTATION) bằng đoạn code sau:
```typescript
export const analyzeScriptWithAIStream = async function* (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string,
    styleLock: string,
    mode: string,
    enhanceWithAI: boolean, // Thay cho segmentationMode
    modelName: string = "gemini-2.5-flash",
    targetSceneCount: number = 10,
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9',
    enableAspectRatio: boolean = false,
    enableCharacterConsistency: boolean = false,
    kymaKey?: string,
    kymaModelName: string = "gpt-4o-mini",
    audioDuration?: number  // Tham số mới
): AsyncGenerator<{ type: 'progress' | 'final', scenes?: any[], progress?: number, status?: string, provider?: string, model?: string, totalCount?: number }> {
    let finalProvider = kymaKey ? "Kyma" : (apiKey ? "Gemini (User Key)" : "System Default");
    let finalModel = kymaKey ? kymaModelName : modelName;

    if (!kymaKey && !apiKey) {
        throw new Error("Không có API key. Vui lòng cấu hình Kyma hoặc Gemini key trước khi phân cảnh.");
    }

    // 1. PRE-SEGMENTATION
    yield { type: 'progress', scenes: [], progress: 5, status: "Đang tiền xử lý kịch bản theo Smart Timeline..." };
    
    if (!script || script.trim() === '') {
        throw new Error("Kịch bản trống.");
    }
    
    let timelineBlocks;
    const isSrt = script.includes('-->') && (script.includes(',000') || script.includes('.000') || script.includes('\n1\n'));
    
    if (isSrt) {
        timelineBlocks = parseSrtToTimeline(script);
    } else {
        timelineBlocks = parseTxtToSyntheticTimeline(script, audioDuration);
    }

    let segmentedLines = segmentByTimeline(timelineBlocks, targetSceneCount);

    if (segmentedLines.length < targetSceneCount) {
        segmentedLines = ensureSceneCount(segmentedLines, tokenizeSentences(script), targetSceneCount);
    }

    if (enhanceWithAI) {
        yield { type: 'progress', scenes: [], progress: 10, status: "Đang dùng AI nắn chỉnh lại ngữ nghĩa các cảnh..." };
        const scriptText = segmentedLines.map((line, i) => \`[Scene \${i+1}]: \${line}\`).join('\\n\\n');
        
        const systemInstruction = \`You are a storyboard director. Review the script and adjust the scene boundaries for better semantic flow.
You MUST return EXACTLY \${targetSceneCount} scenes. Do not change any text content, only move words/sentences between adjacent scenes if it improves the flow.
Return ONLY a JSON array of strings, where each string is a scene.\`;
        
        try {
            const url = kymaKey ? 'https://kymaapi.com/v1/chat/completions' : \`https://generativelanguage.googleapis.com/v1beta/models/\${modelName}:generateContent?key=\${apiKey.split(',')[0].trim()}\`;
            let adjustedScenes: string[] = [];
            
            if (kymaKey) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${kymaKey.split(',')[0].trim()}\` },
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
            } else {
                const ai = new GoogleGenAI({ apiKey: apiKey.split(',')[0].trim() });
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: scriptText,
                    config: {
                        systemInstruction,
                        responseMimeType: "application/json"
                    }
                });
                if (response.text) {
                     adjustedScenes = JSON.parse(response.text.trim());
                }
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
    
    // (Phần 1.5 CHARACTER DICTIONARY... và code bên dưới giữ nguyên như hiện tại)
```

*(Hãy cẩn thận thay thế từ dòng khai báo `export const analyzeScriptWithAIStream` cho đến hết khối if-else check Mode cũ (ngay trước đoạn 1.5 CHARACTER DICTIONARY)).*

---

## KHỐI 4: CẬP NHẬT STATE & GIAO DIỆN

### 4.1. Cập nhật `src/App.tsx`
Xóa bỏ dòng khai báo `segmentationMode` (tầm dòng 24), thay bằng:
```typescript
  const [enhanceWithAI, setEnhanceWithAI] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
```

Chỗ gọi `<ControlPanel ... />` (tầm dòng 360), **xoá `segmentationMode` và `setSegmentationMode`**, thay thế bằng:
```typescript
                        enhanceWithAI={enhanceWithAI}
                        onEnhanceChange={setEnhanceWithAI}
                        audioFileName={audioFileName}
                        onAudioUpload={(duration, name) => {
                            setAudioDuration(duration);
                            setAudioFileName(name);
                        }}
```

Trong hàm `handleBuildPrompts` (tầm dòng 202), sửa lời gọi `analyzeScriptWithAIStream`:
```typescript
          const stream = analyzeScriptWithAIStream(
              scenario,
              refImagesForService,
              effectiveKey,
              activeStylePrompt,
              mode,
              enhanceWithAI, // Thay chỗ segmentationMode cũ
              selectedModel,
              targetSceneCount,
              promptType,
              aspectRatio,
              enableAspectRatio,
              enableCharacterConsistency,
              kymaKey,
              selectedKymaModel || 'deepseek-v4-flash',
              audioDuration // Thêm parameter cuối
          );
```

### 4.2. Cập nhật `src/components/ControlPanel.tsx`
Cập nhật interface `ControlPanelProps`: **Xóa `segmentationMode`, `setSegmentationMode`**, thêm các prop mới:
```typescript
  enhanceWithAI: boolean;
  onEnhanceChange: (val: boolean) => void;
  audioFileName: string | null;
  onAudioUpload: (duration: number | undefined, name: string | null) => void;
```

Tìm đoạn render HTML cho 3 nút Mode cũ (Thường nằm dưới phần chọn "Số lượng cảnh", có text "Phương pháp phân cảnh"). **Xóa hẳn khối HTML này**. Thay thế bằng:
```tsx
        {/* Tùy chọn AI */}
        <div className="mt-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input 
                type="checkbox" 
                checked={enhanceWithAI} 
                onChange={(e) => onEnhanceChange(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span>🧠 Tăng cường độ chuẩn xác bằng AI (Chậm)</span>
          </label>
        </div>

        {/* Upload Audio */}
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
              className="block w-full text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:font-semibold file:bg-gray-700 file:text-blue-400 hover:file:bg-gray-600"
          />
          {audioFileName && (
              <p className="mt-2 text-xs text-emerald-400">Đã tải: {audioFileName}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">Giúp tính thời lượng ảo cực chuẩn cho kịch bản TXT thuần.</p>
        </div>
```
