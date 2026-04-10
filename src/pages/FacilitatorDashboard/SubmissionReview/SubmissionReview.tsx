// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, CheckCircle, AlertCircle, Save,
    User, GraduationCap, Clock, Award, RotateCcw, MessageSquare,
    ShieldCheck, Eye, Check, X, Edit3, Printer, Info, Lock, Loader2,
    AlertTriangle, Activity, Calendar, BarChart, FileText, UploadCloud, Mic, Code, Link as LinkIcon, CalendarRange, Timer, Play, Square, ShieldAlert,
    Layers, Undo2, FileArchive, Scale
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './SubmissionReview.css';
import { createPortal } from 'react-dom';
import { TintedSignature } from '../FacilitatorProfileView/FacilitatorProfileView';
import moment from 'moment';
import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// ─── EXTENDED GRADE DATA ─────────────────────────────────────────────────────
interface CriterionResult {
    status: 'C' | 'NYC' | null;
    comment: string;
    startTime: string;
    endTime: string;
}

interface WorkplaceActivityResult {
    status: 'C' | 'NYC' | null;
    comment: string;
}

interface GradeData {
    score: number;
    feedback: string;
    isCorrect?: boolean | null;
    criteriaResults?: CriterionResult[];
    activityResults?: WorkplaceActivityResult[];
    obsDate?: string;
    obsStartTime?: string;
    obsEndTime?: string;
    obsDeclaration?: boolean;
}

// ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
const FilePreview = ({ url }: { url?: string }) => {
    if (!url) return null;

    const getExtension = (urlStr: string) => {
        try {
            const urlWithoutQuery = urlStr.split('?')[0];
            const parts = urlWithoutQuery.split('.');
            return parts[parts.length - 1].toLowerCase();
        } catch { return ''; }
    };

    const ext = getExtension(url);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
    const isPdf = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
    const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

    return (
        <div className="sr-file-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} /> Uploaded Evidence
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>
                    {isOffice ? 'Download / View Native' : 'Open Fullscreen'}
                </a>
            </div>
            <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                <strong>File:</strong> {url.split('?')[0].split('/').pop()} <br />
                <strong>URL:</strong> {url}
            </div>
            <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isImage || isVideo ? '10px' : '0', minHeight: '100px' }}>
                {isImage && <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }} />}
                {isVideo && <video src={url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px' }} />}
                {isPdf && <iframe src={url} style={{ width: '100%', height: '500px', border: 'none' }} title="PDF Preview" />}
                {isOffice && (
                    <div style={{ width: '100%' }}>
                        <div style={{ padding: '10px', width: '100%', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.75rem', textAlign: 'center' }}>
                            <strong>Note:</strong> Office documents use a web previewer. If it fails to load, use the <strong>Download / View Native</strong> link above.
                        </div>
                        <iframe src={googleDocsViewerUrl} style={{ width: '100%', height: '500px', border: 'none' }} title="Office Preview" />
                    </div>
                )}
                {!isImage && !isVideo && !isPdf && !isOffice && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>Rich preview not available for this file type.<br />Please use the link above to download it.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── URL PREVIEW ──────────────────────────────────────────────────────────────
const UrlPreview = ({ url }: { url?: string }) => {
    if (!url) return null;

    let embedUrl = url;
    let isEmbeddable = true;

    if (url.includes('youtube.com/watch?v=')) {
        embedUrl = url.replace('watch?v=', 'embed/');
    } else if (url.includes('youtu.be/')) {
        embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
    } else if (url.includes('docs.google.com') || url.includes('drive.google.com')) {
        embedUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    } else if (url.includes('github.com')) {
        isEmbeddable = false;
    }

    return (
        <div className="sr-url-preview" style={{ marginTop: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LinkIcon size={14} /> Link Evidence Provided
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="no-print" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 'bold', textDecoration: 'underline' }}>Open Link in New Tab</a>
            </div>
            <div className="print-only" style={{ padding: '10px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                <strong>Link:</strong> <a href={url} style={{ color: '#073f4e', wordBreak: 'break-all' }}>{url}</a>
            </div>
            <div className="no-print" style={{ background: '#f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
                {isEmbeddable ? (
                    <iframe src={embedUrl} style={{ width: '100%', height: '400px', border: 'none' }} title="URL Preview" />
                ) : (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        <Code size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>This link (e.g. GitHub) blocks inline previewing.<br />Please use the link above to view it securely in a new tab.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── REMEDIATION MODAL ───────────────────────────────────────────────────────
const RemediationModal: React.FC<{
    submissionTitle: string;
    attemptNumber: number;
    onClose: () => void;
    onSubmit: (date: string, notes: string) => void;
}> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
    const [date, setDate] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !notes.trim() || !confirmed) return;
        onSubmit(date, notes);
    };

    const isFinalAttempt = attemptNumber === 2;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <RotateCcw size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        {isFinalAttempt
                            ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
                            : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
                        </label>
                        <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
                        </span>
                    </label>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
                            Log Coaching & Unlock
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// ─── RETURN TO LEARNER MODAL ─────────────────────────────────────────────────
const ReturnToLearnerModal: React.FC<{
    onClose: () => void;
    onSubmit: (reason: string) => void;
}> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim() || !confirmed) return;
        onSubmit(reason);
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '480px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <Undo2 size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Return Logbook to Learner
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#92400e' }}>
                                The learner will be able to correct and resubmit their logbook.
                            </p>
                        </div>
                    </div>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '12px', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5 }}>
                        <strong>When to use this:</strong> The learner's hours are incorrect, evidence is missing or blurry, or the logbook does not accurately reflect the work performed. The logbook will return to <em>In Progress</em> so the learner can correct and resubmit.
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Reason for Return (visible to learner) *
                        </label>
                        <textarea
                            required
                            rows={4}
                            placeholder="e.g. The hours logged on 12 March do not match our records. Please correct your entry and resubmit."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            I confirm that I am returning this logbook because it does not meet the required standard for verification.
                        </span>
                    </label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!reason.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!reason.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!reason.trim() || !confirmed) ? 0.5 : 1 }}>
                            <Undo2 size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                            Return to Learner
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// ─── RESOLVE APPEAL MODAL ───────────────────────────────────────────────────
const ResolveAppealModal: React.FC<{
    appealReason: string;
    onClose: () => void;
    onSubmit: (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => void;
}> = ({ appealReason, onClose, onSubmit }) => {
    const [notes, setNotes] = useState('');
    const [decision, setDecision] = useState<'overturn' | 'new_attempt' | 'reject' | null>(null);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '600px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: '6px solid #8b5cf6' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f5f3ff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#8b5cf6', padding: '10px', borderRadius: '50%', color: 'white' }}><Scale size={24} /></div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#6d28d9', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Academic Appeal Resolution</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#5b21b6' }}>National Training Manager / Board Review</p>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Learner's Reason for Appeal:</span>
                        <p style={{ fontSize: '0.9rem', color: '#0f172a', margin: '8px 0 0 0', fontStyle: 'italic' }}>"{appealReason}"</p>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>Select Resolution Action *</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'overturn' ? '2px solid #22c55e' : '1px solid #cbd5e1', background: decision === 'overturn' ? '#f0fdf4' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'overturn'} onChange={() => setDecision('overturn')} style={{ marginTop: '2px', accentColor: '#22c55e' }} />
                                <div><strong style={{ display: 'block', color: '#166534', fontSize: '0.9rem' }}>Overturn Decision (Change to Competent)</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The learner's appeal is valid. The NYC grade is overturned to Competent.</span></div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'new_attempt' ? '2px solid #f59e0b' : '1px solid #cbd5e1', background: decision === 'new_attempt' ? '#fffbeb' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'new_attempt'} onChange={() => setDecision('new_attempt')} style={{ marginTop: '2px', accentColor: '#f59e0b' }} />
                                <div><strong style={{ display: 'block', color: '#b45309', fontSize: '0.9rem' }}>Grant Additional Attempt</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The NYC grade stands, but the learner is granted a fresh attempt (even if max attempts were reached).</span></div>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: decision === 'reject' ? '2px solid #ef4444' : '1px solid #cbd5e1', background: decision === 'reject' ? '#fef2f2' : 'white', borderRadius: '6px', cursor: 'pointer' }}>
                                <input type="radio" name="decision" checked={decision === 'reject'} onChange={() => setDecision('reject')} style={{ marginTop: '2px', accentColor: '#ef4444' }} />
                                <div><strong style={{ display: 'block', color: '#b91c1c', fontSize: '0.9rem' }}>Uphold Original Grade (Reject Appeal)</strong><span style={{ fontSize: '0.75rem', color: '#475569' }}>The appeal is dismissed. The NYC grade remains locked.</span></div>
                            </label>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Official Resolution Notes *</label>
                        <textarea required rows={3} placeholder="Provide justification for the Academic Board's decision..." value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="button" onClick={() => onSubmit(decision!, notes)} disabled={!decision || !notes.trim()} style={{ flex: 2, padding: '0.75rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: (!decision || !notes.trim()) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!decision || !notes.trim()) ? 0.5 : 1 }}>
                            Finalise Resolution
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── LOGBOOK HOURS TALLY ──────────────────────────────────────────────────────
const LogbookHoursTally: React.FC<{ entries: any[]; requiredHours?: number }> = ({ entries, requiredHours }) => {
    const totalHours = entries.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
    const isShort = requiredHours !== undefined && totalHours < requiredHours;
    const isMet = requiredHours !== undefined && totalHours >= requiredHours;

    return (
        <div style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            border: `2px solid ${isShort ? '#fca5a5' : isMet ? '#86efac' : '#e2e8f0'}`,
            background: isShort ? '#fef2f2' : isMet ? '#f0fdf4' : '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CalendarRange size={20} color={isShort ? '#ef4444' : isMet ? '#22c55e' : '#64748b'} />
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: isShort ? '#b91c1c' : isMet ? '#166534' : '#475569', letterSpacing: '0.05em' }}>
                        Total Logged Hours
                    </div>
                    {requiredHours !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: isShort ? '#ef4444' : isMet ? '#22c55e' : '#64748b', marginTop: '2px' }}>
                            {isMet ? `✓ Minimum ${requiredHours}h requirement met` : `Minimum ${requiredHours}h required`}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)', color: isShort ? '#ef4444' : isMet ? '#16a34a' : '#073f4e' }}>
                    {totalHours}
                </span>
                {requiredHours !== undefined && (
                    <span style={{ fontSize: '1rem', color: '#94a3b8', fontFamily: 'var(--font-heading)' }}>/ {requiredHours}h</span>
                )}
                {requiredHours === undefined && (
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>hrs</span>
                )}
            </div>
            {isShort && (
                <div style={{ width: '100%', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color="#dc2626" />
                    <span style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 'bold' }}>
                        Warning: {requiredHours! - totalHours}h short of the required minimum. Do not verify until the learner corrects their logbook.
                    </span>
                </div>
            )}
        </div>
    );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export const SubmissionReview: React.FC = () => {
    const { submissionId } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const { user } = useStore();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [submission, setSubmission] = useState<any>(null);
    const [assessment, setAssessment] = useState<any>(null);
    const [learner, setLearner] = useState<any>(null);

    const [learnerProfile, setLearnerProfile] = useState<any>(null);
    const [assessorProfile, setAssessorProfile] = useState<any>(null);
    const [moderatorProfile, setModeratorProfile] = useState<any>(null);
    const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);

    const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
    const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
    const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

    const [facOverallFeedback, setFacOverallFeedback] = useState('');
    const [assOverallFeedback, setAssOverallFeedback] = useState('');
    const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

    const [modFeedback, setModFeedback] = useState('');
    const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

    const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm: () => void; onCancel?: () => void; confirmText?: string; } | null>(null);
    const [showRemediationModal, setShowRemediationModal] = useState(false);
    const [showReturnToLearnerModal, setShowReturnToLearnerModal] = useState(false);
    const [showResolveAppealModal, setShowResolveAppealModal] = useState(false);

    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartRef = useRef<number>(performance.now());
    const initialFacTimeRef = useRef<number>(0);
    const initialAssTimeRef = useRef<number>(0);
    const initialModTimeRef = useRef<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const currentAttempt = submission?.attemptNumber || 1;
    const isMaxAttempts = currentAttempt >= 3;

    const hasChecklists = assessment?.blocks?.some((b: any) => b.type === 'checklist');
    const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
    const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
    const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task'].includes(b.type));
    const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;

    const isAppealed = currentStatus === 'appealed' || submission?.appeal?.status === 'pending';
    const isAppealUpheld = submission?.appeal?.status === 'upheld';
    const isAppealRejected = submission?.appeal?.status === 'rejected';

    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
    const isModDone = ['moderated', 'appealed'].includes(currentStatus);
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';

    // ── ROLE FLAGS ───────────────────────────────────────────────────────────
    const isMentor = user?.role === 'mentor';
    const isFacilitator = user?.role === 'facilitator';
    const isFacilitatorOrMentor = isFacilitator || isMentor;
    const isAssessor = user?.role === 'assessor';
    const isModerator = user?.role === 'moderator';
    const isAdmin = user?.role === 'admin';

    const facRoleLabel = isMentor ? 'Workplace Verification' : 'Pre-Marking';
    const facPanelTitle = isMentor ? 'Workplace Mentor Verification' : `${user?.role || 'Facilitator'} Pre-Marking`;
    const facRemarksLabel = isMentor ? 'Supervisor Comments' : `${user?.role || 'Facilitator'} Remarks`;
    const facSubmitLabel = isMentor ? 'Verify & Send to Assessor' : 'Send to Assessor';
    const savedFacRole = submission?.grading?.facilitatorRole;
    const facReadOnlyLabel = savedFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark';

    const canFacilitatorMark = isFacilitatorOrMentor && ['not_started', 'in_progress', 'submitted'].includes(currentStatus);
    const canGrade = isAssessor && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned');
    const canModerate = isModerator && currentStatus === 'graded';

    const canReturnToLearner = isMentor && ['submitted', 'in_progress'].includes(currentStatus);

    const showFacilitatorPanel = canFacilitatorMark || isFacDone;
    const showAssessorPanel = canGrade || isAssDone;
    const showModeratorPanel = canModerate || isModDone;

    // Is the active user currently responsible for grading right now?
    const isActiveRole = canFacilitatorMark || canGrade || canModerate;
    // We treat the active user as printing if they hit the print button
    const [isPrintMode, setIsPrintMode] = useState(false);

    useEffect(() => {
        const loadReviewData = async () => {
            if (!submissionId) return;
            try {
                const subRef = doc(db, 'learner_submissions', submissionId);
                const subSnap = await getDoc(subRef);
                if (!subSnap.exists()) throw new Error("Submission not found");
                const subData = subSnap.data();
                setSubmission({ id: subSnap.id, ...subData });

                const assRef = doc(db, 'assessments', subData.assessmentId);
                const assSnap = await getDoc(assRef);
                if (!assSnap.exists()) throw new Error("Assessment template missing");
                const assData = assSnap.data();
                setAssessment(assData);

                const learnerRef = doc(db, 'learners', subData.learnerId);
                const learnerSnap = await getDoc(learnerRef);
                let learnerAuthUid = null;
                if (learnerSnap.exists()) {
                    const lData = learnerSnap.data();
                    setLearner(lData);
                    learnerAuthUid = lData.authUid;
                }

                const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || learnerAuthUid || subData.learnerId;
                if (targetLearnerUid) {
                    const lProfSnap = await getDoc(doc(db, 'users', targetLearnerUid));
                    if (lProfSnap.exists()) setLearnerProfile(lProfSnap.data());
                }

                if (subData.grading?.gradedBy) {
                    const assProfSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
                    if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
                }

                if (subData.moderation?.moderatedBy) {
                    const modProfSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
                    if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
                }

                const facId = subData.latestCoachingLog?.facilitatorId || subData.grading?.facilitatorId;
                if (facId) {
                    const facProfSnap = await getDoc(doc(db, 'users', facId));
                    if (facProfSnap.exists()) setFacilitatorProfile(facProfSnap.data());
                }

                const historyRef = collection(db, 'learner_submissions', submissionId, 'history');
                const historySnapshotsRes = await getDocs(query(historyRef));
                const hData = historySnapshotsRes.docs.map(d => ({ id: d.id, ...d.data() } as any));
                hData.sort((a: any, b: any) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
                setHistorySnapshots(hData);

                initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
                initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
                initialModTimeRef.current = subData.moderation?.timeSpent || 0;
                sessionStartRef.current = performance.now();

                let fBreakdown = subData.grading?.facilitatorBreakdown;
                let aBreakdown = subData.grading?.assessorBreakdown;
                let mBreakdown = subData.moderation?.breakdown;

                const dbStatus = String(subData.status || '').toLowerCase();

                const generateFreshBreakdown = (includeFeedback: boolean) => {
                    const fresh: Record<string, GradeData> = {};
                    assData.blocks?.forEach((block: any) => {
                        if (block.type === 'mcq') {
                            const isCorrect = subData.answers?.[block.id] === block.correctOption;
                            fresh[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '', isCorrect };
                        } else if (block.type === 'text' || block.type === 'task') {
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
                        } else if (block.type === 'checklist') {
                            const critInit = block.criteria?.map(() => ({ status: null, comment: '', startTime: '', endTime: '' })) || [];
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null, criteriaResults: critInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
                        } else if (block.type === 'logbook') {
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
                        } else if (block.type === 'qcto_workplace') {
                            const actInit = block.workActivities?.map(() => ({ status: null, comment: '' })) || [];
                            fresh[block.id] = { score: 0, feedback: '', isCorrect: null, activityResults: actInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
                        }
                    });
                    return fresh;
                };

                if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
                    if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) fBreakdown = subData.grading.breakdown;
                    else fBreakdown = generateFreshBreakdown(true);
                }
                setFacBreakdown(fBreakdown);

                if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
                    if (['facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(dbStatus)) {
                        aBreakdown = generateFreshBreakdown(false);
                        assData.blocks?.forEach((b: any) => {
                            if ((b.type === 'checklist' || b.type === 'qcto_workplace') && fBreakdown[b.id]) {
                                aBreakdown[b.id] = { ...JSON.parse(JSON.stringify(fBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
                            }
                        });
                    } else {
                        aBreakdown = {};
                    }
                }
                setAssBreakdown(aBreakdown);

                if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
                    if (['graded', 'moderated', 'returned', 'appealed'].includes(dbStatus)) {
                        mBreakdown = generateFreshBreakdown(false);
                        assData.blocks?.forEach((b: any) => {
                            if ((b.type === 'checklist' || b.type === 'qcto_workplace') && aBreakdown[b.id]) {
                                mBreakdown[b.id] = { ...JSON.parse(JSON.stringify(aBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
                            }
                        });
                    } else {
                        mBreakdown = {};
                    }
                }
                setModBreakdown(mBreakdown);

                setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
                setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');
                setCompetency(subData.competency || null);
                setModFeedback(subData.moderation?.feedback || '');
                setModOutcome(subData.moderation?.outcome || null);

            } catch (err: any) {
                toast.error(err.message || "Failed to load data.");
            } finally {
                setLoading(false);
            }
        };
        loadReviewData();

        // Bind print events to hide active controls if needed
        const handleBeforePrint = () => setIsPrintMode(true);
        const handleAfterPrint = () => setIsPrintMode(false);
        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [submissionId]);

    const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

    const formatTimeSpent = (seconds?: number) => {
        if (seconds === undefined || seconds === null) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        return `${m}m`;
    };

    const formatCalendarSpread = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return null;
        const diffHours = (new Date(endStr).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60);
        if (diffHours < 24) return diffHours < 1 ? '< 1 hr spread' : `${Math.floor(diffHours)} hr spread`;
        return `${Math.floor(diffHours / 24)} day spread`;
    };

    const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!submission?.id) return;
            try {
                const updatePayload: any = {
                    'grading.facilitatorBreakdown': fBreak,
                    'grading.assessorBreakdown': aBreak,
                    'moderation.breakdown': mBreak,
                    'grading.facilitatorOverallFeedback': fOverall,
                    'grading.assessorOverallFeedback': aOverall,
                    'moderation.feedback': updatedModFeedback,
                    lastStaffEditAt: new Date().toISOString()
                };
                if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
                if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;
                if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = getFacTime();
                if (canGrade) updatePayload['grading.assessorTimeSpent'] = getAssTime();
                if (canModerate) updatePayload['moderation.timeSpent'] = getModTime();

                const nowIso = new Date().toISOString();
                if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
                    updatePayload['grading.facilitatorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
                }
                if (canGrade && !submission.grading?.assessorStartedAt) {
                    updatePayload['grading.assessorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
                }
                if (canModerate && !submission.moderation?.moderatorStartedAt) {
                    updatePayload['moderation.moderatorStartedAt'] = nowIso;
                    setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
                }
                await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
            } catch (error) { console.error("Auto-save failed:", error); } finally { setSaving(false); }
        }, 1500);
    };

    const getActiveBreakdownData = (blockId: string) => {
        if (canFacilitatorMark) return { ...facBreakdown[blockId] };
        if (canGrade) return { ...assBreakdown[blockId] };
        if (canModerate) return { ...modBreakdown[blockId] };
        return null;
    };

    const setActiveBreakdownData = (blockId: string, newData: GradeData) => {
        if (canFacilitatorMark) {
            const next = { ...facBreakdown, [blockId]: newData };
            setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canGrade) {
            const next = { ...assBreakdown, [blockId]: newData };
            setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        } else if (canModerate) {
            const next = { ...modBreakdown, [blockId]: newData };
            setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
        }
    };

    const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.isCorrect = isCorrect;
        active.score = isCorrect ? maxMarks : 0;
        setActiveBreakdownData(blockId, active);
    };

    const handleScoreChange = (blockId: string, score: number, max: number) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.score = Math.min(Math.max(0, score), max);
        setActiveBreakdownData(blockId, active);
    };

    const handleFeedbackChange = (blockId: string, feedback: string) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        active.feedback = feedback;
        setActiveBreakdownData(blockId, active);
    };

    const handleCriterionChange = (blockId: string, index: number, field: keyof CriterionResult, value: any) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const crits = [...(active.criteriaResults || [])];
        if (!crits[index]) crits[index] = { status: null, comment: '', startTime: '', endTime: '' };
        crits[index] = { ...crits[index], [field]: value };
        active.criteriaResults = crits;
        const block = assessment?.blocks?.find((b: any) => b.id === blockId);
        const total = block?.criteria?.length || 0;
        if (total > 0 && crits.length >= total && crits.slice(0, total).every((c: any) => c?.status)) {
            active.isCorrect = crits.slice(0, total).every((c: any) => c?.status === 'C');
        }
        setActiveBreakdownData(blockId, active);
    };

    const handleActivityStatusChange = (blockId: string, index: number, status: 'C' | 'NYC') => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const activities = [...(active.activityResults || [])];
        if (!activities[index]) activities[index] = { status: null, comment: '' };
        activities[index].status = status;
        active.activityResults = activities;
        const block = assessment?.blocks?.find((b: any) => b.id === blockId);
        const total = block?.workActivities?.length || 0;
        if (total > 0 && activities.length >= total && activities.slice(0, total).every((a: any) => a?.status)) {
            active.isCorrect = activities.slice(0, total).every((a: any) => a?.status === 'C');
        }
        setActiveBreakdownData(blockId, active);
    };

    const handleActivityCommentChange = (blockId: string, index: number, comment: string) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        const activities = [...(active.activityResults || [])];
        if (!activities[index]) activities[index] = { status: null, comment: '' };
        activities[index].comment = comment;
        active.activityResults = activities;
        setActiveBreakdownData(blockId, active);
    };

    const handleGlobalChecklistChange = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime' | 'obsDeclaration', value: any) => {
        const active = getActiveBreakdownData(blockId);
        if (!active) return;
        (active as any)[field] = value;
        setActiveBreakdownData(blockId, active);
    };

    const handleSetToNow = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime') => {
        if (field === 'obsDate') handleGlobalChecklistChange(blockId, field, moment().format('YYYY-MM-DD'));
        else handleGlobalChecklistChange(blockId, field, moment().format('HH:mm'));
    };

    const handleFacOverallFeedbackChange = (val: string) => { if (!canFacilitatorMark) return; setFacOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome); };
    const handleAssOverallFeedbackChange = (val: string) => { if (!canGrade) return; setAssOverallFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome); };
    const handleModFeedbackChange = (val: string) => { if (!canModerate) return; setModFeedback(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome); };
    const handleCompetencySelect = (val: 'C' | 'NYC') => { if (!canGrade) return; setCompetency(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome); };
    const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => { if (!canModerate) return; setModOutcome(val); triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val); };

    // ── RETURN TO LEARNER ────────────────────────────────────────────────────
    const executeReturnToLearner = async (reason: string) => {
        setShowReturnToLearnerModal(false);
        setSaving(true);
        try {
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'in_progress',
                mentorReturnReason: reason,
                mentorReturnedAt: new Date().toISOString(),
                mentorReturnedBy: user?.uid,
                mentorReturnedByName: user?.fullName,
                lastStaffEditAt: new Date().toISOString(),
            });
            toast.success("Logbook returned to learner for correction.");
            setTimeout(() => navigate(-1), 1500);
        } catch (err) {
            toast.error("Failed to return logbook to learner.");
        } finally {
            setSaving(false);
        }
    };

    // ── REMEDIATION ──────────────────────────────────────────────────────────
    // ── REMEDIATION ──────────────────────────────────────────────────────────
    const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
        setShowRemediationModal(false);
        setSaving(true);
        try {
            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission, archivedAt: new Date().toISOString(), snapshotReason: 'Remediation requested after NYC outcome',
                coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
            });
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'not_started', //Reset to the Gate screen
                startedAt: deleteField(), //Wipe the old timer!
                competency: deleteField(),
                grading: deleteField(),
                moderation: deleteField(),
                submittedAt: deleteField(),
                learnerDeclaration: deleteField(),
                attemptNumber: (submission.attemptNumber || 1) + 1,
                lastStaffEditAt: new Date().toISOString(),
                latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName, acknowledged: false }
            });
            toast.success("Workbook grading cleared and unlocked for learner!");
            setTimeout(() => navigate(-1), 1500);
        } catch (err) { toast.error("Failed to unlock for remediation."); } finally { setSaving(false); }
    };

    // ── RESOLVE APPEAL ────────────────────────────────────────────────────────
    const executeAppealResolution = async (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => {
        setShowResolveAppealModal(false);
        setSaving(true);
        try {
            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission, archivedAt: new Date().toISOString(), snapshotReason: `Appeal Resolution: ${decision}`
            });

            const updatePayload: any = {
                'appeal.status': decision === 'overturn' || decision === 'new_attempt' ? 'upheld' : 'rejected',
                'appeal.resolutionNotes': notes,
                'appeal.resolvedBy': user?.uid,
                'appeal.resolvedByName': user?.fullName,
                'appeal.resolvedAt': new Date().toISOString(),
                lastStaffEditAt: new Date().toISOString()
            };

            if (decision === 'overturn') {
                updatePayload.status = 'moderated';
                updatePayload.competency = 'C';
                updatePayload['moderation.outcome'] = 'Endorsed';
                updatePayload['moderation.feedback'] = `APPEAL UPHELD: ${notes}`;
            } else if (decision === 'new_attempt') {
                updatePayload.status = 'not_started';
                updatePayload.startedAt = deleteField();
                updatePayload.competency = deleteField();
                updatePayload.grading = deleteField();
                updatePayload.moderation = deleteField();
                updatePayload.submittedAt = deleteField();
                updatePayload.learnerDeclaration = deleteField();
                updatePayload.attemptNumber = (submission.attemptNumber || 1) + 1;
            } else if (decision === 'reject') {
                updatePayload.status = 'moderated';
            }

            await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
            toast.success("Appeal resolved successfully!");
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            toast.error("Failed to resolve appeal.");
        } finally {
            setSaving(false);
        }
    };

    const getTotals = (breakdown: Record<string, GradeData>) => {
        const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
        const max = assessment?.totalMarks || 0;
        const pct = max > 0 ? Math.round((score / max) * 100) : 0;
        return { score, max, pct };
    };

    const facTotals = getTotals(facBreakdown);
    const assTotals = getTotals(assBreakdown);
    const modTotals = getTotals(modBreakdown);

    let activeTotals = facTotals;
    if (showAssessorPanel) activeTotals = assTotals;
    if (showModeratorPanel) activeTotals = modTotals;

    const sectionTotals: Record<string, { total: number, awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type) && currentSectionId) {
                const g = submission?.grading || {}; const m = submission?.moderation || {};
                const mLayer = m.breakdown?.[block.id] || {}; const aLayer = g.assessorBreakdown?.[block.id] || {}; const fLayer = g.facilitatorBreakdown?.[block.id] || {};
                const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };
                let activeLayer = legacyLayer;
                if (isFacDone) activeLayer = fLayer;
                if (isAssDone) activeLayer = aLayer;
                if (isModDone) activeLayer = mLayer;
                sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
                if (activeLayer.score !== undefined && activeLayer.score !== null) sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
            }
        });
    }

    // ─── VALIDATION ───────────────────────────────────────────────────────────
    const validateMentorVerification = (): string | null => {
        if (!assessment?.blocks) return null;

        for (const block of assessment.blocks) {
            const grade = facBreakdown[block.id];

            if (block.type === 'checklist') {
                const criteria = block.criteria || [];
                const results = grade?.criteriaResults || [];

                for (let i = 0; i < criteria.length; i++) {
                    if (!results[i]?.status) {
                        return `Please select "Observed ✓" or "Not Observed ✗" for every criterion in the checklist "${block.title}". Item ${i + 1} is still unverified.`;
                    }
                }

                if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
                    return `Please tick the verification declaration at the bottom of the checklist "${block.title}" before submitting.`;
                }
            }

            if (block.type === 'qcto_workplace') {
                const activities = block.workActivities || [];
                const results = grade?.activityResults || [];

                for (let i = 0; i < activities.length; i++) {
                    if (!results[i]?.status) {
                        return `Please select "Verified ✓" or "Not Verified ✗" for every Work Activity in "${block.weCode} – ${block.weTitle}". Activity ${i + 1} (${activities[i]?.code || `#${i + 1}`}) is still unverified.`;
                    }
                }

                if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
                    return `Please tick the workplace verification sign-off declaration at the bottom of "${block.weCode} – ${block.weTitle}" before submitting.`;
                }
            }
        }

        return null;
    };

    const validateAllMarked = (breakdown: Record<string, GradeData>, isModerating: boolean = false) => {
        if (!assessment?.blocks) return true;
        const isAssessorGrading = canGrade;
        const unmarkedCount = assessment.blocks.filter((block: any) => {
            const grade = breakdown[block.id];

            // Admins & Facilitators bypass validation for Workplace (read-only)
            if (isWorkplaceModule && (isAdmin || isFacilitator) && !isModerating) {
                return false;
            }

            if (['mcq', 'text', 'task'].includes(block.type)) {
                return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
            }

            if (block.type === 'checklist') {
                const declarationRequired = !isModerating && block.requireObservationDeclaration
                    && !grade?.obsDeclaration
                    && !(isAssessorGrading && savedFacRole === 'mentor');
                if (declarationRequired) return true;
                const crits = grade?.criteriaResults || [];
                const total = block.criteria?.length || 0;
                for (let i = 0; i < total; i++) {
                    if (!crits[i] || !crits[i].status) return true;
                }
                const allHaveStatus = crits.slice(0, total).every((c: any) => c?.status);
                if (!allHaveStatus) return true;
                return false;
            }

            if (block.type === 'qcto_workplace') {
                const declarationRequired = !isModerating && block.requireObservationDeclaration
                    && !grade?.obsDeclaration
                    && !(isAssessorGrading && savedFacRole === 'mentor');
                if (declarationRequired) return true;

                // Mentors do not assign C/NYC status, so they bypass this strict criteria check
                if (isMentor) return false;

                const activities = grade?.activityResults || [];
                const total = block.workActivities?.length || 0;
                for (let i = 0; i < total; i++) {
                    if (!activities[i] || !activities[i].status) return true;
                }
                const allHaveStatus = activities.slice(0, total).every((a: any) => a?.status);
                if (!allHaveStatus) return true;
                return false;
            }

            return false;
        }).length;
        return unmarkedCount === 0;
    };

    // ─── SUBMIT HANDLERS ──────────────────────────────────────────────────────
    const triggerSubmitFacilitator = () => {
        if (isMentor) {
            const mentorValidationError = validateMentorVerification();
            if (mentorValidationError) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Incomplete Verification',
                    message: mentorValidationError,
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
            if (!facOverallFeedback.trim()) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Supervisor Comments Required',
                    message: 'Please add your overall Supervisor Comments before verifying this logbook.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
        } else {
            if (!validateAllMarked(facBreakdown, false)) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Incomplete Marking',
                    message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
            if (!facOverallFeedback.trim()) {
                return setModalConfig({
                    isOpen: true, type: 'warning', title: 'Missing Remarks',
                    message: 'You must provide Overall Facilitator Remarks before sending this script forward.',
                    confirmText: 'Got it', onConfirm: () => setModalConfig(null)
                });
            }
        }

        let newStatus = 'facilitator_reviewed';
        let confirmTitle = isWorkplaceModule ? 'Complete Mentor Verification?' : 'Complete Pre-Marking?';
        let confirmMessage = isWorkplaceModule ? 'This will finalize your verification and send the logbook to the Assessor.' : 'This will finalize your feedback and send the workbook to the Assessor.';
        let confirmBtnText = 'Send to Assessor';

        if (['not_started', 'in_progress'].includes(currentStatus)) {
            if (hasChecklists || hasWorkplace) {
                newStatus = 'awaiting_learner_signoff';
                confirmTitle = isWorkplaceModule ? 'Request Learner Sign-off?' : 'Request Learner Sign-off?';
                confirmMessage = isWorkplaceModule
                    ? 'This will save your verification and prompt the learner to log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.'
                    : 'This will save your practical observation and prompt the learner to log in, review your feedback, and officially sign off before it goes to the Assessor.';
                confirmBtnText = isWorkplaceModule ? 'Save & Request Learner Signature' : 'Save & Request Sign-off';
            } else {
                confirmTitle = isWorkplaceModule ? 'Force Verify?' : 'Force Submission?';
                confirmMessage = isWorkplaceModule
                    ? 'The learner has not formally submitted yet. Verifying now will lock the logbook for the learner and pass it directly to the Assessor. Proceed?'
                    : 'The learner has not submitted this workbook yet. Finalising your marking now will lock the workbook and pass it to the Assessor. Proceed?';
                confirmBtnText = isWorkplaceModule ? 'Verify & Force Submit' : 'Force Submit & Send';
            }
        }

        setModalConfig({
            isOpen: true, type: 'info', title: confirmTitle, message: confirmMessage, confirmText: confirmBtnText,
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus,
                        'grading.facilitatorBreakdown': facBreakdown,
                        'grading.facilitatorOverallFeedback': facOverallFeedback,
                        'grading.facilitatorId': user?.uid,
                        'grading.facilitatorName': user?.fullName,
                        'grading.facilitatorRole': user?.role,
                        'grading.facilitatorReviewedAt': new Date().toISOString(),
                        'grading.facilitatorTimeSpent': getFacTime()
                    });
                    if (newStatus === 'awaiting_learner_signoff') {
                        toast.success(isWorkplaceModule ? "Verification saved! Learner has been requested to sign the logbook." : "Observation saved! Learner has been requested to sign off.");
                    } else {
                        toast.success(isWorkplaceModule ? "Logbook verified and passed to Assessor!" : "Script marked and passed to Assessor!");
                    }
                    setTimeout(() => navigate(-1), 2000);
                } catch (error) { toast.error("Failed to save."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitGrade = () => {
        if (!validateAllMarked(assBreakdown, false)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!assOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'warning', title: 'Finalise Grade?', message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.', confirmText: 'Apply Signature & Submit',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'graded', marks: assTotals.score, competency,
                        'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback,
                        'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName,
                        'grading.assessorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'grading.gradedAt': new Date().toISOString(), 'grading.assessorTimeSpent': getAssTime()
                    });
                    toast.success("Workbook graded and signed successfully!"); setTimeout(() => window.location.reload(), 500);
                } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    const triggerSubmitModeration = () => {
        if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Decision', message: 'You must select Endorse or Return to Assessor before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (modOutcome === 'Returned' && !modFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Green Pen Instructions Required', message: 'You must provide Green Pen instructions explaining what the Assessor needs to fix before this can be returned.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
        if (!isWorkplaceModule && !validateAllMarked(modBreakdown, true)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question and fully check all blocks before endorsing.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

        setModalConfig({
            isOpen: true, type: 'info',
            title: modOutcome === 'Returned' ? 'Return to Assessor?' : 'Endorse & Finalise?',
            message: modOutcome === 'Returned'
                ? 'This will return the workbook to the Assessor with your Green Pen instructions. The Assessor must address your concerns before re-submitting.'
                : 'This will apply your Green Pen signature and endorse the Assessor\'s judgment. The learner\'s result will be locked in for the QCTO verifier.',
            confirmText: modOutcome === 'Returned' ? 'Confirm Return' : 'Confirm Endorsement',
            onConfirm: async () => {
                setModalConfig(null); setSaving(true);
                try {
                    const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';
                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome,
                        'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid,
                        'moderation.moderatorName': user?.fullName, 'moderation.moderatorRegNumber': user?.assessorRegNumber || 'Pending Reg',
                        'moderation.moderatedAt': new Date().toISOString(), 'moderation.timeSpent': getModTime()
                    });
                    toast.success("Moderation saved successfully!"); setTimeout(() => navigate(-1), 1000);
                } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
            }, onCancel: () => setModalConfig(null)
        });
    };

    if (loading) return (
        <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div className="ap-spinner" />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}> Loading Record...</span>
            </div>
        </div>
    );

    if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

    const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
    const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');
    const canPrint = !['not_started', 'in_progress'].includes(currentStatus);

    // ─── RENDER BLOCKS ────────────────────────────────────────────────────────
    const renderBlocks = (isPrintMode: boolean) => {
        let qNum = 0;

        return assessment.blocks?.map((block: any) => {
            if (block.type === 'section') {
                const totals = sectionTotals[block.id];
                return (
                    <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
                            {isAssDone && totals && totals.total > 0 && (
                                <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}><BarChart size={14} /> {totals.awarded}/{totals.total}</span>
                            )}
                        </div>
                        {block.content && (
                            <div className="quill-read-only-content" style={{ color: '#334155', fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: block.content }} />
                        )}
                    </div>
                );
            }

            if (block.type === 'info') return (
                <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderLeft: '4px solid #0ea5e9', background: '#f0f9ff', padding: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 'bold', marginBottom: '8px' }}><Info size={16} /> Reading Material</div>
                    <p style={{ margin: 0, color: '#0c4a6e', whiteSpace: 'pre-wrap' }}>{block.content}</p>
                </div>
            );

            if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
                qNum++;
                const learnerAns = submission.answers?.[block.id];
                const maxM = block.marks || 0;

                const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
                const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
                const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };

                let activeInkColor = 'blue'; let activeData = fData; let isActiveRole = false;

                if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
                else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
                else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
                else {
                    if (isModDone) { activeInkColor = 'green'; activeData = mData; }
                    else if (isAssDone) { activeInkColor = 'red'; activeData = aData; }
                    else { activeInkColor = 'blue'; activeData = fData; }
                }

                // Allow read-only layers to show if they have data AND we are not the one actively producing that data right now. 
                const renderFacReadOnly = (isFacDone || fData?.feedback || fData?.score > 0) && (!canFacilitatorMark || isPrintMode);
                const renderAssReadOnly = (isAssDone || aData?.feedback || aData?.score > 0) && (!canGrade || isPrintMode);
                const renderModReadOnly = (isModDone || mData?.feedback) && (!canModerate || isPrintMode);

                const mentorActiveOnScorableBlock = isMentor && canFacilitatorMark && ['mcq', 'text', 'task'].includes(block.type);

                // Helper to resolve the correct declaration data depending on role
                let decData = activeData;
                let isDeclarationInteractive = isActiveRole;
                if (isModerator) {
                    decData = isWorkplaceModule ? fData : aData;
                    isDeclarationInteractive = false;
                } else if (isAssessor && isWorkplaceModule) {
                    decData = fData; // Assessor sees Mentor's declaration read-only
                    isDeclarationInteractive = false;
                }

                // ── GRADE BOX HELPER ──────────────────────────────────────────────
                const renderReadOnlyLayers = () => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: (!isPrintMode && isActiveRole) ? '1rem' : '0' }}>
                        {renderFacReadOnly && (
                            <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
                                <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>
                                    <Info size={13} /> {facReadOnlyLabel}
                                </div>
                                <div style={{ color: '#0369a1', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {submission.grading?.facilitatorRole !== 'mentor' && (
                                        <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span>
                                    )}
                                    {fData.feedback || <em style={{ opacity: 0.7 }}>No specific {submission.grading?.facilitatorRole === 'mentor' ? 'supervisor comments' : 'coaching'} provided.</em>}
                                </div>
                            </div>
                        )}
                        {renderAssReadOnly && (
                            <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
                                <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}><Award size={13} /> Assessor Grade</div>
                                <div style={{ color: '#991b1b', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {!isWorkplaceModule && <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{aData.score ?? 0}/{maxM}]</span>}
                                    {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}
                                </div>
                            </div>
                        )}
                        {renderModReadOnly && (
                            <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px' }}>
                                <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}><ShieldCheck size={13} /> Moderator QA</div>
                                <div style={{ color: '#16a34a', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {!isWorkplaceModule && <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{mData.score ?? 0}/{maxM}]</span>}
                                    {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}
                                </div>
                            </div>
                        )}
                    </div>
                );

                const renderActiveGradeControls = (blockId: string) => {
                    if (isModerator && isWorkplaceModule) {
                        return (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#15803d', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <ShieldCheck size={14} /> Moderator QA Notes
                                </div>
                                <textarea
                                    className="sr-feedback-input"
                                    rows={2}
                                    style={{ width: '100%', color: 'green', fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #bbf7d0', borderRadius: '4px', resize: 'vertical', background: 'white' }}
                                    placeholder="Moderator Green Pen QA notes for this item (optional)..."
                                    value={activeData.feedback || ''}
                                    onChange={e => handleFeedbackChange(blockId, e.target.value)}
                                />
                                <p style={{ margin: '8px 0 0 0', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                                    Moderators verify QA compliance — marks are not awarded on Workplace Experience modules.
                                </p>
                            </div>
                        );
                    }

                    if (mentorActiveOnScorableBlock) {
                        return (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <ShieldCheck size={14} /> Supervisor Observation Comments
                                </div>
                                <textarea
                                    className="sr-feedback-input"
                                    rows={2}
                                    style={{ width: '100%', color: 'blue', fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
                                    placeholder="Add any supervisor observation notes for this item (optional)..."
                                    value={activeData.feedback || ''}
                                    onChange={e => handleFeedbackChange(blockId, e.target.value)}
                                />
                                <p style={{ margin: '8px 0 0 0', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                                    As Workplace Mentor, you verify and observe — the Assessor will formally grade this item.
                                </p>
                            </div>
                        );
                    }

                    return (
                        <>
                            <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <label style={{ color: activeInkColor, fontWeight: 'bold', fontSize: '0.85rem' }}>Total Marks Awarded for this block:</label>
                                <input type="number" className="sr-score-input" style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }} value={activeData.score ?? 0} onChange={e => handleScoreChange(blockId, parseInt(e.target.value) || 0, maxM)} />
                                <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
                            </div>
                            <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
                                <textarea className="sr-feedback-input" rows={2} style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }} placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."} value={activeData.feedback || ''} onChange={e => handleFeedbackChange(blockId, e.target.value)} />
                            </div>
                        </>
                    );
                };

                // ── MCQ ──────────────────────────────────────────────────────────
                if (block.type === 'mcq') {
                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{qNum}</span>
                                    <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.question}</span>
                                </div>
                                {!isPrintMode && isActiveRole && !isMentor && !(isModerator && isWorkplaceModule) && (
                                    <div className="sr-visual-mark">
                                        <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                        <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                    </div>
                                )}
                            </div>
                            <div className="sr-q-body">
                                <div className="sr-answer-box">
                                    <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                    <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
                                        <span style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + learnerAns)}. ${block.options?.[learnerAns]}` : 'No answer provided.'}</span>
                                        {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
                                    </div>
                                    <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + block.correctOption)}. {block.options?.[block.correctOption]}</strong></div>
                                </div>
                                <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                    {renderReadOnlyLayers()}
                                    {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                </div>
                            </div>
                        </div>
                    );
                }

                // ── TEXT ─────────────────────────────────────────────────────────
                if (block.type === 'text') {
                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e' }}>Q{qNum}</span>
                                    <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.question}</span>
                                </div>
                                {!isPrintMode && isActiveRole && !isMentor && !(isModerator && isWorkplaceModule) && (
                                    <div className="sr-visual-mark">
                                        <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                        <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                    </div>
                                )}
                            </div>
                            <div className="sr-q-body">
                                <div className="sr-answer-box">
                                    <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                    <div className="sr-text-ans">
                                        {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: learnerAns }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
                                    </div>
                                </div>
                                <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                    {renderReadOnlyLayers()}
                                    {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                </div>
                            </div>
                        </div>
                    );
                }

                // ── TASK ─────────────────────────────────────────────────────────
                if (block.type === 'task') {
                    // SAFE FALLBACK FOR LEARNER ANSWERS TO PREVENT CRASHES
                    const safeLearnerAns = learnerAns || {};

                    const taskTabs = [
                        { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', val: safeLearnerAns.text },
                        { id: 'audio', icon: <Mic size={14} />, label: 'Audio', val: safeLearnerAns.audioUrl },
                        { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', val: safeLearnerAns.url },
                        { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', val: safeLearnerAns.uploadUrl },
                        { id: 'code', icon: <Code size={14} />, label: 'Code', val: safeLearnerAns.code }
                    ].filter(t => !!t.val);

                    const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;

                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#ede9fe', color: '#8b5cf6' }}>Q{qNum}</span>
                                    <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.question}</span>
                                </div>
                                {!isPrintMode && isActiveRole && !isMentor && !(isModerator && isWorkplaceModule) && (
                                    <div className="sr-visual-mark">
                                        <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                        <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                    </div>
                                )}
                            </div>
                            <div className="sr-q-body">
                                <div className="sr-answer-box">
                                    <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Learner Evidence Submitted:</div>
                                    {(!learnerAns || Object.keys(learnerAns).length === 0) ? (
                                        <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No evidence uploaded by learner.</span>
                                    ) : isPrintMode ? (
                                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: 'white' }}>
                                            {safeLearnerAns.text && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Rich Text Response:</strong><div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: safeLearnerAns.text }} /></div>}
                                            {safeLearnerAns.audioUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Audio Recording:</strong><div>URL: {safeLearnerAns.audioUrl}</div></div>}
                                            {safeLearnerAns.url && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Link:</strong><div><a href={safeLearnerAns.url} target="_blank" rel="noreferrer">{safeLearnerAns.url}</a></div></div>}
                                            {safeLearnerAns.uploadUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Uploaded File:</strong><FilePreview url={safeLearnerAns.uploadUrl} /></div>}
                                            {safeLearnerAns.code && <div><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Code:</strong><pre style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}>{safeLearnerAns.code}</pre></div>}
                                        </div>
                                    ) : taskTabs.length === 0 ? (
                                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>No evidence provided.</span>
                                    ) : (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
                                            <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                                                {taskTabs.map(t => (
                                                    <button key={t.id} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })} style={{ padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent', background: activeTabId === t.id ? 'white' : 'transparent', color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTabId === t.id ? 'bold' : 'normal', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                        {t.icon} {t.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div style={{ padding: '15px' }}>
                                                {activeTabId === 'text' && <div className="quill-read-only-content" style={{ wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: safeLearnerAns.text || '' }} />}
                                                {activeTabId === 'audio' && <audio controls src={safeLearnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />}
                                                {activeTabId === 'url' && <UrlPreview url={safeLearnerAns.url} />}
                                                {activeTabId === 'upload' && <FilePreview url={safeLearnerAns.uploadUrl} />}
                                                {activeTabId === 'code' && <pre style={{ margin: 0, overflowX: 'auto', fontSize: '0.85rem', fontFamily: 'monospace', background: '#1e293b', color: '#f8fafc', padding: '15px', borderRadius: '4px' }}><code>{safeLearnerAns.code}</code></pre>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                    {renderReadOnlyLayers()}
                                    {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                </div>
                            </div>
                        </div>
                    );
                }

                // ── LOGBOOK ──────────────────────────────────────────────────────
                if (block.type === 'logbook') {
                    const entries = Array.isArray(learnerAns) ? learnerAns : [];
                    const totalHours = entries.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0);

                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#ffedd5', color: '#ea580c' }}>LOG</span>
                                    <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.title}</span>
                                </div>
                            </div>
                            <div className="sr-q-body">
                                <div className="sr-answer-box">
                                    <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarRange size={14} /> Workplace Hours Logged:</div>
                                    {entries.length === 0 ? (
                                        <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No entries logged by learner.</span>
                                    ) : (
                                        <>
                                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', background: 'white' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                                                            <th style={{ padding: '10px' }}>Date</th>
                                                            <th style={{ padding: '10px' }}>Assignment Task & Evidence</th>
                                                            <th style={{ padding: '10px' }}>Start Time</th>
                                                            <th style={{ padding: '10px' }}>Finish Time</th>
                                                            <th style={{ padding: '10px' }}>Total Hours</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {entries.map((entry: any, i: number) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: 'white', verticalAlign: 'top' }}>
                                                                <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.date}</td>
                                                                <td style={{ padding: '10px', color: '#334155' }}>
                                                                    <div className="quill-read-only-content" style={{ fontSize: '0.85rem', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: entry.task || '<em>No task description provided.</em>' }} />
                                                                    {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} /></div>}
                                                                    {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
                                                                </td>
                                                                <td style={{ padding: '10px', color: '#475569' }}>{entry.startTime}</td>
                                                                <td style={{ padding: '10px', color: '#475569' }}>{entry.endTime}</td>
                                                                <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.hours}</td>
                                                            </tr>
                                                        ))}
                                                        <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                                            <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.8rem', color: '#475569' }}>Total Logged Hours:</td>
                                                            <td style={{ padding: '10px', color: '#ea580c', fontSize: '1.1rem' }}>{totalHours}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>

                                            <LogbookHoursTally entries={entries} requiredHours={block.requiredHours} />

                                            {isMentor && canFacilitatorMark && (
                                                <div style={{ marginTop: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                                        <ShieldCheck size={14} /> Supervisor Comments on Logbook
                                                    </div>
                                                    <textarea
                                                        className="sr-feedback-input"
                                                        rows={3}
                                                        style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
                                                        placeholder="Comment on the accuracy and completeness of hours logged..."
                                                        value={activeData.feedback || ''}
                                                        onChange={e => handleFeedbackChange(block.id, e.target.value)}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }

                // ── CHECKLIST ────────────────────────────────────────────────────
                if (block.type === 'checklist') {
                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.title}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            {isMentor ? 'Workplace observation checklist — verify each criterion.' : 'Assessor observation checklist.'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="sr-q-body">
                                <div style={{ marginTop: '1rem' }}>
                                    {block.criteria?.map((crit: string, i: number) => {
                                        const mentorResult = fData.criteriaResults?.[i] || { status: null, comment: '' };
                                        const assessorResult = aData.criteriaResults?.[i] || { status: null, comment: '' };
                                        const modResult = mData.criteriaResults?.[i] || { status: null, comment: '' };
                                        const myResult = activeData.criteriaResults?.[i] || { status: null, comment: '', startTime: '', endTime: '' };

                                        const displayResult = isModerator ? assessorResult : myResult;

                                        let durationStr = '';
                                        if (myResult.startTime && myResult.endTime) {
                                            const diffMs = new Date(myResult.endTime).getTime() - new Date(myResult.startTime).getTime();
                                            const m = Math.floor(diffMs / 60000);
                                            const s = Math.floor((diffMs % 60000) / 1000);
                                            durationStr = `${m}m ${s}s`;
                                        }

                                        return (
                                            <div key={i} style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
                                                <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '0.95rem' }}>{i + 1}. {crit}</p>

                                                {block.requireEvidencePerCriterion !== false && (() => {
                                                    const rawEv = learnerAns?.[`evidence_${i}`];
                                                    const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});
                                                    if (!critEvidence.uploadUrl && !critEvidence.url && !critEvidence.code && !critEvidence.text) {
                                                        return <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#7c3aed', fontStyle: 'italic', background: '#f5f3ff', padding: '8px', borderRadius: '4px' }}>No evidence provided for this criterion.</p>;
                                                    }
                                                    return (
                                                        <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: '#6d28d9', marginBottom: '10px', textTransform: 'uppercase' }}><Layers size={16} /> Learner Evidence Submitted</label>
                                                            {critEvidence.uploadUrl && <FilePreview url={critEvidence.uploadUrl} />}
                                                            {critEvidence.url && <UrlPreview url={critEvidence.url} />}
                                                            {critEvidence.code && <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto' }}><code>{critEvidence.code}</code></pre>}
                                                            {critEvidence.text && <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: critEvidence.text }} />}
                                                        </div>
                                                    );
                                                })()}

                                                {/* READ ONLY LAYERS (Stacked perfectly) */}
                                                {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
                                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                            <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Observation' : 'Facilitator Pre-Mark'}
                                                        </span>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                            {mentorResult.status === 'C' ? (savedFacRole === 'mentor' ? 'Observed ✓' : 'Competent (C)') : mentorResult.status === 'NYC' ? (savedFacRole === 'mentor' ? 'Not Observed ✗' : 'NYC') : 'Not Reviewed'}
                                                        </span>
                                                        {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
                                                    </div>
                                                )}

                                                {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
                                                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                            <Award size={12} /> Assessor Grade
                                                        </span>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                            {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
                                                        </span>
                                                        {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
                                                    </div>
                                                )}

                                                {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
                                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                            <ShieldCheck size={12} /> Moderator QA
                                                        </span>
                                                        {modResult.status && (
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                                {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
                                                            </span>
                                                        )}
                                                        {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
                                                    </div>
                                                )}

                                                {/* ACTIVE EVALUATION CONTROLS */}
                                                {(!isPrintMode && isActiveRole) && (
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '15px', marginTop: '5px' }}>
                                                        {block.requirePerCriterionTiming !== false && !isModerator && (
                                                            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <Timer size={16} color="#64748b" />
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', minWidth: '80px' }}>Task Timer:</span>
                                                                {!myResult.startTime ? (
                                                                    <button onClick={() => handleCriterionChange(block.id, i, 'startTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Play size={12} /> Start</button>
                                                                ) : !myResult.endTime ? (
                                                                    <>
                                                                        <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold', fontStyle: 'italic' }}>In progress since {new Date(myResult.startTime).toLocaleTimeString()}...</span>
                                                                        <button onClick={() => handleCriterionChange(block.id, i, 'endTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}><Square size={12} /> Stop</button>
                                                                    </>
                                                                ) : (
                                                                    <div style={{ display: 'flex', gap: '15px', fontSize: '0.75rem', color: '#334155' }}>
                                                                        <span><strong>Start:</strong> {new Date(myResult.startTime).toLocaleTimeString()}</span>
                                                                        <span><strong>End:</strong> {new Date(myResult.endTime).toLocaleTimeString()}</span>
                                                                        <span style={{ color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>Duration: {durationStr}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: isModerator ? 'not-allowed' : 'pointer' }}>
                                                                <input type="radio" disabled={isModerator} checked={myResult.status === 'C'} onChange={() => handleCriterionChange(block.id, i, 'status', 'C')} style={{ accentColor: '#22c55e' }} />
                                                                {isMentor ? 'Observed ✓' : 'Competent (C)'}
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: isModerator ? 'not-allowed' : 'pointer' }}>
                                                                <input type="radio" disabled={isModerator} checked={myResult.status === 'NYC'} onChange={() => handleCriterionChange(block.id, i, 'status', 'NYC')} style={{ accentColor: '#ef4444' }} />
                                                                {isMentor ? 'Not Observed ✗' : 'NYC'}
                                                            </label>
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: '250px' }}>
                                                            <textarea
                                                                className="ab-input"
                                                                disabled={isModerator && !isWorkplaceModule && !myResult.comment}
                                                                rows={2}
                                                                placeholder={isMentor ? "Supervisor observation notes..." : isModerator ? "Assessor's comments" : "Assessor comments / reasoning..."}
                                                                value={myResult.comment}
                                                                onChange={e => handleCriterionChange(block.id, i, 'comment', e.target.value)}
                                                                style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
                                        {renderReadOnlyLayers()}
                                        {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                    </div>

                                    {block.requireObservationDeclaration !== false && !isModerator && (
                                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
                                            <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <ShieldCheck size={16} color={activeInkColor} />
                                                {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
                                            </h4>

                                            {block.requireTimeTracking !== false && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                                                    {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
                                                        const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
                                                        const types = ['date', 'time', 'time'];
                                                        const val = decData[field];
                                                        return (
                                                            <div key={field}>
                                                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    {labels[fi]}
                                                                    {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
                                                                </label>
                                                                {(!isDeclarationInteractive || isPrintMode)
                                                                    ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
                                                                    : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
                                                                }
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
                                                <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
                                                {isWorkplaceModule
                                                    ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
                                                    : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }

                // ── QCTO WORKPLACE ───────────────────────────────────────────────
                if (block.type === 'qcto_workplace') {
                    return (
                        <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                            <div className="sr-q-header">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span className="sr-q-num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span className="sr-q-text" style={{ color: '#073f4e', fontWeight: 'bold' }}>{block.weCode} – {block.weTitle}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            {isMentor ? 'Workplace Experience — Mentor Verification' : 'Workplace Experience Checkpoint'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="sr-q-body">
                                {block.workActivities?.map((activity: any, actIdx: number) => {
                                    const taskKey = `wa_${activity.id}_task`;
                                    const dateKey = `wa_${activity.id}_date`;
                                    const task = learnerAns?.[taskKey] || '';
                                    const date = learnerAns?.[dateKey] || '';

                                    const mentorResult = fData.activityResults?.[actIdx] || { status: null, comment: '' };
                                    const assessorResult = aData.activityResults?.[actIdx] || { status: null, comment: '' };
                                    const modResult = mData.activityResults?.[actIdx] || { status: null, comment: '' };
                                    const myResult = activeData.activityResults?.[actIdx] || { status: null, comment: '' };

                                    // If Moderator, show Assessor's result on the radios. Otherwise, show active role's result.
                                    const displayResult = isModerator ? assessorResult : myResult;

                                    return (
                                        <div key={activity.id} style={{ marginBottom: '2rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
                                            <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <h4 style={{ margin: 0, color: '#073f4e' }}>{activity.code}: {activity.description}</h4>
                                            </div>
                                            <div style={{ padding: '1rem' }}>
                                                {/* Learner Evidence */}
                                                <div style={{ marginBottom: '1.5rem' }}>
                                                    <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
                                                        {task && <div style={{ flex: 1, minWidth: '250px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Task Performed:</strong><div className="quill-read-only-content" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal', marginTop: '6px' }} dangerouslySetInnerHTML={{ __html: task }} /></div>}
                                                        {date && <div style={{ minWidth: '120px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Date:</strong><div style={{ marginTop: '6px' }}>{new Date(date).toLocaleDateString()}</div></div>}
                                                    </div>

                                                    {activity.evidenceItems?.map((evItem: any) => {
                                                        const seData = learnerAns?.[`se_${evItem.id}`] || {};
                                                        return (
                                                            <div key={evItem.id} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e11d48', display: 'block', marginBottom: '8px' }}>
                                                                    Evidence: {evItem.code} - {evItem.description}
                                                                </span>
                                                                {seData.uploadUrl && <div style={{ marginBottom: '10px' }}><FilePreview url={seData.uploadUrl} /></div>}
                                                                {seData.url && <div style={{ marginBottom: '10px' }}><UrlPreview url={seData.url} /></div>}
                                                                {seData.code && <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', marginBottom: '10px' }}><code>{seData.code}</code></pre>}
                                                                {seData.text && <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: seData.text }} />}
                                                                {(!seData.uploadUrl && !seData.url && !seData.code && !seData.text) && <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No evidence attached for this item.</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
                                                    {/* READ ONLY LAYERS (Stacked perfectly) */}
                                                    {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
                                                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                                <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark'}
                                                            </span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                                {mentorResult.status === 'C' ? 'Verified ✓' : mentorResult.status === 'NYC' ? 'Not Verified ✗' : 'Not Reviewed'}
                                                            </span>
                                                            {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
                                                        </div>
                                                    )}

                                                    {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
                                                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                                <Award size={12} /> Assessor Grade
                                                            </span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                                {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
                                                            </span>
                                                            {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
                                                        </div>
                                                    )}

                                                    {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
                                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
                                                                <ShieldCheck size={12} /> Moderator QA
                                                            </span>
                                                            {modResult.status && (
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
                                                                    {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
                                                                </span>
                                                            )}
                                                            {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
                                                        </div>
                                                    )}

                                                    {/* ACTIVE EVALUATION CONTROLS */}
                                                    {(!isPrintMode && isActiveRole) && (
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: isModerator ? 'not-allowed' : 'pointer' }}>
                                                                    <input type="radio" disabled={isModerator} checked={myResult.status === 'C'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'C')} style={{ accentColor: '#22c55e' }} />
                                                                    {isMentor ? 'Verified ✓' : 'Competent (C)'}
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: isModerator ? 'not-allowed' : 'pointer' }}>
                                                                    <input type="radio" disabled={isModerator} checked={myResult.status === 'NYC'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'NYC')} style={{ accentColor: '#ef4444' }} />
                                                                    {isMentor ? 'Not Verified ✗' : 'NYC'}
                                                                </label>
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: '250px' }}>
                                                                <textarea
                                                                    className="ab-input"
                                                                    disabled={isModerator && !myResult.comment}
                                                                    rows={2}
                                                                    placeholder={isMentor ? "Supervisor verification notes..." : isModerator ? "Assessor's comments" : "Assessor comments / reasoning..."}
                                                                    value={myResult.comment}
                                                                    onChange={e => handleActivityCommentChange(block.id, actIdx, e.target.value)}
                                                                    style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {block.requireSelfAssessment && learnerAns?.selfAssessmentDone && (
                                    <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                                        <strong style={{ color: '#e11d48' }}>Learner Self-Assessment Completed</strong>
                                        <CheckCircle size={16} color="#22c55e" style={{ marginLeft: '8px' }} />
                                    </div>
                                )}
                                {block.requireGoalPlanning && learnerAns?.goalPlanningDone && (
                                    <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                                        <strong style={{ color: '#e11d48' }}>Learner Goal Planning Completed</strong>
                                        <CheckCircle size={16} color="#22c55e" style={{ marginLeft: '8px' }} />
                                    </div>
                                )}

                                <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
                                    {renderReadOnlyLayers()}
                                    {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                </div>

                                {block.requireObservationDeclaration !== false && !isModerator && (
                                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
                                        <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ShieldCheck size={16} color={activeInkColor} />
                                            {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
                                        </h4>

                                        {block.requireTimeTracking !== false && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                                                {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
                                                    const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
                                                    const types = ['date', 'time', 'time'];
                                                    const val = decData[field];
                                                    return (
                                                        <div key={field}>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                {labels[fi]}
                                                                {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
                                                            </label>
                                                            {(!isDeclarationInteractive || isPrintMode)
                                                                ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
                                                                : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
                                                            }
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
                                            <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
                                            {isWorkplaceModule
                                                ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
                                                : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }
            }
            return null;
        });
    };

    // ─── JSX RETURN ───────────────────────────────────────────────────────────
    return (
        <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {modalConfig && modalConfig.isOpen && (
                <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} onClose={modalConfig.onConfirm} onCancel={modalConfig.onCancel} />
            )}

            {showRemediationModal && (
                <RemediationModal submissionTitle={submission.title} attemptNumber={currentAttempt} onClose={() => setShowRemediationModal(false)} onSubmit={executeRemediation} />
            )}

            {showReturnToLearnerModal && (
                <ReturnToLearnerModal onClose={() => setShowReturnToLearnerModal(false)} onSubmit={executeReturnToLearner} />
            )}

            {/* TOPBAR */}
            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">
                        {assessment.title}
                        {submission?.attemptNumber > 1 && (
                            <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
                                Attempt {submission.attemptNumber}
                            </span>
                        )}
                        {/* APPEAL GRANTED GLOBAL BADGE */}
                        {isAppealUpheld && (
                            <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <Scale size={12} /> Appeal Granted
                            </span>
                        )}
                        {isMentor && (
                            <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontFamily: 'var(--font-heading)' }}>
                                MENTOR VIEW
                            </span>
                        )}
                    </h1>
                </div>
                <div className="ap-player-topbar__right">
                    {/* OPEN BOOK PDF BUTTON IN GRADER TOPBAR */}
                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
                            <FileArchive size={13} /> View Manual
                        </button>
                    )}

                    {canPrint && (
                        <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
                            <Printer size={13} /> Print Audit
                        </button>
                    )}
                    <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
                        {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
                    </span>
                </div>
            </div>

            {/* PRINT WRAP */}
            <div className="sr-print-wrap">
                {/* Cover pages */}
                <div className="print-only-cover">
                    <div className="print-page">
                        <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
                            {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
                        </h1>
                        <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
                            LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
                        </h2>
                        <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
                            <tbody>
                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
                            </tbody>
                        </table>
                        <h3>CONTACT INFORMATION:</h3>
                        <table className="print-table" style={{ width: '100%' }}>
                            <tbody>
                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="print-page">
                        <h3>Note to the learner</h3>
                        <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
                        <h3>Purpose</h3>
                        <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
                        <h3>Topic elements to be covered include</h3>
                        <table className="print-table no-border" style={{ width: '100%' }}>
                            <tbody>
                                {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
                                    ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
                                        <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td></tr>
                                    ))
                                    : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
                                        const secTotal = sectionTotals[sec.id]?.total || 0;
                                        const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
                                        return <tr key={idx}><td><strong>Section {idx + 1}: </strong>{sec.title}</td><td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>;
                                    })
                                }
                            </tbody>
                        </table>
                    </div>

                    <div className="print-page">
                        <h3>Entry Requirements</h3>
                        <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
                        <h3>Provider Accreditation Requirements</h3>
                        <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
                        <h3>Human Resource Requirements</h3>
                        <ul>
                            <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
                            <li>Assessors and moderators: accredited by the relevant SETA</li>
                        </ul>
                        <h3>Exemptions</h3>
                        <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
                        <h3>Venue, Date and Time</h3>
                        <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
                        <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
                    </div>

                    {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
                        <div className="print-page">
                            <h3>Record of Developmental Intervention (Remediation)</h3>
                            <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>
                            <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
                                <tbody>
                                    <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
                                    <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
                                </tbody>
                            </table>
                            <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
                                <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
                                    <span style={{ color: 'blue' }}>Facilitator Declaration</span>
                                    {facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <div className="sr-sig-no-image" style={{ color: 'blue' }}>No Canvas Signature</div>}
                                    <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
                                    <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
                                </div>
                                <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                    <span style={{ color: 'black' }}>Learner Acknowledgement</span>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>}
                                            <strong style={{ color: 'black' }}>{learner?.fullName || learnerProfile?.fullName}</strong>
                                            <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
                                            <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                            <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
                                            <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Audit header */}
                <div className="sr-print-header">
                    <div className="sr-print-header-info">
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <p><strong>Learner Name:</strong> {learner?.fullName}</p>
                                <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
                                <p><strong>Submitted:</strong> {isSubmitted ? new Date(submission.submittedAt).toLocaleDateString() : 'Pending Submission'}</p>
                            </div>
                            <div>
                                <p><strong>Module:</strong> {assessment.moduleInfo?.moduleNumber}</p>
                                <p><strong>Score:</strong> <span style={{ color: isWorkplaceModule ? '#64748b' : (isFacDone ? printInkColor : '#94a3b8'), fontWeight: 'bold' }}>{isWorkplaceModule ? 'N/A (Competency Based)' : (isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review')}</span></p>
                                <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sr-blocks">
                    {renderBlocks(true)}
                </div>

                {/* Print overall feedback */}
                <div className="print-page" style={{ marginTop: '20px' }}>
                    <h3 style={{ borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>Overall Assessment Feedback</h3>
                    {facOverallFeedback && (
                        <div style={{ borderLeft: '4px solid blue', padding: '15px', background: '#eff6ff', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'blue', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                {submission.grading?.facilitatorRole === 'mentor' ? 'Mentor Supervisor Comments' : `${user?.role} Pre-Marking Remarks`}
                            </h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e3a8a', fontStyle: 'italic', lineHeight: 1.5 }}>{facOverallFeedback}</p>
                        </div>
                    )}
                    {assOverallFeedback && (
                        <div style={{ borderLeft: '4px solid red', padding: '15px', background: '#fef2f2', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'red', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Assessor Grading Remarks</h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#7f1d1d', fontStyle: 'italic', lineHeight: 1.5 }}>{assOverallFeedback}</p>
                        </div>
                    )}
                    {modFeedback && (
                        <div style={{ borderLeft: '4px solid green', padding: '15px', background: '#f0fdf4', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'green', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Moderator QA Notes</h4>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#14532d', fontStyle: 'italic', lineHeight: 1.5 }}>{modFeedback}</p>
                        </div>
                    )}
                </div>

                {/* Signature block */}
                <div className="sr-signature-block">
                    <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
                        <span style={{ color: 'black' }}>Learner Declaration</span>
                        {isSubmitted && submission.learnerDeclaration ? (
                            <>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div className="sr-sig-no-image" style={{ color: 'black' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'black' }}>{learner?.fullName}</strong>
                                <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Submission</div>
                            </div>
                        )}
                    </div>

                    <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue' }}>
                        <span style={{ color: 'blue' }}>{submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Marking'}</span>
                        {isFacDone && submission.grading?.facilitatorReviewedAt ? (
                            <>
                                {facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <div className="sr-sig-no-image" style={{ color: 'blue' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</strong>
                                <em style={{ color: 'blue' }}>Signed: {new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>
                                    {submission.grading?.facilitatorRole === 'mentor' ? 'Workplace Verification Confirmed' : 'Pre-Marking Completed'}
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'blue', border: 'none' }}>Pending</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'blue', width: '80%', marginTop: '10px' }}>Awaiting Verification</div>
                            </div>
                        )}
                    </div>

                    <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
                        <span style={{ color: 'red' }}>Assessor Sign-off</span>
                        {isAssDone && submission.grading?.gradedAt ? (
                            <>
                                {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div className="sr-sig-no-image" style={{ color: 'red' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
                                <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'red', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red', width: '80%', marginTop: '10px' }}>Awaiting Assessment</div>
                            </div>
                        )}
                    </div>

                    <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
                        <span style={{ color: 'green' }}>Internal Moderation</span>
                        {isModDone && submission.moderation?.moderatedAt ? (
                            <>
                                {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div className="sr-sig-no-image" style={{ color: 'green' }}>No Canvas Signature</div>}
                                <strong style={{ color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
                                <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
                                <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                <div className="sr-sig-no-image" style={{ color: 'green', border: 'none' }}>Pending Signature</div>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green', width: '80%', marginTop: '10px' }}>Awaiting Moderation</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* SCREEN LAYOUT */}
            <div className="sr-layout no-print">
                <div className="sr-content-pane">

                    {/* ATTEMPT CONTEXT BANNER */}
                    {currentStatus === 'in_progress' && currentAttempt > 1 && (
                        <div style={{ background: isAppealUpheld ? '#f5f3ff' : '#f0f9ff', border: '1px solid', borderColor: isAppealUpheld ? '#ddd6fe' : '#bae6fd', borderLeft: '4px solid', borderLeftColor: isAppealUpheld ? '#8b5cf6' : '#0ea5e9', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '12px' }}>
                            {isAppealUpheld ? <Scale size={20} color="#6d28d9" /> : <Info size={20} color="#0284c7" />}
                            <div>
                                <strong style={{ display: 'block', color: isAppealUpheld ? '#5b21b6' : '#0369a1' }}>Attempt {currentAttempt} in Progress {isAppealUpheld ? '(Via Appeal)' : ''}</strong>
                                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: isAppealUpheld ? '#4c1d95' : '#075985' }}>
                                    {isAppealUpheld
                                        ? `A fresh attempt has been granted by the Academic Board following a successful appeal. Prior work is archived in the sidebar.`
                                        : `A fresh attempt has been granted. Previous work is archived in the sidebar.`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ACTIVE APPEAL BANNER */}
                    {isAppealed && (
                        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderLeft: '5px solid #8b5cf6', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#6d28d9', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <Scale size={20} /> Formal Appeal Pending
                                    </h2>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#5b21b6' }}>
                                        This learner has formally appealed their "Not Yet Competent" outcome.
                                    </p>
                                    <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Learner's Reason for Appeal:</span>
                                        <p style={{ fontSize: '0.95rem', color: '#0f172a', margin: '8px 0 0 0', fontStyle: 'italic' }}>"{submission.appeal?.reason}"</p>
                                        <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>Lodged: {new Date(submission.appeal?.date).toLocaleString()}</span>
                                    </div>
                                </div>
                                {(isAdmin || isModerator) && (
                                    <button
                                        onClick={() => setShowResolveAppealModal(true)}
                                        style={{ background: '#8b5cf6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <Scale size={16} /> Resolve Appeal
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* GRANTED APPEAL BANNER */}
                    {isAppealUpheld && !isAppealed && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '5px solid #22c55e', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <Scale size={20} /> Formal Appeal Granted
                                    </h2>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#166534' }}>
                                        The Academic Board has upheld the learner's appeal.
                                        {submission.competency === 'C' ? ' The assessment outcome has been overturned to Competent.' : ' A new attempt has been granted.'}
                                    </p>
                                    <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase' }}>Board Resolution Notes:</span>
                                        <p style={{ fontSize: '0.95rem', color: '#0f172a', margin: '8px 0 0 0', fontStyle: 'italic' }}>"{submission.appeal?.resolutionNotes}"</p>
                                        <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#15803d' }}>Resolved by {submission.appeal?.resolvedByName || 'Academic Board'} on {new Date(submission.appeal?.resolvedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* REJECTED APPEAL BANNER */}
                    {isAppealRejected && !isAppealed && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderLeft: '5px solid #ef4444', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontSize: '1.2rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <Scale size={20} /> Formal Appeal Rejected
                                    </h2>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#991b1b' }}>
                                        The Academic Board has reviewed and rejected the learner's appeal. The original grade has been upheld.
                                    </p>
                                    <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase' }}>Board Resolution Notes:</span>
                                        <p style={{ fontSize: '0.95rem', color: '#0f172a', margin: '8px 0 0 0', fontStyle: 'italic' }}>"{submission.appeal?.resolutionNotes}"</p>
                                        <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#b91c1c' }}>Resolved by {submission.appeal?.resolvedByName || 'Academic Board'} on {new Date(submission.appeal?.resolvedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {showResolveAppealModal && (
                        <ResolveAppealModal
                            appealReason={submission.appeal?.reason || ''}
                            onClose={() => setShowResolveAppealModal(false)}
                            onSubmit={executeAppealResolution}
                        />
                    )}

                    {/* Mentor return reason banner — shown to everyone when logbook was returned */}
                    {submission.mentorReturnReason && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <Undo2 size={15} /> Returned by Workplace Mentor
                            </h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#92400e' }}>
                                <strong>Reason:</strong> {submission.mentorReturnReason}
                            </p>
                            {submission.mentorReturnedAt && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309' }}>
                                    Returned by {submission.mentorReturnedByName} on {new Date(submission.mentorReturnedAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    )}

                    {submission.latestCoachingLog && currentAttempt > 1 && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <CheckCircle size={16} /> Remediation Coaching Logged
                            </h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}>
                                <strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                "{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}
                            </p>
                        </div>
                    )}

                    <div className="sr-blocks">
                        {renderBlocks(false)}
                    </div>
                </div>

                <aside className="sr-sidebar no-print">
                    {/* ── FACILITATOR / MENTOR PANEL ──────────────────────────────── */}
                    {showFacilitatorPanel && (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid blue` }}>
                            <h3 className="sr-summary-title" style={{ color: 'blue' }}>
                                {savedFacRole === 'mentor' ? 'Workplace Mentor Verification' : facPanelTitle}
                            </h3>

                            {isAwaitingSignoff ? (
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '15px', borderRadius: '6px', textAlign: 'center' }}>
                                    <Clock size={24} color="#3b82f6" style={{ margin: '0 auto 10px' }} />
                                    <strong style={{ color: '#1d4ed8', display: 'block', marginBottom: '5px' }}>Awaiting Learner Signature</strong>
                                    <p style={{ color: '#1e3a8a', fontSize: '0.85rem', margin: 0, lineHeight: 1.4 }}>
                                        {isMentor
                                            ? 'You have saved your verification. The learner must now log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.'
                                            : 'You have successfully logged the observation details. The learner must now log in, review this feedback, and apply their signature to submit the workbook to the Assessor.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {canFacilitatorMark && (
                                        <div className={`sr-role-guide blue`}>
                                            <Info size={16} />
                                            <div>
                                                {isMentor ? (
                                                    <>
                                                        <strong>Workplace Verification Role</strong>
                                                        <br />As Workplace Mentor, your role is to <em>verify and confirm</em> that the learner performed the tasks in a real work environment. You do not award marks — the Assessor will do that.
                                                    </>
                                                ) : (
                                                    <>
                                                        <strong>Formative Feedback</strong>
                                                        <br />Use your Blue Pen to provide developmental feedback.
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Score circle — only for facilitators on non-WE modules */}
                                    {!isMentor && !isWorkplaceModule && (
                                        <div className="sr-score-display">
                                            <div className="sr-score-circle" style={{ borderColor: 'blue' }}>
                                                <span className="sr-score-val" style={{ color: 'blue' }}>{facTotals.score}</span>
                                                <span className="sr-score-max" style={{ color: 'blue' }}>/ {facTotals.max}</span>
                                            </div>
                                            <div className="sr-score-percent" style={{ color: 'blue' }}>{facTotals.pct}%</div>
                                        </div>
                                    )}

                                    {/* Mentor: verification status summary instead of score */}
                                    {isMentor && canFacilitatorMark && (
                                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '1rem', margin: '1rem 0' }}>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#0369a1', lineHeight: 1.5 }}>
                                                <strong>Your checklist:</strong><br />
                                                ✓ Review the learner's logbook entries and evidence<br />
                                                ✓ Mark each criterion as <em>Observed</em> or <em>Not Observed</em><br />
                                                ✓ Tick the verification declaration on each block<br />
                                                ✓ Add Supervisor Comments below<br />
                                                ✓ Click <strong>Verify & Send to Assessor</strong>
                                            </p>
                                        </div>
                                    )}

                                    <div className="sr-overall-feedback">
                                        <label className="sr-sidebar-label" style={{ color: 'blue' }}>
                                            {savedFacRole === 'mentor' ? 'Mentor Supervisor Comments' : facRemarksLabel}
                                        </label>
                                        {canFacilitatorMark ? (
                                            <textarea
                                                className="sr-textarea"
                                                rows={3}
                                                style={{ color: 'blue', fontStyle: 'italic', borderColor: 'blue', background: 'whitesmoke' }}
                                                placeholder={isMentor ? "Add your overall supervisor comments on the learner's workplace performance..." : "Add overall coaching comments..."}
                                                value={facOverallFeedback}
                                                onChange={e => handleFacOverallFeedbackChange(e.target.value)}
                                            />
                                        ) : (
                                            <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', color: '#0369a1', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #0284c7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                {facOverallFeedback || `No overall ${isMentor ? 'supervisor comments' : 'remarks'} provided.`}
                                            </div>
                                        )}
                                    </div>

                                    {canFacilitatorMark ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <button className="sr-submit-btn" style={{ background: 'blue' }} onClick={triggerSubmitFacilitator} disabled={saving}>
                                                {saving ? 'Processing...' : (hasChecklists || hasWorkplace) && ['not_started', 'in_progress'].includes(currentStatus)
                                                    ? (isMentor ? 'Save & Request Learner Signature' : 'Save & Request Sign-off')
                                                    : facSubmitLabel
                                                }
                                            </button>

                                            {/* Return to Learner — mentor only */}
                                            {canReturnToLearner && (
                                                <button
                                                    onClick={() => setShowReturnToLearnerModal(true)}
                                                    disabled={saving}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.65rem', background: 'white', color: '#b45309', border: '2px solid #f59e0b', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                                >
                                                    <Undo2 size={15} /> Return to Learner
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="sr-audit-stamp" style={{ color: 'blue', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
                                            <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                            {submission.grading?.facilitatorRole === 'mentor' ? 'Verified by ' : 'Completed by '}{submission.grading?.facilitatorName || 'Facilitator'}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── ASSESSOR PANEL ──────────────────────────────────────────── */}
                    {showAssessorPanel ? (
                        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid red' }}>
                            <h3 className="sr-summary-title" style={{ color: 'red' }}>Official Assessor Grading</h3>
                            {canGrade && <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>}
                            {!isWorkplaceModule && (
                                <div className="sr-score-display">
                                    <div className="sr-score-circle" style={{ borderColor: 'red', width: '80px', height: '80px' }}><span className="sr-score-val" style={{ color: 'red', fontSize: '1.5rem' }}>{assTotals.score}</span></div>
                                    <div className="sr-score-percent" style={{ color: 'red' }}>{assTotals.pct}%</div>
                                </div>
                            )}
                            <div className="sr-competency-section" style={{ marginTop: '1rem' }}>
                                <label className="sr-sidebar-label" style={{ color: 'red' }}>Final Competency</label>
                                <div className="sr-comp-toggles">
                                    <button
                                        className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`}
                                        onClick={() => { if (!canGrade || isModerator) return; handleCompetencySelect('C'); }}
                                        disabled={!canGrade || isModerator}
                                        style={{ opacity: (!canGrade || isModerator) ? 0.5 : 1, cursor: (!canGrade || isModerator) ? 'not-allowed' : 'pointer' }}
                                    ><Award size={16} /> Competent (C)</button>
                                    <button
                                        className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`}
                                        onClick={() => { if (!canGrade || isModerator) return; handleCompetencySelect('NYC'); }}
                                        disabled={!canGrade || isModerator}
                                        style={{ opacity: (!canGrade || isModerator) ? 0.5 : 1, cursor: (!canGrade || isModerator) ? 'not-allowed' : 'pointer' }}
                                    ><AlertCircle size={16} /> Not Yet Competent</button>
                                </div>
                            </div>
                            <div className="sr-overall-feedback">
                                <label className="sr-sidebar-label" style={{ color: 'red' }}>Assessor Remarks</label>
                                {canGrade ? (
                                    <textarea className="sr-textarea" rows={3} style={{ color: 'red', fontStyle: 'italic', fontWeight: 500, borderColor: 'red' }} placeholder="Provide holistic feedback..." value={assOverallFeedback} onChange={e => handleAssOverallFeedbackChange(e.target.value)} />
                                ) : (
                                    <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '6px', color: '#b91c1c', fontStyle: 'italic', fontSize: '0.85rem', borderLeft: '3px solid #dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{assOverallFeedback || "No overall remarks provided."}</div>
                                )}
                            </div>
                            {(!canGrade && submission.grading?.gradedAt) && (
                                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                    <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: 'red', textTransform: 'uppercase' }}>Assessor Signature</p>
                                    {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color="red" /> : <div style={{ height: '40px', fontStyle: 'italic', fontSize: '0.8rem', color: 'red' }}>No Canvas Signature</div>}
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'red' }}>{submission.grading?.assessorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'red' }}><Clock size={10} /> {new Date(submission.grading?.gradedAt).toLocaleDateString()}</p>
                                </div>
                            )}
                            {canGrade && <div className="sr-action-area"><button className="sr-submit-btn" style={{ background: 'red' }} onClick={triggerSubmitGrade} disabled={saving}>{saving ? 'Processing...' : 'Apply Signature & Finalise'}</button></div>}
                        </div>
                    ) : (
                        <div className="sr-summary-card sr-locked-card" style={{ borderTop: '4px solid #cbd5e1', background: '#f8fafc', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                            <Lock size={28} color="#94a3b8" />
                            <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: '#334155' }}>Assessor Grading</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                {isWorkplaceModule ? 'Awaiting mentor verification to be completed.' : 'Awaiting facilitator to complete pre-marking.'}
                            </p>
                        </div>
                    )}

                    {/* ── MODERATOR PANEL ─────────────────────────────────────────── */}
                    {showModeratorPanel ? (
                        <div className="sr-summary-card sr-mod-card" style={{ borderTop: '4px solid green', marginBottom: '1.5rem' }}>
                            <h3 className="sr-summary-title" style={{ color: 'green' }}>Internal Moderation (QA)</h3>

                            {canModerate && (
                                <div className="sr-role-guide green">
                                    <Info size={16} />
                                    <div>
                                        <strong>You are auditing the Assessor's judgment</strong><br />
                                        Review the Assessor's Red Pen comments and evidence. Leave Green Pen QA notes per block above, then Endorse or Return below.
                                    </div>
                                </div>
                            )}

                            {/* Score circle – only for non‑WE modules */}
                            {!isWorkplaceModule && (
                                <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                    <div className="sr-score-circle" style={{ borderColor: 'green' }}>
                                        <span className="sr-score-val" style={{ color: 'green' }}>{modTotals.score}</span>
                                        <span className="sr-score-max" style={{ color: 'green' }}>/ {modTotals.max}</span>
                                    </div>
                                    <div className="sr-score-percent" style={{ color: 'green' }}>{modTotals.pct}%</div>
                                </div>
                            )}

                            {/* Disabled C/NYC buttons – visual reference only */}
                            <div className="sr-competency-section" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                <label className="sr-sidebar-label" style={{ color: 'green' }}>Assessor's Declared Competency</label>
                                <div className="sr-comp-toggles">
                                    <button
                                        className={`sr-comp-btn ${submission.competency === 'C' ? 'active-c-green' : ''}`}
                                        disabled={true}
                                        style={{ cursor: 'default', opacity: submission.competency === 'C' ? 1 : 0.5 }}
                                    >
                                        <Award size={16} /> Competent (C)
                                    </button>
                                    <button
                                        className={`sr-comp-btn ${submission.competency === 'NYC' ? 'active-nyc-green' : ''}`}
                                        disabled={true}
                                        style={{ cursor: 'default', opacity: submission.competency === 'NYC' ? 1 : 0.5 }}
                                    >
                                        <AlertCircle size={16} /> Not Yet Competent
                                    </button>
                                </div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                                    This is the Assessor's grade. You cannot change it.
                                </p>
                            </div>

                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Award size={12} /> Assessor's Declared Outcome
                                </p>
                                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: submission.competency === 'C' ? '#166534' : submission.competency === 'NYC' ? '#991b1b' : '#64748b' }}>
                                    {submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Not yet declared'}
                                </p>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                                    This is the Assessor's grade. You are required to audit whether this judgment is justified.
                                </p>
                            </div>

                            {/* Moderation outcome – Endorse / Return to Assessor */}
                            <div className="sr-competency-section">
                                <label className="sr-sidebar-label" style={{ color: 'green' }}>Your Moderation Decision</label>
                                <div className="sr-comp-toggles">
                                    <button
                                        className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`}
                                        onClick={() => handleModOutcomeSelect('Endorsed')}
                                        disabled={!canModerate}
                                    >
                                        <ShieldCheck size={16} /> Endorse Grade
                                    </button>
                                    <button
                                        className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`}
                                        onClick={() => handleModOutcomeSelect('Returned')}
                                        disabled={!canModerate}
                                    >
                                        <AlertCircle size={16} /> Return to Assessor
                                    </button>
                                </div>
                                {modOutcome && (
                                    <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: modOutcome === 'Endorsed' ? '#15803d' : '#b91c1c', fontStyle: 'italic' }}>
                                        {modOutcome === 'Endorsed'
                                            ? "You are endorsing the Assessor's judgment. The learner's result will be locked in for the QCTO verifier."
                                            : "You are returning this to the Assessor with your Green Pen instructions below. The Assessor must address your concerns and re-submit."}
                                    </p>
                                )}
                            </div>

                            {/* Green Pen overall QA notes */}
                            <div className="sr-overall-feedback">
                                <label className="sr-sidebar-label" style={{ color: 'green' }}>
                                    {modOutcome === 'Returned' ? 'Green Pen Instructions for Assessor (Required)' : 'Green Pen QA Notes (Optional)'}
                                </label>
                                <textarea
                                    className="sr-textarea"
                                    rows={4}
                                    style={{ color: 'green', fontStyle: 'italic', fontWeight: 500, borderColor: canModerate ? 'green' : '#cbd5e1' }}
                                    placeholder={canModerate
                                        ? (modOutcome === 'Returned'
                                            ? 'Explain exactly what the Assessor must fix before re-submitting...'
                                            : 'Record any QA observations for the external QCTO verifier...')
                                        : 'No moderation notes provided.'}
                                    value={modFeedback}
                                    disabled={!canModerate}
                                    onChange={e => handleModFeedbackChange(e.target.value)}
                                />
                            </div>

                            {(!canModerate && submission.moderation?.moderatedAt) && (
                                <div className="sr-audit-stamp" style={{ color: 'green', textAlign: 'center', fontSize: '0.8rem', marginTop: '1rem' }}>
                                    <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                    {submission.moderation?.outcome === 'Endorsed' ? 'Endorsed' : 'Returned'} by {submission.moderation?.moderatorName}
                                </div>
                            )}

                            {canModerate && (
                                <div className="sr-action-area">
                                    <button
                                        className="sr-submit-btn"
                                        style={{ background: modOutcome === 'Returned' ? '#dc2626' : 'green' }}
                                        onClick={triggerSubmitModeration}
                                        disabled={saving}
                                    >
                                        {saving ? 'Processing...' : modOutcome === 'Returned' ? 'Return to Assessor' : 'Endorse & Finalise'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="sr-summary-card sr-locked-card" style={{ borderTop: '4px solid #cbd5e1', background: '#f8fafc', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                            <Lock size={28} color="#94a3b8" />
                            <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: '#334155' }}>QA Moderation</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Awaiting assessor to complete official grading.</p>
                        </div>
                    )}

                    {/* ── OFFICIAL AUDIT TRAIL ─────────────────────────────────────── */}
                    <div className="sr-summary-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#073f4e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1.5rem' }}><ShieldCheck size={18} color="#073f4e" /> Official Audit Trail</h3>

                        {currentStatus === 'not_started' && <div className="ap-audit-card__no-outcome" style={{ color: '#94a3b8' }}>No outcome recorded yet</div>}

                        {/* AUDIT TRAIL APPEAL RESOLUTION CARD */}
                        {submission?.appeal?.status && submission?.appeal?.status !== 'pending' && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #ddd6fe', borderLeft: `4px solid ${submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444'}`, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: submission.appeal.status === 'upheld' ? '#166534' : '#991b1b', margin: '0 0 8px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Scale size={14} /> Appeal Resolution
                                </p>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: submission.appeal.status === 'upheld' ? '#22c55e' : '#ef4444' }}>
                                    {submission.appeal.status === 'upheld' ? 'Appeal Granted' : 'Appeal Rejected'}
                                </p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Resolved by: {submission.appeal?.resolvedByName || 'Academic Board'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.appeal?.resolvedAt ? moment(submission.appeal.resolvedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                </p>
                            </div>
                        )}

                        {currentAttempt > 1 && submission.latestCoachingLog && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#b45309', margin: '0 0 8px 0', fontWeight: 'bold' }}>Developmental Intervention</p>
                                <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #fde68a' }}>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#92400e', fontWeight: 'bold', textTransform: 'uppercase' }}>Facilitator Logged</p>
                                    {facilitatorProfile?.signatureUrl ? <TintedSignature imageUrl={facilitatorProfile.signatureUrl} color="blue" /> : <div style={{ height: '30px', display: 'flex', alignItems: 'center', color: '#b45309', fontStyle: 'italic', fontSize: '0.75rem' }}>No Canvas Signature</div>}
                                    <p style={{ margin: '4px 0 2px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#78350f' }}>{submission.latestCoachingLog.facilitatorName}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#92400e', fontWeight: 'bold', textTransform: 'uppercase' }}>Learner Acknowledged</p>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '30px', display: 'flex', alignItems: 'center', color: '#b45309', fontStyle: 'italic', fontSize: '0.75rem' }}>No Canvas Signature</div>}
                                            <p style={{ margin: '4px 0 2px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#78350f' }}>{learner?.fullName || learnerProfile?.fullName}</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={11} /> {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', fontStyle: 'italic' }}>Pending learner acknowledgement</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {(isSubmitted && !isAwaitingSignoff) && submission.learnerDeclaration && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Learner Declaration</p>
                                {learnerProfile?.signatureUrl ? <TintedSignature imageUrl={learnerProfile.signatureUrl} color="black" /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</p>
                            </div>
                        )}

                        {isFacDone && submission.grading?.facilitatorReviewedAt && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>{submission.grading?.facilitatorRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</p>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.grading?.facilitatorReviewedAt ? moment(submission.grading.facilitatorReviewedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    {submission.grading?.facilitatorTimeSpent > 0 && <><span style={{ margin: '0 4px' }}>•</span><Activity size={11} /> Active: {formatTimeSpent(submission.grading?.facilitatorTimeSpent)}</>}
                                    {submission.grading?.facilitatorStartedAt && submission.grading?.facilitatorReviewedAt && <><span style={{ margin: '0 4px' }}>•</span><Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.facilitatorStartedAt, submission.grading.facilitatorReviewedAt)}</>}
                                </p>
                            </div>
                        )}

                        {isAssDone && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Assessor Verification</p>
                                {assessorProfile?.signatureUrl ? <TintedSignature imageUrl={assessorProfile.signatureUrl} color={'red'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'red' }}>{assessorProfile?.fullName || submission.grading?.assessorName || '—'}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.grading?.gradedAt ? moment(submission.grading.gradedAt).format('DD/MM/YYYY HH:mm') : 'Completed'}
                                    {submission.grading?.assessorTimeSpent > 0 && <><span style={{ margin: '0 4px' }}>•</span><Activity size={11} /> Active: {formatTimeSpent(submission.grading?.assessorTimeSpent)}</>}
                                    {submission.grading?.assessorStartedAt && submission.grading?.gradedAt && <><span style={{ margin: '0 4px' }}>•</span><Calendar size={11} /> Spread: {formatCalendarSpread(submission.grading.assessorStartedAt, submission.grading.gradedAt)}</>}
                                </p>
                            </div>
                        )}

                        {isModDone && (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px 0', fontWeight: 'bold' }}>Internal Moderation QA</p>
                                {moderatorProfile?.signatureUrl ? <TintedSignature imageUrl={moderatorProfile.signatureUrl} color={'green'} /> : <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem', borderBottom: '1px dashed #e2e8f0', marginBottom: '8px' }}>No Canvas Signature</div>}
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</p>
                                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b' }}>Outcome: {submission.moderation?.outcome}</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <Clock size={11} /> {submission.moderation?.moderatedAt ? moment(submission.moderation.moderatedAt).format('DD/MM/YYYY HH:MM') : 'Completed'}
                                    {submission.moderation?.timeSpent > 0 && <><span style={{ margin: '0 4px' }}>•</span><Activity size={11} /> Active: {formatTimeSpent(submission.moderation?.timeSpent)}</>}
                                    {submission.moderation?.moderatorStartedAt && submission.moderation?.moderatedAt && <><span style={{ margin: '0 4px' }}>•</span><Calendar size={11} /> Spread: {formatCalendarSpread(submission.moderation.moderatorStartedAt, submission.moderation.moderatedAt)}</>}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 3-Attempt Remediation Logic */}
                    {currentStatus === 'moderated' && submission.competency === 'NYC' && (
                        <div className="sr-summary-card" style={{ marginTop: '1.5rem', borderTop: isMaxAttempts ? '4px solid #ef4444' : '4px solid #f59e0b', background: isMaxAttempts ? '#fef2f2' : '#fffbeb' }}>
                            <h3 className="sr-summary-title" style={{ color: isMaxAttempts ? '#b91c1c' : '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isMaxAttempts ? <ShieldAlert size={16} /> : <RotateCcw size={16} />}
                                {isMaxAttempts ? 'Maximum Attempts Reached' : 'Remediation Required'}
                            </h3>
                            <div style={{ background: isMaxAttempts ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: `1px solid ${isMaxAttempts ? '#fca5a5' : '#fcd34d'}`, padding: '8px', borderRadius: '4px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: isMaxAttempts ? '#991b1b' : '#b45309', fontWeight: 'bold' }}>Current Attempt:</span>
                                <span style={{ fontSize: '0.9rem', color: isMaxAttempts ? '#7f1d1d' : '#92400e', fontWeight: 'bold' }}>{currentAttempt} of 3</span>
                            </div>
                            {isMaxAttempts ? (
                                <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                                    This learner has exhausted all 3 permitted attempts and remains Not Yet Competent. Under QCTO compliance, this assessment is permanently locked. The learner must re-enroll in the module or lodge a formal appeal.
                                </p>
                            ) : (user?.role === 'facilitator' || user?.role === 'admin') ? (
                                <>
                                    <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '1rem', lineHeight: 1.5 }}>
                                        This learner has been verified as Not Yet Competent. Ensure a coaching intervention has taken place before unlocking this workbook for their next attempt.
                                    </p>
                                    <button className="sr-submit-btn" style={{ background: '#d97706' }} onClick={() => setShowRemediationModal(true)} disabled={saving}>
                                        <RotateCcw size={16} /> Log Coaching & Unlock
                                    </button>
                                </>
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#b45309', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                                    This assessment has been finalised as Not Yet Competent. The Facilitator has been notified to conduct a coaching intervention and initiate the remediation process for the next attempt.
                                </p>
                            )}
                        </div>
                    )}

                    <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />
                </aside>
            </div>
        </div>
    );
};

export default SubmissionReview;