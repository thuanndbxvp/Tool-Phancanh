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
  // KHỐI v4 (2-bước): 2 handler riêng
  onSegment: () => void;
  onGeneratePrompts: () => void;
  isBuilding: boolean;
  isSegmenting: boolean;
  buildProgress: number;
  buildStatus: string;
  scriptFileName: string | null;
  hasPrompts: boolean;
  hasScenes: boolean;
  // KHỐI plan_2: Auto/Manual mode
  sceneCountMode: 'auto' | 'manual';
  setSceneCountMode: (mode: 'auto' | 'manual') => void;
  targetSceneCount: number;
  setTargetSceneCount: (count: number) => void;
  targetSecs: number;
  setTargetSecs: (secs: number) => void;
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
  // KHỐI B (hybrid v2): Audio input
  audioSource: 'srt' | 'txt';
  audioFileName?: string | null;
  audioDuration?: number;
  onAudioUpload?: (duration: number | undefined, name: string | null) => void;
  manualAudioDuration?: number;
  onManualDurationChange?: (val: number | undefined) => void;
}

export const ControlPanel: FC<ControlPanelProps> = ({
    mode, setMode, scenario, setScenario, customStylePrompt, setCustomStylePrompt,
    onScriptUpload, onSegment, onGeneratePrompts, isBuilding, isSegmenting, buildProgress, buildStatus,
    scriptFileName,
    hasPrompts, hasScenes,
    sceneCountMode, setSceneCountMode,
    targetSceneCount, setTargetSceneCount,
    targetSecs, setTargetSecs,
    promptType, setPromptType,
    selectedStyleId, setSelectedStyleId,
    aspectRatio, setAspectRatio,
    enableAspectRatio, setEnableAspectRatio,
    enableCharacterConsistency, setEnableCharacterConsistency,
    selectedModel,
    audioSource, audioFileName, onAudioUpload, audioDuration, manualAudioDuration, onManualDurationChange
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
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border shadow-md flex items-center justify-center gap-2 ${promptType === 'image' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>Prompt Ảnh <span className="font-medium opacity-80 font-normal ml-1">(Nano Banana)</span></span>
                    </button>
                    <button
                        onClick={() => setPromptType('video')}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border shadow-md flex items-center justify-center gap-2 ${promptType === 'video' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>Prompt Video <span className="font-medium opacity-80 font-normal ml-1">(Veo/Sora)</span></span>
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
                {enableAspectRatio && (
                    <div className="flex gap-2 mb-4 animate-fade-in">
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
                )}

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

            {/* KHỐI B v2: 3 nút segmentation cũ đã bị ẩn theo yêu cầu sếp (Early-Cut Strategy) */}

            {/* KHỐI B (hybrid v2): Smart Hybrid - 1 luồng duy nhất, cần audio nếu upload TXT */}
            <div className="mb-4 p-4 bg-slate-900/60 rounded-xl border border-indigo-500/30">
                <label className="block text-sm font-semibold text-slate-200 mb-3">
                    ✂️ Phân cảnh thông minh
                </label>

                {/* KHỐI plan_2: Auto/Manual mode radio + dynamic input */}
                <div className="mb-3 p-3 bg-slate-900 border border-emerald-500/40 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <label className={`flex items-center justify-center gap-1 p-2 rounded-lg cursor-pointer border transition-all text-xs font-semibold ${sceneCountMode === 'auto' ? 'bg-emerald-700 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                            <input
                                type="radio"
                                name="sceneCountMode"
                                checked={sceneCountMode === 'auto'}
                                onChange={() => setSceneCountMode('auto')}
                                className="form-radio h-3 w-3 text-emerald-500 bg-slate-700 border-slate-600 focus:ring-emerald-500"
                            />
                            <span>⏱ Auto</span>
                        </label>
                        <label className={`flex items-center justify-center gap-1 p-2 rounded-lg cursor-pointer border transition-all text-xs font-semibold ${sceneCountMode === 'manual' ? 'bg-emerald-700 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                            <input
                                type="radio"
                                name="sceneCountMode"
                                checked={sceneCountMode === 'manual'}
                                onChange={() => setSceneCountMode('manual')}
                                className="form-radio h-3 w-3 text-emerald-500 bg-slate-700 border-slate-600 focus:ring-emerald-500"
                            />
                            <span>🎯 Manual</span>
                        </label>
                    </div>

                    {sceneCountMode === 'auto' ? (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 uppercase block text-center">
                                Số giây mỗi cảnh
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="60"
                                step="0.5"
                                value={targetSecs}
                                onChange={(e) => setTargetSecs(Math.max(0.5, parseFloat(e.target.value) || 1))}
                                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-center text-white text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <p className="mt-1 text-[10px] text-slate-500 leading-tight text-center">
                                Hệ thống tự tính: <span className="text-emerald-400 font-bold">{(manualAudioDuration ?? audioDuration ?? 0).toFixed(0)}s ÷ {targetSecs}s ≈ {((manualAudioDuration ?? audioDuration ?? 0) > 0 ? Math.round((manualAudioDuration ?? audioDuration ?? 0) / targetSecs) : '?')}</span> cảnh
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 uppercase block text-center">
                                Số lượng cảnh mong muốn
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="500"
                                value={targetSceneCount}
                                onChange={(e) => setTargetSceneCount(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-center text-white text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            {scenario.length > 50 && (
                                <div className="mt-2 text-[10px] text-amber-500/80 leading-tight text-center">
                                    💡 Gợi ý (chuẩn Video 8s): <br/>
                                    <span className="font-bold text-emerald-400 cursor-pointer hover:underline" onClick={() => setTargetSceneCount(optimalSceneCount)}>
                                        ~{optimalSceneCount} cảnh (Bấm để gán)
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Audio source - 2 options: upload file HOẶC nhập duration */}
                {audioSource !== 'srt' && (
                    <div className="mb-3 p-3 bg-slate-800/80 rounded-lg border border-amber-500/30">
                        <label className="block text-xs font-semibold text-amber-400 mb-2">
                            🎵 Audio Voiceover {audioSource === 'txt' && '(bắt buộc với TXT)'}
                        </label>
                        <input
                            type="file"
                            accept="audio/mp3, audio/wav, audio/mpeg"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    const url = URL.createObjectURL(file);
                                    const audio = new Audio(url);
                                    audio.onloadedmetadata = () => {
                                        onAudioUpload?.(audio.duration, file.name);
                                        URL.revokeObjectURL(url);
                                    };
                                } else {
                                    onAudioUpload?.(undefined, null);
                                }
                            }}
                            className="block w-full text-xs text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-amber-400 hover:file:bg-slate-600"
                        />
                        {audioFileName && (
                            <p className="mt-1 text-xs text-emerald-400">Đã tải: {audioFileName}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs text-slate-500">hoặc nhập thời lượng (giây):</span>
                            <input
                                type="number"
                                min="1"
                                max="7200"
                                value={manualAudioDuration ?? ''}
                                placeholder="vd: 120"
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    onManualDurationChange?.(isNaN(val) ? undefined : val);
                                }}
                                className="flex-1 bg-slate-800 border border-slate-700 p-1 rounded text-center text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                            />
                        </div>
                        {audioSource === 'txt' && !audioFileName && !manualAudioDuration && (
                            <p className="mt-2 text-[10px] text-rose-400 leading-tight">
                                ⚠️ Kịch bản TXT cần audio (file hoặc nhập thời lượng) để tính pacing chính xác.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* KHỐI v4: BƯỚC 1 - Phân cảnh (pure timeline, không AI) */}
            <div>
                <button
                    onClick={onSegment}
                    disabled={!canBuild || isSegmenting || isBuilding}
                    className={`relative w-full overflow-hidden py-3 px-4 rounded-md font-semibold transition-all flex items-center justify-center text-white ${hasScenes ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed shadow-lg`}
                >
                    {isSegmenting && (
                        <div
                            className="absolute left-0 top-0 bottom-0 bg-emerald-600/40 transition-all duration-300 ease-out"
                            style={{ width: `${buildProgress}%` }}
                        />
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                        {isSegmenting ? <SpinnerIcon className="animate-spin h-5 w-5" /> : hasScenes ? <ArrowPathIcon className="h-5 w-5" /> : null}
                        {isSegmenting ? `${buildStatus || 'Đang phân cảnh...'} (${formatTime(elapsedSeconds)})` : hasScenes ? 'Phân cảnh lại' : '✂️ Phân cảnh'}
                    </div>
                </button>
                {isSegmenting && buildProgress > 0 && (
                    <div className="mt-2 text-center text-xs text-emerald-400 font-medium animate-pulse">
                        Đang tiến hành... {buildProgress}%
                    </div>
                )}
            </div>

            {/* KHỐI v4: BƯỚC 2 - Tạo prompt hàng loạt (AI bắt buộc) */}
            {hasScenes && (
                <div>
                    <button
                        onClick={onGeneratePrompts}
                        disabled={!hasScenes || isBuilding || isSegmenting}
                        className={`relative w-full overflow-hidden py-3 px-4 rounded-md font-semibold transition-all flex items-center justify-center text-white ${hasPrompts ? 'bg-purple-600 hover:bg-purple-500' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:bg-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed shadow-lg`}
                    >
                        {isBuilding && (
                            <div
                                className="absolute left-0 top-0 bottom-0 bg-emerald-600/40 transition-all duration-300 ease-out"
                                style={{ width: `${buildProgress}%` }}
                            />
                        )}
                        <div className="relative z-10 flex items-center gap-2">
                            {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5" /> : hasPrompts ? <ArrowPathIcon className="h-5 w-5" /> : null}
                            {isBuilding ? `${buildStatus || 'AI đang sinh prompt...'} (${formatTime(elapsedSeconds)})` : hasPrompts ? 'Tạo lại prompt' : '🤖 Tạo prompt hàng loạt'}
                        </div>
                    </button>
                    {isBuilding && buildProgress > 0 && (
                        <div className="mt-2 text-center text-xs text-emerald-400 font-medium animate-pulse">
                            Đang tiến hành... {buildProgress}%
                        </div>
                    )}
                </div>
            )}
          </div>
      </div>
    </div>
  );
};
