export interface Sentence {
    idx: number;
    text: string;
    wordCount: number;
}

export const tokenizeSentences = (text: string): Sentence[] => {
    if (!text) return [];
    // Sử dụng bộ băm chuẩn của trình duyệt (cực tốt cho tiếng Việt)
    const segmenter = new Intl.Segmenter('vi', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(text));

    return segments
        .map(s => s.segment.trim())
        .filter(s => s.length > 0)
        .map((text, idx) => ({
            idx,
            text,
            wordCount: text.split(/\s+/).filter(w => w.length > 0).length
        }));
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
    return scenes;
};
