import React, { FC, useState, useEffect } from 'react';
import { ApiKeyData } from '../../types';
import { MODELS } from '../../utils/constants';
import { XMarkIcon, KeyIcon, TrashIcon } from '../icons';
import { validateApiKey } from '../../services/geminiService';

export const ApiSettingsModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    apiKeys: ApiKeyData[];
    setApiKeys: (keys: ApiKeyData[]) => void;
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    kymaKey: string;
    setKymaKey: (key: string) => void;
    kymaModels: {id: string, name: string, pricing?: any}[];
    selectedKymaModel: string;
    setSelectedKymaModel: (model: string) => void;
}> = ({ isOpen, onClose, apiKeys, setApiKeys, selectedModel, setSelectedModel, kymaKey, setKymaKey, kymaModels, selectedKymaModel, setSelectedKymaModel }) => {
    const [newKey, setNewKey] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [activeTab, setActiveTab] = useState<'gemini' | 'kyma'>('kyma');
    const [tempKyma, setTempKyma] = useState(kymaKey || '');
    const [isCheckingKyma, setIsCheckingKyma] = useState(false);
    const [kymaCheckMsg, setKymaCheckMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);
    const [geminiCheckMsg, setGeminiCheckMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);

    useEffect(() => {
        setTempKyma(kymaKey);
    }, [kymaKey]);

    if (!isOpen) return null;

    const handleCheckKymaKey = async () => {
        if (!tempKyma.trim()) return;
        setIsCheckingKyma(true);
        setKymaCheckMsg(null);
        try {
            const res = await fetch('https://kymaapi.com/v1/models', {
                headers: { 'Authorization': `Bearer ${tempKyma.trim()}` }
            });
            if (res.ok) {
                setKymaCheckMsg({ text: 'API Key hợp lệ! Đã lưu.', type: 'success' });
                setKymaKey(tempKyma.trim());
                localStorage.setItem('sbgen_kyma_key', tempKyma.trim());
            } else {
                setKymaCheckMsg({ text: 'API Key không hợp lệ hoặc đã hết hạn.', type: 'error' });
            }
        } catch (e) {
            setKymaCheckMsg({ text: 'Lỗi kết nối khi kiểm tra API Key.', type: 'error' });
        }
        setIsCheckingKyma(false);
    };

    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        setGeminiCheckMsg(null);
        if (apiKeys.some(k => k.key === newKey.trim())) {
             setGeminiCheckMsg({ text: 'Key này đã tồn tại!', type: 'error' });
             return;
        }

        setIsValidating(true);
        const isValid = await validateApiKey(newKey.trim(), 'gemini');
        setIsValidating(false);

        const newKeyData: ApiKeyData = {
            key: newKey.trim(),
            isActive: true,
            status: isValid ? 'valid' : 'invalid',
        };

        const updatedKeys = [...apiKeys, newKeyData];
        setApiKeys(updatedKeys);
        localStorage.setItem('sbgen_api_keys', JSON.stringify(updatedKeys));
        setNewKey('');
        if (isValid) {
            setGeminiCheckMsg({ text: 'Thêm Key thành công!', type: 'success' });
        } else {
            setGeminiCheckMsg({ text: 'Key đã được thêm nhưng kiểm tra không hợp lệ.', type: 'error' });
        }
    };

    const handleDeleteKey = (keyToDelete: string) => {
        const updatedKeys = apiKeys.filter(k => k.key !== keyToDelete);
        setApiKeys(updatedKeys);
        localStorage.setItem('sbgen_api_keys', JSON.stringify(updatedKeys));
    };

    const toggleActiveKey = (keyToToggle: string) => {
        const updatedKeys = apiKeys.map(k => k.key === keyToToggle ? { ...k, isActive: !k.isActive } : k);
        setApiKeys(updatedKeys);
        localStorage.setItem('sbgen_api_keys', JSON.stringify(updatedKeys));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <KeyIcon className="h-6 w-6 text-emerald-400" />
                    Quản lý API Key & Model
                </h3>

                <div className="flex border-b border-slate-700 mb-6 shrink-0">
                    <button
                        onClick={() => setActiveTab('kyma')}
                        className={`pb-2 px-4 text-sm font-bold transition-colors ${activeTab === 'kyma' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}
                    >
                        Kyma
                    </button>
                    <button
                        onClick={() => setActiveTab('gemini')}
                        className={`pb-2 px-4 text-sm font-bold transition-colors ${activeTab === 'gemini' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}
                    >
                        Gemini API
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {activeTab === 'gemini' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Column: API Keys */}
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Cấu hình Gemini API Key</label>
                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="password"
                                            value={newKey}
                                            onChange={(e) => setNewKey(e.target.value)}
                                            placeholder="Nhập API Key mới"
                                            className="flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-md focus:ring-2 focus:ring-emerald-500 text-white text-sm"
                                        />
                                        <button 
                                            onClick={handleAddKey}
                                            disabled={isValidating || !newKey}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md text-sm font-bold disabled:opacity-50 min-w-[80px]"
                                        >
                                            {isValidating ? '...' : 'Thêm'}
                                        </button>
                                    </div>
                                    {geminiCheckMsg && (
                                        <div className={`text-sm mb-4 px-2 py-1 rounded border ${geminiCheckMsg.type === 'success' ? 'bg-emerald-900/30 border-emerald-800 text-emerald-400' : 'bg-red-900/30 border-red-800 text-red-400'}`}>
                                            {geminiCheckMsg.text}
                                        </div>
                                    )}

                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                                        {apiKeys.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Chưa có key nào. Vui lòng thêm key.</p>}
                                        {apiKeys.map((k, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={k.isActive} 
                                                        onChange={() => toggleActiveKey(k.key)}
                                                        className="h-4 w-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-600 bg-slate-700"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-mono text-slate-300 truncate w-24 md:w-32">
                                                            {k.key.substring(0, 8)}...{k.key.substring(k.key.length - 6)}
                                                        </span>
                                                        <span className={`text-[10px] uppercase font-bold ${k.status === 'valid' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {k.status === 'valid' ? 'Hoạt động' : 'Không hợp lệ'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteKey(k.key)} className="text-slate-500 hover:text-red-400 p-1">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-2">
                                    * Hệ thống sẽ tự động sử dụng ngẫu nhiên các key đang hoạt động để tránh giới hạn.
                                    </p>
                                </div>
                            </div>

                            {/* Right Column: Model Selection & Info */}
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="block text-sm font-medium text-slate-300">Chọn Model</label>
                                        {apiKeys.length === 0 && <span className="text-[10px] text-amber-500 font-medium">Cần thêm API Key</span>}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {MODELS.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => setSelectedModel(model.id)}
                                                disabled={apiKeys.length === 0}
                                                className={`w-full p-3 rounded-lg border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${selectedModel === model.id && apiKeys.length > 0 ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 disabled:hover:border-slate-700'}`}
                                            >
                                                <div className="font-bold text-sm">{model.name}</div>
                                                {model.recommended && <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mt-1">Khuyên dùng</div>}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-2">
                                        <p className="text-[11px] text-slate-400">
                                            <strong className="text-emerald-400">Gemini 2.5 Flash:</strong> Nhanh, ổn định, tiết kiệm token. Phù hợp cho hầu hết các kịch bản thông thường. Khuyên dùng.
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                            <strong className="text-blue-400">Gemini 3.1 Pro:</strong> Tư duy phức tạp, phân tích bối cảnh và tạo prompt chi tiết nhất. Khuyên dùng cho kịch bản khó.
                                        </p>
                                        <p className="text-[10px] text-amber-500/80 italic">
                                            * Lưu ý: Các bản Pro có giới hạn Request thấp hơn bản Flash, có thể gặp lỗi 429 nếu dùng liên tục với 1 key.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'kyma' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Cấu hình Kyma API</label>
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="password"
                                        value={tempKyma}
                                        onChange={(e) => setTempKyma(e.target.value)}
                                        placeholder="Nhập API Key của Kyma (sk-...)"
                                        className="flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-md focus:ring-2 focus:ring-emerald-500 text-white text-sm"
                                    />
                                    <button
                                        onClick={handleCheckKymaKey}
                                        disabled={isCheckingKyma || !tempKyma.trim()}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md text-sm font-bold min-w-[120px] disabled:opacity-50"
                                    >
                                        {isCheckingKyma ? 'Đang kiểm tra...' : 'Kiểm tra & Lưu'}
                                    </button>
                                </div>
                                {kymaCheckMsg && (
                                    <div className={`text-sm mb-4 px-2 py-1 rounded border ${kymaCheckMsg.type === 'success' ? 'bg-emerald-900/30 border-emerald-800 text-emerald-400' : 'bg-red-900/30 border-red-800 text-red-400'}`}>
                                        {kymaCheckMsg.text}
                                    </div>
                                )}
                                <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-3">
                                    <h4 className="text-sm font-bold text-emerald-400">Danh sách Model Kyma</h4>
                                    <div className="text-xs text-amber-500/80 mb-2 italic">
                                        💡 Mẹo: <b>deepseek-v4-flash</b> được chọn làm mặc định vì đây là model rẻ nhất mà vẫn xử lý phân cảnh (vốn tiêu tốn lượng lớn input token) một cách cực kỳ thông minh.
                                    </div>
                                    {kymaModels.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2">
                                            {kymaModels.map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => {
                                                        setSelectedKymaModel(model.id);
                                                        localStorage.setItem('sbgen_kyma_model', model.id);
                                                    }}
                                                    className={`w-full p-2.5 rounded-lg border text-left transition-all text-sm ${selectedKymaModel === model.id ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'}`}
                                                >
                                                    <div className="font-bold">{model.name}</div>
                                                    {model.pricing && (
                                                        <div className="text-[10px] opacity-80 mt-1">
                                                            {model.pricing.mode === 'per-token' ? `Giá: $${model.pricing.input} vào / $${model.pricing.output} ra (1M tokens)` :
                                                             model.pricing.mode === 'per-image' ? `Giá: $${model.pricing.per_image_usd} / ảnh` :
                                                             model.pricing.mode === 'per-video' ? `Giá: $${model.pricing.per_video_usd} / video` :
                                                             model.pricing.mode === 'per-call' ? `Giá: $${model.pricing.per_call_usd} / lượt gọi` : ''}
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500">Vui lòng nhập API Key để tải danh sách Model.</p>
                                    )}
                                </div>
                                <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-3">
                                    <h4 className="text-sm font-bold text-emerald-400">Hướng dẫn lấy Kyma API:</h4>
                                    <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2">
                                        <li>Truy cập và đăng nhập vào hệ thống Kyma.</li>
                                        <li>Tạo API Key mới định dạng <code className="bg-slate-800 px-1 rounded text-emerald-300">sk-...</code></li>
                                        <li>
                                            Xem hướng dẫn chi tiết tại:{' '}
                                            <a href="https://docs.kymaapi.com/introduction" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                                https://docs.kymaapi.com/introduction
                                            </a>
                                        </li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 flex justify-end shrink-0">
                    <button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20">
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
};
