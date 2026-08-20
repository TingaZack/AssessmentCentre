// src/pages/AdminDashboard/SystemCrashesManager/SystemCrashesManager.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bug, Search, Shield, Trash2, CheckCircle2,
    Terminal, Clock, Loader2,
    AlertTriangle, X, Copy, Check, Filter
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

export const SystemCrashesManager: React.FC = () => {
    const toast = useToast();
    const [crashes, setCrashes] = useState<CrashLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
    const [selectedCrash, setSelectedCrash] = useState<CrashLog | null>(null);
    const [copied, setCopied] = useState(false);

    // Real-time Listener for Crashes
    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, 'system_crashes'), orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as CrashLog[];
            setCrashes(list);
            setLoading(false);
        }, (err) => {
            console.error("Failed to fetch crashes:", err);
            toast.error("Failed to sync crash logs from database.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Filter & Search Logic
    const filteredCrashes = useMemo(() => {
        return crashes.filter(c => {
            const matchesStatus =
                filterStatus === 'all' ? true :
                    filterStatus === 'resolved' ? c.resolved === true :
                        !c.resolved;

            if (!matchesStatus) return false;

            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                c.errorName?.toLowerCase().includes(term) ||
                c.errorMessage?.toLowerCase().includes(term) ||
                c.url?.toLowerCase().includes(term)
            );
        });
    }, [crashes, filterStatus, searchTerm]);

    // Stats Counter
    const stats = useMemo(() => {
        const total = crashes.length;
        const unresolved = crashes.filter(c => !c.resolved).length;
        const resolved = total - unresolved;
        return { total, unresolved, resolved };
    }, [crashes]);

    // Toggle Resolved Status
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

    // Delete Single Crash
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

    // Copy Full Stack Details
    const handleCopyLog = () => {
        if (!selectedCrash) return;
        const payload = `Error: ${selectedCrash.errorName}\nMessage: ${selectedCrash.errorMessage}\nURL: ${selectedCrash.url}\nTime: ${selectedCrash.createdAt}\n\nStack:\n${selectedCrash.errorStack}\n\nComponent Stack:\n${selectedCrash.componentStack}`;
        navigator.clipboard.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : d.toLocaleString('en-ZA', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <div className="mlab-staff animate-fade-in">
            {/* Header */}
            <div className="mlab-staff__header">
                <h2 className="mlab-staff__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Bug size={24} color="var(--mlab-red)" />
                    System Crashlytics & Bug Tracker
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold' }}>
                    <Shield size={14} /> Super Admin Security Restricted
                </div>
            </div>

            {/* Metric KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Total Crashes Logged</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>{stats.total}</div>
                </div>
                <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: 'bold' }}>Unresolved Anomalies</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>{stats.unresolved}</div>
                </div>
                <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#166534', fontWeight: 'bold' }}>Resolved Issues</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>{stats.resolved}</div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="mlab-staff__toolbar">
                <div className="mlab-search" style={{ flex: 1 }}>
                    <Search size={17} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search crash logs by error message, title, or URL..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
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

            <p className="mlab-staff__count">
                Showing <strong>{filteredCrashes.length}</strong> incident logs
            </p>

            {/* Crash Logs Table */}
            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Error Title</th>
                            <th>Incident Location (URL)</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
                                        <Loader2 size={24} className="lfm-spin" color="var(--mlab-blue)" />
                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Syncing Diagnostic Logs...</span>
                                    </div>
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
                                        <button
                                            type="button"
                                            onClick={(e) => handleToggleResolve(crash, e)}
                                            style={{ background: 'none', border: 'none', color: crash.resolved ? '#64748b' : '#16a34a', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase' }}
                                        >
                                            {crash.resolved ? 'Reopen' : 'Resolve'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteCrash(crash.id, e)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                            title="Delete Log"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {!loading && filteredCrashes.length === 0 && (
                            <tr>
                                <td colSpan={5} className="mlab-table-empty">
                                    <CheckCircle2 size={36} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-table-empty__title">Zero Crashes Found</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Crash Detail Modal */}
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
                                <span style={{ color: '#64748b', display: 'block', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '4px' }}>User Agent / Browser:</span>
                                <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155' }}>
                                    {selectedCrash.userAgent || 'Unknown'}
                                </div>
                            </div>

                            {/* Stack Trace Code Box */}
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
                                <div style={{ background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '220px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {selectedCrash.errorStack || 'No JavaScript stack trace captured.'}
                                </div>
                            </div>

                            {/* React Component Stack */}
                            {selectedCrash.componentStack && (
                                <div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>React Component Tree</span>
                                    <div style={{ background: '#0f172a', color: '#94a3b8', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '160px', whiteSpace: 'pre-wrap' }}>
                                        {selectedCrash.componentStack}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lfm-footer">
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--ghost"
                                style={{ color: '#ef4444' }}
                                onClick={() => handleDeleteCrash(selectedCrash.id)}
                            >
                                Delete Log
                            </button>
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--primary"
                                onClick={() => handleToggleResolve(selectedCrash)}
                            >
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