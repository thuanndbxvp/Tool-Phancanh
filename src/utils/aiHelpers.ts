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
