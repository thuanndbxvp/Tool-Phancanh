export const parseSRT = (content: string): string => {
  return content
    .replace(/^\uFEFF/, '')                                      // Loại bỏ cặn BOM UTF-8
    .replace(/^\d+\r?\n/gm, '')                                  // Xoá số có newline theo sau (chính xác hơn Regex cũ)
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '') // Xoá timestamp
    .replace(/<[^>]+>/g, '')                                     // Xoá thẻ HTML
    .replace(/\{[^}]+\}/g, '')                                   // Xoá style e.g {italic}
    .replace(/\n{3,}/g, '\n\n')                                  // Chuẩn hoá khoảng trắng
    .trim();
};
