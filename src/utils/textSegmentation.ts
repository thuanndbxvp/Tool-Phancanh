export interface Sentence {
    idx: number;
    text: string;
    wordCount: number;
}

export const tokenizeSentences = (text: string): Sentence[] => {
    if (!text) return [];

    let segmenter: Intl.Segmenter;
    try {
        segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });
    } catch {
        // Fallback an toàn cho trình duyệt cũ (Safari < 14)
        return text.match(/[^.!?\n]+[.!?\n]+/g)?.map(s => s.trim()).filter(Boolean)
            .map((t, i) => ({ idx: i, text: t, wordCount: t.split(/\s+/).filter(w => w.length > 0).length })) || [];
    }

    const result: Sentence[] = [];
    let idx = 0;

    // Tối ưu 1 vòng lặp duy nhất thay cho chain.map.filter.map
    for (const seg of segmenter.segment(text)) {
        const trimmed = seg.segment.trim();
        if (trimmed.length === 0) continue;
        const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
        result.push({ idx: idx++, text: trimmed, wordCount });
    }

    return result;
};

export const segmentByWaterFilling = (sentences: Sentence[], targetSceneCount: number): string[] => {
    if (sentences.length === 0) return [];

    const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
    const idealWords = Math.max(1, totalWords / targetSceneCount);

    const scenes: string[] = [];
    let currentScene: string[] = [];
    let currentWords = 0;

    for (let i = 0; i < sentences.length; i++) {
        currentScene.push(sentences[i].text);
        currentWords += sentences[i].wordCount;

        if (currentWords >= idealWords && scenes.length < targetSceneCount - 1) {
            scenes.push(currentScene.join(' '));
            currentScene = [];
            currentWords = 0;
        }
    }

    if (currentScene.length > 0) {
        scenes.push(currentScene.join(' '));
    }

    // Fallback: Tránh trường hợp tạo ra quá ít cảnh so với yêu cầu (vd 5 câu, target 20 cảnh)
    if (scenes.length < targetSceneCount && sentences.length >= targetSceneCount) {
        const fallbackScenes: string[] = [];
        const base = Math.floor(sentences.length / targetSceneCount);
        let remainder = sentences.length % targetSceneCount;
        let currentIdx = 0;
        
        for (let i = 0; i < targetSceneCount; i++) {
            const take = base + (remainder > 0 ? 1 : 0);
            remainder--;
            const chunk = sentences.slice(currentIdx, currentIdx + take).map(s => s.text).join(' ');
            fallbackScenes.push(chunk);
            currentIdx += take;
        }
        return fallbackScenes;
    }

    return scenes;
};

export const segmentByIndex = (sentences: Sentence[], aiIndices: { fromSentenceIdx: number, toSentenceIdx: number }[]): string[] => {
    const scenes: string[] = [];
    let lastHandledIdx = -1;

    for (let i = 0; i < aiIndices.length; i++) {
        let fromIdx = aiIndices[i].fromSentenceIdx;
        let toIdx = aiIndices[i].toSentenceIdx;

        if (fromIdx > lastHandledIdx + 1) fromIdx = lastHandledIdx + 1;
        if (toIdx < fromIdx) toIdx = fromIdx;
        if (toIdx >= sentences.length) toIdx = sentences.length - 1;
        // Bỏ việc ép toIdx của scene cuối cùng, để dành việc xử lý phần thừa cho logic bên dưới.

        const sceneTexts = sentences.slice(fromIdx, toIdx + 1).map(s => s.text);
        scenes.push(sceneTexts.join(' '));
        lastHandledIdx = toIdx;
    }

    // Append any remaining sentences (gap handling)
    if (sentences.length > 0 && lastHandledIdx < sentences.length - 1 && scenes.length > 0) {
        const unmapped = sentences.slice(lastHandledIdx + 1).map(s => s.text);
        // Phân bổ đều các câu thừa vào các cảnh (round-robin từ cảnh cuối ngược lên) để tránh dồn cục
        let sceneIdx = scenes.length - 1;
        for (const text of unmapped) {
            scenes[sceneIdx] = scenes[sceneIdx] + ' ' + text;
            sceneIdx--;
            if (sceneIdx < 0) sceneIdx = scenes.length - 1;
        }
    } else if (sentences.length > 0 && scenes.length === 0) {
        scenes.push(sentences.map(s => s.text).join(' '));
    }
    return scenes;
};

/**
 * Đảm bảo segmentedLines có đúng targetSceneCount scenes.
 * Nếu thiếu nhiều (ratio < 0.8) → re-segment toàn bộ bằng water-filling.
 * Nếu thiếu ít (ratio ≥ 0.8) → tách scene dài nhất làm đôi (tại dấu câu gần nhất).
 * Trả về mảng mới (không mutate input).
 */
export const ensureSceneCount = (
    segmentedLines: string[],
    sentences: Sentence[],
    targetSceneCount: number
): string[] => {
    if (segmentedLines.length >= targetSceneCount) return segmentedLines;

    const ratio = segmentedLines.length / targetSceneCount;
    console.warn(`AI trả thiếu cảnh (${segmentedLines.length}/${targetSceneCount}, ratio=${ratio.toFixed(2)}), đang tự bù...`);

    // Case 1: Thiếu nhiều (≥ 20%) → re-segment toàn bộ
    if (ratio < 0.8) {
        const resegmented = segmentByWaterFilling(sentences, targetSceneCount);
        console.warn(`Re-segmented toàn bộ → ${resegmented.length} scenes`);
        return resegmented;
    }

    // Case 2: Thiếu ít (< 20%) → tách scene dài nhất làm đôi, lặp đến khi đủ
    const result = [...segmentedLines];
    let safetyLimit = targetSceneCount * 2;
    while (result.length < targetSceneCount && safetyLimit-- > 0) {
        // Tìm scene dài nhất (theo số từ)
        let maxIdx = 0;
        let maxWords = 0;
        result.forEach((line, i) => {
            const words = line.split(/\s+/).filter(w => w.length > 0).length;
            if (words > maxWords) { maxWords = words; maxIdx = i; }
        });

        if (maxWords < 2) break; // Không thể tách nữa

        const longest = result[maxIdx];
        const half = Math.floor(longest.length / 2);

        // Tìm vị trí tách tại dấu câu gần nhất (., !, ?)
        let splitAt = -1;
        for (const sep of ['. ', '! ', '? ', '.\n', '!\n', '?\n']) {
            const idx = longest.lastIndexOf(sep, half);
            if (idx > splitAt) splitAt = idx;
        }
        if (splitAt < 0) splitAt = half; // Không có dấu câu → tách giữa

        const part1 = longest.slice(0, splitAt + 1).trim();
        const part2 = longest.slice(splitAt + 1).trim();

        if (!part1 || !part2) break;

        result.splice(maxIdx, 1, part1, part2);
    }

    // Nếu vẫn thiếu sau khi tách (edge case) → fallback cuối cùng
    if (result.length < targetSceneCount) {
        console.warn(`Tách scene dài nhất không đủ, fallback cuối: water-filling toàn bộ`);
        return segmentByWaterFilling(sentences, targetSceneCount);
    }

    console.warn(`Đã bù từ ${segmentedLines.length} → ${result.length} scenes bằng cách tách scene dài`);
    return result;
};

// ========== KHỐI 2 (hybrid-segmentation): TIMELINE-BASED SEGMENTATION ==========

export interface TimelineBlock {
    startTime: number;
    endTime: number;
    text: string;
    isPunctuationEnd: boolean;
}

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

    // Early-Cut Strategy:
    //   min_target = target - 2.5s  → vào vùng "có thể cắt" nếu gặp dấu câu
    //   max_target = target + 4s    → hard limit, cắt cứng bất chấp dấu câu
    const minTarget = Math.max(0, targetSceneDuration - 2.5);
    const maxTarget = targetSceneDuration + 4;

    const scenes: string[] = [];
    let currentSceneText: string[] = [];
    let currentSceneStart = timeline[0].startTime;

    for (let i = 0; i < timeline.length; i++) {
        const block = timeline[i];
        currentSceneText.push(block.text);

        const currentDuration = block.endTime - currentSceneStart;
        const isLastScene = scenes.length >= targetSceneCount - 1;

        let shouldBreak = false;

        if (currentDuration >= maxTarget) {
            // HARD LIMIT: vượt ngưỡng max → cắt cứng, kể cả giữa câu
            shouldBreak = true;
        } else if (currentDuration >= minTarget && !isLastScene) {
            // VÙNG EARLY-CUT: target - 2.5s đến target + 4s
            // Chỉ cắt nếu gặp dấu câu → đảm bảo ngữ nghĩa trọn vẹn
            if (block.isPunctuationEnd) {
                shouldBreak = true;
            }
        }

        if (shouldBreak) {
            scenes.push(currentSceneText.join(' '));
            currentSceneText = [];
            if (i + 1 < timeline.length) {
                currentSceneStart = timeline[i + 1].startTime;
            }
        }
    }

    if (currentSceneText.length > 0) {
        scenes.push(currentSceneText.join(' '));
    }

    return scenes;
};
