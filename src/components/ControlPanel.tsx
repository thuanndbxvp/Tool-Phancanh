import React, { FC, useRef, useMemo, useState, useEffect } from 'react';
import { AppMode, PromptType, AspectRatio } from '../types';
import { PRESET_STYLES } from '../utils/constants';
import { calculateOptimalSceneCount } from '../utils/helpers';
import { ChevronDownIcon, ChevronUpIcon, DocumentIcon, PhotoIcon, VideoCameraIcon, SpinnerIcon, ArrowPathIcon, InformationCircleIcon } from './icons';

interface ControlPanelProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  scenario: string;
  setScenario: (value: string) => void;
  customStylePrompt: string;
  setCustomStylePrompt: (value: string) => void;
  onScriptUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBuildPrompts: () => void;
  isBuilding: boolean;
  buildProgress: number;
  buildStatus: string;
  scriptFileName: string | null;
  segmentationMode: 'ai' | 'punctuation' | 'fixed';
  setSegmentationMode: (mode: 'ai' | 'punctuation' | 'fixed') => void;
  hasPrompts: boolean;
  targetSceneCount: number;
  setTargetSceneCount: (count: number) => void;
  promptType: PromptType;
  setPromptType: (type: PromptType) => void;
  selectedStyleId: string;
  setSelectedStyleId: (id: string) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  enableAspectRatio: boolean;
  setEnableAspectRatio: (enable: boolean) => void;
  enableCharacterConsistency: boolean;
  setEnableCharacterConsistency: (enable: boolean) => void;
  selectedModel: string;
}

export const ControlPanel: FC<ControlPanelProps> = ({ 
    mode, setMode, scenario, setScenario, customStylePrompt, setCustomStylePrompt,
    onScriptUpload, onBuildPrompts, isBuilding, buildProgress, buildStatus,
    scriptFileName, 
    segmentationMode, setSegmentationMode, hasPrompts,
    targetSceneCount, setTargetSceneCount,
    promptType, setPromptType,
    selectedStyleId, setSelectedStyleId,
    aspectRatio, setAspectRatio,
    enableAspectRatio, setEnableAspectRatio,
    enableCharacterConsistency, setEnableCharacterConsistency,
    selectedModel
}) => {
  const scriptFileRef = useRef<HTMLInputElement>(null);
  const [isCustomStyleExpanded, setIsCustomStyleExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (isBuilding) {
          interval = setInterval(() => {
              setElapsedSeconds(prev => prev + 1);
          }, 1000);
      } else {
          setElapsedSeconds(0);
      }
      return () => clearInterval(interval);
  }, [isBuilding]);

  const formatTime = (totalSeconds: number) => {
      const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const s = (totalSeconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
  };
  
  const optimalSceneCount = useMemo(() => calculateOptimalSceneCount(scenario), [scenario]);
  const scriptReady = useMemo(() => scenario.trim() !== "" || scriptFileName !== null, [scenario, scriptFileName]);

  const canBuild = useMemo(() => {
      return scriptReady;
  }, [scriptReady]);

  return (
    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl sticky top-6 shadow-2xl backdrop-blur-md">
      
      <h2 className="text-xl font-bold text-emerald-400 mb-6">1. Cấu hình</h2>
      
      <div className="flex flex-col gap-6">
          {/* COLUMN 1: Inputs */}
          <div className="flex flex-col gap-6">
            
            {/* Style Selector */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎭 Chọn Phong Cách Image/Video</label>
                <div className="relative">
                    <select
                        value={selectedStyleId}
                        onChange={(e) => setSelectedStyleId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 appearance-none cursor-pointer"
                    >
                        <option value="reference">📸 Nhập phong cách thủ công (Mặc định)</option>
                        {PRESET_STYLES.map(style => (
                            <option key={style.id} value={style.id}>
                                {style.label}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                        <ChevronDownIcon className="h-4 w-4" />
                    </div>
                </div>
                {selectedStyleId !== 'reference' && (
                     <p className="text-xs text-slate-500 mt-2 italic">
                        * Khi chọn phong cách có sẵn, công cụ sẽ bỏ qua phong cách tự nhập.
                    </p>
                )}
            </div>

            {/* Custom Style Prompt (Visible ONLY if style is 'reference') */}
            {selectedStyleId === 'reference' && (
                <div className="space-y-2 animate-fade-in">
                    <div className="border border-slate-700 rounded-xl overflow-hidden">
                        <button 
                        onClick={() => setIsCustomStyleExpanded(!isCustomStyleExpanded)}
                        className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                        <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            📸 Nhập mô tả phong cách
                        </span>
                        {isCustomStyleExpanded ? (
                            <ChevronUpIcon className="h-4 w-4 text-slate-400" /> 
                        ) : (
                            <ChevronDownIcon className="h-4 w-4 text-slate-400" />
                        )}
                    </button>
                    
                    {isCustomStyleExpanded && (
                        <div className="p-4 bg-slate-900/30 border-t border-slate-700 animate-fade-in">
                            <textarea
                                value={customStylePrompt}
                                onChange={(e) => setCustomStylePrompt(e.target.value)}
                                placeholder="Ví dụ: Phong cách hoạt hình Ghibli, ánh sáng hoàng hôn, màu sắc ấm áp..."
                                rows={3}
                                className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner text-white text-sm"
                            ></textarea>
                            <p className="text-xs text-amber-300 mt-3 font-semibold bg-amber-900/30 p-2.5 rounded-lg border border-amber-500/30 shadow-sm flex items-center gap-2">
                                <InformationCircleIcon className="h-4 w-4 flex-shrink-0" />
                                AI sẽ dùng mô tả này để tạo prompt ảnh thống nhất.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* Script Upload */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">📄 Tải lên Kịch bản (.txt, .srt)</label>
                <div 
                    onClick={() => scriptFileRef.current?.click()}
                    className="flex items-center gap-3 bg-slate-800 border border-slate-700 hover:border-emerald-500 p-3 rounded-md cursor-pointer transition-colors group"
                >
                    <DocumentIcon className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span className="text-sm text-slate-300 truncate">{scriptFileName || 'Chọn file kịch bản...'}</span>
                </div>
                <input ref={scriptFileRef} type="file" accept=".txt,.srt" onChange={onScriptUpload} className="hidden" />
            </div>

          </div>

          {/* COLUMN 2: Actions */}
          <div className="flex flex-col gap-6">

            {/* Prompt Type & Aspect Ratio Selector */}
             <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎨 Loại Output (Chỉ tạo Prompt) & Tỷ lệ</label>
                <div className="flex gap-3 mb-3">
                    <button
                        onClick={() => setPromptType('image')}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 text-center ${promptType === 'image' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <PhotoIcon className="h-5 w-5 mb-1" />
                        <span>Prompt Ảnh<br/><span className="text-[10px] font-medium opacity-80">(Nano Banana)</span></span>
                    </button>
                    <button
                        onClick={() => setPromptType('video')}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 text-center ${promptType === 'video' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <VideoCameraIcon className="h-5 w-5 mb-1" />
                        <span>Prompt Video<br/><span className="text-[10px] font-medium opacity-80">(Veo/Sora)</span></span>
                    </button>
                </div>
                
                {/* Aspect Ratio Buttons */}
                <div className="flex items-center gap-2 mb-2">
                    <input 
                        type="checkbox" 
                        id="enableAspectRatio" 
                        checked={enableAspectRatio}
                        onChange={(e) => setEnableAspectRatio(e.target.checked)}
                        className="w-4 h-4 text-emerald-500 bg-slate-800 border-slate-600 rounded focus:ring-emerald-500 focus:ring-2"
                    />
                    <label htmlFor="enableAspectRatio" className="text-sm font-medium text-slate-300 cursor-pointer">
                        Chỉ định khuôn hình trong prompt output
                    </label>
                </div>
                <div className={`flex gap-2 transition-opacity duration-300 mb-4 ${enableAspectRatio ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <button
                        onClick={() => setAspectRatio('16:9')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${aspectRatio === '16:9' ? 'bg-slate-700 border-emerald-500 text-emerald-400 shadow-sm' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                    >
                        16:9 (Ngang)
                    </button>
                     <button
                        onClick={() => setAspectRatio('9:16')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${aspectRatio === '9:16' ? 'bg-slate-700 border-emerald-500 text-emerald-400 shadow-sm' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                    >
                        9:16 (Dọc)
                    </button>
                     <button
                        onClick={() => setAspectRatio('1:1')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${aspectRatio === '1:1' ? 'bg-slate-700 border-emerald-500 text-emerald-400 shadow-sm' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                    >
                        1:1 (Vuông)
                    </button>
                </div>

                <div className="flex flex-col mb-2">
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="enableCharacterConsistency" 
                            checked={enableCharacterConsistency}
                            onChange={(e) => setEnableCharacterConsistency(e.target.checked)}
                            className="w-4 h-4 text-emerald-500 bg-slate-800 border-slate-600 rounded focus:ring-emerald-500 focus:ring-2"
                        />
                        <label htmlFor="enableCharacterConsistency" className="text-sm font-medium text-slate-300 cursor-pointer">
                            Đồng nhất mô tả nhân vật trong prompt
                        </label>
                    </div>
                    {enableCharacterConsistency && (
                        <p className="text-[11px] text-amber-500/80 ml-6 mt-1.5 leading-tight italic">
                            ⚠️ Lưu ý: Tính năng này làm quá trình xử lý chậm hơn và tốn nhiều token AI hơn.
                        </p>
                    )}
                </div>
            </div>

            {/* Segmentation Options & Generate Button Group */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">✂️ Phương pháp phân cảnh (Pre-segmentation)</label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <button
                        onClick={() => setSegmentationMode('ai')}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 text-center ${segmentationMode === 'ai' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>🤖 AI</span>
                        <span className="font-medium opacity-70 text-[9px] leading-tight">Ngữ nghĩa</span>
                    </button>
                    <button
                        onClick={() => setSegmentationMode('fixed')}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 text-center ${segmentationMode === 'fixed' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>🔢 Chia đều</span>
                        <span className="font-medium opacity-70 text-[9px] leading-tight">Bằng nhau</span>
                    </button>
                    <button
                        onClick={() => setSegmentationMode('punctuation')}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 text-center ${segmentationMode === 'punctuation' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>📝 Dấu câu</span>
                        <span className="font-medium opacity-70 text-[9px] leading-tight">Logic câu</span>
                    </button>

                     <div className={`col-span-3 p-2 rounded-xl border flex flex-col justify-center items-center transition-all duration-300 ${(segmentationMode === 'fixed' || segmentationMode === 'ai') ? 'bg-slate-900 border-emerald-500/50 opacity-100' : 'bg-slate-900/50 border-slate-800 opacity-40 pointer-events-none'}`}>
                        <label className="text-[10px] font-bold text-slate-400 mb-1 uppercase text-center">Số lượng cảnh</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="500"
                            value={targetSceneCount}
                            onChange={(e) => setTargetSceneCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-center text-white text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            disabled={segmentationMode !== 'fixed' && segmentationMode !== 'ai'}
                        />
                        {scenario.length > 50 && (segmentationMode === 'fixed' || segmentationMode === 'ai') && (
                            <div className="mt-2 text-[10px] text-amber-500/80 leading-tight text-center">
                                💡 Gợi ý (chuẩn Video 8s): <br/>
                                <span className="font-bold text-emerald-400 cursor-pointer hover:underline" onClick={() => setTargetSceneCount(optimalSceneCount)}>
                                    ~{optimalSceneCount} cảnh (Bấm để gán)
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={onBuildPrompts}
                    disabled={!canBuild || isBuilding}
                    className={`relative w-full overflow-hidden py-3 px-4 rounded-md font-semibold transition-all flex items-center justify-center text-white ${hasPrompts ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed shadow-lg`}
                >
                    {isBuilding && (
                        <div 
                            className="absolute left-0 top-0 bottom-0 bg-emerald-600/40 transition-all duration-300 ease-out" 
                            style={{ width: `${buildProgress}%` }}
                        />
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                        {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5" /> : hasPrompts ? <ArrowPathIcon className="h-5 w-5" /> : null}
                        {isBuilding ? `${buildStatus || 'AI đang phân tích...'} (${formatTime(elapsedSeconds)})` : hasPrompts ? 'Tạo lại Storyboard Pro' : 'Tạo Storyboard Pro'}
                    </div>
                </button>
                {isBuilding && buildProgress > 0 && (
                    <div className="mt-2 text-center text-xs text-emerald-400 font-medium animate-pulse">
                        Đang tiến hành... {buildProgress}%
                    </div>
                )}
            </div>
          </div>
      </div>
    </div>
  );
};
