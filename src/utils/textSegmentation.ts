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
        const sentencesPerScene = Math.max(1, Math.floor(sentences.length / targetSceneCount));
        for (let i = 0; i < sentences.length; i += sentencesPerScene) {
            fallbackScenes.push(sentences.slice(i, i + sentencesPerScene).map(s => s.text).join(' '));
        }
        // Ép số lượng cảnh bằng đúng target (gộp cuối nếu dư)
        while (fallbackScenes.length > targetSceneCount) {
            const last = fallbackScenes.pop();
            if (last && fallbackScenes.length > 0) {
                fallbackScenes[fallbackScenes.length - 1] += " " + last;
            }
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
        if (i === aiIndices.length - 1) toIdx = sentences.length - 1;

        const sceneTexts = sentences.slice(fromIdx, toIdx + 1).map(s => s.text);
        scenes.push(sceneTexts.join(' '));
        lastHandledIdx = toIdx;
    }

    // Append any remaining sentences (gap handling)
    if (sentences.length > 0 && lastHandledIdx < sentences.length - 1 && scenes.length > 0) {
        const remainder = sentences.slice(lastHandledIdx + 1).map(s => s.text).join(' ');
        if (remainder) {
            scenes[scenes.length - 1] = (scenes[scenes.length - 1] + ' ' + remainder).trim();
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
