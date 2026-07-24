import React, { FC } from 'react';
import { ToastMessage } from '../types';
import { CheckCircleIcon, WarningIcon, InformationCircleIcon, XMarkIcon } from './icons';

export const ToastItem: FC<{ toast: ToastMessage; onClose: (id: string) => void }> = ({ toast, onClose }) => {
    const bgClass = toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500' 
                  : toast.type === 'error' ? 'bg-red-900/90 border-red-500' 
                  : 'bg-indigo-900/90 border-indigo-500';
    const iconColor = toast.type === 'success' ? 'text-emerald-400' 
                    : toast.type === 'error' ? 'text-red-400' 
                    : 'text-indigo-400';
                    
    return (
        <div className={`${bgClass} border-l-4 p-4 rounded-r shadow-2xl mb-3 flex items-start gap-3 min-w-[320px] max-w-md animate-fade-in relative backdrop-blur-md transition-all duration-300 transform hover:translate-x-1`}>
            <div className={`mt-0.5 ${iconColor}`}>
                {toast.type === 'success' && <CheckCircleIcon className="h-6 w-6" />}
                {toast.type === 'error' && <WarningIcon className="h-6 w-6" />} 
                {toast.type === 'info' && <InformationCircleIcon className="h-6 w-6" />}
            </div>
            <div className="flex-1">
                <h4 className={`text-sm font-bold ${iconColor} mb-1 uppercase tracking-wider`}>{toast.title}</h4>
                <p className="text-xs text-slate-100 leading-relaxed font-medium">{toast.message}</p>
            </div>
            <button onClick={() => onClose(toast.id)} className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                <XMarkIcon className="h-4 w-4" />
            </button>
        </div>
    );
};

export const ToastContainer: FC<{ toasts: ToastMessage[]; onClose: (id: string) => void }> = ({ toasts, onClose }) => {
    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onClose={onClose} />
                ))}
            </div>
        </div>
    );
};
