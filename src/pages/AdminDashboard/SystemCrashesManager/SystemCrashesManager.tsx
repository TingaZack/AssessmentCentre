// src/pages/AdminDashboard/SystemCrashesManager/SystemCrashesManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bug, Search, Shield, Trash2, CheckCircle2,
    Terminal, Clock, Loader2, AlertTriangle, X,
    Filter, Cpu, Activity, RefreshCw, Copy, Check
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import '../../../components/views/StaffView/StaffView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import { createPortal } from 'react-dom';

interface CrashLog {
    id: string;
    errorName?: string;
    errorMessage?: string;
    errorStack?: string;
    componentStack?: string;
    url?: string;
    userAgent?: string;
    resolved?: boolean;
    createdAt?: string;
    timestamp?: any;
}

interface AiUsageLog {
    id: string;
    feature?: string;
    provider?: 'OpenRouter' | 'HuggingFace';
    model?: string;
    success?: boolean;
    fallbackUsed?: boolean;
    fallbackAttempts?: number;
    durationMs?: number;
    userId?: string;
    sessionId?: string;
    createdAt?: any;
}

export const SystemCrashesManager: React.FC = () => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'crashes' | 'ai_telemetry'>('crashes');

    // System Crashes State
    const [crashes, setCrashes] = useState<CrashLog[]>([]);
    const [loadingCrashes, setLoadingCrashes] = useState(true);
    const [crashSearch, setCrashSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
    const [selectedCrash, setSelectedCrash] = useState<CrashLog | null>(null);
    const [copied, setCopied] = useState(false);

    // AI Telemetry State
    const [aiLogs, setAiLogs] = useState<AiUsageLog[]>([]);
    const [loadingAi, setLoadingAi] = useState(true);
    const [aiSearch, setAiSearch] = useState('');
    const [aiFeatureFilter, setAiFeatureFilter] = useState<string>('all');

    // Real-time Listener: System Crashes
    useEffect(() => {
        setLoadingCrashes(true);
        const q = query(collection(db, 'system_crashes'), orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as CrashLog[];
            setCrashes(list);
            setLoadingCrashes(false);
        }, (err) => {
            console.error("Failed to fetch crashes:", err);
            toast.error("Failed to sync crash logs from database.");
            setLoadingCrashes(false);
        });

        return () => unsubscribe();
    }, []);

    // Real-time Listener: AI Telemetry
    useEffect(() => {
        setLoadingAi(true);
        const q = query(collection(db, 'ai_usage'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as AiUsageLog[];
            setAiLogs(list);
            setLoadingAi(false);
        }, (err) => {
            console.warn("AI telemetry query skipped:", err?.message || err);
            setLoadingAi(false);
        });

        return () => unsubscribe();
    }, []);

    // Crash Filtering & Stats
    const filteredCrashes = useMemo(() => {
        return crashes.filter(c => {
            const matchesStatus =
                filterStatus === 'all' ? true :
                    filterStatus === 'resolved' ? c.resolved === true :
                        !c.resolved;

            if (!matchesStatus) return false;
            if (!crashSearch.trim()) return true;
            const term = crashSearch.toLowerCase();
            return (
                c.errorName?.toLowerCase().includes(term) ||
                c.errorMessage?.toLowerCase().includes(term) ||
                c.url?.toLowerCase().includes(term)
            );
        });
    }, [crashes, filterStatus, crashSearch]);

    const crashStats = useMemo(() => {
        const total = crashes.length;
        const unresolved = crashes.filter(c => !c.resolved).length;
        const resolved = total - unresolved;
        return { total, unresolved, resolved };
    }, [crashes]);

    // AI Telemetry Filtering & Stats
    const filteredAiLogs = useMemo(() => {
        return aiLogs.filter(log => {
            const matchesFeature = aiFeatureFilter === 'all' ? true : log.feature === aiFeatureFilter;
            if (!matchesFeature) return false;

            if (!aiSearch.trim()) return true;
            const term = aiSearch.toLowerCase();
            return (
                log.feature?.toLowerCase().includes(term) ||
                log.model?.toLowerCase().includes(term) ||
                log.provider?.toLowerCase().includes(term) ||
                log.sessionId?.toLowerCase().includes(term)
            );
        });
    }, [aiLogs, aiFeatureFilter, aiSearch]);

    const aiStats = useMemo(() => {
        const total = aiLogs.length;
        const openRouterCount = aiLogs.filter(l => l.provider === 'OpenRouter').length;
        const hfCount = aiLogs.filter(l => l.provider === 'HuggingFace').length;
        const fallbackCount = aiLogs.filter(l => l.fallbackUsed).length;
        const fallbackRate = total > 0 ? Math.round((fallbackCount / total) * 100) : 0;
        const avgDuration = total > 0 ? Math.round(aiLogs.reduce((acc, l) => acc + (l.durationMs || 0), 0) / total) : 0;

        return { total, openRouterCount, hfCount, fallbackRate, avgDuration };
    }, [aiLogs]);

    // Crash Actions
    const handleToggleResolve = async (crash: CrashLog, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            const crashRef = doc(db, 'system_crashes', crash.id);
            await updateDoc(crashRef, {
                resolved: !crash.resolved,
                resolvedAt: new Date().toISOString()
            });
            toast.success(!crash.resolved ? "Crash marked as resolved." : "Crash reopened.");
        } catch (err) {
            toast.error("Failed to update status.");
        }
    };

    const handleDeleteCrash = async (crashId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            await deleteDoc(doc(db, 'system_crashes', crashId));
            if (selectedCrash?.id === crashId) setSelectedCrash(null);
            toast.success("Crash log deleted.");
        } catch (err) {
            toast.error("Failed to delete log.");
        }
    };

    const handleCopyLog = () => {
        if (!selectedCrash) return;
        const payload = `Error: ${selectedCrash.errorName}\nMessage: ${selectedCrash.errorMessage}\nURL: ${selectedCrash.url}\nTime: ${selectedCrash.createdAt}\n\nStack:\n${selectedCrash.errorStack}\n\nComponent Stack:\n${selectedCrash.componentStack}`;
        navigator.clipboard.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatDate = (dateVal?: any) => {
        if (!dateVal) return 'N/A';
        const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('en-ZA', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <div className="mlab-staff animate-fade-in">
            {/* Header */}
            <div className="mlab-staff__header">
                <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={24} color="var(--mlab-blue)" />
                    System Observability & Telemetry Center
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold' }}>
                    <Shield size={14} /> Super Admin Security Restricted
                </div>
            </div>

            {/* TAB NAVIGATION HEADER */}
            <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #cbd5e1', marginBottom: '1.5rem' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('crashes')}
                    style={{
                        padding: '12px 4px', background: 'none', border: 'none',
                        color: activeTab === 'crashes' ? '#dc2626' : '#64748b',
                        fontWeight: activeTab === 'crashes' ? 800 : 600, fontSize: '0.9rem',
                        cursor: 'pointer', borderBottom: activeTab === 'crashes' ? '3px solid #dc2626' : '3px solid transparent',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <Bug size={18} /> Runtime Crashlytics
                    {crashStats.unresolved > 0 && (
                        <span style={{ background: '#dc2626', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem' }}>
                            {crashStats.unresolved}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('ai_telemetry')}
                    style={{
                        padding: '12px 4px', background: 'none', border: 'none',
                        color: activeTab === 'ai_telemetry' ? '#0284c7' : '#64748b',
                        fontWeight: activeTab === 'ai_telemetry' ? 800 : 600, fontSize: '0.9rem',
                        cursor: 'pointer', borderBottom: activeTab === 'ai_telemetry' ? '3px solid #0284c7' : '3px solid transparent',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <Cpu size={18} /> AI Gateway Telemetry
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem' }}>
                        {aiStats.total}
                    </span>
                </button>
            </div>

            {/* ════ TAB 1: RUNTIME CRASHES ════ */}
            {activeTab === 'crashes' && (
                <div className="animate-fade-in">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Total Crashes Logged</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{crashStats.total}</div>
                        </div>
                        <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>Unresolved Anomalies</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>{crashStats.unresolved}</div>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#166534', fontWeight: 'bold' }}>Resolved Issues</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>{crashStats.resolved}</div>
                        </div>
                    </div>

                    <div className="mlab-staff__toolbar">
                        <div className="mlab-search" style={{ flex: 1 }}>
                            <Search size={17} color="var(--mlab-grey)" />
                            <input
                                type="text"
                                placeholder="Search crash logs by error message, title, or URL..."
                                value={crashSearch}
                                onChange={e => setCrashSearch(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={15} color="var(--mlab-grey)" />
                            <select
                                className="lp-input"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value as any)}
                                style={{ margin: 0, height: '40px', padding: '0 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                            >
                                <option value="unresolved">Unresolved Only</option>
                                <option value="resolved">Resolved Only</option>
                                <option value="all">All Logs</option>
                            </select>
                        </div>
                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Error Title</th>
                                    <th>Location (URL)</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingCrashes ? (
                                    <tr>
                                        <td colSpan={5} className="mlab-table-empty">
                                            <Loader2 size={24} className="lfm-spin" color="var(--mlab-blue)" />
                                        </td>
                                    </tr>
                                ) : filteredCrashes.map(crash => (
                                    <tr key={crash.id} onClick={() => setSelectedCrash(crash)} style={{ cursor: 'pointer', background: crash.resolved ? '#f8fafc' : 'white' }}>
                                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
                                            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                            {formatDate(crash.createdAt)}
                                        </td>
                                        <td style={{ maxWidth: '280px' }}>
                                            <span style={{ fontWeight: 'bold', color: crash.resolved ? '#64748b' : '#dc2626', display: 'block', fontSize: '0.85rem' }}>
                                                {crash.errorName || 'Runtime Error'}
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                                                {crash.errorMessage || 'No error message available.'}
                                            </span>
                                        </td>
                                        <td style={{ maxWidth: '220px', fontSize: '0.8rem', color: '#0369a1' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', fontFamily: 'monospace' }}>
                                                {crash.url ? crash.url.replace(/^https?:\/\/[^\/]+/, '') : 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            {crash.resolved ? (
                                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={11} /> Resolved
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <AlertTriangle size={11} /> Active Bug
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button type="button" onClick={(e) => handleToggleResolve(crash, e)} style={{ background: 'none', border: 'none', color: crash.resolved ? '#64748b' : '#16a34a', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                                    {crash.resolved ? 'Reopen' : 'Resolve'}
                                                </button>
                                                <button type="button" onClick={(e) => handleDeleteCrash(crash.id, e)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} title="Delete Log">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════ TAB 2: AI GATEWAY TELEMETRY ════ */}
            {activeTab === 'ai_telemetry' && (
                <div className="animate-fade-in">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Total AI Calls</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{aiStats.total}</div>
                        </div>

                        <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#0369a1', fontWeight: 'bold' }}>OpenRouter / Gemini</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#0284c7', marginTop: '4px' }}>{aiStats.openRouterCount}</div>
                        </div>

                        <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#b45309', fontWeight: 'bold' }}>Fallback Rate</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#d97706', marginTop: '4px' }}>{aiStats.fallbackRate}%</div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#475569', fontWeight: 'bold' }}>Avg Latency</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#334155', marginTop: '4px' }}>{aiStats.avgDuration}ms</div>
                        </div>
                    </div>

                    <div className="mlab-staff__toolbar">
                        <div className="mlab-search" style={{ flex: 1 }}>
                            <Search size={17} color="var(--mlab-grey)" />
                            <input
                                type="text"
                                placeholder="Search by model, feature, provider, session ID..."
                                value={aiSearch}
                                onChange={e => setAiSearch(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={15} color="var(--mlab-grey)" />
                            <select
                                className="lp-input"
                                value={aiFeatureFilter}
                                onChange={(e) => setAiFeatureFilter(e.target.value)}
                                style={{ margin: 0, height: '40px', padding: '0 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                            >
                                <option value="all">All Features</option>
                                <option value="mock_interview_turn">Mock Interview Turn</option>
                                <option value="mock_interview_evaluation">Mock Interview Evaluation</option>
                            </select>
                        </div>
                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Feature</th>
                                    <th>Provider & Model</th>
                                    <th>Duration</th>
                                    <th>Fallback Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingAi ? (
                                    <tr>
                                        <td colSpan={5} className="mlab-table-empty">
                                            <Loader2 size={24} className="lfm-spin" color="var(--mlab-blue)" />
                                        </td>
                                    </tr>
                                ) : filteredAiLogs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
                                            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                            {formatDate(log.createdAt)}
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 700, color: 'var(--mlab-midnight)', fontSize: '0.82rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                                {log.feature || 'unknown'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <strong style={{ fontSize: '0.85rem', color: '#0284c7' }}>{log.provider}</strong>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>{log.model}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 700, fontSize: '0.85rem', color: '#334155' }}>
                                            {log.durationMs || 0} ms
                                        </td>
                                        <td>
                                            {log.fallbackUsed ? (
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <RefreshCw size={10} /> Fallback ({log.fallbackAttempts} att)
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={10} /> Primary Model
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {!loadingAi && filteredAiLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="mlab-table-empty">
                                            <Activity size={36} color="var(--mlab-grey)" style={{ opacity: 0.5 }} />
                                            <span className="mlab-table-empty__title">No AI Logs Recorded</span>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Crash Inspector Modal */}
            {selectedCrash && createPortal(
                <div className="lfm-overlay" onClick={() => setSelectedCrash(null)} style={{ zIndex: 99999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title" style={{ color: '#dc2626' }}>
                                <Terminal size={16} /> Crash Diagnostic Inspector
                            </h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setSelectedCrash(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>
                                    {selectedCrash.errorName || 'Exception'}
                                </div>
                                <div style={{ fontSize: '1rem', color: '#7f1d1d', fontWeight: 'bold', marginTop: '4px', wordBreak: 'break-word' }}>
                                    {selectedCrash.errorMessage || 'No error message available'}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold' }}>Timestamp:</span>
                                    <span>{formatDate(selectedCrash.createdAt)}</span>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold' }}>Page URL:</span>
                                    <a href={selectedCrash.url} target="_blank" rel="noreferrer" style={{ color: '#0284c7', wordBreak: 'break-all' }}>
                                        {selectedCrash.url || 'N/A'}
                                    </a>
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>JavaScript Stack Trace</span>
                                    <button
                                        type="button"
                                        onClick={handleCopyLog}
                                        style={{ background: '#e2e8f0', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                        {copied ? 'Copied' : 'Copy Full Trace'}
                                    </button>
                                </div>
                                <div style={{ background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '220px', whiteSpace: 'pre-wrap' }}>
                                    {selectedCrash.errorStack || 'No stack trace captured.'}
                                </div>
                            </div>
                        </div>

                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteCrash(selectedCrash.id)}>
                                Delete Log
                            </button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => handleToggleResolve(selectedCrash)}>
                                {selectedCrash.resolved ? 'Reopen Bug' : 'Mark as Resolved'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};


// // src/pages/AdminDashboard/SystemCrashesManager/SystemCrashesManager.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import {
//     Bug, Search, Shield, Trash2, CheckCircle2,
//     Terminal, Clock, Loader2,
//     AlertTriangle, X, Copy, Check, Filter
// } from 'lucide-react';
// import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useToast } from '../../../components/common/Toast/Toast';
// import '../../../components/views/StaffView/StaffView.css';
// import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// import { createPortal } from 'react-dom';

// interface CrashLog {
//     id: string;
//     errorName?: string;
//     errorMessage?: string;
//     errorStack?: string;
//     componentStack?: string;
//     url?: string;
//     userAgent?: string;
//     resolved?: boolean;
//     createdAt?: string;
//     timestamp?: any;
// }

// export const SystemCrashesManager: React.FC = () => {
//     const toast = useToast();
//     const [crashes, setCrashes] = useState<CrashLog[]>([]);
//     const [loading, setLoading] = useState(true);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
//     const [selectedCrash, setSelectedCrash] = useState<CrashLog | null>(null);
//     const [copied, setCopied] = useState(false);

//     // Real-time Listener for Crashes
//     useEffect(() => {
//         setLoading(true);
//         const q = query(collection(db, 'system_crashes'), orderBy('timestamp', 'desc'));

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const list = snapshot.docs.map(d => ({
//                 id: d.id,
//                 ...d.data()
//             })) as CrashLog[];
//             setCrashes(list);
//             setLoading(false);
//         }, (err) => {
//             console.error("Failed to fetch crashes:", err);
//             toast.error("Failed to sync crash logs from database.");
//             setLoading(false);
//         });

//         return () => unsubscribe();
//     }, []);

//     // Filter & Search Logic
//     const filteredCrashes = useMemo(() => {
//         return crashes.filter(c => {
//             const matchesStatus =
//                 filterStatus === 'all' ? true :
//                     filterStatus === 'resolved' ? c.resolved === true :
//                         !c.resolved;

//             if (!matchesStatus) return false;

//             if (!searchTerm.trim()) return true;
//             const term = searchTerm.toLowerCase();
//             return (
//                 c.errorName?.toLowerCase().includes(term) ||
//                 c.errorMessage?.toLowerCase().includes(term) ||
//                 c.url?.toLowerCase().includes(term)
//             );
//         });
//     }, [crashes, filterStatus, searchTerm]);

//     // Stats Counter
//     const stats = useMemo(() => {
//         const total = crashes.length;
//         const unresolved = crashes.filter(c => !c.resolved).length;
//         const resolved = total - unresolved;
//         return { total, unresolved, resolved };
//     }, [crashes]);

//     // Toggle Resolved Status
//     const handleToggleResolve = async (crash: CrashLog, e?: React.MouseEvent) => {
//         if (e) e.stopPropagation();
//         try {
//             const crashRef = doc(db, 'system_crashes', crash.id);
//             await updateDoc(crashRef, {
//                 resolved: !crash.resolved,
//                 resolvedAt: new Date().toISOString()
//             });
//             toast.success(!crash.resolved ? "Crash marked as resolved." : "Crash reopened.");
//         } catch (err) {
//             toast.error("Failed to update status.");
//         }
//     };

//     // Delete Single Crash
//     const handleDeleteCrash = async (crashId: string, e?: React.MouseEvent) => {
//         if (e) e.stopPropagation();
//         try {
//             await deleteDoc(doc(db, 'system_crashes', crashId));
//             if (selectedCrash?.id === crashId) setSelectedCrash(null);
//             toast.success("Crash log deleted.");
//         } catch (err) {
//             toast.error("Failed to delete log.");
//         }
//     };

//     // Copy Full Stack Details
//     const handleCopyLog = () => {
//         if (!selectedCrash) return;
//         const payload = `Error: ${selectedCrash.errorName}\nMessage: ${selectedCrash.errorMessage}\nURL: ${selectedCrash.url}\nTime: ${selectedCrash.createdAt}\n\nStack:\n${selectedCrash.errorStack}\n\nComponent Stack:\n${selectedCrash.componentStack}`;
//         navigator.clipboard.writeText(payload);
//         setCopied(true);
//         setTimeout(() => setCopied(false), 2000);
//     };

//     const formatDate = (dateStr?: string) => {
//         if (!dateStr) return 'N/A';
//         const d = new Date(dateStr);
//         return isNaN(d.getTime()) ? dateStr : d.toLocaleString('en-ZA', {
//             day: '2-digit', month: 'short', year: 'numeric',
//             hour: '2-digit', minute: '2-digit', second: '2-digit'
//         });
//     };

//     return (
//         <div className="mlab-staff animate-fade-in">
//             {/* Header */}
//             <div className="mlab-staff__header">
//                 <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                     <Bug size={24} color="var(--mlab-red)" />
//                     System Crashlytics & Bug Tracker
//                 </h2>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold' }}>
//                     <Shield size={14} /> Super Admin Security Restricted
//                 </div>
//             </div>

//             {/* Metric KPI Cards */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
//                 <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                     <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Total Crashes Logged</span>
//                     <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{stats.total}</div>
//                 </div>
//                 <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5' }}>
//                     <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>Unresolved Anomalies</span>
//                     <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>{stats.unresolved}</div>
//                 </div>
//                 <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
//                     <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#166534', fontWeight: 'bold' }}>Resolved Issues</span>
//                     <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>{stats.resolved}</div>
//                 </div>
//             </div>

//             {/* Filter Toolbar */}
//             <div className="mlab-staff__toolbar">
//                 <div className="mlab-search" style={{ flex: 1 }}>
//                     <Search size={17} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search crash logs by error message, title, or URL..."
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                     <Filter size={15} color="var(--mlab-grey)" />
//                     <select
//                         className="lp-input"
//                         value={filterStatus}
//                         onChange={(e) => setFilterStatus(e.target.value as any)}
//                         style={{ margin: 0, height: '40px', padding: '0 12px', borderRadius: '6px', fontSize: '0.85rem' }}
//                     >
//                         <option value="unresolved">Unresolved Only</option>
//                         <option value="resolved">Resolved Only</option>
//                         <option value="all">All Logs</option>
//                     </select>
//                 </div>
//             </div>

//             <p className="mlab-staff__count">
//                 Showing <strong>{filteredCrashes.length}</strong> incident logs
//             </p>

//             {/* Crash Logs Table */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Timestamp</th>
//                             <th>Error Title</th>
//                             <th>Incident Location (URL)</th>
//                             <th>Status</th>
//                             <th>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {loading ? (
//                             <tr>
//                                 <td colSpan={5} className="mlab-table-empty">
//                                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
//                                         <Loader2 size={24} className="lfm-spin" color="var(--mlab-blue)" />
//                                         <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Syncing Diagnostic Logs...</span>
//                                     </div>
//                                 </td>
//                             </tr>
//                         ) : filteredCrashes.map(crash => (
//                             <tr key={crash.id} onClick={() => setSelectedCrash(crash)} style={{ cursor: 'pointer', background: crash.resolved ? '#f8fafc' : 'white' }}>
//                                 <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
//                                     <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
//                                     {formatDate(crash.createdAt)}
//                                 </td>
//                                 <td style={{ maxWidth: '280px' }}>
//                                     <span style={{ fontWeight: 'bold', color: crash.resolved ? '#64748b' : '#dc2626', display: 'block', fontSize: '0.85rem' }}>
//                                         {crash.errorName || 'Runtime Error'}
//                                     </span>
//                                     <span style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
//                                         {crash.errorMessage || 'No error message available.'}
//                                     </span>
//                                 </td>
//                                 <td style={{ maxWidth: '220px', fontSize: '0.8rem', color: '#0369a1' }}>
//                                     <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', fontFamily: 'monospace' }}>
//                                         {crash.url ? crash.url.replace(/^https?:\/\/[^\/]+/, '') : 'N/A'}
//                                     </span>
//                                 </td>
//                                 <td>
//                                     {crash.resolved ? (
//                                         <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                             <CheckCircle2 size={11} /> Resolved
//                                         </span>
//                                     ) : (
//                                         <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                             <AlertTriangle size={11} /> Active Bug
//                                         </span>
//                                     )}
//                                 </td>
//                                 <td>
//                                     <div style={{ display: 'flex', gap: '8px' }}>
//                                         <button
//                                             type="button"
//                                             onClick={(e) => handleToggleResolve(crash, e)}
//                                             style={{ background: 'none', border: 'none', color: crash.resolved ? '#64748b' : '#16a34a', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase' }}
//                                         >
//                                             {crash.resolved ? 'Reopen' : 'Resolve'}
//                                         </button>
//                                         <button
//                                             type="button"
//                                             onClick={(e) => handleDeleteCrash(crash.id, e)}
//                                             style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
//                                             title="Delete Log"
//                                         >
//                                             <Trash2 size={14} />
//                                         </button>
//                                     </div>
//                                 </td>
//                             </tr>
//                         ))}

//                         {!loading && filteredCrashes.length === 0 && (
//                             <tr>
//                                 <td colSpan={5} className="mlab-table-empty">
//                                     <CheckCircle2 size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                                     <span className="mlab-table-empty__title">Zero Crashes Found</span>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* Crash Detail Modal */}
//             {selectedCrash && createPortal(
//                 <div className="lfm-overlay" onClick={() => setSelectedCrash(null)} style={{ zIndex: 99999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title" style={{ color: '#dc2626' }}>
//                                 <Terminal size={16} /> Crash Diagnostic Inspector
//                             </h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setSelectedCrash(null)}>
//                                 <X size={20} />
//                             </button>
//                         </div>

//                         <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                             <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', borderRadius: '6px' }}>
//                                 <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>
//                                     {selectedCrash.errorName || 'Exception'}
//                                 </div>
//                                 <div style={{ fontSize: '1rem', color: '#7f1d1d', fontWeight: 'bold', marginTop: '4px', wordBreak: 'break-word' }}>
//                                     {selectedCrash.errorMessage || 'No error message available'}
//                                 </div>
//                             </div>

//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
//                                 <div>
//                                     <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold' }}>Timestamp:</span>
//                                     <span>{formatDate(selectedCrash.createdAt)}</span>
//                                 </div>
//                                 <div>
//                                     <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold' }}>Page URL:</span>
//                                     <a href={selectedCrash.url} target="_blank" rel="noreferrer" style={{ color: '#0284c7', wordBreak: 'break-all' }}>
//                                         {selectedCrash.url || 'N/A'}
//                                     </a>
//                                 </div>
//                             </div>

//                             <div>
//                                 <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '4px' }}>User Agent / Browser:</span>
//                                 <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155' }}>
//                                     {selectedCrash.userAgent || 'Unknown'}
//                                 </div>
//                             </div>

//                             {/* Stack Trace Code Box */}
//                             <div>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
//                                     <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>JavaScript Stack Trace</span>
//                                     <button
//                                         type="button"
//                                         onClick={handleCopyLog}
//                                         style={{ background: '#e2e8f0', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
//                                     >
//                                         {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
//                                         {copied ? 'Copied' : 'Copy Full Trace'}
//                                     </button>
//                                 </div>
//                                 <div style={{ background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '220px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
//                                     {selectedCrash.errorStack || 'No JavaScript stack trace captured.'}
//                                 </div>
//                             </div>

//                             {/* React Component Stack */}
//                             {selectedCrash.componentStack && (
//                                 <div>
//                                     <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>React Component Tree</span>
//                                     <div style={{ background: '#0f172a', color: '#94a3b8', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '160px', whiteSpace: 'pre-wrap' }}>
//                                         {selectedCrash.componentStack}
//                                     </div>
//                                 </div>
//                             )}
//                         </div>

//                         <div className="lfm-footer">
//                             <button
//                                 type="button"
//                                 className="lfm-btn lfm-btn--ghost"
//                                 style={{ color: '#ef4444' }}
//                                 onClick={() => handleDeleteCrash(selectedCrash.id)}
//                             >
//                                 Delete Log
//                             </button>
//                             <button
//                                 type="button"
//                                 className="lfm-btn lfm-btn--primary"
//                                 onClick={() => handleToggleResolve(selectedCrash)}
//                             >
//                                 {selectedCrash.resolved ? 'Reopen Bug' : 'Mark as Resolved'}
//                             </button>
//                         </div>
//                     </div>
//                 </div>,
//                 document.body
//             )}
//         </div>
//     );
// };