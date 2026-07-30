/**
 * AI Helpers - các tiện ích chung cho tất cả dịch vụ AI (Gemini, Kyma, ...).
 *
 * Được tách ra từ geminiService.ts theo kế hoạch "robust-ai-connection".
 */

/**
 * Parse mảng JSON từ text AI trả về, chịu được các trường hợp:
 *  - Text bị wrap trong markdown ```json ... ```
 *  - Text bị cắt cụt giữa chừng (thiếu `]` cuối, thiếu dấu phẩy)
 *  - Text có rác (prefix/suffix do model tự sinh)
 *  - Text có dấu phẩy thừa ở cuối
 *
 * Tham số `expectedCount` chỉ dùng để gợi ý (không bắt buộc trùng khớp).
 * Hàm sẽ ném Error nếu không thể tách được mảng JSON hợp lệ.
 */
export const parseJsonArray = (text: string, expectedCount?: number): any[] => {
    let t = (text || "").trim();

    // 1) Strip markdown wrapper
    if (t.startsWith("```")) {
        t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
    }

    const candidates: string[] = [t];
    const fixed = t.replace(/,+$/, ''); // Xóa dấu phẩy thừa ở cuối

    // 2) Nếu thiếu `]` cuối (truncated) → thử chèn thêm
    if (fixed && !fixed.endsWith("]")) {
        candidates.push(fixed + "]");
        candidates.push(fixed + '"]');
    }

    for (const cand of candidates) {
        try {
            const arr = JSON.parse(cand);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch {
            /* thử candidate tiếp theo */
        }
    }

    // 3) "Thuốc đắng dã tật": bóc tách mảng nằm giữa rác
    const startIdx = t.indexOf("[");
    const endIdx = t.lastIndexOf("]");
    if (startIdx !== -1 && endIdx > startIdx) {
        try {
            const arr = JSON.parse(t.substring(startIdx, endIdx + 1));
            if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch {
            /* bỏ qua */
        }
    }

    throw new Error(
        `Không thể parse dữ liệu từ AI thành mảng JSON (expected ${expectedCount ?? '?'}, text length=${t.length}).`
    );
};

/**
 * Danh sách model fallback cho mỗi provider, dùng khi model yêu cầu
 * bị 429/503/timeout thì thử model kế tiếp trước khi báo lỗi.
 */
export const FALLBACK_MODELS: { gemini: string[]; kyma: string[] } = {
    gemini: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    kyma: ['deepseek-v4-flash', 'gpt-4o-mini', 'claude-3-haiku-20240307'],
};
