import React, { FC } from 'react';
import { SavedSession } from '../../types';
import { formatDate } from '../../utils/helpers';
import { XMarkIcon, LibraryIcon, ClockIcon, DownloadIcon, TrashIcon } from '../icons';

export const LibraryModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    sessions: SavedSession[];
    onDelete: (id: string) => void;
    onDownload: (session: SavedSession) => void;
}> = ({ isOpen, onClose, sessions, onDelete, onDownload }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[80vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <LibraryIcon className="h-6 w-6 text-emerald-400" />
                    Thư viện Session
                </h3>
                <p className="text-slate-400 text-sm mb-6">Các phiên làm việc được lưu cục bộ trên trình duyệt.</p>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            <p>Không tìm thấy phiên làm việc nào.</p>
                        </div>
                    ) : (
                        sessions.slice().reverse().map(session => (
                            <div key={session.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between group hover:border-slate-600 transition-colors">
                                <div>
                                    <h4 className="font-bold text-slate-200 text-sm mb-1">{session.name || 'Session không tên'}</h4>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><ClockIcon className="h-3 w-3" /> {formatDate(session.timestamp)}</span>
                                        <span className="bg-slate-800 px-2 py-0.5 rounded text-emerald-400 font-mono">{session.prompts.length} cảnh</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={() => onDownload(session)}
                                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/20 rounded-lg transition-colors"
                                        title="Tải Excel"
                                     >
                                        <DownloadIcon className="h-5 w-5" />
                                    </button>
                                    <button 
                                        onClick={() => onDelete(session.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Xóa"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
