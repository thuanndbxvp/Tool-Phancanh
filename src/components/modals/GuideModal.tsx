import React, { FC } from 'react';
import { XMarkIcon, BookOpenIcon } from '../icons';

export const GuideModal: FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <BookOpenIcon className="h-6 w-6 text-emerald-400" />
                    Hướng dẫn sử dụng
                </h3>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Step 1 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">1</div>
                            <h3 className="font-bold text-slate-200 mb-2">Cấu hình API Key & Model</h3>
                            <p className="text-xs text-slate-400 leading-relaxed mb-3">
                            Bấm nút <strong>API</strong> góc trên bên phải để nhập Key. Bạn có thể sử dụng <strong>Kyma API</strong> (khuyên dùng) hoặc <strong>Gemini API</strong>. Lấy Kyma Key tại: <a href="https://kymaapi.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-bold">KymaAPI.com</a>.
                            </p>
                            <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded border border-slate-800 space-y-1">
                                <p><strong className="text-emerald-400">Gemini 2.5 Flash:</strong> Ổn định, kết quả nhất quán.</p>
                                <p><strong className="text-blue-400">Gemini Flash Latest:</strong> Luôn cập nhật bản mới nhất, thông minh hơn.</p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">2</div>
                            <h3 className="font-bold text-slate-200 mb-2">Nhập liệu & Phân tích</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Upload script hoặc dán văn bản. AI sẽ <strong>tự động phân tích</strong> bối cảnh, nhân vật từ nội dung để tạo prompt.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">3</div>
                            <h3 className="font-bold text-slate-200 mb-2">Tạo Storyboard Pro</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Nhấn nút tạo. AI sẽ phân tách script thành các phân cảnh và tạo prompt chi tiết.
                            </p>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">4</div>
                            <h3 className="font-bold text-slate-200 mb-2">Xuất kết quả</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Tải file <strong>Excel</strong> chứa toàn bộ prompt. Tải file <strong>TXT</strong> để đồng bộ.
                            </p>
                        </div>

                        {/* Step 5 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">5</div>
                            <h3 className="font-bold text-slate-200 mb-2">Tạo ảnh hàng loạt</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Sử dụng tool <a href="https://github.com/duckmartians/G-Labs-Automation/releases/tag/v1.2.6" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">G-lab-Automation</a> hoặc <a href="https://chromewebstore.google.com/detail/auto-whisk-automator-for/gedfnhdibkfgacmkbjgpfjihacalnlpn" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Auto Whisk Automator</a> với file Excel (bước 4) để tự động tạo ảnh từ prompt. <br/>Hoặc các bạn có thể sử dụng bất kỳ tool tạo ảnh nào đang dùng.
                            </p>
                        </div>

                        {/* Step 6 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">6</div>
                            <h3 className="font-bold text-slate-200 mb-2">Chuẩn bị tài nguyên</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Gom tất cả vào 1 thư mục: File script (.txt từ bước 4), toàn bộ ảnh đã tạo, và file Audio giọng đọc (từ 11Labs/Minimax/...).
                            </p>
                        </div>

                        {/* Step 7 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">7</div>
                            <h3 className="font-bold text-slate-200 mb-2">Đồng bộ Audio & Hình ảnh</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Mở tool <strong>AudioScriptImageSync</strong>. Tại ô "Upload All", chọn toàn bộ file trong thư mục bước 6. Nhấn <strong>Analyze & Sync</strong>.
                            </p>
                        </div>

                        {/* Step 8 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">8</div>
                            <h3 className="font-bold text-slate-200 mb-2">Xuất Video</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Sau khi Sync xong, nhấn <strong>Create MP4</strong>. Chờ xử lý rồi nhấn <strong>Download</strong> để tải video hoàn thiện.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
