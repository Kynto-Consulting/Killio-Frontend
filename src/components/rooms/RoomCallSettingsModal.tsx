"use client";

import { useEffect, useRef, useState } from "react";
import { 
  Camera, Mic, Speaker, X, Check, 
  Sparkles, Settings, Volume2, VideoOff,
  Monitor, Layout, Tv, Maximize2, Image as ImageIcon, Plus, Trash2
} from "lucide-react";
import type { VideoFilter } from "@/hooks/use-room-call";
import { getFilterStyle } from "./RoomCallEffectsPanel";
import { VideoEffectsProcessor } from "@/lib/video-effects-processor";

interface Device {
  deviceId: string;
  label: string;
}

const LOCAL_STORAGE_KEY = "kynto_custom_call_backgrounds";

interface RoomCallSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilter: VideoFilter;
  onSetFilter: (filter: VideoFilter) => void;
  backgroundBlur: number;
  onSetBackgroundBlur: (val: number) => void;
  skinSmooth: number;
  onSetSkinSmooth: (val: number) => void;
  backgroundRemoval: boolean;
  onSetBackgroundRemoval: (val: boolean) => void;
  virtualBackgroundUrl: string | undefined;
  onSetVirtualBackgroundUrl: (url: string | undefined) => void;
  backgroundColor: string | undefined;
  onSetBackgroundColor: (color: string | undefined) => void;
  currentVideoDeviceId: string | null;
  onSwitchCamera: (deviceId: string) => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  localStream: MediaStream | null;
  t: (key: string) => string;
}

const ALL_EFFECTS: { id: VideoFilter; name: string; icon: string }[] = [
  { id: "none",      name: "None",      icon: "✕" },
  { id: "blur",      name: "Blur",      icon: "🌫️" },
  { id: "grayscale", name: "Mono",      icon: "⬛" },
  { id: "warm",      name: "Warm",      icon: "🌅" },
  { id: "cool",      name: "Cool",      icon: "🧊" },
  { id: "sepia",     name: "Sepia",     icon: "🟤" },
  { id: "vivid",     name: "Vivid",     icon: "🎨" },
  { id: "neon",      name: "Neon",      icon: "🟢" },
  { id: "vintage",   name: "Vintage",   icon: "🎞️" },
  { id: "noir",      name: "Noir",      icon: "🕵️" },
  { id: "vaporwave", name: "Vapor",     icon: "🌌" },
  { id: "glow",      name: "Glow",      icon: "✨" },
];

export function RoomCallSettingsModal({
  isOpen,
  onClose,
  currentFilter,
  onSetFilter,
  backgroundBlur,
  onSetBackgroundBlur,
  skinSmooth,
  onSetSkinSmooth,
  backgroundRemoval,
  onSetBackgroundRemoval,
  virtualBackgroundUrl,
  onSetVirtualBackgroundUrl,
  backgroundColor,
  onSetBackgroundColor,
  currentVideoDeviceId,
  onSwitchCamera,
  isAudioMuted,
  onToggleAudio,
  localStream,
  t,
}: RoomCallSettingsModalProps) {
  const [videoDevices, setVideoDevices] = useState<Device[]>([]);
  const [audioDevices, setAudioDevices] = useState<Device[]>([]);
  const [previewFilter, setPreviewFilter] = useState<VideoFilter>(currentFilter);
  const [previewBlur, setPreviewBlur] = useState(backgroundBlur);
  const [previewSmooth, setPreviewSmooth] = useState(skinSmooth);
  const [previewRemoval, setPreviewRemoval] = useState(backgroundRemoval);
  const [previewBgUrl, setPreviewBgUrl] = useState(virtualBackgroundUrl);
  const [previewBgColor, setPreviewBgColor] = useState(backgroundColor);
  const [customBgs, setCustomBgs] = useState<{ id: string; url: string }[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectsProcessor = useRef<VideoEffectsProcessor | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Load devices
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setVideoDevices(devices.filter(d => d.kind === "videoinput").map(d => ({ deviceId: d.deviceId, label: d.label || "Camera" })));
      setAudioDevices(devices.filter(d => d.kind === "audioinput").map(d => ({ deviceId: d.deviceId, label: d.label || "Microphone" })));
    });

    // Load custom backgrounds from localStorage
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try { setCustomBgs(JSON.parse(saved)); } catch (e) { console.error(e); }
    }

    // Start audio meter
    if (localStream && !isAudioMuted) {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg);
        rafRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        audioCtx.close();
      };
    }
  }, [isOpen, localStream, isAudioMuted]);

  useEffect(() => {
    if (!isOpen || !videoRef.current || !canvasRef.current || !localStream) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    video.srcObject = localStream;
    
    if (!effectsProcessor.current) {
      effectsProcessor.current = new VideoEffectsProcessor();
    }
    
    const draw = async () => {
      if (video.videoWidth > 0) {
        const processedCanvas = await effectsProcessor.current?.processFrame(video, {
          filter: getFilterStyle(previewFilter),
          backgroundBlur: previewBlur,
          backgroundRemoval: previewRemoval,
          virtualBackgroundUrl: previewBgUrl,
          backgroundColor: previewBgColor,
          skinSmooth: previewSmooth,
        });

        if (processedCanvas) {
          canvas.width = processedCanvas.width;
          canvas.height = processedCanvas.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(processedCanvas, 0, 0);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      effectsProcessor.current?.dispose();
      effectsProcessor.current = null;
    };
  }, [isOpen, previewFilter, previewBlur, previewSmooth, previewRemoval, previewBgUrl, previewBgColor, localStream]);

  const BG_COLORS = ["#000000", "#1a1a1a", "#2e1065", "#064e3b", "#701a75", "#450a0a"];
  const VIRTUAL_BGS = [
    { id: "office", url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=400&h=225&q=80", label: "Office" },
    { id: "nature", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=400&h=225&q=80", label: "Nature" },
    { id: "abstract", url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=400&h=225&q=80", label: "Abstract" },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const newBg = { id: `custom_${Date.now()}`, url };
      const updated = [newBg, ...customBgs].slice(0, 5); // Limit to 5 custom bgs
      setCustomBgs(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      setPreviewBgUrl(url);
      setPreviewBgColor(undefined);
    };
    reader.readAsDataURL(file);
  };

  const removeCustomBg = (id: string) => {
    const updated = customBgs.filter(b => b.id !== id);
    setCustomBgs(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    if (previewBgUrl && customBgs.find(b => b.id === id)?.url === previewBgUrl) {
      setPreviewBgUrl(undefined);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center text-violet-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-none">{t("call.settings.title")}</h2>
              <p className="text-xs text-zinc-500 mt-1">{t("call.settings.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          {/* Left: Preview & Devices */}
          <div className="flex-1 space-y-6">
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-inner group">
              <canvas ref={canvasRef} className="w-full h-full object-cover" />
              <video ref={videoRef} autoPlay muted playsInline className="hidden" />
              
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white/90 border border-white/10">
                  Preview: {previewFilter.charAt(0).toUpperCase() + previewFilter.slice(1)}
                </div>
                {isAudioMuted ? (
                  <div className="bg-red-500/20 border border-red-500/50 p-2 rounded-full text-red-400">
                    <Mic className="w-4 h-4 opacity-50" />
                  </div>
                ) : (
                  <div className="bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 overflow-hidden w-8 h-8 flex items-end">
                    <div className="w-full bg-green-500 transition-all duration-75" style={{ height: `${Math.min(100, (audioLevel / 128) * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>

            {/* Device Selectors */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5" /> {t("call.settings.camera")}
                </label>
                <div className="grid gap-2">
                  {videoDevices.map(device => (
                    <button
                      key={device.deviceId}
                      onClick={() => onSwitchCamera(device.deviceId)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                        currentVideoDeviceId === device.deviceId || (currentVideoDeviceId === null && device.label.toLowerCase().includes("default"))
                        ? "border-violet-600 bg-violet-600/10 text-white"
                        : "border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-sm truncate">{device.label}</span>
                      {currentVideoDeviceId === device.deviceId && <Check className="w-4 h-4 text-violet-500" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1 flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5" /> {t("call.settings.microphone")}
                </label>
                <div className="grid gap-2">
                  {audioDevices.map(device => (
                    <button
                      key={device.deviceId}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700 transition-all"
                    >
                      <span className="text-sm truncate">{device.label}</span>
                      <Volume2 className="w-4 h-4 opacity-40" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Effects Grid */}
          <div className="w-full md:w-80 flex flex-col gap-6">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> {t("call.settings.videoEffects")}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {ALL_EFFECTS.map(effect => (
                  <button
                    key={effect.id}
                    onClick={() => setPreviewFilter(effect.id)}
                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                      previewFilter === effect.id
                      ? "border-violet-600 bg-violet-600/10"
                      : "border-zinc-800 bg-zinc-800/30 hover:border-zinc-700"
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center text-lg shadow-lg group-hover:scale-110 transition-transform"
                      style={{ filter: getFilterStyle(effect.id) }}
                    >
                      {effect.id === "none" ? <X className="w-4 h-4 text-white/50" /> : effect.icon}
                    </div>
                    <span className={`text-[10px] font-bold ${previewFilter === effect.id ? "text-violet-400" : "text-zinc-500"}`}>
                      {effect.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Background Control */}
            <div className="space-y-4 bg-zinc-800/20 rounded-2xl p-4 border border-zinc-800/50">
               <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                     <Layout className="w-3.5 h-3.5" /> Background Mode
                  </label>
                  <button 
                    onClick={() => setPreviewRemoval(!previewRemoval)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
                      previewRemoval ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {previewRemoval ? "Enabled" : "Disabled"}
                  </button>
               </div>

               {previewRemoval && (
                 <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Colors */}
                    <div className="flex flex-wrap gap-2">
                       <button 
                         onClick={() => { setPreviewBgUrl(undefined); setPreviewBgColor(undefined); }}
                         className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${!previewBgUrl && !previewBgColor ? "border-violet-500" : "border-transparent"}`}
                       >
                         <VideoOff className="w-3 h-3 text-zinc-500" />
                       </button>
                       {BG_COLORS.map(color => (
                         <button
                           key={color}
                           onClick={() => { setPreviewBgUrl(undefined); setPreviewBgColor(color); }}
                           style={{ backgroundColor: color }}
                           className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${previewBgColor === color ? "border-white" : "border-transparent"}`}
                         />
                       ))}
                    </div>

                    {/* Virtual BGs & Custom */}
                    <div className="grid grid-cols-4 gap-2">
                       <button
                         onClick={() => fileInputRef.current?.click()}
                         className="aspect-video rounded-lg border-2 border-dashed border-zinc-700 hover:border-violet-500 flex flex-col items-center justify-center text-zinc-500 hover:text-violet-400 transition-all bg-zinc-800/40"
                       >
                         <Plus className="w-4 h-4" />
                         <span className="text-[8px] font-bold mt-1">Upload</span>
                       </button>
                       <input 
                         type="file" ref={fileInputRef} className="hidden" 
                         accept="image/*" onChange={handleFileUpload} 
                       />

                       {customBgs.map(bg => (
                         <div key={bg.id} className="relative group/bg aspect-video">
                           <button
                             onClick={() => { setPreviewBgUrl(bg.url); setPreviewBgColor(undefined); }}
                             className={`w-full h-full rounded-lg overflow-hidden border-2 transition-all ${previewBgUrl === bg.url ? "border-violet-500" : "border-transparent"}`}
                           >
                             <img src={bg.url} alt="Custom" className="w-full h-full object-cover" />
                           </button>
                           <button 
                             onClick={(e) => { e.stopPropagation(); removeCustomBg(bg.id); }}
                             className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover/bg:opacity-100 transition-opacity shadow-lg"
                           >
                             <Trash2 className="w-3 h-3 text-white" />
                           </button>
                         </div>
                       ))}

                       {VIRTUAL_BGS.map(bg => (
                         <button
                           key={bg.id}
                           onClick={() => { setPreviewBgUrl(bg.url); setPreviewBgColor(undefined); }}
                           className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${previewBgUrl === bg.url ? "border-violet-500" : "border-transparent"}`}
                         >
                           <img src={bg.url} alt={bg.label} className="w-full h-full object-cover" />
                         </button>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            {/* GPU Sliders */}
            <div className="space-y-4 bg-zinc-800/20 rounded-2xl p-4 border border-zinc-800/50">
               <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                       <Tv className="w-3.5 h-3.5" /> Background Blur
                    </label>
                    <span className="text-[10px] font-mono text-violet-400">{previewBlur}px</span>
                  </div>
                  <input 
                    type="range" min="0" max="20" step="1"
                    value={previewBlur}
                    onChange={(e) => setPreviewBlur(parseInt(e.target.value))}
                    className="w-full accent-violet-500 bg-zinc-700 rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
               </div>

               <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                       <Sparkles className="w-3.5 h-3.5 text-pink-400" /> Skin Smoothing
                    </label>
                    <span className="text-[10px] font-mono text-pink-400">{previewSmooth}</span>
                  </div>
                  <input 
                    type="range" min="0" max="10" step="1"
                    value={previewSmooth}
                    onChange={(e) => setPreviewSmooth(parseInt(e.target.value))}
                    className="w-full accent-pink-500 bg-zinc-700 rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
               </div>
            </div>

            <div className="mt-auto pt-6 border-t border-zinc-800 space-y-3">
              <button
                onClick={() => { 
                  onSetFilter(previewFilter); 
                  onSetBackgroundBlur(previewBlur);
                  onSetSkinSmooth(previewSmooth);
                  onSetBackgroundRemoval(previewRemoval);
                  onSetVirtualBackgroundUrl(previewBgUrl);
                  onSetBackgroundColor(previewBgColor);
                  onClose(); 
                }}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-violet-600/20 active:scale-[0.98]"
              >
                {t("call.settings.applyChanges")}
              </button>
              <button
                onClick={onClose}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-3 rounded-xl transition-all active:scale-[0.98]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
