import React, { useState, useEffect, useMemo, FC } from 'react';
import { AppMode, PromptType, AspectRatio, ApiKeyData, SavedSession, ScenePrompt, ToastMessage, ToastType } from './types';
import { exportToExcel, getTimestamp, formatDate, inferSrtDurationSecs } from './utils/helpers';
import { PRESET_STYLES, MODELS } from './utils/constants';
import { ToastContainer } from './components/Toast';
import { WelcomeGuide } from './components/WelcomeGuide';
import { ControlPanel } from './components/ControlPanel';
import { ApiSettingsModal } from './components/modals/ApiSettingsModal';
import { LibraryModal } from './components/modals/LibraryModal';
import { GuideModal } from './components/modals/GuideModal';
import { BookOpenIcon, LibraryIcon, KeyIcon, SparklesIcon, TextDocumentIcon, DownloadIcon } from './components/icons';
import { splitScriptToScenes, generatePromptsForScenes } from './services/geminiService';
import { calcTargetSceneCount } from './utils/textSegmentation';

const App: FC = () => {
  // State
  const [mode, setMode] = useState<AppMode>('general');
  const [scenario, setScenario] = useState<string>('');
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [customStylePrompt, setCustomStylePrompt] = useState<string>('');
  const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
  // KHỐI v4 (2-bước): Kết quả bước 1 - chỉ có scriptLine, chưa có prompt
  const [scenes, setScenes] = useState<string[]>([]);
  const [isSegmenting, setIsSegmenting] = useState<boolean>(false);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [buildProgress, setBuildProgress] = useState<number>(0);
  const [buildStatus, setBuildStatus] = useState<string>('');
  const [targetSceneCount, setTargetSceneCount] = useState<number>(10);
  const [promptType, setPromptType] = useState<PromptType>('image');
  // KHỐI B (hybrid v2): Audio source state - thay thế useHybridMode cũ
  const [audioSource, setAudioSource] = useState<'srt' | 'txt'>('txt');
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [manualAudioDuration, setManualAudioDuration] = useState<number | undefined>(undefined);
  // KHỐI plan_2: Auto/Manual mode cho phân cảnh
  //   auto   → user nhập số GIÂY mỗi cảnh (vd 8s), tự tính scenes = totalDuration / secs
  //   manual → user nhập SỐ CẢNH (vd 100), chia đều duration / 100
  const [sceneCountMode, setSceneCountMode] = useState<'auto' | 'manual'>('manual');
  const [targetSecs, setTargetSecs] = useState<number>(8);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [enableAspectRatio, setEnableAspectRatio] = useState<boolean>(false);
  const [enableCharacterConsistency, setEnableCharacterConsistency] = useState<boolean>(false);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('reference');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // API & Settings State
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [kymaKey, setKymaKey] = useState<string>('');
  const [kymaModels, setKymaModels] = useState<{id: string, name: string, pricing?: any}[]>([]);
  const [selectedKymaModel, setSelectedKymaModel] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [showApiModal, setShowApiModal] = useState(false);
  
  // Library State
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    if (kymaKey) {
        fetch('https://kymaapi.com/v1/models', {
            headers: { 'Authorization': `Bearer ${kymaKey}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.data && Array.isArray(data.data)) {
                const models = data.data.map((m: any) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing }));
                setKymaModels(models);
                
                const savedKymaModel = localStorage.getItem('sbgen_kyma_model');
                if (savedKymaModel && models.some((m: any) => m.id === savedKymaModel)) {
                    setSelectedKymaModel(savedKymaModel);
                } else if (models.some((m: any) => m.id === 'deepseek-v4-flash')) {
                    setSelectedKymaModel('deepseek-v4-flash');
                } else if (models.length > 0) {
                    setSelectedKymaModel(models[0].id);
                }
            }
        })
        .catch(err => console.error("Failed to fetch Kyma models", err));
    } else {
        setKymaModels([]);
        setSelectedKymaModel('');
    }
  }, [kymaKey]);

  useEffect(() => {
    const saved = localStorage.getItem('sbgen_sessions');
    if (saved) {
        try {
            setSavedSessions(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load sessions", e);
        }
    }
  }, []);

  useEffect(() => {
    const oldKey = localStorage.getItem('sbgen_api_key');
    const storedKeysStr = localStorage.getItem('sbgen_api_keys');
    const savedKyma = localStorage.getItem('sbgen_kyma_key');
    
    let keys: ApiKeyData[] = [];
    if (storedKeysStr) {
        try {
            keys = JSON.parse(storedKeysStr);
        } catch (e) { console.error(e); }
    } else if (oldKey) {
        keys = [{ key: oldKey, isActive: true, status: 'unknown' }];
        localStorage.setItem('sbgen_api_keys', JSON.stringify(keys));
    }
    setApiKeys(keys);

    if (savedKyma) {
        setKymaKey(savedKyma);
    }
  }, []);

  const saveSession = (newPrompts: ScenePrompt[], scriptName: string) => {
      const newSession: SavedSession = {
          id: Date.now().toString(),
          name: scriptName || `Untitled ${new Date().toLocaleTimeString()}`,
          timestamp: Date.now(),
          prompts: newPrompts
      };
      const updatedSessions = [...savedSessions, newSession];
      setSavedSessions(updatedSessions);
      localStorage.setItem('sbgen_sessions', JSON.stringify(updatedSessions));
  };

  const handleDeleteSession = (id: string) => {
      const updated = savedSessions.filter(s => s.id !== id);
      setSavedSessions(updated);
      localStorage.setItem('sbgen_sessions', JSON.stringify(updated));
      addToast('info', 'Đã xóa', 'Đã xóa phiên làm việc khỏi thư viện.');
  };

  const handleDownloadSession = (session: SavedSession) => {
      exportToExcel(session.prompts, `storyboard_${session.name.replace(/\s+/g, '_')}`);
      const txtContent = session.prompts.map(p => `${p.scriptLine}`).join('\n');
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `script_${session.name.replace(/\s+/g, '_')}_${session.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const addToast = (type: ToastType, title: string, message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          // KHỐI B (hybrid v2): Auto-detect SRT vs TXT
          const isSrt = content.includes('-->') && (content.includes(',000') || content.includes('.000') || content.includes('\n1\n'));
          setAudioSource(isSrt ? 'srt' : 'txt');
          setScriptFileName(file.name);
          setScenario(content);
          addToast('success', 'Đã tải kịch bản', `${file.name} (${isSrt ? 'SRT' : 'TXT'})`);
      };
      reader.readAsText(file);
  };

  // ========== KHỐI v4 (2-bước): BƯỚC 1 - PHÂN CẢNH ==========
  // Auto / Manual đều chạy pure timeline segmentation, KHÔNG cần AI.
  // Chỉ khi user tick "Chia với AI" (Manual mode) mới gọi AI enhance.
  const handleSegment = async () => {
      if (!scenario) {
          addToast('error', 'Chưa có kịch bản', 'Vui lòng tải lên file kịch bản (.txt, .srt).');
          return;
      }
      // KHỐI B (hybrid v2): Validate gate - TXT cần audio hoặc manual duration
      // SRT tự có timestamp → không cần audio
      if (audioSource === 'txt' && !audioFileName && !audioDuration && !manualAudioDuration) {
          addToast('error', 'Thiếu Audio', 'Kịch bản TXT cần upload file audio hoặc nhập thời lượng voiceover để tính pacing.');
          return;
      }

      // Tính effectiveAudioDuration: ưu tiên manual > audio file > SRT fallback (tính từ timestamp cuối)
      const srtInferredDuration = (audioSource === 'srt' || scenario.includes('-->'))
          ? inferSrtDurationSecs(scenario)
          : undefined;
      const effectiveAudioDuration = manualAudioDuration ?? audioDuration ?? srtInferredDuration;

      // Tính scene count theo mode
      let effectiveSceneCount = targetSceneCount;
      if (sceneCountMode === 'auto' && effectiveAudioDuration && effectiveAudioDuration > 0 && targetSecs > 0) {
          effectiveSceneCount = calcTargetSceneCount(effectiveAudioDuration, targetSecs);
          const source = manualAudioDuration ? 'manual' : audioDuration ? 'audio file' : 'SRT timestamp';
          addToast('info', 'Auto mode', `Tự tính: ${effectiveAudioDuration.toFixed(1)}s / ${targetSecs}s ≈ ${effectiveSceneCount} cảnh (từ ${source}).`);
      } else if (sceneCountMode === 'auto') {
          addToast('error', 'Auto mode thiếu data', 'Cần thời lượng để tính số cảnh. Upload audio, nhập duration, hoặc upload file SRT có timestamp hợp lệ (00:00:00,000 --> 00:XX:XX,XXX).');
          return;
      }

      setIsSegmenting(true);
      setBuildProgress(0);
      setBuildStatus('Đang phân cảnh...');
      setScenes([]);
      setPrompts([]);

      try {
          const activeKeys = apiKeys.filter(k => k.isActive);
          const effectiveKey = activeKeys.map(k => k.key).join(',');

          const sceneLines = await splitScriptToScenes(
              scenario,
              effectiveSceneCount,
              effectiveAudioDuration,
              effectiveKey,
              kymaKey,
              selectedKymaModel || 'deepseek-v4-flash'
          );

          setScenes(sceneLines);
          addToast('success', 'Đã phân cảnh', `Chia thành ${sceneLines.length} cảnh. Bấm "Tạo prompt hàng loạt" để sinh prompt.`);
      } catch (error: any) {
          addToast('error', 'Lỗi phân cảnh', error.message);
      } finally {
          setIsSegmenting(false);
      }
  };

  // ========== KHỐI v4 (2-bước): BƯỚC 2 - TẠO PROMPT HÀNG LOẠT ==========
  // AI bắt buộc ở bước này. Input là scenes[] từ bước 1.
  const handleGeneratePrompts = async () => {
      if (scenes.length === 0) {
          addToast('error', 'Chưa có cảnh', 'Vui lòng bấm "Phân cảnh" trước.');
          return;
      }
      const activeKeys = apiKeys.filter(k => k.isActive);
      const effectiveKey = activeKeys.map(k => k.key).join(',');

      if (!effectiveKey && !kymaKey) {
          addToast('error', 'Chưa cấu hình API Key', 'Cần API key để sinh prompt. Vui lòng nhấn nút API góc trên bên phải.');
          setIsBuilding(false);
          return;
      }

      setIsBuilding(true);
      setBuildProgress(0);
      setBuildStatus('Đang khởi tạo prompt...');
      setPrompts([]);
      try {
          let activeStylePrompt = "";
          if (selectedStyleId === 'reference') {
              activeStylePrompt = customStylePrompt.trim() !== ""
                  ? "Visual Style: " + customStylePrompt.trim()
                  : "Visual Style: Neutral, realistic, high quality. Visualize the scene based strictly on the script content.";
          } else {
              const selectedStyleObj = PRESET_STYLES.find(s => s.id === selectedStyleId);
              activeStylePrompt = selectedStyleObj ? selectedStyleObj.prompt : "";
          }

          const expectedProvider = kymaKey ? 'Kyma' : 'Gemini';
          const expectedModel = kymaKey ? selectedKymaModel || 'deepseek-v4-flash' : selectedModel;
          addToast('info', 'Đang sinh prompt...', `Sử dụng ${expectedProvider} (${expectedModel}).`);

          const stream = generatePromptsForScenes(
              scenes,
              [],  // referenceImages - chưa dùng
              effectiveKey,
              activeStylePrompt,
              mode,
              selectedModel,
              promptType,
              aspectRatio,
              enableAspectRatio,
              enableCharacterConsistency,
              scenario,  // scriptContext cho character dict
              kymaKey,
              selectedKymaModel || 'deepseek-v4-flash'
          );

          let finalResults: { scenes: any[], provider: string, model: string, totalCount: number } | null = null;
          for await (const evt of stream) {
              if (evt.type === 'progress' && evt.scenes) {
                  setBuildProgress(evt.progress!);
                  setBuildStatus(evt.status!);
                  const incrementalPrompts = evt.scenes.map((item: any, index: number) => ({
                      id: `scene-${index}`,
                      imagePrompt: item.imagePrompt,
                      videoPrompt: item.videoPrompt,
                      scriptLine: item.scriptLine
                  }));
                  setPrompts(incrementalPrompts);
              } else if (evt.type === 'final' && evt.scenes) {
                  finalResults = {
                      scenes: evt.scenes,
                      provider: evt.provider!,
                      model: evt.model!,
                      totalCount: evt.totalCount!,
                  };
              }
          }

          if (!finalResults) throw new Error("Streaming bị ngắt không rõ lý do.");

          const newPrompts = finalResults.scenes.map((item: any, index: number) => ({
              id: `scene-${index}`,
              imagePrompt: item.imagePrompt,
              videoPrompt: item.videoPrompt,
              scriptLine: item.scriptLine
          }));

          setPrompts(newPrompts);
          saveSession(newPrompts, scriptFileName || "Manual Scenario");

          addToast('success', 'Thành công', `Đã tạo ${newPrompts.length}/${finalResults.totalCount} cảnh bằng ${finalResults.provider} (${finalResults.model}).`);
      } catch (error: any) {
          addToast('error', 'Lỗi tạo prompt', error.message);
      } finally {
          setIsBuilding(false);
      }
  };
  
  const handleDownloadExcel = () => {
      exportToExcel(prompts);
  };

  const handleDownloadTxt = () => {
      if (prompts.length === 0) return;
      const txtContent = prompts.map(p => p.scriptLine).join('\n');
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `script_${getTimestamp()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  // KHỐI v4.1: View chung cho cả scenes (sau bước 1) và prompts (sau bước 2)
  // - Sau bước 1: scenes[] có data, prompts[] rỗng → hiển thị scene card với prompt rỗng
  // - Sau bước 2: prompts[] có data → dùng prompts làm nguồn chính
  // Phân biệt qua hasPrompts để đổi header + ẩn button xuất file.
  const displayItems: ScenePrompt[] = prompts.length > 0
      ? prompts
      : scenes.map((line, idx) => ({
          id: `scene-${idx}`,
          scriptLine: line,
          imagePrompt: '',
          videoPrompt: '',
      }));

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30 flex flex-col overflow-hidden">
        <ToastContainer toasts={toasts} onClose={removeToast} />

        <ApiSettingsModal
            isOpen={showApiModal} 
            onClose={() => setShowApiModal(false)}
            apiKeys={apiKeys}
            setApiKeys={setApiKeys}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            kymaKey={kymaKey}
            setKymaKey={setKymaKey}
            kymaModels={kymaModels}
            selectedKymaModel={selectedKymaModel}
            setSelectedKymaModel={setSelectedKymaModel}
        />
        
        <LibraryModal 
            isOpen={showLibraryModal}
            onClose={() => setShowLibraryModal(false)}
            sessions={savedSessions}
            onDelete={handleDeleteSession}
            onDownload={handleDownloadSession}
        />

        <GuideModal 
            isOpen={showGuideModal}
            onClose={() => setShowGuideModal(false)}
        />

        <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div 
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
                    onClick={() => window.location.reload()}
                    title="Làm mới ứng dụng"
                >
                    <div className="w-8 h-8 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xl shadow-lg shadow-emerald-500/20">S</div>
                    <h1 className="font-bold text-lg tracking-tight text-white">Storyboard<span className="text-emerald-400">Gen</span> AI</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowGuideModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium border border-slate-700"
                    >
                        <BookOpenIcon className="h-4 w-4" />
                        Hướng dẫn
                    </button>
                    <button 
                        onClick={() => setShowLibraryModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium border border-slate-700"
                    >
                        <LibraryIcon className="h-4 w-4" />
                        Thư viện
                    </button>
                    <button 
                        onClick={() => setShowApiModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-colors text-sm font-bold border border-emerald-500/30"
                    >
                        <KeyIcon className="h-4 w-4" />
                        API
                    </button>
                </div>
            </div>
        </header>

        <main className="flex-1 min-h-0 max-w-7xl mx-auto px-6 py-8 w-full overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                <div className="lg:col-span-4 space-y-6 lg:overflow-y-auto lg:pr-2 lg:-mr-2 pb-4">
                    <ControlPanel 
                        mode={mode}
                        setMode={setMode}
                        scenario={scenario}
                        setScenario={setScenario}
                        customStylePrompt={customStylePrompt}
                        setCustomStylePrompt={setCustomStylePrompt}
                        onScriptUpload={handleScriptUpload}
                        onSegment={handleSegment}
                        onGeneratePrompts={handleGeneratePrompts}
                        isBuilding={isBuilding}
                        isSegmenting={isSegmenting}
                        buildProgress={buildProgress}
                        buildStatus={buildStatus}
                        scriptFileName={scriptFileName}
                        hasPrompts={prompts.length > 0}
                        hasScenes={scenes.length > 0}
                        sceneCountMode={sceneCountMode}
                        setSceneCountMode={setSceneCountMode}
                        targetSceneCount={targetSceneCount}
                        setTargetSceneCount={setTargetSceneCount}
                        targetSecs={targetSecs}
                        setTargetSecs={setTargetSecs}
                        promptType={promptType}
                        setPromptType={setPromptType}
                        selectedStyleId={selectedStyleId}
                        setSelectedStyleId={setSelectedStyleId}
                        aspectRatio={aspectRatio}
                        setAspectRatio={setAspectRatio}
                        enableAspectRatio={enableAspectRatio}
                        setEnableAspectRatio={setEnableAspectRatio}
                        enableCharacterConsistency={enableCharacterConsistency}
                        setEnableCharacterConsistency={setEnableCharacterConsistency}
                        selectedModel={selectedModel}
                        audioSource={audioSource}
                        audioFileName={audioFileName}
                        onAudioUpload={(duration, name) => {
                            setAudioDuration(duration);
                            setAudioFileName(name);
                        }}
                        manualAudioDuration={manualAudioDuration}
                        onManualDurationChange={setManualAudioDuration}
                    />
                </div>

                <div className="lg:col-span-8 lg:overflow-y-auto lg:pr-2 lg:-mr-2 pb-4">
                    {displayItems.length === 0 ? (
                        <WelcomeGuide />
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <SparklesIcon className="h-5 w-5 text-emerald-400" />
                                    {prompts.length > 0
                                        ? `Storyboard đã tạo (${displayItems.length} cảnh)`
                                        : `Phân cảnh xong (${displayItems.length} cảnh) — chờ tạo prompt`}
                                </h2>
                                {prompts.length > 0 && (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleDownloadTxt}
                                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 border border-slate-600"
                                        >
                                            <TextDocumentIcon className="h-4 w-4" /> Xuất Script (.txt)
                                        </button>
                                        <button
                                            onClick={handleDownloadExcel}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                        >
                                            <DownloadIcon className="h-4 w-4" /> Xuất Excel
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                {displayItems.map((scene, idx) => {
                                    const hasPrompt = !!(scene.imagePrompt || scene.videoPrompt);
                                    return (
                                        <div key={scene.id} className={`bg-slate-900 border rounded-xl p-5 transition-all shadow-sm ${hasPrompt ? 'border-slate-800 hover:border-emerald-500/30' : 'border-amber-500/20 hover:border-amber-500/40'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${hasPrompt ? 'bg-slate-800 text-slate-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                    Cảnh {idx + 1}
                                                </span>
                                                {!hasPrompt && (
                                                    <span className="text-[10px] text-amber-400/70 italic">
                                                        Chưa có prompt — bấm "Tạo prompt hàng loạt"
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mb-4">
                                                <p className="text-slate-300 italic font-medium border-l-2 border-emerald-500/50 pl-3 py-1">"{scene.scriptLine}"</p>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4 text-sm">
                                                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                                                    <p className="text-xs text-slate-500 font-bold mb-1 uppercase">
                                                        {scene.videoPrompt ? "Mô tả Video (Veo/Sora)" : "Mô tả Hình ảnh"}
                                                    </p>
                                                    <p className={`leading-relaxed text-xs ${hasPrompt ? 'text-slate-300' : 'text-slate-600 italic'}`}>
                                                        {scene.videoPrompt || scene.imagePrompt || '— chưa sinh prompt —'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    </div>
  );
};

export default App;
