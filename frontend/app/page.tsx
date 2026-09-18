'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const InteractiveMap = dynamic(() => import('./components/InteractiveMap'), {
    ssr: false,
    loading: () => <div className="h-full bg-slate-900 flex items-center justify-center text-xs text-slate-500">Loading Map Canvas...</div>
});

export default function SatQueryDashboard() {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'copilot' | 'change' | 'fusion' | 'geo' | 'reports'>('dashboard');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [file, setFile] = useState<File | null>(null);
    const [filePath, setFilePath] = useState<string>('');
    const [comparisonFile, setComparisonFile] = useState<File | null>(null);
    const [comparisonFilePath, setComparisonFilePath] = useState<string>('');
    const [analysisMetadata, setAnalysisMetadata] = useState<Record<string, unknown> | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [selectedCoords, setSelectedCoords] = useState<[number, number]>([13.0827, 80.2707]);
    const [locationName, setLocationName] = useState<string>("ISTRAC / ISRO HQ, Bengaluru");

    const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user', text: string }>>([
        { role: 'ai', text: 'Upload a GeoTIFF, PNG, JPG, or JPEG satellite image to inspect its pixels, bands, indices, and candidate regions.' }
    ]);
    const [inputMessage, setInputMessage] = useState<string>('');

    const [epoch1, setEpoch1] = useState<string>("2020-01 Baseline (Landsat-8)");
    const [epoch2, setEpoch2] = useState<string>("2026-09 Current (Cartosat-3)");
    const [changeResult, setChangeResult] = useState<string | null>(null);
    const [changeReport, setChangeReport] = useState<Record<string, unknown> | null>(null);
    const [changeLoading, setChangeLoading] = useState(false);
    const [changePreview, setChangePreview] = useState<string | null>(null);
    const [fusionResult, setFusionResult] = useState<string | null>(null);
    const [fusionReport, setFusionReport] = useState<Record<string, unknown> | null>(null);
    const [fusionPreview, setFusionPreview] = useState<string | null>(null);
    const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [aiEnabled, setAiEnabled] = useState(false);

    useEffect(() => {
        let mounted = true;
        const checkBackend = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/health`);
                const data = await response.json();
                if (mounted) {
                    setBackendStatus(response.ok ? 'online' : 'offline');
                    setAiEnabled(Boolean(data.ai_enabled));
                }
            } catch {
                if (mounted) setBackendStatus('offline');
            }
        };
        checkBackend();
        return () => { mounted = false; };
    }, []);

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    const handleUpload = async (uploadedFile: File, redirectToCopilot = true) => {
        setFile(uploadedFile);
        setUploadError(null);

        const formData = new FormData();
        formData.append('file', uploadedFile);

        try {
            const res = await fetch(`${API_BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Upload failed');
            setFilePath(data.path || uploadedFile.name);
            setAnalysisMetadata(data.metadata);
            setMessages(prev => [
                ...prev,
                { role: 'user', text: `[Uploaded Raster Scene: ${uploadedFile.name}]` },
                { role: 'ai', text: `Satellite image analyzed: ${data.metadata.width}x${data.metadata.height} pixels, ${data.metadata.bands} bands, mean NDVI ${data.metadata.ndvi_mean ?? 'unavailable'}, and ${data.metadata.detected_objects} candidate regions detected.` }
            ]);
            if (redirectToCopilot) setActiveTab('copilot');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setFile(null);
            setUploadError(message);
            setMessages(prev => [...prev, { role: 'ai', text: `Image upload failed: ${message}` }]);
            return;
        }
    };

    const handleComparisonUpload = async (uploadedFile: File) => {
        setComparisonFile(uploadedFile);
        setUploadError(null);
        const formData = new FormData();
        formData.append('file', uploadedFile);
        try {
            const res = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Comparison upload failed');
            setComparisonFilePath(data.path);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Comparison upload failed';
            setComparisonFile(null);
            setUploadError(message);
            setMessages(prev => [...prev, { role: 'ai', text: `Comparison image upload failed: ${message}` }]);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        handleUpload(e.target.files[0]);
    };

    const handleBaselineFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        handleUpload(e.target.files[0], false);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputMessage.trim()) return;

        const newMsg = inputMessage.trim();
        setMessages(prev => [...prev, { role: 'user', text: newMsg }]);
        setInputMessage('');

        setMessages(prev => [...prev, { role: 'ai', text: '⚡ Routing query through VLM & Raster Analysis engine...' }]);

        try {
            const res = await fetch(`${API_BASE_URL}/api/copilot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: newMsg, location: locationName, image_path: filePath || null })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Copilot request failed');

            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: data.response };
                return updated;
            });
        } catch (err) {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: err instanceof Error ? err.message : 'Analysis failed.' };
                return updated;
            });
        }
    };

    const runChangeDetection = async () => {
        if (!filePath || !comparisonFilePath) {
            setChangeResult('Upload both a baseline and comparison satellite image before running change detection.');
            return;
        }
        setChangeLoading(true);
        setChangeResult('Comparing valid pixels and extracting changed regions...');
        setChangePreview(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/change-detection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ epoch1, epoch2, location: locationName, baseline_path: filePath, comparison_path: comparisonFilePath })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Change detection failed');
            setChangeReport({ ...data, summary: `Analysis complete for ${locationName}:\nChanged pixels: ${data.change_percent}%\nValid pixels: ${data.valid_pixels}\nDifference threshold: ${data.difference_threshold}\nMethod: ${data.method}` });
            setChangePreview(data.preview_data_url || null);
            setChangeResult(`Analysis complete for ${locationName}:\n• Changed pixels: ${data.change_percent}%\n• Valid pixels: ${data.valid_pixels}\n• Difference threshold: ${data.difference_threshold}\n• Method: ${data.method}`);
        } catch (err) {
            setChangeResult(err instanceof Error ? err.message : 'Change detection failed');
        } finally {
            setChangeLoading(false);
        }
    };

    const runFusion = async () => {
        if (!filePath || !comparisonFilePath) {
            setFusionResult('Upload an optical scene and a radar scene before running fusion.');
            return;
        }
        setFusionResult('Normalizing overlapping pixels and calculating fused response...');
        setFusionPreview(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/fusion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ optical_path: filePath, radar_path: comparisonFilePath })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Fusion failed');
            setFusionReport({ ...data, summary: `Fusion complete:\nValid overlapping pixels: ${data.valid_pixels}\nFused mean response: ${data.fused_mean}\nHigh-response area: ${data.high_response_percent}%\nMethod: ${data.method}` });
            setFusionPreview(data.preview_data_url || null);
            setFusionResult(`Fusion complete:\n• Valid overlapping pixels: ${data.valid_pixels}\n• Fused mean response: ${data.fused_mean}\n• High-response area: ${data.high_response_percent}%\n• Method: ${data.method}`);
        } catch (err) {
            setFusionResult(err instanceof Error ? err.message : 'Fusion failed');
        }
    };

    const exportReport = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ generated_at: new Date().toISOString(), location: locationName, coordinates: selectedCoords, messages, scene: analysisMetadata, change_detection: changeReport, fusion: fusionReport })
            });
            if (!res.ok) throw new Error('Report generation failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'satquery-intelligence-report.pdf';
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Report generation failed');
        }
    };

    return (
        <div className={`${theme === 'dark' ? 'dark' : ''} min-h-screen`}>
            <div className="min-h-screen bg-slate-100 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300 overflow-hidden">

                {/* TOP HEADER BAR */}
                <div className="bg-slate-200 dark:bg-[#04060b] border-b border-slate-300 dark:border-slate-800/80 px-4 py-2 text-xs font-mono text-slate-600 dark:text-slate-400 flex justify-between items-center z-30">
                    <div className="flex items-center space-x-3">
                        <span className="font-bold text-slate-800 dark:text-slate-200">SatQuery AI</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-500">Command Center Dashboard</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleTheme}
                            className="bg-slate-300 dark:bg-slate-900 text-slate-800 dark:text-amber-400 px-3 py-1 rounded border border-slate-400 dark:border-slate-700 font-bold transition hover:opacity-80 text-[11px]"
                        >
                            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                        </button>
                        <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-3 py-1 rounded text-[11px] font-medium">
                            {backendStatus === 'online' ? '● Live Analysis' : backendStatus === 'offline' ? '● API Offline' : '● Connecting'}
                        </span>
                            <span className={`${backendStatus === 'online' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800' : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800'} border px-3 py-1 rounded flex items-center gap-2 font-medium text-[11px]`}>
                            <span className={`w-2 h-2 rounded-full ${backendStatus === 'online' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`}></span>
                            {backendStatus === 'online' ? 'Analysis API Online' : backendStatus === 'offline' ? 'Analysis API Offline' : 'Connecting to API'}
                        </span>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">

                    {/* SIDEBAR */}
                    <aside className="w-72 bg-white dark:bg-[#0c1222] border-r border-slate-300 dark:border-slate-800/80 flex flex-col justify-between p-4 shadow-xl z-20">
                        <div>
                            <div className="flex items-center space-x-3 mb-6 px-2 pt-2">
                                <div className="bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/40 p-2.5 rounded-xl text-amber-600 dark:text-amber-400 shadow-inner">
                                    🛰️
                                </div>
                                <div>
                                    <h1 className="text-sm font-black tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                        SatQuery AI <span className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[9px] px-1 py-0.5 rounded border border-amber-300 dark:border-amber-800 font-mono">EO AI</span>
                                    </h1>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Earth Observation Intelligence</p>
                                </div>
                            </div>

                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 mb-3">Platform</p>

                            <nav className="space-y-1.5">
                                {[
                                    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
                                    { id: 'copilot', label: 'SatQuery Copilot', icon: '🤖', badge: 'AI' },
                                    { id: 'change', label: 'Change Intelligence', icon: '🔄' },
                                    { id: 'fusion', label: 'Multimodal Fusion', icon: '🥞' },
                                    { id: 'geo', label: 'Geo Intelligence', icon: '🗺️', badge: 'GIS' },
                                    { id: 'reports', label: 'Intelligence Reports', icon: '📄' },
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as any)}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${activeTab === item.id
                                                ? 'bg-amber-500/10 dark:bg-gradient-to-r dark:from-amber-500/20 dark:to-amber-600/10 text-amber-600 dark:text-amber-400 border border-amber-500/40 shadow-sm'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <span className="text-sm">{item.icon}</span>
                                            <span>{item.label}</span>
                                        </div>
                                        {item.badge && (
                                            <span className="text-[9px] bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-mono">
                                                {item.badge}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="bg-slate-100 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800/80 p-3.5 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sensor Downlink</span>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            </div>
                            <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400/90 truncate">Sentinel-1/2 • Cartosat-3 • BigEarthNet</p>
                        </div>
                    </aside>

                    {/* MAIN VIEWPORT */}
                    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#070b14]">
                        <div className="flex-1 p-6 overflow-y-auto space-y-6">

                            {/* DASHBOARD TAB */}
                            {activeTab === 'dashboard' && (
                                <div className="space-y-6">
                                    <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-3.5 rounded-xl flex flex-wrap items-center justify-between text-xs shadow-md">
                                        <div className="flex items-center space-x-3">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">ISTRAC Ground Station Network</span>
                                            <span className="text-slate-400">|</span>
                                            <span className="text-slate-600 dark:text-slate-400">Bengaluru Master Control & Shadnagar Earth Station (NRSC)</span>
                                        </div>
                                        <div className="flex items-center space-x-4 font-mono text-[11px]">
                                            <span className="text-slate-500">2026/09/04 00:28:46 UTC</span>
                                            <span className="text-amber-600 dark:text-amber-400 font-bold">Active: Cartosat-3 (Pass in Progress)</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <div className="lg:col-span-2 bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col h-[480px] relative">
                                            <div className="flex justify-between items-center mb-3 z-10 bg-slate-100 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-300 dark:border-slate-800">
                                                <div className="flex space-x-2 text-xs">
                                                    <span className="bg-amber-600 text-white px-2.5 py-1 rounded font-medium">Satellite Canvas</span>
                                                    <span className="bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 px-2.5 py-1 rounded">Interactive Mode</span>
                                                </div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                                                    Lat: {selectedCoords[0].toFixed(4)} | Lng: {selectedCoords[1].toFixed(4)}
                                                </div>
                                            </div>
                                            <div className="flex-1 rounded-xl overflow-hidden relative">
                                                <InteractiveMap
                                                    theme={theme}
                                                    position={selectedCoords}
                                                    onLocationSelect={(lat, lng, name) => {
                                                        setSelectedCoords([lat, lng]);
                                                        setLocationName(name);
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between h-[480px]">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Satellite Mission Dossier</h3>
                                                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[10px] px-2 py-0.5 rounded-full">{analysisMetadata ? 'Scene analyzed' : 'Awaiting scene'}</span>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                                    <div className="flex justify-between"><span className="text-slate-500">Payload:</span><span className="text-slate-800 dark:text-slate-200">{analysisMetadata ? `${String(analysisMetadata.bands)} raster band(s)` : 'No scene loaded'}</span></div>
                                                    <div className="flex justify-between"><span className="text-slate-500">Raster size:</span><span className="text-slate-800 dark:text-slate-200">{analysisMetadata ? `${String(analysisMetadata.width)} x ${String(analysisMetadata.height)} px` : 'Upload to inspect'}</span></div>
                                                    <div className="flex justify-between"><span className="text-slate-500">Active Zone:</span><span className="text-amber-600 dark:text-amber-400 font-mono text-[11px] truncate max-w-[170px]" title={locationName}>{locationName}</span></div>
                                                    <div className="flex justify-between"><span className="text-slate-500">Target Coordinates:</span><span className="text-slate-800 dark:text-slate-200 font-mono">{selectedCoords[0]}°N, {selectedCoords[1]}°E</span></div>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                                    <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Ingest Satellite Image</h4>
                                                    <input type="file" onChange={handleFileInputChange} className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer" />
                                                    {file && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono truncate">✔ Loaded: {file.name}</p>}
                                                    {analysisMetadata && <p className="text-[10px] text-slate-500 font-mono">{String(analysisMetadata.width)}x{String(analysisMetadata.height)} px • {String(analysisMetadata.bands)} bands • {String(analysisMetadata.detected_objects)} detections</p>}
                                                    {analysisMetadata && <div className="mt-2 border-t border-slate-200 dark:border-slate-800 pt-2 text-[10px] text-slate-600 dark:text-slate-400 space-y-1"><p className="font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Scene Summary</p><p>Band 1 mean: {String(analysisMetadata.mean_value)} • range: {String(analysisMetadata.min_value)}–{String(analysisMetadata.max_value)}</p><p>NDVI: {String(analysisMetadata.ndvi_mean ?? 'Unavailable for this image')}</p><p>CRS: {String(analysisMetadata.crs ?? 'Not embedded')}</p></div>}
                                                    {uploadError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{uploadError}</p>}
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">SatQuery AI • Earth Observation Intelligence</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* COPILOT TAB */}
                            {activeTab === 'copilot' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl shadow-xl flex h-[calc(100vh-140px)] overflow-hidden">
                                    <div className="w-80 bg-slate-50 dark:bg-[#080d1a] border-r border-slate-200 dark:border-slate-800/80 p-4 flex flex-col justify-between">
                                        <div className="space-y-4">
                                            <button onClick={() => setMessages([{ role: 'ai', text: 'New query session initiated. Ask any satellite question or upload a new scene.' }])} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
                                                <span>+ New Query</span>
                                            </button>
                                            <input type="text" placeholder="Search conversations..." className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500" />
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">Saved Conversations (1)</p>
                                                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-3 py-2.5 rounded-xl text-xs font-medium truncate cursor-pointer">
                                                    {file ? `Analysis of ${file.name}` : 'ISRO Operational Telemetry Analysis'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 space-y-1"><p>Auto-saved to Local Storage</p><p className="text-emerald-500 font-mono">● Live</p></div>
                                    </div>

                                    <div className="flex-1 flex flex-col bg-white dark:bg-[#0c1222]">
                                        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#090e1c]">
                                            <div className="flex items-center space-x-2 text-xs font-mono text-slate-500"><span>SatQuery</span><span>/</span><span className="text-amber-600 dark:text-amber-400 font-bold">SatQuery Copilot (AI)</span></div>
                                            <div className="flex items-center space-x-2">
                                                <span className={`${aiEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'} border text-[10px] px-2.5 py-1 rounded-full font-mono`}>{aiEnabled ? '🟢 Gemini VLM Connected' : '🟡 Local Raster Agent'}</span>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                            {messages.map((msg, index) => (
                                                <div key={index} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                                    <div className={`${msg.role === 'user' ? 'bg-slate-700 text-white' : 'bg-amber-600 text-white'} rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0`}>
                                                        {msg.role === 'user' ? 'U' : 'AI'}
                                                    </div>
                                                    <div className={`p-4 rounded-2xl text-xs max-w-xl leading-relaxed whitespace-pre-line ${msg.role === 'user' ? 'bg-amber-600/10 border border-amber-600/30 text-slate-800 dark:text-slate-100' : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'}`}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#090e1c]">
                                            <form onSubmit={handleSendMessage} className="relative bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl p-2.5 shadow-inner flex items-center">
                                                <div className="flex items-center space-x-2 px-2 border-r border-slate-200 dark:border-slate-800 mr-2 text-slate-400">
                                                    <label className="cursor-pointer hover:text-amber-500 transition text-sm flex items-center gap-1" title="Upload satellite image">
                                                        📎<input type="file" onChange={handleFileInputChange} className="hidden" />
                                                    </label>
                                                    <span className="text-xs font-mono text-slate-500 flex items-center gap-1"><span>🖼️</span> {file ? file.name : 'Sample Scene'}</span>
                                                </div>
                                                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder="Ask any satellite question, analyze land-use, or say hello..." className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none px-2" />
                                                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white w-8 h-8 rounded-xl flex items-center justify-center font-bold transition shadow ml-2">↑</button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CHANGE INTELLIGENCE TAB */}
                            {activeTab === 'change' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-8 rounded-2xl shadow-xl space-y-6 max-w-4xl mx-auto">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Multi-Temporal Change Intelligence</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Compare satellite rasters across two different epochs with automated mask difference and pixel classification.</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><label className="text-xs font-mono text-slate-500">Baseline Epoch (Epoch 1)</label><select value={epoch1} onChange={(e) => setEpoch1(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-3 rounded-xl text-xs text-slate-800 dark:text-slate-200"><option>2020-01 Baseline (Landsat-8)</option><option>2015-06 Baseline (Cartosat-2)</option></select></div>
                                        <div className="space-y-2"><label className="text-xs font-mono text-slate-500">Comparison Epoch (Epoch 2)</label><select value={epoch2} onChange={(e) => setEpoch2(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-3 rounded-xl text-xs text-slate-800 dark:text-slate-200"><option>2026-09 Current (Cartosat-3)</option><option>2024-12 Current (Sentinel-2)</option></select></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        <label className="space-y-2 text-slate-500">Baseline scene (use the dashboard upload first)
                                            <input type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" onChange={handleBaselineFileChange} className="block w-full mt-2 text-[11px] file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-slate-700 file:text-white" />
                                            {file && <span className="block text-emerald-500 truncate">{file.name}</span>}
                                        </label>
                                        <label className="space-y-2 text-slate-500">Comparison scene
                                            <input type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" onChange={(e) => e.target.files?.[0] && handleComparisonUpload(e.target.files[0])} className="block w-full mt-2 text-[11px] file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-slate-700 file:text-white" />
                                            {comparisonFile && <span className="block text-emerald-500 truncate">{comparisonFile.name}</span>}
                                        </label>
                                    </div>
                                    <button onClick={runChangeDetection} disabled={changeLoading} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-xs font-bold transition shadow">{changeLoading ? 'Comparing scenes...' : 'Run Automated Change Detection →'}</button>
                                    {changeResult && <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-emerald-600 dark:text-emerald-400 whitespace-pre-line">{changeResult}</div>}
                                    {changePreview && <div className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Change Mask Preview</h4><div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950"><img src={changePreview} alt="Change detection preview with changed pixels highlighted in red" className="block w-full max-h-[420px] object-contain" /></div><p className="text-[10px] text-slate-500">Red pixels indicate the highest absolute band-1 differences between the two uploaded scenes.</p></div>}
                                </div>
                            )}

                            {/* MULTIMODAL FUSION TAB */}
                            {activeTab === 'fusion' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-8 rounded-2xl shadow-xl space-y-6 max-w-4xl mx-auto">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Multimodal Radar & Optical Fusion</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Combine optical VNIR channels with Synthetic Aperture Radar (SAR) backscatter to pierce monsoon clouds and analyze surface moisture.</p>
                                    <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"><p className="text-slate-500">Optical scene</p><p className="text-amber-600 dark:text-amber-400 font-bold truncate">{file?.name ?? 'Not uploaded'}</p></div>
                                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"><p className="text-slate-500">Radar scene</p><p className="text-amber-600 dark:text-amber-400 font-bold truncate">{comparisonFile?.name ?? 'Not uploaded'}</p></div>
                                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"><p className="text-slate-500">Fusion pipeline</p><p className="text-emerald-600 dark:text-emerald-400 font-bold">Pixel-based</p></div>
                                    </div>
                                    <button onClick={runFusion} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl text-xs font-bold transition shadow">Run Optical + Radar Fusion</button>
                                    {fusionResult && <div className="p-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-emerald-600 dark:text-emerald-400 whitespace-pre-line">{fusionResult}</div>}
                                    {fusionPreview && <div className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Fusion Visual Analysis</h4><div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950"><img src={fusionPreview} alt="Optical, radar, fused response panels and fused response histogram" className="block w-full" /></div><p className="text-[10px] text-slate-500">The first two panels are percentile-normalized inputs. The fused panel combines both modalities; the histogram shows fused response distribution.</p></div>}
                                </div>
                            )}

                            {/* GEO INTELLIGENCE TAB */}
                            {activeTab === 'geo' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-8 rounded-2xl shadow-xl space-y-6 max-w-4xl mx-auto">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Geospatial Vector Intelligence (GIS)</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Inspect vector bounding boxes, UTM coordinate zones, and administrative boundaries across India.</p>
                                    <div className="space-y-3 text-xs font-mono">
                                        <div className="flex justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800"><span className="text-slate-500">Active Location:</span><span className="text-amber-600 dark:text-amber-400">{locationName}</span></div>
                                        <div className="flex justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800"><span className="text-slate-500">Latitude / Longitude:</span><span className="text-slate-800 dark:text-slate-200">{selectedCoords[0]}°N, {selectedCoords[1]}°E</span></div>
                                        <div className="flex justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800"><span className="text-slate-500">CRS:</span><span className="text-slate-800 dark:text-slate-200">{String(analysisMetadata?.crs ?? 'Upload a scene')}</span></div>
                                        <div className="flex justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800"><span className="text-slate-500">Bounds:</span><span className="text-slate-800 dark:text-slate-200 truncate max-w-[220px]">{String(analysisMetadata?.bounds ?? 'Unavailable')}</span></div>
                                    </div>
                                </div>
                            )}

                            {/* INTELLIGENCE REPORTS TAB */}
                            {activeTab === 'reports' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-8 rounded-2xl shadow-xl space-y-6 max-w-4xl mx-auto">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Verified Remote Sensing Intelligence Dossiers</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Review verified mission dossiers generated by SatQuery AI for ISRO and Smart India Hackathon evaluation.</p>
                                    <div className="space-y-3">
                                        <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs">
                                            <div><p className="font-bold text-slate-800 dark:text-slate-200">Dossier #SIH-2026-26167: ISTRAC Sector Analysis</p><p className="text-[10px] text-slate-500">Generated via Gemini 2.5 Flash VLM • Cartosat-3 Payload</p></div>
                                            <button onClick={exportReport} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-bold transition">Export PDF dossier →</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}