export const parseSRT = (content: string): string => {
  return content
    .replace(/^\d+$/gm, '')                                    // Xoá số thứ tự dòng
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '') // Xoá timestamp
    .replace(/<[^>]+>/g, '')                                   // Xoá thẻ HTML
    .replace(/\{[^}]+\}/g, '')                                 // Xoá style e.g {italic}
    .replace(/\n{3,}/g, '\n\n')                                // Chuẩn hoá khoảng trắng
    .trim();
};
