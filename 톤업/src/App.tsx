import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Copy,
  Check,
  FileText,
  Mail,
  MessageSquare,
  Info,
  Trash2,
  FileSpreadsheet,
  HeartHandshake,
  AlertCircle,
  TrendingUp,
  Award,
  Plus,
  Pencil,
  X,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Database,
  ChevronDown,
  ChevronUp,
  Download,
  Share,
} from "lucide-react";
import { PRESETS, Preset } from "./presets";
import { auth, googleProvider, db, signInWithPopup, signOut, OperationType, handleFirestoreError } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, getDocs, query, where, writeBatch } from "firebase/firestore";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [selectedTone, setSelectedTone] = useState<
    "polite" | "friendly" | "concise" | "confident" | "soft"
  >("polite");
  const [selectedFormat, setSelectedFormat] = useState<
    "email" | "messenger" | "document"
  >("messenger");
  const [customContext, setCustomContext] = useState("");
  const [resultText, setResultText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // Conversion history (localStorage-backed)
  type HistoryEntry = {
    id: string;
    input: string;
    result: string;
    tone: string;
    format: string;
    context?: string;
    ts: number;
  };
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem("convert_history");
    if (saved) {
      try {
        return JSON.parse(saved) as HistoryEntry[];
      } catch (e) {
        console.error("Failed to parse convert_history from localStorage:", e);
      }
    }
    return [] as HistoryEntry[];
  });

  // History Expansion & Confirmation States
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Theme State: Dark mode (default true) vs Light mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("theme_mode");
    return saved !== "light"; // Default to dark (true) if light wasn't set
  });

  // PWA (Progressive Web App) States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState(false);

  const isIOSDevice = () => {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  };

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      console.log('PWA installed successfully');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handlePWAInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
    } else if (isIOSDevice()) {
      setShowIOSInstallGuide(true);
    }
  };

  // Custom Presets State (backed by localStorage or Firestore)
  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem("custom_presets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse custom presets from localStorage:", e);
      }
    }
    return PRESETS;
  });

  // Fetch / Sync presets when authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false); // Resolve login loading state immediately!
      
      if (currentUser) {
        try {
          const q = query(collection(db, "presets"), where("userId", "==", currentUser.uid));
          let querySnapshot;
          try {
            querySnapshot = await getDocs(q);
          } catch (err) {
            handleFirestoreError(err, OperationType.LIST, "presets");
            throw err;
          }
          const loaded: Preset[] = [];
          querySnapshot.forEach((docSnap) => {
            loaded.push(docSnap.data() as Preset);
          });
          
          if (loaded.length > 0) {
            loaded.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
            setPresets(loaded);
          } else {
            // First login sync: grab local custom presets or fallback to defaults
            const localSaved = localStorage.getItem("custom_presets");
            let initialPresets = PRESETS;
            if (localSaved) {
              try {
                initialPresets = JSON.parse(localSaved);
              } catch (e) {
                console.error("Local presets parse error:", e);
              }
            }
            
            const batch = writeBatch(db);
            const presetsToSave = initialPresets.map((p, idx) => ({
              ...p,
              id: p.id.startsWith(currentUser.uid) ? p.id : `${currentUser.uid}_${p.id}`,
              userId: currentUser.uid,
              createdAt: Date.now() + idx
            }));
            
            for (const p of presetsToSave) {
              const docRef = doc(db, "presets", p.id);
              batch.set(docRef, p);
            }
            try {
              await batch.commit();
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, "presets");
              throw err;
            }
            
            setPresets(presetsToSave as Preset[]);
          }
        } catch (error) {
          console.error("Firestore presets fetch/sync error:", error);
          setErrorMessage("구글 클라우드에서 상황 카드를 불러오는 도중 오류가 발생했습니다.");
        }
      } else {
        // Logged out: fallback to local storage or defaults
        const saved = localStorage.getItem("custom_presets");
        if (saved) {
          try {
            setPresets(JSON.parse(saved));
          } catch (e) {
            setPresets(PRESETS);
          }
        } else {
          setPresets(PRESETS);
        }
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Modal State for Adding/Editing Presets
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  
  // Form States for Preset Modal
  const [presetTitle, setPresetTitle] = useState("");
  const [presetCategory, setPresetCategory] = useState("업무 보고");
  const [presetDraft, setPresetDraft] = useState("");
  const [presetTone, setPresetTone] = useState<"polite" | "friendly" | "concise" | "confident" | "soft">("polite");
  const [presetFormat, setPresetFormat] = useState<"email" | "messenger" | "document">("messenger");
  const [presetContext, setPresetContext] = useState("");
  const [modalError, setModalError] = useState("");

  // Toggle theme handler
  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem("theme_mode", newMode ? "dark" : "light");
  };

  // Apply a preset to active inputs
  const handleSelectPreset = (preset: Preset) => {
    setInputText(preset.draft);
    setSelectedTone(preset.suggestedTone);
    setSelectedFormat(preset.suggestedFormat);
    setCustomContext(preset.suggestedContext || "");
    setErrorMessage("");
  };

  // Clear main fields
  const handleClear = () => {
    setInputText("");
    setCustomContext("");
    setResultText("");
    setErrorMessage("");
  };

  // Delete a preset
  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("이 상황 카드를 삭제하시겠습니까?")) {
      const updated = presets.filter((p) => p.id !== id);
      setPresets(updated);
      
      if (user) {
        try {
          await deleteDoc(doc(db, "presets", id));
        } catch (err) {
          console.error("Failed to delete preset from firestore:", err);
          setErrorMessage("구글 클라우드에서 상황 카드를 삭제하지 못했습니다.");
          handleFirestoreError(err, OperationType.DELETE, `presets/${id}`);
        }
      } else {
        localStorage.setItem("custom_presets", JSON.stringify(updated));
      }
    }
  };

  // Open modal for creating a new preset
  const handleOpenAddModal = () => {
    setEditingPresetId(null);
    setPresetTitle("");
    setPresetCategory("업무 보고");
    setPresetDraft("");
    setPresetTone("polite");
    setPresetFormat("messenger");
    setPresetContext("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Open modal for editing an existing preset
  const handleOpenEditModal = (preset: Preset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetId(preset.id);
    setPresetTitle(preset.title);
    setPresetCategory(preset.category);
    setPresetDraft(preset.draft);
    setPresetTone(preset.suggestedTone);
    setPresetFormat(preset.suggestedFormat);
    setPresetContext(preset.suggestedContext || "");
    setModalError("");
    setIsModalOpen(true);
  };

  // Save the custom preset (creates new or updates existing)
  const handleSavePreset = async () => {
    if (!presetTitle.trim()) {
      setModalError("상황 제목을 간단히 입력해 주세요 (예: 📊 보고서 전달).");
      return;
    }
    if (!presetDraft.trim()) {
      setModalError("초안 예시 내용을 작성해 주세요.");
      return;
    }

    const targetId = editingPresetId || "preset_" + Date.now();
    const targetPreset: Preset = {
      id: targetId,
      title: presetTitle.trim(),
      category: presetCategory.trim(),
      draft: presetDraft.trim(),
      suggestedTone: presetTone,
      suggestedFormat: presetFormat,
      suggestedContext: presetContext.trim() || undefined,
    };

    let updatedPresets: Preset[];
    if (editingPresetId) {
      updatedPresets = presets.map((p) => p.id === editingPresetId ? targetPreset : p);
    } else {
      updatedPresets = [...presets, targetPreset];
    }

    if (user) {
      try {
        const firestorePreset = {
          ...targetPreset,
          userId: user.uid,
          createdAt: Date.now()
        };
        await setDoc(doc(db, "presets", targetId), firestorePreset);
        setPresets(updatedPresets);
        setIsModalOpen(false);
      } catch (err) {
        console.error("Firestore save error:", err);
        setModalError("구글 클라우드에 상황 카드를 저장하는 중 오류가 발생했습니다.");
        handleFirestoreError(err, OperationType.WRITE, `presets/${targetId}`);
      }
    } else {
      setPresets(updatedPresets);
      localStorage.setItem("custom_presets", JSON.stringify(updatedPresets));
      setIsModalOpen(false);
    }
  };

  // Reset all presets back to default PRESETS
  const handleResetToDefaults = async () => {
    if (window.confirm("상황 템플릿을 초기 기본 제공 템플릿으로 리셋하시겠습니까? (커스텀 추가 사항이 사라집니다)")) {
      if (user) {
        try {
          setIsLoading(true);
          const q = query(collection(db, "presets"), where("userId", "==", user.uid));
          let querySnapshot;
          try {
            querySnapshot = await getDocs(q);
          } catch (err) {
            handleFirestoreError(err, OperationType.LIST, "presets");
            throw err;
          }
          const batch = writeBatch(db);
          querySnapshot.forEach((docSnap) => {
            batch.delete(docSnap.ref);
          });
          
          const presetsToSave = PRESETS.map((p, idx) => ({
            ...p,
            userId: user.uid,
            createdAt: Date.now() + idx
          }));
          
          for (const p of presetsToSave) {
            batch.set(doc(db, "presets", p.id), p);
          }
          try {
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, "presets");
            throw err;
          }
          setPresets(presetsToSave as Preset[]);
        } catch (err) {
          console.error("Firestore reset error:", err);
          setErrorMessage("구글 클라우드에서 상황 카드를 초기화하는 도중 오류가 발생했습니다.");
        } finally {
          setIsLoading(false);
        }
      } else {
        setPresets(PRESETS);
        localStorage.setItem("custom_presets", JSON.stringify(PRESETS));
      }
    }
  };

  // Conversion history helpers (localStorage-backed)
  const saveHistoryEntry = (entry: HistoryEntry) => {
      const updated = [entry, ...history].slice(0, 50); // keep last 50 entries
      setHistory(updated);
      try {
        localStorage.setItem("convert_history", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save history to localStorage:", e);
      }
  };

  const handleApplyHistory = (entry: HistoryEntry) => {
      setInputText(entry.input);
      setSelectedTone(entry.tone as any);
      setSelectedFormat(entry.format as any);
      setCustomContext(entry.context || "");
      setResultText(entry.result);
  };

  const handleHistoryItemClick = (entry: HistoryEntry) => {
      handleApplyHistory(entry);
      setExpandedHistoryId(prev => prev === entry.id ? null : entry.id);
  };

  const handleDeleteHistory = (id: string) => {
      const updated = history.filter((h) => h.id !== id);
      setHistory(updated);
      if (expandedHistoryId === id) {
        setExpandedHistoryId(null);
      }
      try {
        localStorage.setItem("convert_history", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
  };

  const performClearHistory = () => {
      setHistory([]);
      setExpandedHistoryId(null);
      localStorage.removeItem("convert_history");
      setShowClearHistoryConfirm(false);
  };

  const handleDownloadResult = () => {
      if (!resultText) return;
      try {
        const blob = new Blob([resultText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tone-converter-result-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("파일 다운로드 실패:", e);
      }
  };

  // Submit translation request to backend API
  const handleConvert = async () => {
    if (!inputText.trim()) {
      setErrorMessage("변환할 초안 내용을 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setResultText("");

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
          tone: selectedTone,
          format: selectedFormat,
          context: customContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "서버 통신 중 오류가 발생했습니다.");
      }

      setResultText(data.result);

      // Save to local history (non-blocking)
      try {
        const entry: HistoryEntry = {
          id: `h_${Date.now()}`,
          input: inputText,
          result: data.result,
          tone: selectedTone,
          format: selectedFormat,
          context: customContext,
          ts: Date.now(),
        };
        saveHistoryEntry(entry);
      } catch (e) {
        console.error("history save failed:", e);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "서버 요청 중 예기치 못한 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // Copy result to clipboard
  const handleCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  // Helper labels for tones
  const tones = [
    {
      id: "polite" as const,
      label: "정중하게",
      description: "비즈니스 공식 예절",
    },
    {
      id: "friendly" as const,
      label: "친근하게",
      description: "상냥하고 따뜻한 메신저용",
    },
    {
      id: "concise" as const,
      label: "간결하게",
      description: "핵심만 신속 명확하게",
    },
    {
      id: "confident" as const,
      label: "자신있게",
      description: "당당하고 논리적인 발표형",
    },
    {
      id: "soft" as const,
      label: "부드러운 거절",
      description: "쿠션어가 가득한 양해형",
    },
  ];

  // Helper labels for formats
  const formats = [
    { id: "messenger" as const, label: "메신저", icon: MessageSquare },
    { id: "email" as const, label: "이메일 형식", icon: Mail },
    { id: "document" as const, label: "보고서/문서", icon: FileText },
  ];

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden py-6 px-3.5 sm:py-12 sm:px-6 lg:px-8 font-sans antialiased flex flex-col items-center justify-start transition-colors duration-300 ${
        isDarkMode ? "text-white" : "text-slate-800"
      }`}
      style={
        isDarkMode
          ? {
              background: "radial-gradient(at 0% 0%, #1e1b4b 0%, transparent 50%), radial-gradient(at 100% 0%, #312e81 0%, transparent 50%), radial-gradient(at 50% 50%, #4338ca 0%, #0f172a 100%)",
              backgroundColor: "#0f172a"
            }
          : {
              background: "radial-gradient(at 0% 0%, #e0e7ff 0%, transparent 50%), radial-gradient(at 100% 0%, #f3e8ff 0%, transparent 50%), radial-gradient(at 50% 50%, #c7d2fe 0%, #f8fafc 100%)",
              backgroundColor: "#f8fafc"
            }
      }
    >
      {/* Background Mesh Overlay */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none z-0 transition-all duration-300"
        style={{
          backgroundImage: isDarkMode
            ? "radial-gradient(#ffffff 1px, transparent 1px)"
            : "radial-gradient(#4f46e5 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />

      {/* Floating Controls Container (Login & Theme) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex flex-col-reverse sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3">
        {isAuthLoading ? (
          <div className="flex items-center justify-center p-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : user ? (
          <div className="flex items-center gap-2">
            <div className={`hidden md:flex flex-col items-end text-right text-xs ${isDarkMode ? "text-indigo-200" : "text-slate-600"}`}>
              <span className="font-bold">{user.displayName || "사용자"}</span>
              <span className="text-[10px] opacity-70">{user.email}</span>
            </div>
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-indigo-400 shadow-md object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md border border-indigo-500">
                {user.displayName ? user.displayName.charAt(0) : "U"}
              </div>
            )}
            <button
              onClick={() => signOut(auth)}
              className={`p-1.5 px-2.5 text-[11px] font-bold rounded-xl border flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95 ${
                isDarkMode
                  ? "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-300 hover:text-rose-200"
                  : "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
              }`}
              title="로그아웃"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              try {
                await signInWithPopup(auth, googleProvider);
              } catch (error: any) {
                console.error("Google Auth failed:", error);
                if (error.code === "auth/popup-blocked") {
                  alert("팝업이 차단되었습니다. 새 창으로 앱을 열거나 브라우저 팝업 설정을 해제해 주세요.");
                } else {
                  alert(`구글 로그인 실패: ${error.message}`);
                }
              }
            }}
            className={`p-1.5 px-2.5 text-[11px] font-bold rounded-xl border flex items-center gap-1 transition-all cursor-pointer shadow-md active:scale-95 ${
              isDarkMode
                ? "bg-indigo-600/90 hover:bg-indigo-600 border-indigo-400/30 text-white"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            <LogIn className="w-3 h-3 text-indigo-500" />
            <span>구글 로그인</span>
          </button>
        )}

        {/* Floating Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-md active:scale-95 ${
            isDarkMode
              ? "bg-white/5 border-white/10 text-yellow-300 hover:bg-white/10"
              : "bg-white border-indigo-100 text-amber-500 hover:bg-slate-50"
          }`}
          title={isDarkMode ? "밝은 모드로 전환" : "어두운 모드로 전환"}
        >
          {isDarkMode ? <Sun className="w-4 h-4 animate-spin-slow" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="max-w-6xl w-full mx-auto relative z-10 space-y-10">
        
        {/* Header Section */}
        <header className="text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4 shadow-xs backdrop-blur-md border transition-all ${
            isDarkMode
              ? "bg-white/5 border-white/10 text-indigo-200"
              : "bg-indigo-50/80 border-indigo-100/60 text-indigo-700"
          }`}>
            <Sparkles className={`w-3.5 h-3.5 animate-pulse ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
            <span>AI 비즈니스 라이팅 어시스턴트</span>
          </div>
          <h1 className={`text-4xl font-extrabold tracking-tight sm:text-5xl text-transparent bg-clip-text bg-gradient-to-r drop-shadow-xs transition-all ${
            isDarkMode
              ? "from-white via-indigo-100 to-indigo-200"
              : "from-slate-900 via-indigo-950 to-slate-800"
          }`}>
            말투 한 끝
          </h1>
          <p className={`mt-3.5 text-base sm:text-lg max-w-xl mx-auto leading-relaxed transition-colors duration-300 ${
            isDarkMode ? "text-indigo-200/70" : "text-slate-600/95"
          }`}>
            대충 작성한 일상 대화나 날것의 초안을 격식 있고 배려 넘치는 명품 비즈니스 말투로 다듬어 드립니다.
          </p>
        </header>

        {/* PWA Installation Banner */}
        {!isStandalone && (isInstallable || isIOSDevice()) && (
          <div className="animate-fade-in">
            <div className={`p-4 sm:p-5 rounded-3xl border flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300 ${
              isDarkMode 
                ? "bg-indigo-950/40 border-indigo-500/20 shadow-lg text-indigo-100" 
                : "bg-indigo-50/50 border-indigo-100/60 shadow-xs text-indigo-900"
            }`}>
              <div className="flex items-center gap-3.5 text-center md:text-left flex-col md:flex-row">
                <div className={`p-2.5 rounded-2xl flex items-center justify-center shrink-0 ${
                  isDarkMode ? "bg-indigo-500/10 text-indigo-300" : "bg-white text-indigo-600 shadow-2xs border border-indigo-100"
                }`}>
                  <Download className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base tracking-tight flex items-center justify-center md:justify-start gap-1.5">
                    <span>"말투 한 끝" 앱으로 편리하게 사용하기</span>
                    <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider animate-pulse">PWA</span>
                  </h3>
                  <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? "text-indigo-200/70" : "text-slate-600"}`}>
                    모바일 브라우저에서 별도의 다운로드 비용이나 등록 가입 없이, 홈 화면에 1초 만에 앱처럼 추가해서 간편히 소통을 디자인해 보세요!
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
                <button
                  onClick={handlePWAInstall}
                  className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95 flex items-center justify-center gap-1.5 border-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isIOSDevice() ? "홈 화면에 설치 방법" : "앱 설치하기"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Presets Section */}
        <section className="space-y-3" id="presets">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <TrendingUp className={`w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
              <h2 className={`text-[13px] sm:text-sm font-bold truncate ${isDarkMode ? "text-indigo-200/80" : "text-slate-700"}`}>
                자주 마주하는 상황 템플릿<span className="hidden sm:inline"> (카드를 눌러 초안 자동 입력)</span>
              </h2>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleResetToDefaults}
                className={`text-[11px] sm:text-xs px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                  isDarkMode
                    ? "text-indigo-300/60 hover:text-indigo-300 bg-white/5 hover:bg-white/10 border-white/5"
                    : "text-slate-500 hover:text-indigo-600 bg-white hover:bg-slate-50 border-slate-200 shadow-xs"
                }`}
                title="템플릿을 초기 디폴트 값으로 재설정합니다"
              >
                초기화
              </button>
              <button
                onClick={handleOpenAddModal}
                className={`flex items-center gap-0.5 sm:gap-1 text-[11px] sm:text-xs border px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap ${
                  isDarkMode
                    ? "text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/20"
                    : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                }`}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>상황 추가</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`group relative flex flex-col justify-between p-2.5 sm:p-4 border rounded-2xl transition-all text-left duration-300 cursor-pointer min-h-[90px] sm:min-h-[115px] ${
                  isDarkMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 hover:border-indigo-500/40 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] text-white"
                    : "bg-white hover:bg-slate-50 border-slate-200/80 hover:border-indigo-400 hover:shadow-[0_4px_12px_rgba(99,102,241,0.06)] text-slate-800"
                }`}
              >
                {/* Edit and Delete Buttons (Visible on hover of the preset card) */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                  <button
                    onClick={(e) => handleOpenEditModal(preset, e)}
                    className="p-1 sm:p-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors cursor-pointer"
                    title="이 상황 카드 수정"
                  >
                    <Pencil className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeletePreset(preset.id, e)}
                    className="p-1 sm:p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                    title="이 상황 카드 삭제"
                  >
                    <Trash2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                  </button>
                </div>

                <span className={`text-[9px] sm:text-[11px] font-bold mb-1 sm:mb-1.5 block transition-colors ${
                  isDarkMode 
                    ? "text-indigo-300/70 group-hover:text-indigo-300" 
                    : "text-indigo-700/80 group-hover:text-indigo-700"
                }`}>
                  {preset.category}
                </span>
                <span className={`text-[12px] sm:text-sm font-semibold leading-snug transition-colors pr-10 ${
                  isDarkMode ? "text-white/90 group-hover:text-white" : "text-slate-800"
                }`}>
                  {preset.title}
                </span>
              </div>
            ))}

            {/* Dash border add scenario placeholder card */}
            <button
              onClick={handleOpenAddModal}
              className={`flex flex-col items-center justify-center p-2.5 sm:p-4 border border-dashed rounded-2xl transition-all duration-300 cursor-pointer h-full min-h-[90px] sm:min-h-[115px] ${
                isDarkMode
                  ? "bg-white/5 hover:bg-indigo-500/10 border-indigo-400/30 hover:border-indigo-400/60 text-indigo-200"
                  : "bg-white hover:bg-indigo-50/60 border-indigo-300 hover:border-indigo-400 text-indigo-800 shadow-xs"
              }`}
            >
              <Plus className={`w-4 h-4 sm:w-6 sm:h-6 mb-1 ${isDarkMode ? "text-indigo-300" : "text-indigo-700"}`} />
              <span className={`text-[10px] sm:text-xs font-bold ${isDarkMode ? "text-indigo-200" : "text-indigo-800"}`}>새로운 업무 상황 추가</span>
            </button>
          </div>
        </section>

        {/* Main Work Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Panel: Inputs & Settings */}
          <div className={`lg:col-span-6 border backdrop-blur-xl rounded-3xl p-4 sm:p-8 space-y-5 sm:space-y-6 transition-all duration-300 ${
            isDarkMode
              ? "bg-white/10 border-white/15 shadow-2xl"
              : "bg-white/70 border-indigo-100/80 shadow-lg"
          }`}>
            
            {/* Input Draft Section */}
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <label htmlFor="draft-input" className={`text-sm font-bold flex items-center gap-2 ${
                  isDarkMode ? "text-indigo-200" : "text-slate-700"
                }`}>
                  <FileSpreadsheet className={`w-4.5 h-4.5 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
                  초안 및 날것의 생각 작성
                </label>
                {inputText && (
                  <button
                    onClick={handleClear}
                    className={`text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                      isDarkMode ? "text-indigo-300/60 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    비우기
                  </button>
                )}
              </div>
              <div className="relative">
                <textarea
                  id="draft-input"
                  rows={6}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (errorMessage) setErrorMessage("");
                  }}
                  placeholder="예시) 오늘 몸이 안 좋아서 병원 들렸다가 30분 정도 지각해야 할 것 같아요. 부장님 죄송합니다..."
                  className={`w-full p-3.5 sm:p-4 border rounded-2xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 resize-none leading-relaxed text-base sm:text-sm transition-all ${
                    isDarkMode
                      ? "bg-white/5 border-white/10 text-white placeholder-indigo-200/30"
                      : "bg-white border-slate-200 text-slate-800 placeholder-slate-400/80 shadow-xs"
                  }`}
                />
                <div className={`absolute bottom-3 right-4 text-xs pointer-events-none ${
                  isDarkMode ? "text-indigo-300/40" : "text-slate-400"
                }`}>
                  {inputText.length}자
                </div>
              </div>
            </div>

            {/* Tone Selector */}
            <div>
              <label className={`text-sm font-bold block mb-2.5 ${
                isDarkMode ? "text-indigo-200" : "text-slate-700"
              }`}>
                정밀 어조(Tone) 설정
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                {tones.map((t) => {
                  const isActive = selectedTone === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTone(t.id)}
                      className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-indigo-600/90 hover:bg-indigo-600 border-indigo-400/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                          : isDarkMode
                            ? "border-white/10 hover:border-white/20 bg-white/5 text-indigo-200/80 hover:bg-white/10"
                            : "border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:bg-slate-50 shadow-xs"
                      }`}
                    >
                      <div className="text-[13px] sm:text-sm font-bold block">{t.label}</div>
                      <div
                        className={`text-[10px] sm:text-[11px] mt-1.5 leading-normal transition-colors ${
                          isActive
                            ? "text-indigo-100/90"
                            : isDarkMode
                              ? "text-indigo-300/50"
                              : "text-slate-400"
                        }`}
                      >
                        {t.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className={`text-sm font-bold block mb-2.5 ${
                isDarkMode ? "text-indigo-200" : "text-slate-700"
              }`}>
                결과물 포맷
              </label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {formats.map((f) => {
                  const isActive = selectedFormat === f.id;
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFormat(f.id)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 sm:py-3.5 px-1 sm:px-2 rounded-2xl border text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-indigo-600/90 hover:bg-indigo-600 border-indigo-400/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                          : isDarkMode
                            ? "border-white/10 hover:border-white/20 bg-white/5 text-indigo-300 hover:bg-white/10"
                            : "border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:bg-slate-50 shadow-xs"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Context Field */}
            <div>
              <label htmlFor="context-input" className={`text-sm font-bold flex items-center gap-1.5 mb-2 ${
                isDarkMode ? "text-indigo-200" : "text-slate-700"
              }`}>
                <Info className={`w-4 h-4 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
                추가 요청사항/참고 맥락 (선택)
              </label>
              <input
                id="context-input"
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="예) 마감이 늦어서 미안한 기색 추가, 상대방은 협력사 과장님"
                className={`w-full px-3.5 py-2.5 sm:px-4 sm:py-3 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-base sm:text-sm transition-all ${
                  isDarkMode
                    ? "bg-white/5 border-white/10 text-white placeholder-indigo-200/30"
                    : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-xs"
                }`}
              />
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs leading-normal">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Conversion Action Button */}
            <button
              onClick={handleConvert}
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-2xl font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>AI 라이팅 엔진 가동 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>비즈니스 말투로 다듬기</span>
                </>
              )}
            </button>
          </div>

          {/* Right Panel: Results & Feedback */}
          <div className="lg:col-span-6 flex flex-col h-full space-y-6">
            
            {/* Output Container */}
            <div className={`border backdrop-blur-xl rounded-3xl p-4 sm:p-8 flex flex-col flex-1 min-h-[380px] sm:min-h-[440px] transition-all duration-300 ${
              isDarkMode
                ? "bg-white/10 border-white/15 shadow-2xl"
                : "bg-white/70 border-indigo-100/80 shadow-lg"
            }`}>
              <div className={`flex justify-between items-center mb-5 pb-3 border-b ${
                isDarkMode ? "border-white/10" : "border-slate-100"
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
                  </span>
                  <span className={`text-sm font-bold ${isDarkMode ? "text-indigo-100" : "text-slate-800"}`}>변환 결과 확인</span>
                </div>
                {resultText && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                        isDarkMode
                          ? isCopied
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10 hover:border-white/20"
                          : isCopied
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs"
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>복사하기</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadResult}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                        isDarkMode
                          ? "bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10 hover:border-white/20"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs"
                      }`}
                      title="결과 다운로드"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>다운로드</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Main Text Output Area */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="relative min-h-[220px]">
                  <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center text-indigo-200/40 space-y-3"
                      >
                        <Sparkles className="w-8 h-8 text-indigo-300/60 animate-bounce" />
                        <div className="text-sm font-medium text-indigo-200/60 animate-pulse text-center max-w-xs leading-relaxed">
                          초안을 분석하고 맞춤식 비즈니스 매너 규칙과 쿠션어를 정교하게 배정하고 있습니다...
                        </div>
                      </motion.div>
                    ) : resultText ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-[15px] sm:text-base whitespace-pre-wrap leading-relaxed select-text font-medium select-all border rounded-2xl p-4 sm:p-5 ${
                          isDarkMode
                            ? "bg-white/5 border-white/10 text-white"
                            : "bg-white border-indigo-100/50 text-slate-800 shadow-xs"
                        }`}
                      >
                        {resultText}
                      </motion.div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                        <div className={`w-12 h-12 rounded-full border flex items-center justify-center mb-3 ${
                          isDarkMode ? "bg-white/5 border-white/10" : "bg-indigo-50 border-indigo-100/80"
                        }`}>
                          <HeartHandshake className={`w-6 h-6 ${isDarkMode ? "text-indigo-300/60" : "text-indigo-600"}`} />
                        </div>
                        <p className={`text-sm font-semibold ${isDarkMode ? "text-indigo-200/70" : "text-slate-700"}`}>대기 중</p>
                        <p className={`text-xs mt-1.5 max-w-[280px] leading-relaxed ${isDarkMode ? "text-indigo-300/40" : "text-slate-400"}`}>
                          왼쪽 창에 텍스트를 입력하거나 빠른 상황 카드를 선택해 말투를 변환해 보세요.
                        </p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Info Tip / Cushioner list */}
                {resultText && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-6 p-3.5 sm:p-4 rounded-2xl border flex items-start gap-3 text-xs sm:text-sm leading-relaxed ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 text-indigo-200/70"
                        : "bg-indigo-50/60 border-indigo-100/50 text-slate-600"
                    }`}
                  >
                    <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
                    <div>
                      <span className={`font-bold block mb-1 ${isDarkMode ? "text-white" : "text-slate-800"}`}>💡 작성 팁 & 보정 가이드</span>
                      선택하신 <span className={`font-bold ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`}>{tones.find((t) => t.id === selectedTone)?.label}</span> 어조에 맞춰 상냥하고 신뢰감 높은 비즈니스 전용 쿠션어가 완벽하게 추가되었습니다. 전송하기 전에 편하게 수정해 사용하세요!
                    </div>
                  </motion.div>
                )}

                {/* History Panel (Local) */}
                {history && history.length > 0 && (
                  <div className={`mt-4 p-3.5 sm:p-5 rounded-3xl border transition-all duration-300 ${isDarkMode ? "bg-white/5 border-white/10 text-indigo-200/70" : "bg-white border-slate-150/80 text-slate-700 shadow-xs"}`}>
                    <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-dashed border-slate-100 dark:border-white/5">
                      <span className="font-bold text-sm tracking-tight text-indigo-800 dark:text-indigo-200">최근 변환 기록</span>
                      <div className="flex items-center gap-2">
                        {showClearHistoryConfirm ? (
                          <div className="flex items-center gap-1.5 animate-fade-in bg-rose-500/10 dark:bg-rose-500/15 py-1 px-2.5 rounded-xl border border-rose-500/20">
                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">전부 지울까요?</span>
                            <button
                              onClick={performClearHistory}
                              className="text-[10px] px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white border-none font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                            >
                              예
                            </button>
                            <button
                              onClick={() => setShowClearHistoryConfirm(false)}
                              className="text-[10px] px-2 py-0.5 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-white/5 text-slate-500 dark:text-slate-300 transition-all cursor-pointer font-semibold"
                            >
                              아니오
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowClearHistoryConfirm(true)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-indigo-300 transition-all font-semibold cursor-pointer shadow-2xs active:scale-95 animate-fade-in"
                          >
                            모두 삭제
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <ul className="space-y-2.5 max-h-80 overflow-auto pr-1">
                      {history.map((h) => {
                        const isExpanded = expandedHistoryId === h.id;
                        return (
                          <li
                            key={h.id}
                            onClick={() => handleHistoryItemClick(h)}
                            className={`group p-3 rounded-2xl cursor-pointer flex flex-col justify-start transition-all duration-300 border ${
                              isExpanded
                                ? isDarkMode
                                  ? "bg-white/8 border-indigo-500/30 shadow-md"
                                  : "bg-indigo-50/50 border-indigo-200 shadow-xs"
                                : isDarkMode
                                  ? "bg-white/5 border-transparent hover:bg-white/8 hover:border-white/10"
                                  : "bg-slate-50 border-transparent hover:bg-slate-100 hover:border-slate-200"
                            }`}
                          >
                            <div className="flex items-start justify-between w-full gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-semibold text-slate-400 dark:text-indigo-300/50 flex items-center gap-1.5 flex-wrap">
                                  <span>{new Date(h.ts).toLocaleString()}</span>
                                  <span className="opacity-50">•</span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 font-bold">
                                    {tones.find((t) => t.id === h.tone)?.label || h.tone}
                                  </span>
                                </div>
                                <div className={`text-sm font-medium transition-all ${
                                  isExpanded
                                    ? "whitespace-pre-wrap mt-2 select-text leading-relaxed text-slate-800 dark:text-white"
                                    : "line-clamp-1 truncate mt-1 text-slate-600 dark:text-indigo-200/80"
                                }`}>
                                  {h.result}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(h.result);
                                  }}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-2xs cursor-pointer text-slate-600 dark:text-indigo-200"
                                  title="결과 복사"
                                >
                                  복사
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHistory(h.id);
                                  }}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30 transition-colors shadow-2xs cursor-pointer text-slate-600 dark:text-indigo-200"
                                  title="기록 삭제"
                                >
                                  삭제
                                </button>
                                <div className="text-slate-400 dark:text-indigo-300/40 p-0.5 shrink-0">
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </div>
                              </div>
                            </div>

                            {/* Extra info displayed ONLY when expanded */}
                            {isExpanded && (
                              <div className="mt-3.5 space-y-2.5 text-xs animate-fade-in">
                                {/* Original Input Draft */}
                                <div className="bg-white/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-white/5 text-slate-500 dark:text-indigo-200/60">
                                  <span className="font-bold text-[10px] text-slate-400 dark:text-indigo-300/40 block mb-1">💡 작성했던 초안</span>
                                  <div className="whitespace-pre-wrap leading-relaxed break-all">{h.input}</div>
                                </div>
                                
                                {/* Metadata tags */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-bold">
                                    어조: {tones.find(t => t.id === h.tone)?.label || h.tone}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-indigo-200/70 font-bold">
                                    포맷: {formats.find(f => f.id === h.format)?.label || h.format}
                                  </span>
                                  {h.context && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[220px]" title={h.context}>
                                      상황: {h.context}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Educational / Visual Accent Panel */}
            <div className={`border rounded-3xl p-4 sm:p-6 shadow-xs flex items-center gap-3.5 sm:gap-5 backdrop-blur-md transition-all duration-300 ${
              isDarkMode
                ? "bg-white/5 border-white/10 text-white"
                : "bg-indigo-50/40 border-indigo-100/50 text-slate-800 shadow-xs"
            }`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                isDarkMode
                  ? "bg-indigo-500/15 border border-indigo-500/20 shadow-indigo-500/5"
                  : "bg-indigo-100 border border-indigo-200/60 shadow-indigo-200/5"
              }`}>
                <Award className={`w-6 h-6 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
              </div>
              <div>
                <h3 className={`text-sm sm:text-base font-bold mb-1 ${isDarkMode ? "text-white" : "text-slate-800"}`}>프로페셔널 커뮤니케이션의 핵심</h3>
                <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? "text-indigo-200/60" : "text-slate-500"}`}>
                  한 글자, 한 끝의 차이가 사내 평판과 파트너십의 신뢰를 결정합니다. 격식과 상냥함을 균형있게 유지해 보세요.
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Frosted Glass Preset Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Modal Overlay backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            {/* Modal Content container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`relative w-full max-w-lg border backdrop-blur-2xl rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 overflow-hidden z-10 transition-all ${
                isDarkMode
                  ? "bg-indigo-950/80 border-white/20 text-white"
                  : "bg-white/95 border-indigo-100 text-slate-800"
              }`}
            >
              <div className={`flex justify-between items-center pb-3 border-b ${
                isDarkMode ? "border-white/10" : "border-slate-100"
              }`}>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
                  <span>{editingPresetId ? "업무 상황 정보 수정" : "새로운 업무 상황 추가"}</span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                    isDarkMode ? "hover:bg-white/10 text-indigo-200 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* Situation Category */}
                <div>
                  <label htmlFor="modal-category" className={`text-xs font-bold block mb-1.5 ${
                    isDarkMode ? "text-indigo-200" : "text-slate-600"
                  }`}>
                    상황 분류 (카테고리)
                  </label>
                  <input
                    id="modal-category"
                    type="text"
                    value={presetCategory}
                    onChange={(e) => setPresetCategory(e.target.value)}
                    placeholder="예) 업무 보고, 업무 조정, 협력사 소통, 기획 제안 등"
                    className={`w-full px-3 py-2.5 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-base sm:text-sm ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                        : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                    }`}
                  />
                </div>

                {/* Situation Title */}
                <div>
                  <label htmlFor="modal-title" className={`text-xs font-bold block mb-1.5 ${
                    isDarkMode ? "text-indigo-200" : "text-slate-600"
                  }`}>
                    상황 제목
                  </label>
                  <input
                    id="modal-title"
                    type="text"
                    value={presetTitle}
                    onChange={(e) => setPresetTitle(e.target.value)}
                    placeholder="예) 📊 기획서 초안 전달"
                    className={`w-full px-3 py-2.5 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-base sm:text-sm ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                        : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                    }`}
                  />
                </div>

                {/* Draft Content */}
                <div>
                  <label htmlFor="modal-draft" className={`text-xs font-bold block mb-1.5 ${
                    isDarkMode ? "text-indigo-200" : "text-slate-600"
                  }`}>
                    날것의 초안 내용 (예시)
                  </label>
                  <textarea
                    id="modal-draft"
                    rows={4}
                    value={presetDraft}
                    onChange={(e) => setPresetDraft(e.target.value)}
                    placeholder="예시) 기획안 대충 작성해 올리니 바쁘시더라도 다들 보시고 금주 화요일까지 꼭 피드백 피드백 고고"
                    className={`w-full p-3 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-base sm:text-sm resize-none ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                        : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Suggested Tone */}
                  <div>
                    <label htmlFor="modal-tone" className={`text-xs font-bold block mb-1.5 ${
                      isDarkMode ? "text-indigo-200" : "text-slate-600"
                    }`}>
                      기본 권장 어조
                    </label>
                    <select
                      id="modal-tone"
                      value={presetTone}
                      onChange={(e) => setPresetTone(e.target.value as any)}
                      className={`w-full px-3 py-2.5 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 text-sm cursor-pointer ${
                        isDarkMode
                          ? "bg-indigo-900 border-white/10 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-800"
                      }`}
                    >
                      <option value="polite">정중하게</option>
                      <option value="friendly">친근하게</option>
                      <option value="concise">간결하게</option>
                      <option value="confident">자신있게</option>
                      <option value="soft">부드러운 거절</option>
                    </select>
                  </div>

                  {/* Suggested Format */}
                  <div>
                    <label htmlFor="modal-format" className={`text-xs font-bold block mb-1.5 ${
                      isDarkMode ? "text-indigo-200" : "text-slate-600"
                    }`}>
                      기본 결과 포맷
                    </label>
                    <select
                      id="modal-format"
                      value={presetFormat}
                      onChange={(e) => setPresetFormat(e.target.value as any)}
                      className={`w-full px-3 py-2.5 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 text-sm cursor-pointer ${
                        isDarkMode
                          ? "bg-indigo-900 border-white/10 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-800"
                      }`}
                    >
                      <option value="messenger">메신저</option>
                      <option value="email">이메일 형식</option>
                      <option value="document">보고서/문서</option>
                    </select>
                  </div>
                </div>

                {/* Suggested Context */}
                <div>
                  <label htmlFor="modal-context" className={`text-xs font-bold block mb-1.5 ${
                    isDarkMode ? "text-indigo-200" : "text-slate-600"
                  }`}>
                    추가 권장 맥락 (선택)
                  </label>
                  <input
                    id="modal-context"
                    type="text"
                    value={presetContext}
                    onChange={(e) => setPresetContext(e.target.value)}
                    placeholder="예) 마감 지키라는 내용 강조, 부드러운 분위기 유지"
                    className={`w-full px-3 py-2.5 border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 text-base sm:text-sm ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 text-white placeholder-white/20"
                        : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                    }`}
                  />
                </div>
              </div>

              {/* Modal Error */}
              {modalError && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className={`flex items-center justify-end gap-2.5 pt-3 border-t ${
                isDarkMode ? "border-white/10" : "border-slate-100"
              }`}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                    isDarkMode
                      ? "border-white/10 hover:bg-white/10"
                      : "border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  취소
                </button>
                <button
                  onClick={handleSavePreset}
                  className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm font-bold shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5 text-white"
                >
                  <Check className="w-4 h-4" />
                  <span>상황 저장</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* iOS Installation Guide Modal */}
      <AnimatePresence>
        {showIOSInstallGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIOSInstallGuide(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`w-full max-w-md p-6 rounded-3xl shadow-2xl relative z-10 border flex flex-col gap-4 overflow-hidden ${
                isDarkMode
                  ? "bg-slate-900 border-white/10 text-white"
                  : "bg-white border-slate-200 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-slate-200/40">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Download className={`w-5 h-5 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`} />
                  <span>iOS 홈 화면에 추가 방법</span>
                </h3>
                <button
                  onClick={() => setShowIOSInstallGuide(false)}
                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                    isDarkMode ? "hover:bg-white/10 text-indigo-200 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 py-2">
                <p className={`text-xs ${isDarkMode ? "text-indigo-200/70" : "text-slate-500"}`}>
                  Safari 브라우저에서 아래 가이드를 따라 3초 만에 홈 화면에 간편히 추가할 수 있습니다.
                </p>

                <div className="space-y-3.5">
                  <div className={`p-3 rounded-2xl border flex items-start gap-3 ${
                    isDarkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                  }`}>
                    <div className="w-6 h-6 rounded-full bg-indigo-600/15 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">1</div>
                    <div className="text-xs sm:text-sm leading-relaxed">
                      Safari 브라우저 하단 툴바의 <span className="font-bold text-indigo-500 inline-flex items-center gap-0.5 bg-indigo-500/10 px-1.5 py-0.5 rounded-md"><Share className="w-3.5 h-3.5" /> 공유</span> 버튼을 터치합니다.
                    </div>
                  </div>

                  <div className={`p-3 rounded-2xl border flex items-start gap-3 ${
                    isDarkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                  }`}>
                    <div className="w-6 h-6 rounded-full bg-indigo-600/15 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">2</div>
                    <div className="text-xs sm:text-sm leading-relaxed">
                      공유 옵션 메뉴를 위로 스크롤하여 <span className="font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">홈 화면에 추가</span> 항목을 터치합니다.
                    </div>
                  </div>

                  <div className={`p-3 rounded-2xl border flex items-start gap-3 ${
                    isDarkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                  }`}>
                    <div className="w-6 h-6 rounded-full bg-indigo-600/15 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">3</div>
                    <div className="text-xs sm:text-sm leading-relaxed">
                      우측 상단의 <span className="font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">추가</span> 버튼을 터치하면 완료됩니다!
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t pt-3 border-slate-200/40">
                <button
                  onClick={() => setShowIOSInstallGuide(false)}
                  className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-xs font-bold transition-all cursor-pointer text-white w-full"
                >
                  확인했습니다
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
