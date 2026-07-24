import React, { useState, useEffect, useMemo, FC } from 'react';
import { AppMode, PromptType, AspectRatio, ApiKeyData, SavedSession, ScenePrompt, ToastMessage, ToastType } from './types';
import { exportToExcel, getTimestamp, formatDate } from './utils/helpers';
import { PRESET_STYLES, MODELS } from './utils/constants';
import { ToastContainer } from './components/Toast';
import { WelcomeGuide } from './components/WelcomeGuide';
import { ControlPanel } from './components/ControlPanel';
import { ApiSettingsModal } from './components/modals/ApiSettingsModal';
import { LibraryModal } from './components/modals/LibraryModal';
import { GuideModal } from './components/modals/GuideModal';
import { BookOpenIcon, LibraryIcon, KeyIcon, SparklesIcon, TextDocumentIcon, DownloadIcon } from './components/icons';
import { analyzeScriptWithAIStream } from './services/geminiService';

const App: FC = () => {
  // State
  const [mode, setMode] = useState<AppMode>('general');
  const [scenario, setScenario] = useState<string>('');
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [customStylePrompt, setCustomStylePrompt] = useState<string>('');
  const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [buildProgress, setBuildProgress] = useState<number>(0);
  const [buildStatus, setBuildStatus] = useState<string>('');
  const [segmentationMode, setSegmentationMode] = useState<'ai' | 'punctuation' | 'fixed'>('fixed');
  const [targetSceneCount, setTargetSceneCount] = useState<number>(10);
  const [promptType, setPromptType] = useState<PromptType>('image');
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
          setScriptFileName(file.name);
          setScenario(content);
          addToast('success', 'Đã tải kịch bản', `Đã tải ${file.name}`);
      };
      reader.readAsText(file);
  };

  const handleBuildPrompts = async () => {
      if (!scenario) {
          addToast('error', 'Chưa có kịch bản', 'Vui lòng tải lên file kịch bản (.txt, .srt).');
          return;
      }
      setIsBuilding(true);
      setBuildProgress(0);
      setBuildStatus('Đang khởi tạo...');
      setPrompts([]); // Clear old prompts for progressive view
      try {
           const activeKeys = apiKeys.filter(k => k.isActive);
           let effectiveKey = "";

           if (activeKeys.length > 0) {
               // Truyền CSV keys để withRetry tự xoay vòng khi gặp 429
               effectiveKey = activeKeys.map(k => k.key).join(',');
           }
           
           if (!effectiveKey && !kymaKey) {
               addToast('error', 'Chưa cấu hình API Key', 'Vui lòng nhấn nút API góc trên bên phải để nhập Kyma API Key hoặc Gemini API Key trước khi phân cảnh.');
               setIsBuilding(false);
               return;
           }
          
          let refImagesForService: { base64: string; mimeType: string }[] = [];
          let activeStylePrompt = "";

          if (selectedStyleId === 'reference') {
             if (customStylePrompt.trim() !== "") {
                 activeStylePrompt = "Visual Style: " + customStylePrompt.trim();
             } else {
                 activeStylePrompt = "Visual Style: Neutral, realistic, high quality. Visualize the scene based strictly on the script content.";
             }
          } else {
             const selectedStyleObj = PRESET_STYLES.find(s => s.id === selectedStyleId);
             activeStylePrompt = selectedStyleObj ? selectedStyleObj.prompt : "";
          }

          const expectedProvider = kymaKey ? 'Kyma' : 'Gemini';
          const expectedModel = kymaKey ? selectedKymaModel || 'deepseek-v4-flash' : selectedModel;
          const initialMessage = kymaKey
              ? `Đang thử Kyma trước (${expectedModel}), sẽ fallback Gemini nếu lỗi.`
              : `Đang dùng Gemini (${expectedModel}).`;
          addToast('info', 'Đang phân cảnh...', initialMessage);

          const stream = analyzeScriptWithAIStream(
              scenario,
              refImagesForService,
              effectiveKey,
              activeStylePrompt,
              mode,
              segmentationMode,
              selectedModel,
              targetSceneCount,
              promptType,
              aspectRatio,
              enableAspectRatio,
              enableCharacterConsistency,
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

          if (finalResults.provider !== expectedProvider || finalResults.model !== expectedModel) {
              addToast('info', 'Tự động chuyển đổi', `Dùng ${finalResults.provider} (${finalResults.model}) do cấu hình ban đầu gặp lỗi.`);
          }
          addToast('success', 'Thành công', `Đã tạo ${newPrompts.length}/${finalResults.totalCount} cảnh bằng ${finalResults.provider} (${finalResults.model}).`);
          
      } catch (error: any) {
          addToast('error', 'Lỗi tạo nội dung', error.message);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
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

        <main className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <ControlPanel 
                        mode={mode}
                        setMode={setMode}
                        scenario={scenario}
                        setScenario={setScenario}
                        customStylePrompt={customStylePrompt}
                        setCustomStylePrompt={setCustomStylePrompt}
                        onScriptUpload={handleScriptUpload}
                        onBuildPrompts={handleBuildPrompts}
                        isBuilding={isBuilding}
                        buildProgress={buildProgress}
                        buildStatus={buildStatus}
                        scriptFileName={scriptFileName}
                        segmentationMode={segmentationMode}
                        setSegmentationMode={setSegmentationMode}
                        hasPrompts={prompts.length > 0}
                        targetSceneCount={targetSceneCount}
                        setTargetSceneCount={setTargetSceneCount}
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
                    />
                </div>

                <div className="lg:col-span-8">
                    {prompts.length === 0 ? (
                        <WelcomeGuide />
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <SparklesIcon className="h-5 w-5 text-emerald-400" />
                                    Storyboard đã tạo ({prompts.length} cảnh)
                                </h2>
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
                            </div>
                            
                            <div className="space-y-4">
                                {prompts.map((scene, idx) => (
                                    <div key={scene.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-emerald-500/30 transition-all shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="bg-slate-800 text-slate-400 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Cảnh {idx + 1}</span>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-slate-300 italic font-medium border-l-2 border-emerald-500/50 pl-3 py-1">"{scene.scriptLine}"</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 text-sm">
                                            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                                                <p className="text-xs text-slate-500 font-bold mb-1 uppercase">
                                                    {scene.videoPrompt ? "Mô tả Video (Veo/Sora)" : "Mô tả Hình ảnh"}
                                                </p>
                                                <p className="text-slate-300 leading-relaxed text-xs">
                                                    {scene.videoPrompt || scene.imagePrompt}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
