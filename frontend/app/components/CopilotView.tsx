'use client';
import { useState } from 'react';

export default function CopilotView({ filePath }: { filePath: string }) {
    const [query, setQuery] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<any>(null);

    const handleQuerySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!filePath) return alert('Please upload satellite imagery in the Dashboard first.');
        setLoading(true);

        const formData = new URLSearchParams();
        formData.append('query', query);
        formData.append('image_path', filePath);

        const res = await fetch('http://localhost:8000/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        const data = await res.json();
        setReport(data);
        setLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-[#0c1222] border border-slate-800/80 p-6 rounded-2xl shadow-xl space-y-4">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">SatQuery AI Copilot</h3>
                    <p className="text-xs text-slate-400 mt-1">Ask any satellite remote sensing question, analyze spectral indices, or query spatial features.</p>
                </div>

                <form onSubmit={handleQuerySubmit} className="space-y-4">
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask in natural language (e.g., 'Calculate vegetation index NDVI', 'Check for flood anomaly patterns')..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm focus:outline-none focus:border-amber-500 text-slate-200 h-28 resize-none shadow-inner"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 px-6 rounded-xl transition text-sm disabled:opacity-50 shadow-lg shadow-amber-600/20"
                    >
                        {loading ? 'Executing LangGraph Workflow...' : 'Run Natural Language Analysis'}
                    </button>
                </form>
            </div>

            {report && (
                <div className="bg-[#0c1222] border border-amber-900/40 p-6 rounded-2xl shadow-xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Intelligence Report & Evidence</h3>
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3 text-sm">
                        <div>
                            <strong className="text-slate-500 text-[10px] uppercase block">Query:</strong>
                            <p className="text-slate-200 mt-0.5">{report.query}</p>
                        </div>
                        <div>
                            <strong className="text-slate-500 text-[10px] uppercase block">Actionable Insight:</strong>
                            <p className="text-amber-300 font-medium mt-0.5 leading-relaxed">{report.insight}</p>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-400">
                            <span>Tools Used: <strong className="text-slate-300">{report.tools_used?.join(', ')}</strong></span>
                            <span className="text-amber-400 font-mono font-bold bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-800/60">
                                Confidence: {report.confidence}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}