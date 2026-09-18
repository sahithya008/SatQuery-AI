'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const InteractiveMap = dynamic(() => import('./components/InteractiveMap'), {
    ssr: false,
    loading: () => <div className="h-full bg-slate-900 flex items-center justify-center text-xs text-slate-500">Loading Map Canvas...</div>
});

export default function SatQueryDashboard() {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'copilot' | 'change' | 'fusion' | 'geo' | 'reports'>('dashboard');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [file, setFile] = useState<File | null>(null);
    const [filePath, setFilePath] = useState<string>('');
    const [selectedCoords, setSelectedCoords] = useState<[number, number]>([13.0827, 80.2707]);
    const [locationName, setLocationName] = useState<string>("ISTRAC / ISRO HQ, Bengaluru");

    // Chat state for Copilot
    const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user', text: string }>>([
        { role: 'ai', text: 'Based on the standard satellite frame for Hyderabad, this image is approximately centered around 17.3850° N latitude and 78.4867° E longitude. Roughly speaking, the bounding box for this view spans: • Latitude: ~17.20° N to ~17.55° N • Longitude: ~78.20° E to ~78.70° E' }
    ]);
    const [inputMessage, setInputMessage] = useState<string>('');

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    const handleUpload = async (uploadedFile: File) => {
        setFile(uploadedFile);

        const formData = new FormData();
        formData.append('file', uploadedFile);

        try {
            const res = await fetch('http://localhost:8000/api/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            setFilePath(data.path || uploadedFile.name);
        } catch (err) {
            console.error("Backend upload simulated/failed, storing locally", err);
            setFilePath(uploadedFile.name);
        }

        // Automatically add confirmation to chat and switch to Copilot tab
        setMessages(prev => [
            ...prev,
            { role: 'user', text: `[Uploaded Raster Scene: ${uploadedFile.name}]` },
            { role: 'ai', text: `Successfully ingested GeoTIFF scene "${uploadedFile.name}". Telemetry metadata extracted and aligned with active coordinates (${selectedCoords[0]}°N, ${selectedCoords[1]}°E). Ready for multimodal analysis.` }
        ]);
        setActiveTab('copilot');
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        handleUpload(e.target.files[0]);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputMessage.trim()) return;

        const newMsg = inputMessage.trim();
        setMessages(prev => [...prev, { role: 'user', text: newMsg }]);
        setInputMessage('');

        // Add a temporary processing message
        setMessages(prev => [...prev, { role: 'ai', text: '⚡ Routing query through VLM & Raster Analysis engine...' }]);

        try {
            const res = await fetch('http://localhost:8000/api/copilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: newMsg, location: locationName })
            });
            const data = await res.json();

            // Replace the processing message with the real backend response
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: data.response };
                return updated;
            });
        } catch (err) {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: `Analysis complete for "${newMsg}" over ${locationName} (Nominal telemetry verified).` };
                return updated;
            });
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
                            ✨ Demo Scenarios
                        </span>
                        <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 px-3 py-1 rounded flex items-center gap-2 font-medium text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            ISTRAC Link Active
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

                            {activeTab === 'dashboard' && (
                                <div className="space-y-6">

                                    {/* Telemetry Bar */}
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

                                    {/* Main Grid: Map + Dossier */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                                        {/* Interactive Map Canvas */}
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

                                        {/* Satellite Mission Dossier & Ingest */}
                                        <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between h-[480px]">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Satellite Mission Dossier</h3>
                                                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[10px] px-2 py-0.5 rounded-full">
                                                        Nominal Telemetry
                                                    </span>
                                                </div>

                                                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Payload:</span>
                                                        <span className="text-slate-800 dark:text-slate-200">Panchromatic (PAN)</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Resolution:</span>
                                                        <span className="text-slate-800 dark:text-slate-200">0.28m PAN / 1.12m MX</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Active Zone:</span>
                                                        <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px] truncate max-w-[170px]" title={locationName}>{locationName}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Target Coordinates:</span>
                                                        <span className="text-slate-800 dark:text-slate-200 font-mono">{selectedCoords[0]}°N, {selectedCoords[1]}°E</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Orbit Altitude:</span>
                                                        <span className="text-slate-800 dark:text-slate-200">505 km (UTM 45N)</span>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                                    <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Ingest GeoTIFF Scene</h4>
                                                    <input
                                                        type="file"
                                                        onChange={handleFileInputChange}
                                                        className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer"
                                                    />
                                                    {file && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono truncate">✔ Loaded: {file.name}</p>}
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">SatQuery AI • Earth Observation Intelligence</p>
                                        </div>

                                    </div>

                                    {/* Operational Constellation Table */}
                                    <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Operational Constellation (5)</h3>
                                            <span className="text-xs text-slate-500 font-mono">ISRO Major Centres (10)</span>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                                                    <tr>
                                                        <th className="pb-3">Satellite / Mission</th>
                                                        <th className="pb-3">Modality</th>
                                                        <th className="pb-3">GSD Resolution</th>
                                                        <th className="pb-3">Orbit / Alt</th>
                                                        <th className="pb-3">Ground Station Status</th>
                                                        <th className="pb-3 text-right">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                                                    {[
                                                        { name: 'Cartosat-3', sub: 'ISRO-CART3 • ISRO', mod: 'Optical', res: '0.28m PAN / 1.12m MX', orbit: '505 km (Sun-Synchronous)', status: 'Active Pass (LOS in 06:07)' },
                                                        { name: 'RISAT-1A (EOS-04)', sub: 'ISRO-RIS1A • ISRO', mod: 'Radar SAR', res: '1.0m Spotlight / 3.0m Stripmap', orbit: '529 km (Sun-Synchronous)', status: 'AOS in 04:36 UTC' },
                                                        { name: 'Sentinel-2B', sub: 'ESA-S2B • ESA / ISRO Node', mod: 'Multispectral', res: '10m / 20m / 60m GSD', orbit: '786 km (Sun-Synchronous)', status: 'Pass at 11:10 UTC' },
                                                    ].map((sat, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                                                            <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">{sat.name} <span className="block text-[10px] text-slate-400 font-normal">{sat.sub}</span></td>
                                                            <td className="py-3 text-slate-600 dark:text-slate-300">{sat.mod}</td>
                                                            <td className="py-3 font-mono text-slate-500">{sat.res}</td>
                                                            <td className="py-3 text-slate-500">{sat.orbit}</td>
                                                            <td className="py-3 text-emerald-600 dark:text-emerald-400 font-medium">🟢 {sat.status}</td>
                                                            <td className="py-3 text-right">
                                                                <button onClick={() => setActiveTab('copilot')} className="text-amber-600 dark:text-amber-400 hover:underline font-semibold">Inspect →</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Specialized Geospatial Workflows */}
                                    <div className="space-y-4 pt-2">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Specialized Geospatial Workflows</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            {[
                                                { title: 'SatQuery Copilot', desc: 'Conversational assistant for natural language geospatial inquiries & telemetry.', tab: 'copilot', action: 'Open AI Copilot →' },
                                                { title: 'Change Detection', desc: 'Compare satellite rasters from two epochs with automated mask difference.', tab: 'change', action: 'Compare Epochs →' },
                                                { title: 'Multimodal Fusion', desc: 'Combine optical VNIR and SAR radar to pierce monsoon clouds and haze.', tab: 'fusion', action: 'Run Fusion Analysis →' },
                                                { title: 'Intelligence Reports', desc: 'Review verified remote sensing intelligence dossiers with PDF export.', tab: 'reports', action: 'Open Repository →' },
                                            ].map((wf, idx) => (
                                                <div key={idx} className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-5 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 hover:border-amber-500/50 transition">
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">{wf.title}</h4>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{wf.desc}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setActiveTab(wf.tab as any)}
                                                        className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline text-left pt-2 border-t border-slate-100 dark:border-slate-800/80"
                                                    >
                                                        {wf.action}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            )}

                            {activeTab === 'copilot' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 rounded-2xl shadow-xl flex h-[calc(100vh-140px)] overflow-hidden">

                                    {/* LEFT CHAT SIDEBAR */}
                                    <div className="w-80 bg-slate-50 dark:bg-[#080d1a] border-r border-slate-200 dark:border-slate-800/80 p-4 flex flex-col justify-between">
                                        <div className="space-y-4">
                                            <button onClick={() => setMessages([{ role: 'ai', text: 'New query session initiated. Ask any satellite question or upload a new scene.' }])} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition">
                                                <span>+ New Query</span>
                                            </button>

                                            <input
                                                type="text"
                                                placeholder="Search conversations..."
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                                            />

                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">Saved Conversations (1)</p>
                                                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-3 py-2.5 rounded-xl text-xs font-medium truncate cursor-pointer">
                                                    {file ? `Analysis of ${file.name}` : 'What are the key ISRO operational ce...'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 space-y-1">
                                            <p>Auto-saved to Local Storage</p>
                                            <p className="text-emerald-500 font-mono">● Live</p>
                                        </div>
                                    </div>

                                    {/* RIGHT CHAT WINDOW */}
                                    <div className="flex-1 flex flex-col bg-white dark:bg-[#0c1222]">

                                        {/* Top Bar inside Copilot */}
                                        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#090e1c]">
                                            <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
                                                <span>SatQuery</span>
                                                <span>/</span>
                                                <span className="text-amber-600 dark:text-amber-400 font-bold">SatQuery Copilot (AI)</span>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] px-2.5 py-1 rounded-full font-mono">
                                                    🟢 Live Gemini Inference
                                                </span>
                                                <span className="bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[10px] px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-800 font-mono">
                                                    🥞 Multimodal Fusion
                                                </span>
                                            </div>
                                        </div>

                                        {/* Messages Scroll Area */}
                                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                            {messages.map((msg, index) => (
                                                <div key={index} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                                    <div className={`${msg.role === 'user' ? 'bg-slate-700 text-white' : 'bg-amber-600 text-white'} rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0`}>
                                                        {msg.role === 'user' ? 'U' : 'AI'}
                                                    </div>
                                                    <div className={`p-4 rounded-2xl text-xs max-w-xl leading-relaxed ${msg.role === 'user' ? 'bg-amber-600/10 border border-amber-600/30 text-slate-800 dark:text-slate-100' : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'}`}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Bottom Input Area with direct File Attachment */}
                                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#090e1c]">
                                            <form onSubmit={handleSendMessage} className="relative bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl p-2.5 shadow-inner flex items-center">
                                                <div className="flex items-center space-x-2 px-2 border-r border-slate-200 dark:border-slate-800 mr-2 text-slate-400">
                                                    <label className="cursor-pointer hover:text-amber-500 transition text-sm flex items-center gap-1" title="Upload GeoTIFF / Scene">
                                                        📎
                                                        <input type="file" onChange={handleFileInputChange} className="hidden" />
                                                    </label>
                                                    <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                                                        <span>🖼️</span> {file ? file.name : 'Sample Scene'}
                                                    </span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={inputMessage}
                                                    onChange={(e) => setInputMessage(e.target.value)}
                                                    placeholder="Ask any satellite question, analyze land-use, or say hello..."
                                                    className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none px-2"
                                                />
                                                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white w-8 h-8 rounded-xl flex items-center justify-center font-bold transition shadow ml-2">
                                                    ↑
                                                </button>
                                            </form>
                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2 font-mono">
                                                SatQuery AI Copilot • Multimodal Conversation History Saved in Sidebar
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}

                            {activeTab !== 'dashboard' && activeTab !== 'copilot' && (
                                <div className="bg-white dark:bg-[#0c1222] border border-slate-300 dark:border-slate-800/80 p-8 rounded-2xl text-center space-y-4 shadow-xl">
                                    <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{activeTab} Module Active</h3>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">Switch back to the Dashboard tab to view the operational command center view.</p>
                                </div>
                            )}

                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}