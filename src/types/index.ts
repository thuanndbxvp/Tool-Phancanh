export interface ImageFile {
  name: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
}

export interface ScenePrompt {
  id: number | string;
  imagePrompt?: string;
  videoPrompt?: string;
  scriptLine: string;
}

export interface ApiKeyData {
    key: string;
    isActive: boolean;
    status: 'valid' | 'invalid' | 'unknown';
    lastUsed?: number;
}

export interface SavedSession {
    id: string;
    name: string;
    timestamp: number;
    prompts: ScenePrompt[];
}

export type AppMode = 'general';
export type PromptType = 'image' | 'video';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message: string;
}

// TimelineBlock interface đã được định nghĩa trong src/utils/textSegmentation.ts
// (gần chỗ sử dụng hơn để tránh coupling với types layer)
