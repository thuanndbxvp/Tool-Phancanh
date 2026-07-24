// Hash 64-bit (FNV-1a kết hợp) — collision cực thấp
const hashString = (str: string): string => {
    let h1 = 0x811c9dc5;
    let h2 = 0xcbf29ce4;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = Math.imul(h2 ^ c, 0x100000001b3 & 0xffffffff);
    }
    return h1.toString(16) + h2.toString(16);
};

// Dùng 2000 ký tự đầu làm key (an toàn hơn 200)
const CACHE_KEY_LEN = 2000;

export const Cache = {
    charDict: new Map<string, { hash: string, data: string }>(),

    getCharacters(script: string, model: string): string | null {
        const hash = hashString(script + model);
        const cached = this.charDict.get(script.substring(0, CACHE_KEY_LEN));
        if (cached && cached.hash === hash) return cached.data;
        return null;
    },

    setCharacters(script: string, model: string, data: string) {
        const hash = hashString(script + model);
        this.charDict.set(script.substring(0, CACHE_KEY_LEN), { hash, data });
    }
};
