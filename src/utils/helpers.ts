import * as XLSX from 'xlsx';
import { ScenePrompt } from '../types';

export const fileToDataUrl = (file: File): Promise<{ dataUrl: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

export const getTimestamp = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${h}${m}${s}`;
};

export const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('vi-VN');
};

export const exportToExcel = (prompts: ScenePrompt[], filenamePrefix: string = 'storyboard') => {
      if (prompts.length === 0) return;
      
      const wsData = prompts.map((p, index) => ({
          'Cảnh': index + 1,
          'Nội dung Script': p.scriptLine,
          ...(p.imagePrompt ? { 'Prompt Hình ảnh': p.imagePrompt } : {}),
          ...(p.videoPrompt ? { 'Prompt Video': p.videoPrompt } : {})
      }));
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(wsData);
      
      const wscols = Object.keys(wsData[0]).map(k => ({ wch: 30 }));
      ws['!cols'] = wscols;
      
      XLSX.utils.book_append_sheet(wb, ws, "Storyboard");
      XLSX.writeFile(wb, `${filenamePrefix}_${getTimestamp()}.xlsx`);
};

// --- ALGORITHM TO FIX BUG 1 & BUG 2 ---
// Javascript-based pre-segmentation to avoid missing text and to guarantee even splits.
export const segmentScript = (
  script: string, 
  mode: 'ai' | 'punctuation' | 'fixed', 
  targetSceneCount: number
): string[] => {
  // First, clean up extra spaces and normalize line breaks
  const normalizedScript = script.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  
  if (!normalizedScript) return [];

  // Helper to split into basic logical sentences/clauses
  // We split by punctuation but keep the punctuation attached to the sentence
  const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
  let matches = normalizedScript.match(sentenceRegex);
  
  if (!matches) {
      // Fallback if no punctuation is found, just split by rough length
      matches = [normalizedScript];
  }
  
  let basicSentences = matches.map(s => s.trim()).filter(s => s.length > 0);

  if (mode === 'punctuation' || mode === 'ai') {
      // For punctuation, return sentences, but maybe merge very short ones to avoid scenes with just "Hi."
      const result: string[] = [];
      let temp = "";
      for (const s of basicSentences) {
          if (temp.length + s.length < 50 && temp.length > 0) { // arbitrary small size to merge
              temp += " " + s;
          } else {
              if (temp) result.push(temp);
              temp = s;
          }
      }
      if (temp) result.push(temp);
      return result;
  }

  if (mode === 'fixed') {
      // Distribute evenly across exactly `targetSceneCount`
      if (basicSentences.length <= targetSceneCount) {
          // If we have fewer sentences than target count, we have to split some sentences arbitrarily by length
          // or just return what we have, padded. Better to force splits by word count.
          const words = normalizedScript.split(/\s+/).filter(w => w.length > 0);
          if (words.length <= targetSceneCount) {
             // Edge case: fewer words than target scenes
             return words.concat(Array(targetSceneCount - words.length).fill(""));
          }
          
          const wordsPerScene = Math.ceil(words.length / targetSceneCount);
          const result: string[] = [];
          for (let i = 0; i < targetSceneCount; i++) {
              const start = i * wordsPerScene;
              const chunk = words.slice(start, start + wordsPerScene).join(" ");
              if (chunk) result.push(chunk);
          }
          // Pad if somehow we missed
          while (result.length < targetSceneCount) result.push("");
          return result;
      }

      // We have more sentences than target count, we merge them intelligently
      const totalLength = basicSentences.reduce((acc, val) => acc + val.length, 0);
      const targetLengthPerScene = totalLength / targetSceneCount;
      
      const result: string[] = [];
      let currentChunk = "";
      let scenesCreated = 0;

      for (let i = 0; i < basicSentences.length; i++) {
          const s = basicSentences[i];
          
          // If we are at the last required scene, dump everything remaining into it
          // Or wait, if we do that, the last scene might be too long.
          // Let's stick to the target length
          if (scenesCreated === targetSceneCount - 1) {
             const remaining = basicSentences.slice(i).join(" ");
             currentChunk = (currentChunk + " " + remaining).trim();
             break; 
          }

          const potentialLength = currentChunk.length + s.length;
          
          if (potentialLength >= targetLengthPerScene && currentChunk.length > 0) {
              // Decide whether to add this sentence to current chunk or next chunk based on which is closer to target
              const diffWith = Math.abs(potentialLength - targetLengthPerScene);
              const diffWithout = Math.abs(currentChunk.length - targetLengthPerScene);
              
              if (diffWith < diffWithout) {
                  currentChunk += " " + s;
                  result.push(currentChunk.trim());
                  currentChunk = "";
                  scenesCreated++;
              } else {
                  result.push(currentChunk.trim());
                  currentChunk = s;
                  scenesCreated++;
              }
          } else {
              currentChunk = currentChunk ? currentChunk + " " + s : s;
          }
      }
      if (currentChunk) {
          result.push(currentChunk.trim());
      }
      
      // If we somehow didn't reach the exact count (due to rounding), adjust
      while(result.length < targetSceneCount) {
          result.push(""); // Or split the longest scene
      }
      while(result.length > targetSceneCount) {
          // Merge shortest adjacents
          let minLen = Infinity;
          let idx = 0;
          for(let i=0; i<result.length-1; i++) {
             const len = result[i].length + result[i+1].length;
             if (len < minLen) {
                 minLen = len;
                 idx = i;
             }
          }
          result[idx] = result[idx] + " " + result[idx+1];
          result.splice(idx + 1, 1);
      }

      return result;
  }
  
  return [script]; // fallback
};

export interface SceneAnchor {
  sceneNumber: number;
  startAnchor: string;
  endAnchor: string;
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const findFuzzyIndex = (text: string, anchor: string, startIndex: number = 0): number => {
    if (!anchor || anchor.trim() === '') return -1;
    
    const exact = text.indexOf(anchor, startIndex);
    if (exact !== -1) return exact;

    const substr = text.slice(startIndex);
    const words = anchor.trim().split(/\s+/).filter(w => w.length > 0);
    
    if (words.length > 0) {
        // Try regex matching words ignoring extra spaces/punctuation in between
        const fallbackRegex = new RegExp(words.map(escapeRegExp).join('[\\s\\p{P}]+'), 'iu');
        const fallbackMatch = substr.match(fallbackRegex);
        if (fallbackMatch && fallbackMatch.index !== undefined) {
            return startIndex + fallbackMatch.index;
        }
    }
    return -1;
};

export const splitTextIntoChunks = (text: string, maxLen: number): string[] => {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLen) {
        let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
        if (splitIdx === -1) splitIdx = remaining.lastIndexOf('\n', maxLen);
        if (splitIdx === -1) splitIdx = remaining.lastIndexOf('. ', maxLen);
        if (splitIdx === -1) splitIdx = maxLen; // fallback
        
        chunks.push(remaining.slice(0, splitIdx).trim());
        remaining = remaining.slice(splitIdx).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
};

export const segmentByAnchors = (script: string, anchors: SceneAnchor[]): string[] => {
    if (!anchors || anchors.length === 0) return [script];
    
    const result: string[] = [];
    let currentIndex = 0;

    for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        
        let startIdx = findFuzzyIndex(script, anchor.startAnchor, currentIndex);
        // If start anchor is missing or logically behind our current cursor, we just use the cursor.
        // It guarantees we don't drop the in-between text.
        if (startIdx === -1 || startIdx < currentIndex) {
            startIdx = currentIndex; 
        }

        let endIdx = findFuzzyIndex(script, anchor.endAnchor, startIdx);
        if (endIdx !== -1) {
            endIdx = endIdx + anchor.endAnchor.length; // include the end words
        } else {
            // Fallback: find the start of the next scene
            if (i < anchors.length - 1) {
                const nextStartIdx = findFuzzyIndex(script, anchors[i+1].startAnchor, startIdx);
                endIdx = nextStartIdx !== -1 ? nextStartIdx : script.length;
            } else {
                endIdx = script.length;
            }
        }
        
        // Ensure endIdx is not before startIdx
        if (endIdx < startIdx) {
            endIdx = script.length;
        }

        // We slice from currentIndex to endIdx to catch everything, even text that might be before startIdx
        const chunk = script.slice(currentIndex, endIdx).trim();
        if (chunk) {
            result.push(chunk);
        }
        currentIndex = endIdx;
    }

    // Append any trailing text to the last chunk
    if (currentIndex < script.length && result.length > 0) {
       const remainder = script.slice(currentIndex).trim();
       if (remainder) {
           result[result.length - 1] += "\n\n" + remainder;
       }
    }

    return result;
};

// --- ALGORITHM TO CALCULATE OPTIMAL SCENE COUNT ---
// Based on 8s Video limit (Veo3/Sora) ~ 20-25 words per scene.
export const calculateOptimalSceneCount = (script: string): number => {
    if (!script || script.trim().length === 0) return 1;
    // Count words roughly by splitting by whitespace
    const words = script.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    // 25 words per scene is roughly 10 seconds of voiceover, a safe buffer for 8s videos.
    const optimalCount = Math.round(wordCount / 25);
    return Math.max(1, optimalCount); // At least 1 scene
};

/**
 * Tính tổng thời lượng (giây) từ nội dung SRT mà không cần file audio.
 * Pattern: tìm LAST timestamp dạng "00:01:30,500 --> 00:05:30,000" → lấy end time.
 * Return undefined nếu không parse được (vd file rỗng/không phải SRT).
 */
export const inferSrtDurationSecs = (srtContent: string): number | undefined => {
    if (!srtContent) return undefined;

    // Find the LAST "-->" entry in the file (last cue's end timestamp)
    const matches = [...srtContent.matchAll(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/g)];
    if (matches.length === 0) return undefined;

    // Pattern: mỗi match là "--> HH:MM:SS,mmm", ta cần lấy phần SAU "-->"
    const lastEntry = matches[matches.length - 1];
    const afterDash = srtContent.slice(lastEntry.index! + lastEntry[0].length).trim();
    const endMatch = afterDash.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!endMatch) return undefined;

    const hh = parseInt(endMatch[1], 10);
    const mm = parseInt(endMatch[2], 10);
    const ss = parseInt(endMatch[3], 10);
    const ms = parseInt(endMatch[4], 10);

    return hh * 3600 + mm * 60 + ss + ms / 1000;
};
