// Băm chuỗi đơn giản để tạo Hash
const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return hash.toString();
};

export const Cache = {
    charDict: new Map<string, { hash: string, data: string }>(),

    getCharacters(script: string, model: string): string | null {
        const hash = hashString(script + model);
        const cached = this.charDict.get(script.substring(0, 200));
        if (cached && cached.hash === hash) return cached.data;
        return null;
    },

    setCharacters(script: string, model: string, data: string) {
        const hash = hashString(script + model);
        this.charDict.set(script.substring(0, 200), { hash, data });
    }
};
