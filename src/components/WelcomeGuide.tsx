import React, { FC } from 'react';

export const WelcomeGuide: FC = () => (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm shadow-xl animate-fade-in min-h-[50vh] flex flex-col justify-center">
        <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-lg shadow-lg">👋</span>
            Vui lòng đọc kỹ hướng dẫn và nhập API để bắt đầu
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">1</div>
                <h3 className="font-bold text-slate-200 mb-2">Cấu hình API Key</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                   Bấm nút <strong>API</strong> góc trên bên phải để nhập Key. Bạn có thể nhập <strong>nhiều Key</strong> để hệ thống tự động luân phiên, tránh lỗi 429. Lấy Key tại <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-bold">Google AI Studio</a>.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">2</div>
                <h3 className="font-bold text-slate-200 mb-2">Nhập liệu & Phân tích</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Upload script hoặc dán văn bản. AI sẽ <strong>tự động phân tích</strong> bối cảnh, nhân vật, và thời gian từ nội dung kịch bản để tạo prompt chính xác nhất.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">3</div>
                <h3 className="font-bold text-slate-200 mb-2">Tạo Storyboard Pro</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Nhấn nút tạo. Hệ thống sẽ phân tách script thành các phân cảnh và tạo prompt (hình ảnh/video) chi tiết, nhất quán về phong cách và nhân vật.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">4</div>
                <h3 className="font-bold text-slate-200 mb-2">Xuất kết quả</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Tải file <strong>Excel</strong> chứa toàn bộ prompt để sử dụng cho các công cụ tạo ảnh/video chuyên dụng. Tải file <strong>TXT</strong> để đồng bộ.
                </p>
            </div>

             <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">5</div>
                <h3 className="font-bold text-slate-200 mb-2">Tạo ảnh hàng loạt</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Sử dụng tool <a href="https://github.com/duckmartians/G-Labs-Automation/releases/tag/v1.2.6" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">G-lab-Automation</a> hoặc <a href="https://chromewebstore.google.com/detail/auto-whisk-automator-for/gedfnhdibkfgacmkbjgpfjihacalnlpn" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Auto Whisk Automator</a> với file Excel (bước 4) để tự động tạo ảnh từ prompt.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">6</div>
                <h3 className="font-bold text-slate-200 mb-2">Chuẩn bị tài nguyên</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Gom tất cả vào 1 thư mục: File script (.txt từ bước 4), toàn bộ ảnh đã tạo, và file Audio giọng đọc (từ 11Labs/Minimax/...).
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">7</div>
                <h3 className="font-bold text-slate-200 mb-2">Đồng bộ Audio & Hình ảnh</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Mở tool <strong>AudioScriptImageSync</strong>. Tại ô "Upload All", chọn toàn bộ file trong thư mục bước 6. Nhấn <strong>Analyze & Sync</strong>.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">8</div>
                <h3 className="font-bold text-slate-200 mb-2">Xuất Video</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Sau khi Sync xong, nhấn <strong>Create MP4</strong>. Chờ xử lý rồi nhấn <strong>Download</strong> để tải video hoàn thiện.
                </p>
            </div>
        </div>
    </div>
);
