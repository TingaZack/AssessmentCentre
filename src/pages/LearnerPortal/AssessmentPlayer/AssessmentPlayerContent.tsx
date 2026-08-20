// src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
    BookOpen, Scale, UserCheck, Timer, AlertTriangle,
    ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
    RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
    Menu, FileArchive, Loader2, Sigma, Calendar, LineChart, Pencil,
    ShieldAlert, Maximize, ZoomIn, ZoomOut, Zap, ClipboardList, CheckCircle2,
    Send
} from 'lucide-react';
import { ToastContainer } from '../../../components/common/Toast/Toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './AssessmentPlayer.css';
import { createPortal } from 'react-dom';
import { UploadProgress } from '../../../components/common/UploadProgress';
import { UrlPreview } from '../../../components/common/UrlPreview';
import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, getBytes } from 'firebase/storage';

import katex from "katex";
import "katex/dist/katex.min.css";
import "mathlive";
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import AxisWorkspace from '../../../components/common/AxisWorkspace/AxisWorkspace';

(window as any).katex = katex;

// 🚀 BULLETPROOF PORTAL TARGET RESOLVER FOR FULLSCREEN MODE
const getPortalTarget = (): HTMLElement => {
    const proctorRoot = document.getElementById('proctor-portal-root');
    if (proctorRoot) return proctorRoot;
    if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
    return document.body;
};

const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
const extractPlainText = (htmlString?: string) => {
    if (!htmlString) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString;
    return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
};
const getSafeDate = (ds: string) => {
    if (!ds) return 'recently';
    const d = new Date(ds);
    return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
};

const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'formula'];

const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        </svg>
    );
};

/* ─── INLINE FULLSCREEN-COMPATIBLE MODALS ─── */
const SubmissionConfirmModal: React.FC<{
    isAwaitingSignoff: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isAwaitingSignoff, onConfirm, onCancel }) => {
    return createPortal(
        <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto' }}>
            <div className="lfm-modal animate-fade-in" style={{ width: '90%', maxWidth: '520px' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <ShieldCheck size={18} />
                        {isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment for Grading?"}
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onCancel}>
                        <X size={20} />
                    </button>
                </div>
                <div className="lfm-body">
                    <p style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                        {isAwaitingSignoff
                            ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
                            : "You are about to submit this workbook for final grading. You will NOT be able to change or edit your answers after submitting."}
                    </p>
                </div>
                <div className="lfm-footer">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="lfm-btn lfm-btn--ghost"
                    >
                        Go Back
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="lfm-btn lfm-btn--primary"
                    >
                        <Send size={14} />
                        {isAwaitingSignoff ? "Acknowledge & Submit" : "Yes, Submit for Grading"}
                    </button>
                </div>
            </div>
        </div>,
        getPortalTarget()
    );
};

const LeaveWarningModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
    return createPortal(
        <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="lfm-modal" style={{ width: '90%', maxWidth: '480px', background: 'white', borderTop: '5px solid #f59e0b' }}>
                <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb' }}>
                    <AlertTriangle size={22} color="#f59e0b" />
                    <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#92400e' }}>Leave Timed Assessment?</h2>
                </div>
                <div className="lfm-body" style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
                        Your timer will <strong>NOT</strong> pause. If you leave, the clock will continue counting down in the background.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onCancel} className="ap-btn ap-btn--outline" style={{ padding: '10px 18px', cursor: 'pointer' }}>Stay Here</button>
                        <button type="button" onClick={onConfirm} className="ap-btn" style={{ padding: '10px 18px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Leave</button>
                    </div>
                </div>
            </div>
        </div>,
        getPortalTarget()
    );
};

const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
    return createPortal(
        <div className="ap-modal" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
                <div className="ap-modal-header ap-modal-header--danger">
                    <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
                    <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
                </div>
                <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
                    <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
                    <div className="ap-form-group">
                        <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
                        <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
                    </div>
                    <div className="ap-modal-footer">
                        <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
                        <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
                    </div>
                </form>
            </div>
        </div>,
        getPortalTarget()
    );
};

// 🚀 ENCAPSULATED FULLSCREEN IMAGE VIEWER WITH ZOOM & PAN
const FullscreenImageModal: React.FC<{ url: string; caption?: string; onClose: () => void }> = ({ url, caption, onClose }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        setScale(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.005, 5)));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.stopPropagation();
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(false);
    };

    const zoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
    const zoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.max(p - 0.5, 0.5)); };
    const resetZoom = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

    const btnStyle = {
        background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '10px', 
        borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', 
        justifyContent: 'center', transition: 'background 0.2s', backdropFilter: 'blur(4px)'
    };

    return createPortal(
        <div 
            style={{ 
                position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.95)', 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                backdropFilter: 'blur(8px)', overflow: 'hidden', pointerEvents: 'auto'
            }}
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={onClose}
        >
            <div 
                style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}
                onClick={e => e.stopPropagation()} 
                onMouseDown={e => e.stopPropagation()} 
            >
                <button onClick={zoomOut} style={btnStyle} title="Zoom Out" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomOut size={20} /></button>
                <button onClick={resetZoom} style={btnStyle} title="Reset Zoom" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><Maximize size={20} /></button>
                <button onClick={zoomIn} style={btnStyle} title="Zoom In" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomIn size={20} /></button>
                <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
                <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.8)' }} title="Close" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}><X size={20} /></button>
            </div>
            
            <div 
                style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, 
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}
                onMouseDown={handleMouseDown}
                onClick={e => e.stopPropagation()} 
            >
                <img 
                    src={url} 
                    alt={caption || "Expanded view"} 
                    crossOrigin="anonymous" 
                    draggable={false}
                    style={{ 
                        maxWidth: '90vw', 
                        maxHeight: '80vh', 
                        objectFit: 'contain', 
                        borderRadius: '8px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        pointerEvents: 'none'
                    }}
                />
                {caption && (
                    <p style={{ color: 'white', marginTop: '15px', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px', pointerEvents: 'none' }}>
                        {caption}
                    </p>
                )}
            </div>
            <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '20px' }}>
                Scroll to zoom • Click and drag to pan
            </div>
        </div>,
        getPortalTarget()
    );
};

const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

    useEffect(() => {
        if (!containerRef.current || !html) return;
        // @ts-ignore
        import('katex/dist/contrib/auto-render.mjs').then((module) => {
            if (containerRef.current) {
                module.default(containerRef.current, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false
                });
            }
        }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
    }, [html]);

    return (
        <div style={{ display: 'inline-block', width: style?.width }}>
            {style?.color && <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>}
            <div ref={containerRef} className={`quill-read-only-content ${uniqueClass} ${className || ''}`} style={{ lineHeight: 1.6, ...style }} dangerouslySetInnerHTML={{ __html: cleanRichText(html) }} />
        </div>
    );
};

const LearnerFilePreview: React.FC<{ url: string; onRemove?: () => void; disabled?: boolean }> = ({ url, onRemove, disabled }) => {
    if (!url) return null;

    const cleanUrl = url.split('?')[0];
    const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded_Evidence');
    const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    const isPdf = ext === 'pdf';
    const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

    if (isImage) {
        return (
            <div style={{ position: 'relative', marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <img src={url} alt="Learner evidence preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '4px', display: 'block', margin: '0 auto' }} />
                {onRemove && !disabled && (
                    <button type="button" onClick={onRemove} style={{ marginTop: '8px', padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Trash2 size={13} /> Remove File
                    </button>
                )}
            </div>
        );
    }

    if (isPdf) {
        return (
            <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileText size={18} color="#0284c7" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {fileName}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <a href={url} target="_blank" rel="noopener noreferrer" download style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '6px 12px', background: '#0284c7', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
                            <UploadCloud size={13} style={{ transform: 'rotate(180deg)' }} /> Open PDF
                        </a>
                        {onRemove && !disabled && (
                            <button type="button" onClick={onRemove} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                </div>
                <div style={{ height: '420px', width: '100%' }}>
                    <object data={url} type="application/pdf" width="100%" height="100%">
                        <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#475569' }}>
                            Your browser does not support inline PDF viewing. <a href={url} target="_blank" rel="noreferrer">Click here to download PDF</a>
                        </p>
                    </object>
                </div>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{ background: isSpreadsheet ? '#dcfce7' : '#e0f2fe', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={24} color={isSpreadsheet ? '#15803d' : '#0369a1'} />
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fileName}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: isSpreadsheet ? '#166534' : '#0284c7', fontWeight: 'bold' }}>
                            {isSpreadsheet ? 'Excel / CSV Spreadsheet Evidence' : 'Uploaded Document Evidence'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: isSpreadsheet ? '#166534' : '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
                    </a>
                    {onRemove && !disabled && (
                        <button
                            type="button"
                            onClick={onRemove}
                            style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <Trash2 size={14} /> Remove
                        </button>
                    )}
                </div>
            </div>

            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
                <span>Spreadsheets and binary files are downloaded directly to your device for viewing in Microsoft Excel or Google Sheets.</span>
            </div>
        </div>
    );
};

const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
    const mfRef = useRef<any>(null);
    const lastBroadcastRef = useRef('');

    const cleanValue = useMemo(() => {
        let v = value || '';
        if (v.includes('<p>') || v.includes('&nbsp;')) v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
        return v;
    }, [value]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) mf.value = cleanValue;
        mf.readOnly = readOnly;
    }, [cleanValue, readOnly]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        const handleInput = () => { lastBroadcastRef.current = mf.value; onChange(mf.value); };
        mf.addEventListener('input', handleInput);
        return () => mf.removeEventListener('input', handleInput);
    }, [onChange]);

    useEffect(() => {
        const mf = mfRef.current;
        if (!mf) return;
        const triggerNewline = () => {
            const hasMultilineEnv = mf.value.includes('\\begin{aligned}') || mf.value.includes('\\begin{matrix}') || mf.value.includes('\\begin{array}') || mf.value.includes('\\begin{cases}') || mf.value.includes('\\begin{gathered}');
            if (hasMultilineEnv) mf.executeCommand('addRowAfter');
            else {
                mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
                mf.executeCommand('moveToMathfieldEnd');
            }
        };
        const handleBeforeInput = (e: any) => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); triggerNewline(); } };
        mf.addEventListener('beforeinput', handleBeforeInput);
        return () => mf.removeEventListener('beforeinput', handleBeforeInput);
    }, [readOnly]);

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <style>{`
                math-field::part(container) .ML__matrix,
                math-field::part(container) .ML__array,
                math-field::part(container) .ML__aligned,
                math-field::part(container) .ML__matrix-row {
                    border: none !important;
                    outline: none !important;
                }
            `}</style>
            {React.createElement('math-field', {
                ref: mfRef,
                style: {
                    width: '100%', fontSize: '1.4rem', padding: '12px',
                    border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
                    borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
                    outline: 'none', color: '#0f172a', display: 'block',
                    minHeight: '140px', height: 'auto'
                }
            })}
        </div>
    );
};

const DrawingWorkspace: React.FC<{ value: string; onChange: (v: string) => void; readOnly: boolean; blockId: string; submissionId: string; toast: any; setSaving: (v: boolean) => void }> = ({ value, onChange, readOnly, blockId, submissionId, toast, setSaving }) => {
    const [editor, setEditor] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleSave = async () => {
        if (!editor) return;
        const shapeIds = Array.from(editor.getCurrentPageShapeIds());
        if (shapeIds.length === 0) return toast.warning("The workspace is empty!");

        setIsUploading(true);
        setSaving(true);
        toast.info("Saving workspace securely...");

        try {
            const { blob } = await editor.toImage(shapeIds, {
                format: 'png',
                background: true,
                padding: 20
            });

            const storage = getStorage();
            const refPath = `evidence/${submissionId}/${blockId}_workspace_${Date.now()}.png`;
            const storageRef = fbStorageRef(storage, refPath);

            await uploadBytesResumable(storageRef, blob);
            const url = await getDownloadURL(storageRef);

            onChange(url);
            toast.success("Workspace saved securely!");
        } catch (err) {
            console.error(err);
            toast.error("Failed to save workspace. Please try again.");
        } finally {
            setIsUploading(false);
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            {readOnly && value ? (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <img src={value} alt="Learner workspace" crossOrigin="anonymous" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white' }} />
                </div>
            ) : readOnly && !value ? (
                <div className="ap-upload-empty">No workspace data provided.</div>
            ) : (
                <>
                    <div style={{ height: '600px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                        <Tldraw onMount={setEditor} hideUi={false} />
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }} />
                        {value && <span style={{ color: 'var(--mlab-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><CheckCircle size={14} /> Cloud Synced</span>}
                        <button type="button" onClick={handleSave} className="ap-btn ap-btn--primary" disabled={isUploading}>
                            {isUploading ? <><Loader2 className="ap-spin" size={14} /> Saving Workspace...</> : <><Save size={14} /> Submit Workspace Canvas</>}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export interface AssessmentPlayerContentProps {
    user: any;
    assessment: any;
    submission: any;
    answers: Record<string, any>;
    learnerProfile: any;
    learnerEnrollment: any;
    assessorProfile: any;
    moderatorProfile: any;
    facilitatorProfile: any;
    employers: any[];
    staff: any[];
    moduleLogs: any[];
    approvedLogs: any[];
    logsLoading: boolean;
    saving: boolean;
    setSaving: (v: boolean) => void;
    uploadProgress: Record<string, number>;
    setUploadProgress: (fn: (prev: any) => any) => void;
    activeTabs: Record<string, string>;
    setActiveTabs: (tabs: Record<string, string>) => void;
    timeLeft: number | null;
    isGloballyLocked: boolean;
    isAwaitingSignoff: boolean;
    isPracticalModule: boolean;
    isWorkplaceModule: boolean;
    isRemediation: boolean;
    isAppealUpheld: boolean;
    isFacDone: boolean;
    isAssDone: boolean;
    isModDone: boolean;
    isSubmitted: boolean;
    isMissed: boolean;
    showGate: boolean;
    showLeaveWarning: boolean;
    setShowLeaveWarning: (v: boolean) => void;
    showSubmitConfirm: boolean;
    setShowSubmitConfirm: (v: boolean) => void;
    showAppealModal: boolean;
    setShowAppealModal: (v: boolean) => void;
    declarationChecked: boolean;
    setDeclarationChecked: (v: boolean) => void;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (v: boolean) => void;
    willBeProctored: boolean;
    savedFacRole: string | null;
    grandTotalAwarded: number;
    grandTotalMax: number;
    grandTotalPct: number;
    sectionTotals: Record<string, { total: number; awarded: number }>;
    outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
    safeNavigateBack: () => void;
    handleAnswerChange: (blockId: string, value: any) => void;
    handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
    handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
    handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
    triggerSubmitConfirm: () => void;
    executeSubmit: () => void;
    executeAppeal: (reason: string) => void;
    preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride?: boolean) => void;
    getBlockGrading: (blockId: string) => any;
    isBlockVerified: (blockId: string) => boolean;
    getSecureNow: () => number;
    toast: any;
    saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
    codeSnapshots: Record<string, any>;
    showSurveyModalIndicator?: boolean; // NEW PROP for rendering the survey alert card
    isSurveyCompleted?: boolean | null; // NEW PROP
    onOpenSurveyModal?: () => void; // NEW PROP
}

export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
    const {
        user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
        moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving, setSaving,
        uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
        isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
        isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
        showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
        setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
        grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
        handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
        preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast,
        showSurveyModalIndicator, isSurveyCompleted, onOpenSurveyModal
    } = props;

    const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
    const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});
    
    // 🚀 Tracks which image is currently opened in Fullscreen Modal
    const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

    const answersRef = useRef(answers);
    useEffect(() => { answersRef.current = answers; }, [answers]);

    // COMPUTED STATUS VARS FOR SIDEBAR AND PANELS
    const currentStatus = String(submission?.status || '').toLowerCase();
    const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';
    const isMissed = currentStatus === 'missed';

    const codeBlockStorageSignature = useMemo(() => {
        if (!assessment?.blocks) return '';
        return assessment?.blocks
            .filter((b: any) => b.type === 'code_sandbox')
            .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
            .join('|');
    }, [assessment?.blocks, answers]);

    // 🚀 DIRECT FIREBASE STORAGE DOWNLOAD USING `getBytes`
    useEffect(() => {
        let cancelled = false;

        const fetchSnapshots = async () => {
            try {
                if (!submission?.id || !assessment?.blocks) {
                    if (!cancelled) setIsFetchingSnapshots(false);
                    return;
                }

                const codeBlocks = assessment?.blocks.filter((b: any) => b.type === 'code_sandbox') || [];
                if (codeBlocks.length === 0) {
                    if (!cancelled) setIsFetchingSnapshots(false);
                    return;
                }

                const newSnaps: Record<string, any> = {};
                const storage = getStorage();
                const currentAnswers = answersRef.current;

                await Promise.all(codeBlocks.map(async (block: any) => {
                    const entry = currentAnswers[block.id] || answers[block.id];

                    const storagePath = entry?.storagePath || entry?.codeData?.storagePath;
                    const inlineSnapshot = entry?.snapshot || entry?.codeData?.snapshot;

                    if (storagePath) {
                        try {
                            const jsonRef = fbStorageRef(storage, storagePath);
                            const buffer = await getBytes(jsonRef);
                            const jsonStr = new TextDecoder().decode(buffer);
                            const files = JSON.parse(jsonStr);
                            newSnaps[block.id] = files;
                        } catch (err) {
                            console.error(`❌ [FETCH SNAPSHOTS ERROR] Failed to download storage snapshot for block [${block.id}]:`, err);
                        }
                    } else if (inlineSnapshot) {
                        newSnaps[block.id] = inlineSnapshot;
                    }
                }));

                if (!cancelled) {
                    setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
                }
            } catch (err) {
                console.error("Fatal error fetching snapshots:", err);
            } finally {
                if (!cancelled) setIsFetchingSnapshots(false);
            }
        };

        fetchSnapshots();
        return () => { cancelled = true; };
    }, [submission?.id, codeBlockStorageSignature, assessment?.blocks]);

    const MAX_FILE_SIZE_MB = 10;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
            e.target.value = ''; return;
        }
        handleFileUpload(file, blockId, nestedKey);
    };

    const navItems = assessment?.blocks?.reduce((acc: any[], block: any) => {
        if (block.type === 'section') {
            acc.push({ type: 'section', label: block.title, id: block.id });
        } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
            const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
            acc.push({ type: 'q', label: cleanLabel, id: block.id });
        }
        return acc;
    }, []) || [];

    const displayStatus = submission.status.replace('_', ' ');

    const canEditTask = !isGloballyLocked;
    const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
    const canEditLogbook = !isGloballyLocked;
    const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
    const canEditCode = !isGloballyLocked;

    // 🚀 Interactive Image Renderer with Expand overlay
    const renderBlockImage = (block: any) => {
        if (!block.imageUrl) return null;
        return (
            <div style={{ margin: '1rem 0', textAlign: 'center', position: 'relative', display: 'inline-block', width: '100%' }}>
                <div 
                    style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
                    onClick={() => setExpandedImage({ url: block.imageUrl, caption: block.imageCaption })}
                >
                    <img 
                        src={block.imageUrl} 
                        alt={block.imageCaption || "Assessment attachment"} 
                        crossOrigin="anonymous" 
                        style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain', display: 'block', margin: '0 auto' }} 
                    />
                    <div style={{ 
                        position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.7)', color: 'white', 
                        padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', 
                        backdropFilter: 'blur(4px)', transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' 
                    }}>
                        <Maximize size={14} /> View Fullscreen
                    </div>
                </div>
                {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
            </div>
        );
    };

    const renderBlockFile = (block: any) => {
        if (!block.fileUrl) return null;
        return (
            <div style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <FileText size={20} color="#166534" />
                    <div style={{ overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {block.fileName || "Download Starter File"}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
                    </div>
                </div>
                <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0 }}>
                    <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
                </a>
            </div>
        );
    };

    let qNum = 0;

    const handleFooterSubmitClick = (e: React.MouseEvent) => {
        e.preventDefault();
        triggerSubmitConfirm();
    };

    return (
        <ProctoringWrapper
            assessmentId={assessment?.id || assessment?.assessmentId || user?.assessmentId || ''}
            learnerId={user?.uid || submission?.authUid || submission?.learnerId || ''}
            isProctored={willBeProctored}
        >
            <div className="ap-player ap-animate">
                <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
                {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

                {/* 🚀 MODALS MOUNT DIRECTLY INSIDE FULLSCREEN TOP-LAYER TARGET */}
                {showLeaveWarning && <LeaveWarningModal onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
                {showSubmitConfirm && <SubmissionConfirmModal isAwaitingSignoff={isAwaitingSignoff} onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
                {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

                {/* 🚀 PROCTOR-SAFE IN-DOM FULLSCREEN IMAGE MODAL */}
                {expandedImage && createPortal(
                    <FullscreenImageModal 
                        url={expandedImage.url} 
                        caption={expandedImage.caption} 
                        onClose={() => setExpandedImage(null)} 
                    />,
                    getPortalTarget()
                )}

                <div className="ap-player-topbar no-print">
                    <div className="ap-player-topbar__left">
                        <button type="button" className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
                        <button type="button" className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
                        <div className="ap-player-topbar__separator ap-hide-mobile" />
                        <h1 className="ap-player-topbar__title">
                            <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
                            {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
                        </h1>
                    </div>
                    <div className="ap-player-topbar__right">
                        {assessment?.isOpenBook && assessment?.referenceManualUrl && <button type="button" className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
                        {isGloballyLocked && <button type="button" className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
                        
                        {!isGloballyLocked && !isPracticalModule && timeLeft !== null && (
                            <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
                                <Timer size={14} /> {formatTime(timeLeft)}
                            </div>
                        )}

                        {/* 🚀 EXTRA TIME TOOLBAR BADGE FOR LEARNER */}
                        {submission?.extraTimeGranted > 0 && (
                            <div className="ap-timer ap-hide-mobile" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
                                <Timer size={14} /> +{submission.extraTimeGranted}m Extra
                            </div>
                        )}

                        {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
                        {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
                        <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
                        <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
                    </div>
                </div>

                <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
                    <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                        <button type="button" className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
                        <div className="ap-sidebar__meta-block">
                            <div className="ap-sidebar__meta-title">
                                <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
                            </div>
                            {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
                            <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment?.moduleInfo?.moduleNumber || '—'}</div>
                            {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment?.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
                            {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
                        </div>

                        {/* 🚀 SIDEBAR EXTRA TIME BADGE */}
                        {assessment?.moduleInfo?.timeLimit > 0 && submission?.extraTimeGranted > 0 && (
                            <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
                                    <Timer size={12} style={{ marginRight: '6px' }} />
                                    +{submission.extraTimeGranted} Extra Minutes Granted
                                </span>
                            </div>
                        )}

                        {!isWorkplaceModule && isFacDone && (
                            <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
                                <div className="ap-score-card__stripe" aria-hidden="true" />
                                <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
                                <div className="ap-score-card__body">
                                    <div className="ap-score-card__ring-wrap">
                                        <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
                                        <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
                                    </div>
                                    <div className="ap-score-card__divider" aria-hidden="true" />
                                    <div className="ap-score-card__fraction">
                                        <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
                                        <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
                                        <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
                                    </div>
                                </div>
                                {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
                            </div>
                        )}

                        {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
                            <>
                                <div className="ap-sidebar__label">Status Tracking</div>
                                <div className="ap-sidebar__status-box">
                                    {isAssDone && outcome ? (
                                        <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
                                            <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
                                            {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment?.totalMarks} marks · {outcome.percentage}%</div>}
                                            {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
                                            <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
                                        </div>
                                    ) : (
                                        <div className="ap-sidebar__awaiting">
                                            <Clock size={20} color="rgba(255,255,255,0.25)" />
                                            <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
                                            <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
                                        </div>
                                    )}
                                    {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
                                    {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
                                    {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

                                    <div className="ap-sidebar__timeline-item">
                                        <div className={`ap-sidebar__timeline-icon${isFacDone ? ' ap-sidebar__timeline-icon--done' : ''}`}>
                                            <UserCheck size={13} />
                                        </div>
                                        <div className="ap-sidebar__timeline-content">
                                            <span className="ap-sidebar__timeline-title">
                                                {savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}
                                            </span>
                                            <span className="ap-sidebar__timeline-desc">
                                                {isFacDone
                                                    ? `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt)}`
                                                    : isViolation
                                                        ? 'Pending Facilitator Review (Violation Flagged)'
                                                        : isMissed
                                                            ? 'Pending Staff Review (Missed)'
                                                            : savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
                                    <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>

                                    {(facilitatorProfile?.bookingUrl || assessorProfile?.bookingUrl) && (
                                        <div className="ap-sidebar__booking-card" style={{ marginTop: '1.5rem', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                <Calendar size={14} color="#3b82f6" /> Schedule a Check-in
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                                                Need help understanding your feedback or planning your next steps? Book a 1-on-1 session.
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {facilitatorProfile?.bookingUrl && (
                                                    <a href={facilitatorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
                                                        Book with Facilitator
                                                    </a>
                                                )}
                                                {assessorProfile?.bookingUrl && !facilitatorProfile?.bookingUrl && (
                                                    <a href={assessorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
                                                        Book with Assessor
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="ap-sidebar__label">Workbook Contents</div>
                        <div className="ap-sidebar__nav">
                            {navItems.map((item: any) =>
                                item.type === 'section'
                                    ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
                                    : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                            )}
                        </div>
                    </nav>

                    <div className="ap-player-content print-pane">
                        <div className="ap-blocks">

                            {/* 🚀 LEARNER NOTICE: EXTRA TIME GRANTED BANNER */}
                            {submission?.extraTimeGranted > 0 && (
                                <div style={{
                                    background: '#e0f2fe',
                                    border: '1px solid #bae6fd',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <Timer size={22} color="#0284c7" style={{ flexShrink: 0 }} />
                                    <div>
                                        <strong style={{ fontSize: '0.9rem', color: '#0369a1', display: 'block', marginBottom: '2px' }}>
                                            Extra Time Granted
                                        </strong>
                                        <span style={{ fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.4 }}>
                                            An additional <strong>{submission.extraTimeGranted} minutes</strong> have been added to your assessment timer. You may proceed with your work.
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* 🚀 SECURITY VIOLATION BANNER FOR LEARNERS */}
                            {submission?.status === 'violation' && (
                                <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', margin: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                        <div className="lfm-fg" style={{ flex: 1, minWidth: '300px' }}>
                                            <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)', marginBottom: '0.5rem' }}>
                                                <ShieldAlert size={18} /> Security Violation Detected
                                            </div>
                                            <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                                                This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured and logged. Your invigilator has been notified.
                                            </p>
                                            {submission?.systemNote && (
                                                <div className="lfm-flags-panel" style={{ background: '#ffffff', borderColor: '#fecaca', borderLeftColor: 'var(--mlab-red)' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</span>
                                                    <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                                                        "{submission.systemNote}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {assessment?.blocks?.map((block: any) => {

                                if (block.type === 'section') {
                                    const totals = sectionTotals[block.id];
                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
                                            <span>{block.title}</span>
                                            {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
                                            {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" />}
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                        </div>
                                    );
                                }

                                if (block.type === 'info') return (
                                    <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
                                        <div className="ap-block-info__label"><Info size={13} /> {block.title || 'Reading Material'}</div>
                                        <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
                                        {renderBlockImage(block)}
                                        {renderBlockFile(block)}
                                    </div>
                                );

                                if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
                                    qNum++;
                                    const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
                                    const learnerAns = answers[block.id];
                                    let inkColor = '#64748b';
                                    if (isModDone) inkColor = 'var(--mlab-green)';
                                    else if (isAssDone) inkColor = 'var(--mlab-red)';
                                    else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

                                    const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
                                    const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

                                    const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'graph' ? 'ap-block-type-chip--graph' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
                                    const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : block.type === 'graph' ? 'PLOT' : `Q${qNum}.`;

                                    const isSectionVerified = isBlockVerified(block.id);
                                    const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

                                    return (
                                        <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
                                            <div className="ap-block-question__header">
                                                <div className="ap-block-question__text-wrap">
                                                    <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                        <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

                                                        {block.type === 'qcto_workplace' ? (
                                                            <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} />
                                                        ) : block.type === 'code_sandbox' ? (
                                                            <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
                                                                {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
                                                                {block.question && <MathRenderedContent html={block.question} style={{ color: '#334155' }} />}
                                                            </div>
                                                        ) : block.question ? (
                                                            <MathRenderedContent html={block.question} />
                                                        ) : block.title ? (
                                                            <MathRenderedContent html={block.title} />
                                                        ) : null}
                                                    </span>
                                                    <div className="ap-grade-indicators">
                                                        {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
                                                        {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
                                                        {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
                                                    </div>
                                                </div>
                                                <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
                                            </div>

                                            <div className="ap-block-question__body">
                                                {renderBlockImage(block)}
                                                {renderBlockFile(block)}

                                                {/* MCQ */}
                                                {block.type === 'mcq' && (
                                                    <div className="ap-mcq-options">
                                                        {block.options?.map((opt: string, i: number) => {
                                                            const selected = learnerAns === i;
                                                            return (
                                                                <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
                                                                    <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
                                                                    <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
                                                                    <span className="ap-mcq-label__text">{opt}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* TEXT */}
                                                {block.type === 'text' && (
                                                    <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
                                                        ) : (
                                                            <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* CARTESIAN ENGINE GRAPH BLOCK */}
                                                {block.type === 'graph' && (
                                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                                        <AxisWorkspace
                                                            value={learnerAns || { points: [], shapes: [] }}
                                                            onChange={(val) => handleAnswerChange(block.id, val)}
                                                            readOnly={isUploadLocked || !canEditTask}
                                                        />
                                                    </div>
                                                )}

                                                {/* MATHPAD WITH TABS */}
                                                {block.type === 'mathpad' && (() => {
                                                    const itemAns = typeof learnerAns === 'string'
                                                        ? { equation: learnerAns }
                                                        : (learnerAns || {});

                                                    const mathTabs = [
                                                        { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', allowed: true, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
                                                        { id: 'graph', icon: <LineChart size={13} />, label: 'Graphing Calculator', allowed: block.allowGraphing !== false, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } },
                                                        { id: 'draw', icon: <Pencil size={13} />, label: 'Whiteboard Canvas', allowed: block.allowDrawing !== false, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } }
                                                    ].filter(t => t.allowed);

                                                    const activeTabId = activeTabs[block.id] || mathTabs[0]?.id;

                                                    return (
                                                        <div className="ap-evidence-container">
                                                            {mathTabs.length > 1 && (
                                                                <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                                    {mathTabs.map(t => {
                                                                        const isActive = activeTabId === t.id;
                                                                        const isDone = ((t.id === 'equation' && itemAns.equation) || (t.id === 'graph' && itemAns.graphState?.points?.length > 0) || (t.id === 'draw' && itemAns.drawingUrl));
                                                                        return (
                                                                            <button
                                                                                key={t.id}
                                                                                type="button"
                                                                                onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
                                                                                    background: isActive ? t.theme.activeBg : t.theme.bg,
                                                                                    padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
                                                                                    border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
                                                                                    cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                                                                                    boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
                                                                                    transition: 'all 0.2s ease',
                                                                                    opacity: isActive ? 1 : 0.7,
                                                                                    whiteSpace: 'nowrap'
                                                                                }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
                                                                            >
                                                                                {t.icon} {t.label} {isDone && <CheckCircle size={12} />}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                            <div className="ap-tab-panel">
                                                                {activeTabId === 'equation' && (
                                                                    <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                        <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: mathTabs.length > 1 ? '6px 6px 0 0' : '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                                                            <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
                                                                        </div>
                                                                        <MathpadEditor
                                                                            value={itemAns.equation || ''}
                                                                            onChange={(val) => handleAnswerChange(block.id, { ...itemAns, equation: val })}
                                                                            readOnly={isUploadLocked || !canEditTask}
                                                                        />
                                                                    </div>
                                                                )}
                                                                {activeTabId === 'graph' && (
                                                                    <AxisWorkspace
                                                                        value={itemAns.graphState}
                                                                        onChange={(val) => handleAnswerChange(block.id, { ...itemAns, graphState: val })}
                                                                        readOnly={isUploadLocked || !canEditTask}
                                                                    />
                                                                )}
                                                                {activeTabId === 'draw' && (
                                                                    <DrawingWorkspace
                                                                        value={itemAns.drawingUrl}
                                                                        onChange={(val) => handleAnswerChange(block.id, { ...itemAns, drawingUrl: val })}
                                                                        readOnly={isUploadLocked || !canEditTask}
                                                                        blockId={block.id}
                                                                        submissionId={submission.id}
                                                                        toast={toast}
                                                                        setSaving={setSaving}
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* TASK WITH OPTIONAL IDE */}
                                                {block.type === 'task' && (() => {
                                                    const itemAns = learnerAns || {};

                                                    const taskTabs = [
                                                        { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
                                                        { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio === true, val: itemAns.audioUrl, theme: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', activeBg: '#f3e8ff' } },
                                                        { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
                                                        { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
                                                        { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
                                                    ].filter(t => t.allowed);

                                                    const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
                                                    const progress = uploadProgress[block.id];

                                                    const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
                                                    const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

                                                    return (
                                                        <div className="ap-evidence-container">
                                                            {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
                                                            {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}

                                                            {taskTabs.length > 1 && (
                                                                <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                                    {taskTabs.map(t => {
                                                                        const isActive = activeTabId === t.id;
                                                                        return (
                                                                            <button
                                                                                key={t.id}
                                                                                type="button"
                                                                                onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
                                                                                    background: isActive ? t.theme.activeBg : t.theme.bg,
                                                                                    padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
                                                                                    border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
                                                                                    cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                                                                                    boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
                                                                                    transition: 'all 0.2s ease',
                                                                                    opacity: isActive ? 1 : 0.7
                                                                                }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
                                                                            >
                                                                                {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            <div className="ap-tab-panel">
                                                                {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your answer here…'} />}</div>}
                                                                {activeTabId === 'audio' && (itemAns.audioUrl ? <audio controls src={itemAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
                                                                {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
                                                                {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}

                                                                {/* 🚀 LIVE IDE SANDBOX ON TASK BLOCK */}
                                                                {activeTabId === 'code' && (
                                                                    <div style={{ height: '600px', marginTop: '10px' }}>
                                                                        <CodeSandboxPlayer
                                                                            block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
                                                                            learnerAns={mappedCodeData}
                                                                            readOnly={isUploadLocked || !canEditTask}
                                                                            onChange={async (val) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
                                                                            portalTarget={getPortalTarget()}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* CHECKLIST */}
                                                {block.type === 'checklist' && (
                                                    <div className="ap-checklist">
                                                        <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
                                                        {block.criteria?.map((crit: string, i: number) => {
                                                            const res = criteriaResults?.[i] || {};

                                                            const nestedKey = `evidence_${i}`;
                                                            const itemAns = learnerAns?.[nestedKey] || {};

                                                            const evidenceTabs = [
                                                                { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
                                                                { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
                                                                { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
                                                                { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
                                                            ].filter(t => t.allowed);

                                                            const tabStateKey = `${block.id}_${nestedKey}`;
                                                            const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
                                                            const progress = uploadProgress[`${block.id}_${nestedKey}`];

                                                            const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
                                                            const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

                                                            return (
                                                                <div key={i} className="ap-checklist__item">
                                                                    <p className="ap-checklist__item-title">{i + 1}. {crit}</p>

                                                                    {block.requireEvidencePerCriterion !== false && (
                                                                        <div className="ap-evidence-container" style={{ marginTop: '10px', marginBottom: '15px' }}>
                                                                            {evidenceTabs.length > 1 && (
                                                                                <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                                                    {evidenceTabs.map(t => {
                                                                                        const isActive = activeTabId === t.id;
                                                                                        return (
                                                                                            <button
                                                                                                key={t.id}
                                                                                                type="button"
                                                                                                onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
                                                                                                style={{
                                                                                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
                                                                                                    background: isActive ? t.theme.activeBg : t.theme.bg,
                                                                                                    padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
                                                                                                    border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
                                                                                                    cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                                                                                                    boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
                                                                                                    transition: 'all 0.2s ease',
                                                                                                    opacity: isActive ? 1 : 0.7
                                                                                                }}
                                                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
                                                                                            >
                                                                                                {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
                                                                                            </button>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}

                                                                            <div className="ap-tab-panel">
                                                                                {activeTabId === 'text' && (
                                                                                    <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                        {isGloballyLocked && !isAwaitingSignoff ? (
                                                                                            <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
                                                                                        ) : (
                                                                                            <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                {activeTabId === 'url' && (
                                                                                    <div>
                                                                                        {itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}
                                                                                    </div>
                                                                                )}
                                                                                {activeTabId === 'upload' && (
                                                                                    progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : (
                                                                                        <div className="ap-upload-empty">
                                                                                            {isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
                                                                                                <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
                                                                                                <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} />
                                                                                            </>}
                                                                                        </div>
                                                                                    )
                                                                                )}

                                                                                {activeTabId === 'code' && (
                                                                                    <div style={{ height: '600px', marginTop: '10px' }}>
                                                                                        <CodeSandboxPlayer
                                                                                            block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${crit}`, template: 'vanilla' }}
                                                                                            learnerAns={mappedCodeData}
                                                                                            readOnly={isUploadLocked || !canEditWorkplace}
                                                                                            onChange={async (val) => {
                                                                                                const updatedAns = { ...answers[block.id] };
                                                                                                const prevNested = updatedAns[nestedKey] || {};
                                                                                                updatedAns[nestedKey] = { ...prevNested, codeData: val };
                                                                                                handleAnswerChange(block.id, updatedAns);
                                                                                            }}
                                                                                            portalTarget={getPortalTarget()}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div className="ap-checklist__assessor-row">
                                                                        {res.status ? (
                                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
                                                                                {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
                                                                            </div>
                                                                        ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* LOGBOOK */}
                                                {block.type === 'logbook' && (
                                                    <div className="ap-logbook">
                                                        <MathRenderedContent html={block.content} className="ap-logbook__desc" />
                                                        <table className="ap-logbook__table">
                                                            <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
                                                            <tbody>
                                                                {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
                                                                    <tr key={i} className="ap-logbook__tbody">
                                                                        <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
                                                                        <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
                                                                        {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button type="button" className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
                                                                    </tr>
                                                                ))}
                                                                {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button type="button" className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* QCTO WORKPLACE WITH FULL EVIDENCE SUPPORT & LIVE IDE */}
                                                {block.type === 'qcto_workplace' && (
                                                    <div className="ap-workplace">
                                                        <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
                                                        {block.workActivities?.map((wa: any) => {
                                                            const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
                                                            return (
                                                                <div key={wa.id} className="ap-workplace__activity">
                                                                    <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

                                                                    {wa.evidenceItems?.map((se: any) => {
                                                                        const nestedKey = `se_${se.id}`;
                                                                        const itemAns = learnerAns?.[nestedKey] || {};

                                                                        const evidenceTabs = [
                                                                            { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: true, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
                                                                            { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: true, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
                                                                            { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: true, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
                                                                            { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: true, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
                                                                        ];

                                                                        const tabStateKey = `${block.id}_${nestedKey}`;
                                                                        const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
                                                                        const progress = uploadProgress[`${block.id}_${nestedKey}`];

                                                                        const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
                                                                        const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

                                                                        return (
                                                                            <div key={se.id} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>{se.code}: {se.description}</div>
                                                                                <div className="ap-evidence-container">
                                                                                    {evidenceTabs.length > 1 && (
                                                                                        <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                                                            {evidenceTabs.map(t => {
                                                                                                const isActive = activeTabId === t.id;
                                                                                                return (
                                                                                                    <button
                                                                                                        key={t.id}
                                                                                                        type="button"
                                                                                                        onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
                                                                                                        style={{
                                                                                                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
                                                                                                            background: isActive ? t.theme.activeBg : t.theme.bg,
                                                                                                            padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
                                                                                                            border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
                                                                                                            cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                                                                                                            boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
                                                                                                            transition: 'all 0.2s ease',
                                                                                                            opacity: isActive ? 1 : 0.7
                                                                                                        }}
                                                                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                                                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
                                                                                                    >
                                                                                                        {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
                                                                                                    </button>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}

                                                                                    <div className="ap-tab-panel">
                                                                                        {activeTabId === 'text' && (
                                                                                            <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
                                                                                                {isGloballyLocked && !isAwaitingSignoff ? (
                                                                                                    <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
                                                                                                ) : (
                                                                                                    <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                        {activeTabId === 'url' && (
                                                                                            <div>
                                                                                                {itemAns.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}
                                                                                            </div>
                                                                                        )}
                                                                                        {activeTabId === 'upload' && (
                                                                                            progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : (
                                                                                                <div className="ap-upload-empty">
                                                                                                    {isUploadLocked || !canEditWorkplace ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
                                                                                                        <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
                                                                                                        <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditWorkplace} style={{ fontSize: '0.82rem' }} />
                                                                                                    </>}
                                                                                                </div>
                                                                                            )
                                                                                        )}

                                                                                        {activeTabId === 'code' && (
                                                                                            <div style={{ height: '600px', marginTop: '10px' }}>
                                                                                                <CodeSandboxPlayer
                                                                                                    block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${se.code}`, template: 'vanilla' }}
                                                                                                    learnerAns={mappedCodeData}
                                                                                                    readOnly={isUploadLocked || !canEditWorkplace}
                                                                                                    onChange={async (val) => {
                                                                                                        const updatedAns = { ...answers[block.id] };
                                                                                                        const prevNested = updatedAns[nestedKey] || {};
                                                                                                        updatedAns[nestedKey] = { ...prevNested, codeData: val };
                                                                                                        handleAnswerChange(block.id, updatedAns);
                                                                                                    }}
                                                                                                    portalTarget={getPortalTarget()}
                                                                                                />
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}

                                                                    <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
                                                                        <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
                                                                        <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* 🚀 STANDALONE CODE SANDBOX BLOCK */}
                                                {block.type === 'code_sandbox' && (
                                                    isFetchingSnapshots ? (
                                                        <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                                            <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
                                                            <p>Loading code environment...</p>
                                                        </div>
                                                    ) : (
                                                        <CodeSandboxPlayer
                                                            block={block}
                                                            learnerAns={{
                                                                ...(learnerAns || {}),
                                                                snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot || learnerAns?.codeData?.snapshot
                                                            }}
                                                            readOnly={isUploadLocked || !canEditCode}
                                                            onChange={async (val: any) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
                                                            portalTarget={getPortalTarget()}
                                                        />
                                                    )
                                                )}

                                                {/* Per-question feedback */}
                                                {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
                                                {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
                                                {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>

                        {/* FOOTER */}
                        {isAwaitingSignoff ? (
                            <div className="ap-footer ap-footer--signoff no-print">
                                <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
                                <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <button type="button" className="ap-btn ap-btn--amber" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Acknowledge &amp; Submit for Grading</button>
                                </div>
                            </div>
                        ) : !isGloballyLocked ? (
                            <div className="ap-footer no-print">
                                <h3 className="ap-footer__title">Final Submission</h3>
                                <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
                                <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
                                    <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
                                    <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
                                </label>
                                <div className="ap-footer-actions">
                                    <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
                                    <button type="button" className="ap-btn ap-btn--green" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Submit for Grading</button>
                                </div>
                            </div>
                        ) : (
                            <div className="ap-footer ap-footer--locked no-print">
                                <div className="ap-footer--locked__icon-wrap">
                                    {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
                                </div>
                                <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
                                <p className="ap-footer--locked__desc" style={{ marginBottom: '1.5rem' }}>This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
                                
                                {/* 🚀 EMBEDDED SURVEY INDICATOR FOR SUBMITTED ASSESSMENTS */}
                                {showSurveyModalIndicator && assessment?.surveyId && (
                                    <div style={{
                                        background: isSurveyCompleted ? '#f0fdf4' : '#fffbeb',
                                        border: `1px solid ${isSurveyCompleted ? '#bbf7d0' : '#fde68a'}`,
                                        padding: '16px 24px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '12px',
                                        width: '100%',
                                        maxWidth: '600px',
                                        marginBottom: '2rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                                            <div style={{ background: isSurveyCompleted ? '#dcfce7' : '#fef3c7', padding: '10px', borderRadius: '50%' }}>
                                                <ClipboardList size={22} color={isSurveyCompleted ? '#166534' : '#b45309'} />
                                            </div>
                                            <div>
                                                <strong style={{ fontSize: '0.9rem', color: isSurveyCompleted ? '#166534' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {isSurveyCompleted ? 'Feedback Logged' : 'Pending Feedback Survey'}
                                                </strong>
                                                <span style={{ display: 'block', fontSize: '0.8rem', color: isSurveyCompleted ? '#15803d' : '#78350f', marginTop: '4px', lineHeight: 1.4 }}>
                                                    {isSurveyCompleted
                                                        ? 'Thank you for your feedback!'
                                                        : 'Please take 60 seconds to rate this assessment.'}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={onOpenSurveyModal}
                                            className="mlab-btn mlab-btn--sm"
                                            style={{
                                                background: isSurveyCompleted ? '#ffffff' : '#f59e0b',
                                                color: isSurveyCompleted ? '#166534' : '#ffffff',
                                                border: isSurveyCompleted ? '1px solid #bbf7d0' : 'none',
                                                padding: '8px 16px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                borderRadius: 0,
                                                textTransform: 'uppercase',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {isSurveyCompleted ? <><CheckCircle2 size={14} /> Retake Survey</> : <><Zap size={14} /> Complete Survey Now</>}
                                        </button>
                                    </div>
                                )}

                                <button type="button" className="ap-btn ap-btn--primary" onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ProctoringWrapper>
    );
};

export default AssessmentPlayerContent;


// // src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

// import React, { useState, useMemo, useEffect, useRef } from 'react';
// import {
//     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
//     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
//     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
//     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
//     Menu, FileArchive, Loader2, Sigma, Calendar, LineChart, Pencil,
//     ShieldAlert, Maximize, ZoomIn, ZoomOut,
//     Send
// } from 'lucide-react';
// import { ToastContainer } from '../../../components/common/Toast/Toast';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import './AssessmentPlayer.css';
// import { createPortal } from 'react-dom';
// import { UploadProgress } from '../../../components/common/UploadProgress';
// import { UrlPreview } from '../../../components/common/UrlPreview';
// import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
// import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, getBytes } from 'firebase/storage';

// import katex from "katex";
// import "katex/dist/katex.min.css";
// import "mathlive";
// import { Tldraw } from 'tldraw';
// import 'tldraw/tldraw.css';
// import AxisWorkspace from '../../../components/common/AxisWorkspace/AxisWorkspace';

// (window as any).katex = katex;

// // 🚀 BULLETPROOF PORTAL TARGET RESOLVER FOR FULLSCREEN MODE
// const getPortalTarget = (): HTMLElement => {
//     const proctorRoot = document.getElementById('proctor-portal-root');
//     if (proctorRoot) return proctorRoot;
//     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
//     return document.body;
// };

// const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// const extractPlainText = (htmlString?: string) => {
//     if (!htmlString) return '';
//     const tmp = document.createElement("DIV");
//     tmp.innerHTML = htmlString;
//     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// };
// const getSafeDate = (ds: string) => {
//     if (!ds) return 'recently';
//     const d = new Date(ds);
//     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// };
// const formatTime = (s: number) => {
//     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
//     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// };

// const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'formula'];

// const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
//     const radius = (size - strokeWidth) / 2;
//     const circumference = 2 * Math.PI * radius;
//     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
//     return (
//         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
//             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
//             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
//         </svg>
//     );
// };

// /* ─── INLINE FULLSCREEN-COMPATIBLE MODALS ─── */
// const SubmissionConfirmModal: React.FC<{
//     isAwaitingSignoff: boolean;
//     onConfirm: () => void;
//     onCancel: () => void;
// }> = ({ isAwaitingSignoff, onConfirm, onCancel }) => {
//     return createPortal(
//         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto' }}>
//             <div className="lfm-modal animate-fade-in" style={{ width: '90%', maxWidth: '520px' }}>
//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title">
//                         <ShieldCheck size={18} />
//                         {isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment for Grading?"}
//                     </h2>
//                     <button className="lfm-close-btn" type="button" onClick={onCancel}>
//                         <X size={20} />
//                     </button>
//                 </div>
//                 <div className="lfm-body">
//                     <p style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>
//                         {isAwaitingSignoff
//                             ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
//                             : "You are about to submit this workbook for final grading. You will NOT be able to change or edit your answers after submitting."}
//                     </p>
//                 </div>
//                 <div className="lfm-footer">
//                     <button
//                         type="button"
//                         onClick={onCancel}
//                         className="lfm-btn lfm-btn--ghost"
//                     >
//                         Go Back
//                     </button>
//                     <button
//                         type="button"
//                         onClick={onConfirm}
//                         className="lfm-btn lfm-btn--primary"
//                     >
//                         <Send size={14} />
//                         {isAwaitingSignoff ? "Acknowledge & Submit" : "Yes, Submit for Grading"}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         getPortalTarget()
//     );
// };

// const LeaveWarningModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
//     return createPortal(
//         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <div className="lfm-modal" style={{ width: '90%', maxWidth: '480px', background: 'white', borderTop: '5px solid #f59e0b' }}>
//                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb' }}>
//                     <AlertTriangle size={22} color="#f59e0b" />
//                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#92400e' }}>Leave Timed Assessment?</h2>
//                 </div>
//                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
//                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
//                         Your timer will <strong>NOT</strong> pause. If you leave, the clock will continue counting down in the background.
//                     </p>
//                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
//                         <button type="button" onClick={onCancel} className="ap-btn ap-btn--outline" style={{ padding: '10px 18px', cursor: 'pointer' }}>Stay Here</button>
//                         <button type="button" onClick={onConfirm} className="ap-btn" style={{ padding: '10px 18px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Leave</button>
//                     </div>
//                 </div>
//             </div>
//         </div>,
//         getPortalTarget()
//     );
// };

// const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
//     const [reason, setReason] = useState('');
//     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
//     return createPortal(
//         <div className="ap-modal" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
//                 <div className="ap-modal-header ap-modal-header--danger">
//                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
//                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
//                 </div>
//                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
//                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
//                     <div className="ap-form-group">
//                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
//                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
//                     </div>
//                     <div className="ap-modal-footer">
//                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
//                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         getPortalTarget()
//     );
// };

// // 🚀 ENCAPSULATED FULLSCREEN IMAGE VIEWER WITH ZOOM & PAN
// const FullscreenImageModal: React.FC<{ url: string; caption?: string; onClose: () => void }> = ({ url, caption, onClose }) => {
//     const [scale, setScale] = useState(1);
//     const [position, setPosition] = useState({ x: 0, y: 0 });
//     const [isDragging, setIsDragging] = useState(false);
//     const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

//     const handleWheel = (e: React.WheelEvent) => {
//         e.stopPropagation();
//         setScale(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.005, 5)));
//     };

//     const handleMouseDown = (e: React.MouseEvent) => {
//         e.stopPropagation();
//         setIsDragging(true);
//         setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
//     };

//     const handleMouseMove = (e: React.MouseEvent) => {
//         if (!isDragging) return;
//         e.stopPropagation();
//         setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
//     };

//     const handleMouseUp = (e: React.MouseEvent) => {
//         e.stopPropagation();
//         setIsDragging(false);
//     };

//     const zoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
//     const zoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.max(p - 0.5, 0.5)); };
//     const resetZoom = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

//     const btnStyle = {
//         background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '10px', 
//         borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', 
//         justifyContent: 'center', transition: 'background 0.2s', backdropFilter: 'blur(4px)'
//     };

//     return createPortal(
//         <div 
//             style={{ 
//                 position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.95)', 
//                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
//                 backdropFilter: 'blur(8px)', overflow: 'hidden', pointerEvents: 'auto'
//             }}
//             onWheel={handleWheel}
//             onMouseMove={handleMouseMove}
//             onMouseUp={handleMouseUp}
//             onMouseLeave={handleMouseUp}
//             onClick={onClose}
//         >
//             <div 
//                 style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}
//                 onClick={e => e.stopPropagation()} 
//                 onMouseDown={e => e.stopPropagation()} 
//             >
//                 <button onClick={zoomOut} style={btnStyle} title="Zoom Out" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomOut size={20} /></button>
//                 <button onClick={resetZoom} style={btnStyle} title="Reset Zoom" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><Maximize size={20} /></button>
//                 <button onClick={zoomIn} style={btnStyle} title="Zoom In" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomIn size={20} /></button>
//                 <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
//                 <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.8)' }} title="Close" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}><X size={20} /></button>
//             </div>
            
//             <div 
//                 style={{ 
//                     transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, 
//                     transition: isDragging ? 'none' : 'transform 0.1s ease-out',
//                     cursor: isDragging ? 'grabbing' : 'grab',
//                     display: 'flex', flexDirection: 'column', alignItems: 'center'
//                 }}
//                 onMouseDown={handleMouseDown}
//                 onClick={e => e.stopPropagation()} 
//             >
//                 <img 
//                     src={url} 
//                     alt={caption || "Expanded view"} 
//                     crossOrigin="anonymous" 
//                     draggable={false}
//                     style={{ 
//                         maxWidth: '90vw', 
//                         maxHeight: '80vh', 
//                         objectFit: 'contain', 
//                         borderRadius: '8px',
//                         boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
//                         pointerEvents: 'none'
//                     }}
//                 />
//                 {caption && (
//                     <p style={{ color: 'white', marginTop: '15px', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px', pointerEvents: 'none' }}>
//                         {caption}
//                     </p>
//                 )}
//             </div>
//             <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '20px' }}>
//                 Scroll to zoom • Click and drag to pan
//             </div>
//         </div>,
//         getPortalTarget()
//     );
// };

// const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
//     const containerRef = useRef<HTMLDivElement>(null);
//     const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

//     useEffect(() => {
//         if (!containerRef.current || !html) return;
//         // @ts-ignore
//         import('katex/dist/contrib/auto-render.mjs').then((module) => {
//             if (containerRef.current) {
//                 module.default(containerRef.current, {
//                     delimiters: [
//                         { left: '$$', right: '$$', display: true },
//                         { left: '$', right: '$', display: false },
//                         { left: '\\(', right: '\\)', display: false },
//                         { left: '\\[', right: '\\]', display: true }
//                     ],
//                     throwOnError: false
//                 });
//             }
//         }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
//     }, [html]);

//     return (
//         <div style={{ display: 'inline-block', width: style?.width }}>
//             {style?.color && <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>}
//             <div ref={containerRef} className={`quill-read-only-content ${uniqueClass} ${className || ''}`} style={{ lineHeight: 1.6, ...style }} dangerouslySetInnerHTML={{ __html: cleanRichText(html) }} />
//         </div>
//     );
// };

// const LearnerFilePreview: React.FC<{ url: string; onRemove?: () => void; disabled?: boolean }> = ({ url, onRemove, disabled }) => {
//     if (!url) return null;

//     const cleanUrl = url.split('?')[0];
//     const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded_Evidence');
//     const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

//     const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
//     const isPdf = ext === 'pdf';
//     const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

//     if (isImage) {
//         return (
//             <div style={{ position: 'relative', marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
//                 <img src={url} alt="Learner evidence preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '4px', display: 'block', margin: '0 auto' }} />
//                 {onRemove && !disabled && (
//                     <button type="button" onClick={onRemove} style={{ marginTop: '8px', padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                         <Trash2 size={13} /> Remove File
//                     </button>
//                 )}
//             </div>
//         );
//     }

//     if (isPdf) {
//         return (
//             <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
//                 <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
//                         <FileText size={18} color="#0284c7" />
//                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                             {fileName}
//                         </span>
//                     </div>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <a href={url} target="_blank" rel="noopener noreferrer" download style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '6px 12px', background: '#0284c7', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
//                             <UploadCloud size={13} style={{ transform: 'rotate(180deg)' }} /> Open PDF
//                         </a>
//                         {onRemove && !disabled && (
//                             <button type="button" onClick={onRemove} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
//                                 <Trash2 size={13} />
//                             </button>
//                         )}
//                     </div>
//                 </div>
//                 <div style={{ height: '420px', width: '100%' }}>
//                     <object data={url} type="application/pdf" width="100%" height="100%">
//                         <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#475569' }}>
//                             Your browser does not support inline PDF viewing. <a href={url} target="_blank" rel="noreferrer">Click here to download PDF</a>
//                         </p>
//                     </object>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '16px' }}>
//             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
//                     <div style={{ background: isSpreadsheet ? '#dcfce7' : '#e0f2fe', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                         <FileText size={24} color={isSpreadsheet ? '#15803d' : '#0369a1'} />
//                     </div>
//                     <div style={{ overflow: 'hidden' }}>
//                         <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                             {fileName}
//                         </span>
//                         <span style={{ fontSize: '0.75rem', color: isSpreadsheet ? '#166534' : '#0284c7', fontWeight: 'bold' }}>
//                             {isSpreadsheet ? 'Excel / CSV Spreadsheet Evidence' : 'Uploaded Document Evidence'}
//                         </span>
//                     </div>
//                 </div>

//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                     <a
//                         href={url}
//                         target="_blank"
//                         rel="noopener noreferrer"
//                         download
//                         style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: isSpreadsheet ? '#166534' : '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
//                     >
//                         <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
//                     </a>
//                     {onRemove && !disabled && (
//                         <button
//                             type="button"
//                             onClick={onRemove}
//                             style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
//                         >
//                             <Trash2 size={14} /> Remove
//                         </button>
//                     )}
//                 </div>
//             </div>

//             <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                 <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
//                 <span>Spreadsheets and binary files are downloaded directly to your device for viewing in Microsoft Excel or Google Sheets.</span>
//             </div>
//         </div>
//     );
// };

// const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
//     const mfRef = useRef<any>(null);
//     const lastBroadcastRef = useRef('');

//     const cleanValue = useMemo(() => {
//         let v = value || '';
//         if (v.includes('<p>') || v.includes('&nbsp;')) v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
//         return v;
//     }, [value]);

//     useEffect(() => {
//         const mf = mfRef.current;
//         if (!mf) return;
//         if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) mf.value = cleanValue;
//         mf.readOnly = readOnly;
//     }, [cleanValue, readOnly]);

//     useEffect(() => {
//         const mf = mfRef.current;
//         if (!mf) return;
//         const handleInput = () => { lastBroadcastRef.current = mf.value; onChange(mf.value); };
//         mf.addEventListener('input', handleInput);
//         return () => mf.removeEventListener('input', handleInput);
//     }, [onChange]);

//     useEffect(() => {
//         const mf = mfRef.current;
//         if (!mf) return;
//         const triggerNewline = () => {
//             const hasMultilineEnv = mf.value.includes('\\begin{aligned}') || mf.value.includes('\\begin{matrix}') || mf.value.includes('\\begin{array}') || mf.value.includes('\\begin{cases}') || mf.value.includes('\\begin{gathered}');
//             if (hasMultilineEnv) mf.executeCommand('addRowAfter');
//             else {
//                 mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
//                 mf.executeCommand('moveToMathfieldEnd');
//             }
//         };
//         const handleBeforeInput = (e: any) => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); triggerNewline(); } };
//         mf.addEventListener('beforeinput', handleBeforeInput);
//         return () => mf.removeEventListener('beforeinput', handleBeforeInput);
//     }, [readOnly]);

//     return (
//         <div style={{ position: 'relative', width: '100%' }}>
//             <style>{`
//                 math-field::part(container) .ML__matrix,
//                 math-field::part(container) .ML__array,
//                 math-field::part(container) .ML__aligned,
//                 math-field::part(container) .ML__matrix-row {
//                     border: none !important;
//                     outline: none !important;
//                 }
//             `}</style>
//             {React.createElement('math-field', {
//                 ref: mfRef,
//                 style: {
//                     width: '100%', fontSize: '1.4rem', padding: '12px',
//                     border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
//                     borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
//                     outline: 'none', color: '#0f172a', display: 'block',
//                     minHeight: '140px', height: 'auto'
//                 }
//             })}
//         </div>
//     );
// };

// const DrawingWorkspace: React.FC<{ value: string; onChange: (v: string) => void; readOnly: boolean; blockId: string; submissionId: string; toast: any; setSaving: (v: boolean) => void }> = ({ value, onChange, readOnly, blockId, submissionId, toast, setSaving }) => {
//     const [editor, setEditor] = useState<any>(null);
//     const [isUploading, setIsUploading] = useState(false);

//     const handleSave = async () => {
//         if (!editor) return;
//         const shapeIds = Array.from(editor.getCurrentPageShapeIds());
//         if (shapeIds.length === 0) return toast.warning("The workspace is empty!");

//         setIsUploading(true);
//         setSaving(true);
//         toast.info("Saving workspace securely...");

//         try {
//             const { blob } = await editor.toImage(shapeIds, {
//                 format: 'png',
//                 background: true,
//                 padding: 20
//             });

//             const storage = getStorage();
//             const refPath = `evidence/${submissionId}/${blockId}_workspace_${Date.now()}.png`;
//             const storageRef = fbStorageRef(storage, refPath);

//             await uploadBytesResumable(storageRef, blob);
//             const url = await getDownloadURL(storageRef);

//             onChange(url);
//             toast.success("Workspace saved securely!");
//         } catch (err) {
//             console.error(err);
//             toast.error("Failed to save workspace. Please try again.");
//         } finally {
//             setIsUploading(false);
//             setSaving(false);
//         }
//     };

//     return (
//         <div style={{ position: 'relative' }}>
//             {readOnly && value ? (
//                 <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
//                     <img src={value} alt="Learner workspace" crossOrigin="anonymous" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white' }} />
//                 </div>
//             ) : readOnly && !value ? (
//                 <div className="ap-upload-empty">No workspace data provided.</div>
//             ) : (
//                 <>
//                     <div style={{ height: '600px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
//                         <Tldraw onMount={setEditor} hideUi={false} />
//                     </div>
//                     <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
//                         <div style={{ flex: 1 }} />
//                         {value && <span style={{ color: 'var(--mlab-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><CheckCircle size={14} /> Cloud Synced</span>}
//                         <button type="button" onClick={handleSave} className="ap-btn ap-btn--primary" disabled={isUploading}>
//                             {isUploading ? <><Loader2 className="ap-spin" size={14} /> Saving Workspace...</> : <><Save size={14} /> Submit Workspace Canvas</>}
//                         </button>
//                     </div>
//                 </>
//             )}
//         </div>
//     );
// };

// export interface AssessmentPlayerContentProps {
//     user: any;
//     assessment: any;
//     submission: any;
//     answers: Record<string, any>;
//     learnerProfile: any;
//     learnerEnrollment: any;
//     assessorProfile: any;
//     moderatorProfile: any;
//     facilitatorProfile: any;
//     employers: any[];
//     staff: any[];
//     moduleLogs: any[];
//     approvedLogs: any[];
//     logsLoading: boolean;
//     saving: boolean;
//     setSaving: (v: boolean) => void;
//     uploadProgress: Record<string, number>;
//     setUploadProgress: (fn: (prev: any) => any) => void;
//     activeTabs: Record<string, string>;
//     setActiveTabs: (tabs: Record<string, string>) => void;
//     timeLeft: number | null;
//     isGloballyLocked: boolean;
//     isAwaitingSignoff: boolean;
//     isPracticalModule: boolean;
//     isWorkplaceModule: boolean;
//     isRemediation: boolean;
//     isAppealUpheld: boolean;
//     isFacDone: boolean;
//     isAssDone: boolean;
//     isModDone: boolean;
//     isSubmitted: boolean;
//     isMissed: boolean;
//     showGate: boolean;
//     showLeaveWarning: boolean;
//     setShowLeaveWarning: (v: boolean) => void;
//     showSubmitConfirm: boolean;
//     setShowSubmitConfirm: (v: boolean) => void;
//     showAppealModal: boolean;
//     setShowAppealModal: (v: boolean) => void;
//     declarationChecked: boolean;
//     setDeclarationChecked: (v: boolean) => void;
//     isMobileMenuOpen: boolean;
//     setIsMobileMenuOpen: (v: boolean) => void;
//     willBeProctored: boolean;
//     savedFacRole: string | null;
//     grandTotalAwarded: number;
//     grandTotalMax: number;
//     grandTotalPct: number;
//     sectionTotals: Record<string, { total: number; awarded: number }>;
//     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
//     safeNavigateBack: () => void;
//     handleAnswerChange: (blockId: string, value: any) => void;
//     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
//     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
//     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
//     triggerSubmitConfirm: () => void;
//     executeSubmit: () => void;
//     executeAppeal: (reason: string) => void;
//     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride?: boolean) => void;
//     getBlockGrading: (blockId: string) => any;
//     isBlockVerified: (blockId: string) => boolean;
//     getSecureNow: () => number;
//     toast: any;
//     saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
//     codeSnapshots: Record<string, any>;
// }

// export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
//     const {
//         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
//         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving, setSaving,
//         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
//         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
//         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
//         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
//         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
//         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
//         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
//         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
//     } = props;

//     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
//     const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});
    
//     // 🚀 Tracks which image is currently opened in Fullscreen Modal
//     const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

//     const answersRef = useRef(answers);
//     useEffect(() => { answersRef.current = answers; }, [answers]);

//     // COMPUTED STATUS VARS FOR SIDEBAR AND PANELS
//     const currentStatus = String(submission?.status || '').toLowerCase();
//     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';
//     const isMissed = currentStatus === 'missed';

//     const codeBlockStorageSignature = useMemo(() => {
//         if (!assessment?.blocks) return '';
//         return assessment?.blocks
//             .filter((b: any) => b.type === 'code_sandbox')
//             .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
//             .join('|');
//     }, [assessment?.blocks, answers]);

//     // 🚀 DIRECT FIREBASE STORAGE DOWNLOAD USING `getBytes`
//     useEffect(() => {
//         let cancelled = false;

//         const fetchSnapshots = async () => {
//             try {
//                 if (!submission?.id || !assessment?.blocks) {
//                     if (!cancelled) setIsFetchingSnapshots(false);
//                     return;
//                 }

//                 const codeBlocks = assessment?.blocks.filter((b: any) => b.type === 'code_sandbox') || [];
//                 if (codeBlocks.length === 0) {
//                     if (!cancelled) setIsFetchingSnapshots(false);
//                     return;
//                 }

//                 const newSnaps: Record<string, any> = {};
//                 const storage = getStorage();
//                 const currentAnswers = answersRef.current;

//                 await Promise.all(codeBlocks.map(async (block: any) => {
//                     const entry = currentAnswers[block.id] || answers[block.id];

//                     const storagePath = entry?.storagePath || entry?.codeData?.storagePath;
//                     const inlineSnapshot = entry?.snapshot || entry?.codeData?.snapshot;

//                     if (storagePath) {
//                         try {
//                             const jsonRef = fbStorageRef(storage, storagePath);
//                             const buffer = await getBytes(jsonRef);
//                             const jsonStr = new TextDecoder().decode(buffer);
//                             const files = JSON.parse(jsonStr);
//                             newSnaps[block.id] = files;
//                         } catch (err) {
//                             console.error(`❌ [FETCH SNAPSHOTS ERROR] Failed to download storage snapshot for block [${block.id}]:`, err);
//                         }
//                     } else if (inlineSnapshot) {
//                         newSnaps[block.id] = inlineSnapshot;
//                     }
//                 }));

//                 if (!cancelled) {
//                     setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
//                 }
//             } catch (err) {
//                 console.error("Fatal error fetching snapshots:", err);
//             } finally {
//                 if (!cancelled) setIsFetchingSnapshots(false);
//             }
//         };

//         fetchSnapshots();
//         return () => { cancelled = true; };
//     }, [submission?.id, codeBlockStorageSignature, assessment?.blocks]);

//     const MAX_FILE_SIZE_MB = 10;
//     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

//     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         if (file.size > MAX_FILE_SIZE_BYTES) {
//             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
//             e.target.value = ''; return;
//         }
//         handleFileUpload(file, blockId, nestedKey);
//     };

//     const navItems = assessment?.blocks?.reduce((acc: any[], block: any) => {
//         if (block.type === 'section') {
//             acc.push({ type: 'section', label: block.title, id: block.id });
//         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
//             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
//             acc.push({ type: 'q', label: cleanLabel, id: block.id });
//         }
//         return acc;
//     }, []) || [];

//     const displayStatus = submission.status.replace('_', ' ');

//     const canEditTask = !isGloballyLocked;
//     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
//     const canEditLogbook = !isGloballyLocked;
//     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
//     const canEditCode = !isGloballyLocked;

//     // 🚀 Interactive Image Renderer with Expand overlay
//     const renderBlockImage = (block: any) => {
//         if (!block.imageUrl) return null;
//         return (
//             <div style={{ margin: '1rem 0', textAlign: 'center', position: 'relative', display: 'inline-block', width: '100%' }}>
//                 <div 
//                     style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
//                     onClick={() => setExpandedImage({ url: block.imageUrl, caption: block.imageCaption })}
//                 >
//                     <img 
//                         src={block.imageUrl} 
//                         alt={block.imageCaption || "Assessment attachment"} 
//                         crossOrigin="anonymous" 
//                         style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain', display: 'block', margin: '0 auto' }} 
//                     />
//                     <div style={{ 
//                         position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.7)', color: 'white', 
//                         padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', 
//                         backdropFilter: 'blur(4px)', transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' 
//                     }}>
//                         <Maximize size={14} /> View Fullscreen
//                     </div>
//                 </div>
//                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
//             </div>
//         );
//     };

//     const renderBlockFile = (block: any) => {
//         if (!block.fileUrl) return null;
//         return (
//             <div style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
//                     <FileText size={20} color="#166534" />
//                     <div style={{ overflow: 'hidden' }}>
//                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
//                             {block.fileName || "Download Starter File"}
//                         </span>
//                         <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
//                     </div>
//                 </div>
//                 <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0 }}>
//                     <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
//                 </a>
//             </div>
//         );
//     };

//     let qNum = 0;

//     const handleFooterSubmitClick = (e: React.MouseEvent) => {
//         e.preventDefault();
//         triggerSubmitConfirm();
//     };

//     return (
//         <ProctoringWrapper
//             assessmentId={assessment?.id || assessment?.assessmentId || user?.assessmentId || ''}
//             learnerId={user?.uid || submission?.authUid || submission?.learnerId || ''}
//             isProctored={willBeProctored}
//         >
//             <div className="ap-player ap-animate">
//                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

//                 {/* 🚀 MODALS MOUNT DIRECTLY INSIDE FULLSCREEN TOP-LAYER TARGET */}
//                 {showLeaveWarning && <LeaveWarningModal onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
//                 {showSubmitConfirm && <SubmissionConfirmModal isAwaitingSignoff={isAwaitingSignoff} onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
//                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

//                 {/* 🚀 PROCTOR-SAFE IN-DOM FULLSCREEN IMAGE MODAL */}
//                 {expandedImage && createPortal(
//                     <FullscreenImageModal 
//                         url={expandedImage.url} 
//                         caption={expandedImage.caption} 
//                         onClose={() => setExpandedImage(null)} 
//                     />,
//                     getPortalTarget()
//                 )}

//                 <div className="ap-player-topbar no-print">
//                     <div className="ap-player-topbar__left">
//                         <button type="button" className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
//                         <button type="button" className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
//                         <div className="ap-player-topbar__separator ap-hide-mobile" />
//                         <h1 className="ap-player-topbar__title">
//                             <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
//                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
//                         </h1>
//                     </div>
//                     <div className="ap-player-topbar__right">
//                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button type="button" className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
//                         {isGloballyLocked && <button type="button" className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
                        
//                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && (
//                             <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
//                                 <Timer size={14} /> {formatTime(timeLeft)}
//                             </div>
//                         )}

//                         {/* 🚀 EXTRA TIME TOOLBAR BADGE FOR LEARNER */}
//                         {submission?.extraTimeGranted > 0 && (
//                             <div className="ap-timer ap-hide-mobile" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
//                                 <Timer size={14} /> +{submission.extraTimeGranted}m Extra
//                             </div>
//                         )}

//                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
//                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
//                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
//                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
//                     </div>
//                 </div>

//                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
//                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
//                         <button type="button" className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
//                         <div className="ap-sidebar__meta-block">
//                             <div className="ap-sidebar__meta-title">
//                                 <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
//                             </div>
//                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
//                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment?.moduleInfo?.moduleNumber || '—'}</div>
//                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment?.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
//                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
//                         </div>

//                         {/* 🚀 SIDEBAR EXTRA TIME BADGE */}
//                         {assessment?.moduleInfo?.timeLimit > 0 && submission?.extraTimeGranted > 0 && (
//                             <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
//                                 <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
//                                     <Timer size={12} style={{ marginRight: '6px' }} />
//                                     +{submission.extraTimeGranted} Extra Minutes Granted
//                                 </span>
//                             </div>
//                         )}

//                         {!isWorkplaceModule && isFacDone && (
//                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
//                                 <div className="ap-score-card__stripe" aria-hidden="true" />
//                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
//                                 <div className="ap-score-card__body">
//                                     <div className="ap-score-card__ring-wrap">
//                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
//                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
//                                     </div>
//                                     <div className="ap-score-card__divider" aria-hidden="true" />
//                                     <div className="ap-score-card__fraction">
//                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
//                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
//                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
//                                     </div>
//                                 </div>
//                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
//                             </div>
//                         )}

//                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
//                             <>
//                                 <div className="ap-sidebar__label">Status Tracking</div>
//                                 <div className="ap-sidebar__status-box">
//                                     {isAssDone && outcome ? (
//                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
//                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
//                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment?.totalMarks} marks · {outcome.percentage}%</div>}
//                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
//                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
//                                         </div>
//                                     ) : (
//                                         <div className="ap-sidebar__awaiting">
//                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
//                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
//                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
//                                         </div>
//                                     )}
//                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
//                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
//                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

//                                     <div className="ap-sidebar__timeline-item">
//                                         <div className={`ap-sidebar__timeline-icon${isFacDone ? ' ap-sidebar__timeline-icon--done' : ''}`}>
//                                             <UserCheck size={13} />
//                                         </div>
//                                         <div className="ap-sidebar__timeline-content">
//                                             <span className="ap-sidebar__timeline-title">
//                                                 {savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}
//                                             </span>
//                                             <span className="ap-sidebar__timeline-desc">
//                                                 {isFacDone
//                                                     ? `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt)}`
//                                                     : isViolation
//                                                         ? 'Pending Facilitator Review (Violation Flagged)'
//                                                         : isMissed
//                                                             ? 'Pending Staff Review (Missed)'
//                                                             : savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator'}
//                                             </span>
//                                         </div>
//                                     </div>

//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
//                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>

//                                     {(facilitatorProfile?.bookingUrl || assessorProfile?.bookingUrl) && (
//                                         <div className="ap-sidebar__booking-card" style={{ marginTop: '1.5rem', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 'bold' }}>
//                                                 <Calendar size={14} color="#3b82f6" /> Schedule a Check-in
//                                             </div>
//                                             <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
//                                                 Need help understanding your feedback or planning your next steps? Book a 1-on-1 session.
//                                             </p>
//                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                 {facilitatorProfile?.bookingUrl && (
//                                                     <a href={facilitatorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
//                                                         Book with Facilitator
//                                                     </a>
//                                                 )}
//                                                 {assessorProfile?.bookingUrl && !facilitatorProfile?.bookingUrl && (
//                                                     <a href={assessorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
//                                                         Book with Assessor
//                                                     </a>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </>
//                         )}

//                         <div className="ap-sidebar__label">Workbook Contents</div>
//                         <div className="ap-sidebar__nav">
//                             {navItems.map((item: any) =>
//                                 item.type === 'section'
//                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
//                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                             )}
//                         </div>
//                     </nav>

//                     <div className="ap-player-content print-pane">
//                         <div className="ap-blocks">

//                             {/* 🚀 LEARNER NOTICE: EXTRA TIME GRANTED BANNER */}
//                             {submission?.extraTimeGranted > 0 && (
//                                 <div style={{
//                                     background: '#e0f2fe',
//                                     border: '1px solid #bae6fd',
//                                     padding: '12px 16px',
//                                     borderRadius: '8px',
//                                     marginBottom: '1rem',
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     gap: '12px'
//                                 }}>
//                                     <Timer size={22} color="#0284c7" style={{ flexShrink: 0 }} />
//                                     <div>
//                                         <strong style={{ fontSize: '0.9rem', color: '#0369a1', display: 'block', marginBottom: '2px' }}>
//                                             Extra Time Granted
//                                         </strong>
//                                         <span style={{ fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.4 }}>
//                                             An additional <strong>{submission.extraTimeGranted} minutes</strong> have been added to your assessment timer. You may proceed with your work.
//                                         </span>
//                                     </div>
//                                 </div>
//                             )}

//                             {/* 🚀 SECURITY VIOLATION BANNER FOR LEARNERS */}
//                             {submission?.status === 'violation' && (
//                                 <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', margin: '1rem' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
//                                         <div className="lfm-fg" style={{ flex: 1, minWidth: '300px' }}>
//                                             <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)', marginBottom: '0.5rem' }}>
//                                                 <ShieldAlert size={18} /> Security Violation Detected
//                                             </div>
//                                             <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
//                                                 This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured and logged. Your invigilator has been notified.
//                                             </p>
//                                             {submission?.systemNote && (
//                                                 <div className="lfm-flags-panel" style={{ background: '#ffffff', borderColor: '#fecaca', borderLeftColor: 'var(--mlab-red)' }}>
//                                                     <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</span>
//                                                     <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
//                                                         "{submission.systemNote}"
//                                                     </p>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}

//                             {assessment?.blocks?.map((block: any) => {

//                                 if (block.type === 'section') {
//                                     const totals = sectionTotals[block.id];
//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
//                                             <span>{block.title}</span>
//                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
//                                             {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" />}
//                                             {renderBlockImage(block)}
//                                             {renderBlockFile(block)}
//                                         </div>
//                                     );
//                                 }

//                                 if (block.type === 'info') return (
//                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
//                                         <div className="ap-block-info__label"><Info size={13} /> {block.title || 'Reading Material'}</div>
//                                         <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
//                                         {renderBlockImage(block)}
//                                         {renderBlockFile(block)}
//                                     </div>
//                                 );

//                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
//                                     qNum++;
//                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
//                                     const learnerAns = answers[block.id];
//                                     let inkColor = '#64748b';
//                                     if (isModDone) inkColor = 'var(--mlab-green)';
//                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
//                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

//                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
//                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

//                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'graph' ? 'ap-block-type-chip--graph' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
//                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : block.type === 'graph' ? 'PLOT' : `Q${qNum}.`;

//                                     const isSectionVerified = isBlockVerified(block.id);
//                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

//                                     return (
//                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
//                                             <div className="ap-block-question__header">
//                                                 <div className="ap-block-question__text-wrap">
//                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
//                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

//                                                         {block.type === 'qcto_workplace' ? (
//                                                             <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} />
//                                                         ) : block.type === 'code_sandbox' ? (
//                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
//                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
//                                                                 {block.question && <MathRenderedContent html={block.question} style={{ color: '#334155' }} />}
//                                                             </div>
//                                                         ) : block.question ? (
//                                                             <MathRenderedContent html={block.question} />
//                                                         ) : block.title ? (
//                                                             <MathRenderedContent html={block.title} />
//                                                         ) : null}
//                                                     </span>
//                                                     <div className="ap-grade-indicators">
//                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
//                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
//                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
//                                                     </div>
//                                                 </div>
//                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
//                                             </div>

//                                             <div className="ap-block-question__body">
//                                                 {renderBlockImage(block)}
//                                                 {renderBlockFile(block)}

//                                                 {/* MCQ */}
//                                                 {block.type === 'mcq' && (
//                                                     <div className="ap-mcq-options">
//                                                         {block.options?.map((opt: string, i: number) => {
//                                                             const selected = learnerAns === i;
//                                                             return (
//                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
//                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
//                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
//                                                                     <span className="ap-mcq-label__text">{opt}</span>
//                                                                 </label>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* TEXT */}
//                                                 {block.type === 'text' && (
//                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                         {isGloballyLocked && !isAwaitingSignoff ? (
//                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
//                                                         ) : (
//                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
//                                                         )}
//                                                     </div>
//                                                 )}

//                                                 {/* CARTESIAN ENGINE GRAPH BLOCK */}
//                                                 {block.type === 'graph' && (
//                                                     <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
//                                                         <AxisWorkspace
//                                                             value={learnerAns || { points: [], shapes: [] }}
//                                                             onChange={(val) => handleAnswerChange(block.id, val)}
//                                                             readOnly={isUploadLocked || !canEditTask}
//                                                         />
//                                                     </div>
//                                                 )}

//                                                 {/* MATHPAD WITH TABS */}
//                                                 {block.type === 'mathpad' && (() => {
//                                                     const itemAns = typeof learnerAns === 'string'
//                                                         ? { equation: learnerAns }
//                                                         : (learnerAns || {});

//                                                     const mathTabs = [
//                                                         { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', allowed: true, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
//                                                         { id: 'graph', icon: <LineChart size={13} />, label: 'Graphing Calculator', allowed: block.allowGraphing !== false, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } },
//                                                         { id: 'draw', icon: <Pencil size={13} />, label: 'Whiteboard Canvas', allowed: block.allowDrawing !== false, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } }
//                                                     ].filter(t => t.allowed);

//                                                     const activeTabId = activeTabs[block.id] || mathTabs[0]?.id;

//                                                     return (
//                                                         <div className="ap-evidence-container">
//                                                             {mathTabs.length > 1 && (
//                                                                 <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
//                                                                     {mathTabs.map(t => {
//                                                                         const isActive = activeTabId === t.id;
//                                                                         const isDone = ((t.id === 'equation' && itemAns.equation) || (t.id === 'graph' && itemAns.graphState?.points?.length > 0) || (t.id === 'draw' && itemAns.drawingUrl));
//                                                                         return (
//                                                                             <button
//                                                                                 key={t.id}
//                                                                                 type="button"
//                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
//                                                                                 style={{
//                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
//                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
//                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
//                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
//                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
//                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
//                                                                                     transition: 'all 0.2s ease',
//                                                                                     opacity: isActive ? 1 : 0.7,
//                                                                                     whiteSpace: 'nowrap'
//                                                                                 }}
//                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
//                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
//                                                                             >
//                                                                                 {t.icon} {t.label} {isDone && <CheckCircle size={12} />}
//                                                                             </button>
//                                                                         );
//                                                                     })}
//                                                                 </div>
//                                                             )}
//                                                             <div className="ap-tab-panel">
//                                                                 {activeTabId === 'equation' && (
//                                                                     <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                         <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: mathTabs.length > 1 ? '6px 6px 0 0' : '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
//                                                                             <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
//                                                                         </div>
//                                                                         <MathpadEditor
//                                                                             value={itemAns.equation || ''}
//                                                                             onChange={(val) => handleAnswerChange(block.id, { ...itemAns, equation: val })}
//                                                                             readOnly={isUploadLocked || !canEditTask}
//                                                                         />
//                                                                     </div>
//                                                                 )}
//                                                                 {activeTabId === 'graph' && (
//                                                                     <AxisWorkspace
//                                                                         value={itemAns.graphState}
//                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, graphState: val })}
//                                                                         readOnly={isUploadLocked || !canEditTask}
//                                                                     />
//                                                                 )}
//                                                                 {activeTabId === 'draw' && (
//                                                                     <DrawingWorkspace
//                                                                         value={itemAns.drawingUrl}
//                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, drawingUrl: val })}
//                                                                         readOnly={isUploadLocked || !canEditTask}
//                                                                         blockId={block.id}
//                                                                         submissionId={submission.id}
//                                                                         toast={toast}
//                                                                         setSaving={setSaving}
//                                                                     />
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     );
//                                                 })()}

//                                                 {/* TASK WITH OPTIONAL IDE */}
//                                                 {block.type === 'task' && (() => {
//                                                     const itemAns = learnerAns || {};

//                                                     const taskTabs = [
//                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
//                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio === true, val: itemAns.audioUrl, theme: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', activeBg: '#f3e8ff' } },
//                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
//                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
//                                                         { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
//                                                     ].filter(t => t.allowed);

//                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
//                                                     const progress = uploadProgress[block.id];

//                                                     const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
//                                                     const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

//                                                     return (
//                                                         <div className="ap-evidence-container">
//                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
//                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}

//                                                             {taskTabs.length > 1 && (
//                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
//                                                                     {taskTabs.map(t => {
//                                                                         const isActive = activeTabId === t.id;
//                                                                         return (
//                                                                             <button
//                                                                                 key={t.id}
//                                                                                 type="button"
//                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
//                                                                                 style={{
//                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
//                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
//                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
//                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
//                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
//                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
//                                                                                     transition: 'all 0.2s ease',
//                                                                                     opacity: isActive ? 1 : 0.7
//                                                                                 }}
//                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
//                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
//                                                                             >
//                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
//                                                                             </button>
//                                                                         );
//                                                                     })}
//                                                                 </div>
//                                                             )}

//                                                             <div className="ap-tab-panel">
//                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your answer here…'} />}</div>}
//                                                                 {activeTabId === 'audio' && (itemAns.audioUrl ? <audio controls src={itemAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
//                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
//                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}

//                                                                 {/* 🚀 LIVE IDE SANDBOX ON TASK BLOCK */}
//                                                                 {activeTabId === 'code' && (
//                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
//                                                                         <CodeSandboxPlayer
//                                                                             block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
//                                                                             learnerAns={mappedCodeData}
//                                                                             readOnly={isUploadLocked || !canEditTask}
//                                                                             onChange={async (val) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
//                                                                             portalTarget={getPortalTarget()}
//                                                                         />
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     );
//                                                 })()}

//                                                 {/* CHECKLIST */}
//                                                 {block.type === 'checklist' && (
//                                                     <div className="ap-checklist">
//                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
//                                                         {block.criteria?.map((crit: string, i: number) => {
//                                                             const res = criteriaResults?.[i] || {};

//                                                             const nestedKey = `evidence_${i}`;
//                                                             const itemAns = learnerAns?.[nestedKey] || {};

//                                                             const evidenceTabs = [
//                                                                 { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
//                                                                 { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
//                                                                 { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
//                                                                 { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
//                                                             ].filter(t => t.allowed);

//                                                             const tabStateKey = `${block.id}_${nestedKey}`;
//                                                             const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
//                                                             const progress = uploadProgress[`${block.id}_${nestedKey}`];

//                                                             const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
//                                                             const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

//                                                             return (
//                                                                 <div key={i} className="ap-checklist__item">
//                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>

//                                                                     {block.requireEvidencePerCriterion !== false && (
//                                                                         <div className="ap-evidence-container" style={{ marginTop: '10px', marginBottom: '15px' }}>
//                                                                             {evidenceTabs.length > 1 && (
//                                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
//                                                                                     {evidenceTabs.map(t => {
//                                                                                         const isActive = activeTabId === t.id;
//                                                                                         return (
//                                                                                             <button
//                                                                                                 key={t.id}
//                                                                                                 type="button"
//                                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
//                                                                                                 style={{
//                                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
//                                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
//                                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
//                                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
//                                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
//                                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
//                                                                                                     transition: 'all 0.2s ease',
//                                                                                                     opacity: isActive ? 1 : 0.7
//                                                                                                 }}
//                                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
//                                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
//                                                                                             >
//                                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
//                                                                                             </button>
//                                                                                         );
//                                                                                     })}
//                                                                                 </div>
//                                                                             )}

//                                                                             <div className="ap-tab-panel">
//                                                                                 {activeTabId === 'text' && (
//                                                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                                         {isGloballyLocked && !isAwaitingSignoff ? (
//                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
//                                                                                         ) : (
//                                                                                             <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
//                                                                                         )}
//                                                                                     </div>
//                                                                                 )}
//                                                                                 {activeTabId === 'url' && (
//                                                                                     <div>
//                                                                                         {itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}
//                                                                                     </div>
//                                                                                 )}
//                                                                                 {activeTabId === 'upload' && (
//                                                                                     progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : (
//                                                                                         <div className="ap-upload-empty">
//                                                                                             {isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
//                                                                                                 <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
//                                                                                                 <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} />
//                                                                                             </>}
//                                                                                         </div>
//                                                                                     )
//                                                                                 )}

//                                                                                 {activeTabId === 'code' && (
//                                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
//                                                                                         <CodeSandboxPlayer
//                                                                                             block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${crit}`, template: 'vanilla' }}
//                                                                                             learnerAns={mappedCodeData}
//                                                                                             readOnly={isUploadLocked || !canEditWorkplace}
//                                                                                             onChange={async (val) => {
//                                                                                                 const updatedAns = { ...answers[block.id] };
//                                                                                                 const prevNested = updatedAns[nestedKey] || {};
//                                                                                                 updatedAns[nestedKey] = { ...prevNested, codeData: val };
//                                                                                                 handleAnswerChange(block.id, updatedAns);
//                                                                                             }}
//                                                                                             portalTarget={getPortalTarget()}
//                                                                                         />
//                                                                                     </div>
//                                                                                 )}
//                                                                             </div>
//                                                                         </div>
//                                                                     )}

//                                                                     <div className="ap-checklist__assessor-row">
//                                                                         {res.status ? (
//                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
//                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
//                                                                             </div>
//                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
//                                                                     </div>
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* LOGBOOK */}
//                                                 {block.type === 'logbook' && (
//                                                     <div className="ap-logbook">
//                                                         <MathRenderedContent html={block.content} className="ap-logbook__desc" />
//                                                         <table className="ap-logbook__table">
//                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
//                                                             <tbody>
//                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
//                                                                     <tr key={i} className="ap-logbook__tbody">
//                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
//                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
//                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button type="button" className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
//                                                                     </tr>
//                                                                 ))}
//                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button type="button" className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
//                                                             </tbody>
//                                                         </table>
//                                                     </div>
//                                                 )}

//                                                 {/* QCTO WORKPLACE WITH FULL EVIDENCE SUPPORT & LIVE IDE */}
//                                                 {block.type === 'qcto_workplace' && (
//                                                     <div className="ap-workplace">
//                                                         <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
//                                                         {block.workActivities?.map((wa: any) => {
//                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
//                                                             return (
//                                                                 <div key={wa.id} className="ap-workplace__activity">
//                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

//                                                                     {wa.evidenceItems?.map((se: any) => {
//                                                                         const nestedKey = `se_${se.id}`;
//                                                                         const itemAns = learnerAns?.[nestedKey] || {};

//                                                                         const evidenceTabs = [
//                                                                             { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: true, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
//                                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: true, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
//                                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: true, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
//                                                                             { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: true, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
//                                                                         ];

//                                                                         const tabStateKey = `${block.id}_${nestedKey}`;
//                                                                         const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
//                                                                         const progress = uploadProgress[`${block.id}_${nestedKey}`];

//                                                                         const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
//                                                                         const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

//                                                                         return (
//                                                                             <div key={se.id} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
//                                                                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>{se.code}: {se.description}</div>
//                                                                                 <div className="ap-evidence-container">
//                                                                                     {evidenceTabs.length > 1 && (
//                                                                                         <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
//                                                                                             {evidenceTabs.map(t => {
//                                                                                                 const isActive = activeTabId === t.id;
//                                                                                                 return (
//                                                                                                     <button
//                                                                                                         key={t.id}
//                                                                                                         type="button"
//                                                                                                         onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
//                                                                                                         style={{
//                                                                                                             display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
//                                                                                                             background: isActive ? t.theme.activeBg : t.theme.bg,
//                                                                                                             padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
//                                                                                                             border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
//                                                                                                             cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
//                                                                                                             boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
//                                                                                                             transition: 'all 0.2s ease',
//                                                                                                             opacity: isActive ? 1 : 0.7
//                                                                                                         }}
//                                                                                                         onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
//                                                                                                         onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
//                                                                                                     >
//                                                                                                         {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
//                                                                                                     </button>
//                                                                                                 );
//                                                                                             })}
//                                                                                         </div>
//                                                                                     )}

//                                                                                     <div className="ap-tab-panel">
//                                                                                         {activeTabId === 'text' && (
//                                                                                             <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
//                                                                                                 {isGloballyLocked && !isAwaitingSignoff ? (
//                                                                                                     <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
//                                                                                                 ) : (
//                                                                                                     <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
//                                                                                                 )}
//                                                                                             </div>
//                                                                                         )}
//                                                                                         {activeTabId === 'url' && (
//                                                                                             <div>
//                                                                                                 {itemAns.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}
//                                                                                             </div>
//                                                                                         )}
//                                                                                         {activeTabId === 'upload' && (
//                                                                                             progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : (
//                                                                                                 <div className="ap-upload-empty">
//                                                                                                     {isUploadLocked || !canEditWorkplace ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
//                                                                                                         <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
//                                                                                                         <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditWorkplace} style={{ fontSize: '0.82rem' }} />
//                                                                                                     </>}
//                                                                                                 </div>
//                                                                                             )
//                                                                                         )}

//                                                                                         {activeTabId === 'code' && (
//                                                                                             <div style={{ height: '600px', marginTop: '10px' }}>
//                                                                                                 <CodeSandboxPlayer
//                                                                                                     block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${se.code}`, template: 'vanilla' }}
//                                                                                                     learnerAns={mappedCodeData}
//                                                                                                     readOnly={isUploadLocked || !canEditWorkplace}
//                                                                                                     onChange={async (val) => {
//                                                                                                         const updatedAns = { ...answers[block.id] };
//                                                                                                         const prevNested = updatedAns[nestedKey] || {};
//                                                                                                         updatedAns[nestedKey] = { ...prevNested, codeData: val };
//                                                                                                         handleAnswerChange(block.id, updatedAns);
//                                                                                                     }}
//                                                                                                     portalTarget={getPortalTarget()}
//                                                                                                 />
//                                                                                             </div>
//                                                                                         )}
//                                                                                     </div>
//                                                                                 </div>
//                                                                             </div>
//                                                                         );
//                                                                     })}

//                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
//                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
//                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
//                                                                     </label>
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 {/* 🚀 STANDALONE CODE SANDBOX BLOCK */}
//                                                 {block.type === 'code_sandbox' && (
//                                                     isFetchingSnapshots ? (
//                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
//                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
//                                                             <p>Loading code environment...</p>
//                                                         </div>
//                                                     ) : (
//                                                         <CodeSandboxPlayer
//                                                             block={block}
//                                                             learnerAns={{
//                                                                 ...(learnerAns || {}),
//                                                                 snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot || learnerAns?.codeData?.snapshot
//                                                             }}
//                                                             readOnly={isUploadLocked || !canEditCode}
//                                                             onChange={async (val: any) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
//                                                             portalTarget={getPortalTarget()}
//                                                         />
//                                                     )
//                                                 )}

//                                                 {/* Per-question feedback */}
//                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
//                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
//                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
//                                             </div>
//                                         </div>
//                                     );
//                                 }
//                                 return null;
//                             })}
//                         </div>

//                         {/* FOOTER */}
//                         {isAwaitingSignoff ? (
//                             <div className="ap-footer ap-footer--signoff no-print">
//                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
//                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <button type="button" className="ap-btn ap-btn--amber" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Acknowledge &amp; Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : !isGloballyLocked ? (
//                             <div className="ap-footer no-print">
//                                 <h3 className="ap-footer__title">Final Submission</h3>
//                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
//                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
//                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
//                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
//                                 </label>
//                                 <div className="ap-footer-actions">
//                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
//                                     <button type="button" className="ap-btn ap-btn--green" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Submit for Grading</button>
//                                 </div>
//                             </div>
//                         ) : (
//                             <div className="ap-footer ap-footer--locked no-print">
//                                 <div className="ap-footer--locked__icon-wrap">
//                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
//                                 </div>
//                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
//                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
//                                 <button type="button" className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </ProctoringWrapper>
//     );
// };

// export default AssessmentPlayerContent;




// // // src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

// // import React, { useState, useMemo, useEffect, useRef } from 'react';
// // import {
// //     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
// //     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
// //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// //     Menu, FileArchive, Loader2, Sigma, Calendar, LineChart, Pencil,
// //     ShieldAlert, Maximize, ZoomIn, ZoomOut
// // } from 'lucide-react';
// // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // import ReactQuill from 'react-quill-new';
// // import 'react-quill-new/dist/quill.snow.css';
// // import './AssessmentPlayer.css';
// // import { createPortal } from 'react-dom';
// // import { UploadProgress } from '../../../components/common/UploadProgress';
// // import { UrlPreview } from '../../../components/common/UrlPreview';
// // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
// // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, getBytes } from 'firebase/storage';

// // import katex from "katex";
// // import "katex/dist/katex.min.css";
// // import "mathlive";
// // import { Tldraw } from 'tldraw';
// // import 'tldraw/tldraw.css';
// // import AxisWorkspace from '../../../components/common/AxisWorkspace/AxisWorkspace';

// // (window as any).katex = katex;

// // // 🚀 BULLETPROOF PORTAL TARGET RESOLVER FOR FULLSCREEN MODE
// // const getPortalTarget = (): HTMLElement => {
// //     const proctorRoot = document.getElementById('proctor-portal-root');
// //     if (proctorRoot) return proctorRoot;
// //     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
// //     return document.body;
// // };

// // const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// // const extractPlainText = (htmlString?: string) => {
// //     if (!htmlString) return '';
// //     const tmp = document.createElement("DIV");
// //     tmp.innerHTML = htmlString;
// //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // };
// // const getSafeDate = (ds: string) => {
// //     if (!ds) return 'recently';
// //     const d = new Date(ds);
// //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// // };
// // const formatTime = (s: number) => {
// //     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
// //     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// // };

// // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
// // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'formula'];

// // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// //     const radius = (size - strokeWidth) / 2;
// //     const circumference = 2 * Math.PI * radius;
// //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
// //     return (
// //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// //             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
// //         </svg>
// //     );
// // };

// // /* ─── INLINE FULLSCREEN-COMPATIBLE MODALS ─── */
// // const SubmissionConfirmModal: React.FC<{
// //     isAwaitingSignoff: boolean;
// //     onConfirm: () => void;
// //     onCancel: () => void;
// // }> = ({ isAwaitingSignoff, onConfirm, onCancel }) => {
// //     return createPortal(
// //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '500px', background: 'white', borderTop: '5px solid var(--mlab-green)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
// //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc' }}>
// //                     <ShieldCheck size={22} color="var(--mlab-green)" />
// //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#0f172a' }}>
// //                         {isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment for Grading?"}
// //                     </h2>
// //                 </div>
// //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// //                         {isAwaitingSignoff
// //                             ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
// //                             : "You are about to submit this workbook for final grading. You will NOT be able to change or edit your answers after submitting."}
// //                     </p>
// //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// //                         <button
// //                             type="button"
// //                             onClick={onCancel}
// //                             className="ap-btn ap-btn--outline"
// //                             style={{ padding: '10px 18px', borderRadius: '4px', cursor: 'pointer' }}
// //                         >
// //                             Go Back
// //                         </button>
// //                         <button
// //                             type="button"
// //                             onClick={onConfirm}
// //                             className="ap-btn ap-btn--green"
// //                             style={{ padding: '10px 20px', borderRadius: '4px', background: 'var(--mlab-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
// //                         >
// //                             {isAwaitingSignoff ? "Acknowledge & Submit" : "Yes, Submit for Grading"}
// //                         </button>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>,
// //         getPortalTarget()
// //     );
// // };

// // const LeaveWarningModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
// //     return createPortal(
// //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '480px', background: 'white', borderTop: '5px solid #f59e0b' }}>
// //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb' }}>
// //                     <AlertTriangle size={22} color="#f59e0b" />
// //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#92400e' }}>Leave Timed Assessment?</h2>
// //                 </div>
// //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// //                         Your timer will <strong>NOT</strong> pause. If you leave, the clock will continue counting down in the background.
// //                     </p>
// //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// //                         <button type="button" onClick={onCancel} className="ap-btn ap-btn--outline" style={{ padding: '10px 18px', cursor: 'pointer' }}>Stay Here</button>
// //                         <button type="button" onClick={onConfirm} className="ap-btn" style={{ padding: '10px 18px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Leave</button>
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>,
// //         getPortalTarget()
// //     );
// // };

// // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// //     const [reason, setReason] = useState('');
// //     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
// //     return createPortal(
// //         <div className="ap-modal" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// //                 <div className="ap-modal-header ap-modal-header--danger">
// //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// //                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
// //                 </div>
// //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// //                     <div className="ap-form-group">
// //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// //                     </div>
// //                     <div className="ap-modal-footer">
// //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         getPortalTarget()
// //     );
// // };

// // // 🚀 ENCAPSULATED FULLSCREEN IMAGE VIEWER WITH ZOOM & PAN
// // const FullscreenImageModal: React.FC<{ url: string; caption?: string; onClose: () => void }> = ({ url, caption, onClose }) => {
// //     const [scale, setScale] = useState(1);
// //     const [position, setPosition] = useState({ x: 0, y: 0 });
// //     const [isDragging, setIsDragging] = useState(false);
// //     const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

// //     const handleWheel = (e: React.WheelEvent) => {
// //         e.stopPropagation();
// //         setScale(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.005, 5)));
// //     };

// //     const handleMouseDown = (e: React.MouseEvent) => {
// //         e.stopPropagation();
// //         setIsDragging(true);
// //         setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
// //     };

// //     const handleMouseMove = (e: React.MouseEvent) => {
// //         if (!isDragging) return;
// //         e.stopPropagation();
// //         setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
// //     };

// //     const handleMouseUp = (e: React.MouseEvent) => {
// //         e.stopPropagation();
// //         setIsDragging(false);
// //     };

// //     const zoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
// //     const zoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.max(p - 0.5, 0.5)); };
// //     const resetZoom = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

// //     const btnStyle = {
// //         background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '10px', 
// //         borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', 
// //         justifyContent: 'center', transition: 'background 0.2s', backdropFilter: 'blur(4px)'
// //     };

// //     return createPortal(
// //         <div 
// //             style={{ 
// //                 position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.95)', 
// //                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
// //                 backdropFilter: 'blur(8px)', overflow: 'hidden', pointerEvents: 'auto'
// //             }}
// //             onWheel={handleWheel}
// //             onMouseMove={handleMouseMove}
// //             onMouseUp={handleMouseUp}
// //             onMouseLeave={handleMouseUp}
// //             onClick={onClose}
// //         >
// //             <div 
// //                 style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}
// //                 onClick={e => e.stopPropagation()} 
// //                 onMouseDown={e => e.stopPropagation()} 
// //             >
// //                 <button onClick={zoomOut} style={btnStyle} title="Zoom Out" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomOut size={20} /></button>
// //                 <button onClick={resetZoom} style={btnStyle} title="Reset Zoom" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><Maximize size={20} /></button>
// //                 <button onClick={zoomIn} style={btnStyle} title="Zoom In" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomIn size={20} /></button>
// //                 <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
// //                 <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.8)' }} title="Close" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}><X size={20} /></button>
// //             </div>
            
// //             <div 
// //                 style={{ 
// //                     transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, 
// //                     transition: isDragging ? 'none' : 'transform 0.1s ease-out',
// //                     cursor: isDragging ? 'grabbing' : 'grab',
// //                     display: 'flex', flexDirection: 'column', alignItems: 'center'
// //                 }}
// //                 onMouseDown={handleMouseDown}
// //                 onClick={e => e.stopPropagation()} 
// //             >
// //                 <img 
// //                     src={url} 
// //                     alt={caption || "Expanded view"} 
// //                     crossOrigin="anonymous" 
// //                     draggable={false}
// //                     style={{ 
// //                         maxWidth: '90vw', 
// //                         maxHeight: '80vh', 
// //                         objectFit: 'contain', 
// //                         borderRadius: '8px',
// //                         boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
// //                         pointerEvents: 'none'
// //                     }}
// //                 />
// //                 {caption && (
// //                     <p style={{ color: 'white', marginTop: '15px', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px', pointerEvents: 'none' }}>
// //                         {caption}
// //                     </p>
// //                 )}
// //             </div>
// //             <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '20px' }}>
// //                 Scroll to zoom • Click and drag to pan
// //             </div>
// //         </div>,
// //         getPortalTarget()
// //     );
// // };

// // const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
// //     const containerRef = useRef<HTMLDivElement>(null);
// //     const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

// //     useEffect(() => {
// //         if (!containerRef.current || !html) return;
// //         // @ts-ignore
// //         import('katex/dist/contrib/auto-render.mjs').then((module) => {
// //             if (containerRef.current) {
// //                 module.default(containerRef.current, {
// //                     delimiters: [
// //                         { left: '$$', right: '$$', display: true },
// //                         { left: '$', right: '$', display: false },
// //                         { left: '\\(', right: '\\)', display: false },
// //                         { left: '\\[', right: '\\]', display: true }
// //                     ],
// //                     throwOnError: false
// //                 });
// //             }
// //         }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
// //     }, [html]);

// //     return (
// //         <div style={{ display: 'inline-block', width: style?.width }}>
// //             {style?.color && <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>}
// //             <div ref={containerRef} className={`quill-read-only-content ${uniqueClass} ${className || ''}`} style={{ lineHeight: 1.6, ...style }} dangerouslySetInnerHTML={{ __html: cleanRichText(html) }} />
// //         </div>
// //     );
// // };

// // const LearnerFilePreview: React.FC<{ url: string; onRemove?: () => void; disabled?: boolean }> = ({ url, onRemove, disabled }) => {
// //     if (!url) return null;

// //     const cleanUrl = url.split('?')[0];
// //     const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded_Evidence');
// //     const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

// //     const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
// //     const isPdf = ext === 'pdf';
// //     const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

// //     if (isImage) {
// //         return (
// //             <div style={{ position: 'relative', marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// //                 <img src={url} alt="Learner evidence preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '4px', display: 'block', margin: '0 auto' }} />
// //                 {onRemove && !disabled && (
// //                     <button type="button" onClick={onRemove} style={{ marginTop: '8px', padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                         <Trash2 size={13} /> Remove File
// //                     </button>
// //                 )}
// //             </div>
// //         );
// //     }

// //     if (isPdf) {
// //         return (
// //             <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
// //                 <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
// //                         <FileText size={18} color="#0284c7" />
// //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// //                             {fileName}
// //                         </span>
// //                     </div>
// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                         <a href={url} target="_blank" rel="noopener noreferrer" download style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '6px 12px', background: '#0284c7', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
// //                             <UploadCloud size={13} style={{ transform: 'rotate(180deg)' }} /> Open PDF
// //                         </a>
// //                         {onRemove && !disabled && (
// //                             <button type="button" onClick={onRemove} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
// //                                 <Trash2 size={13} />
// //                             </button>
// //                         )}
// //                     </div>
// //                 </div>
// //                 <div style={{ height: '420px', width: '100%' }}>
// //                     <object data={url} type="application/pdf" width="100%" height="100%">
// //                         <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#475569' }}>
// //                             Your browser does not support inline PDF viewing. <a href={url} target="_blank" rel="noreferrer">Click here to download PDF</a>
// //                         </p>
// //                     </object>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '16px' }}>
// //             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
// //                     <div style={{ background: isSpreadsheet ? '#dcfce7' : '#e0f2fe', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                         <FileText size={24} color={isSpreadsheet ? '#15803d' : '#0369a1'} />
// //                     </div>
// //                     <div style={{ overflow: 'hidden' }}>
// //                         <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// //                             {fileName}
// //                         </span>
// //                         <span style={{ fontSize: '0.75rem', color: isSpreadsheet ? '#166534' : '#0284c7', fontWeight: 'bold' }}>
// //                             {isSpreadsheet ? 'Excel / CSV Spreadsheet Evidence' : 'Uploaded Document Evidence'}
// //                         </span>
// //                     </div>
// //                 </div>

// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                     <a
// //                         href={url}
// //                         target="_blank"
// //                         rel="noopener noreferrer"
// //                         download
// //                         style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: isSpreadsheet ? '#166534' : '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// //                     >
// //                         <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// //                     </a>
// //                     {onRemove && !disabled && (
// //                         <button
// //                             type="button"
// //                             onClick={onRemove}
// //                             style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
// //                         >
// //                             <Trash2 size={14} /> Remove
// //                         </button>
// //                     )}
// //                 </div>
// //             </div>

// //             <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                 <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
// //                 <span>Spreadsheets and binary files are downloaded directly to your device for viewing in Microsoft Excel or Google Sheets.</span>
// //             </div>
// //         </div>
// //     );
// // };

// // const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
// //     const mfRef = useRef<any>(null);
// //     const lastBroadcastRef = useRef('');

// //     const cleanValue = useMemo(() => {
// //         let v = value || '';
// //         if (v.includes('<p>') || v.includes('&nbsp;')) v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
// //         return v;
// //     }, [value]);

// //     useEffect(() => {
// //         const mf = mfRef.current;
// //         if (!mf) return;
// //         if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) mf.value = cleanValue;
// //         mf.readOnly = readOnly;
// //     }, [cleanValue, readOnly]);

// //     useEffect(() => {
// //         const mf = mfRef.current;
// //         if (!mf) return;
// //         const handleInput = () => { lastBroadcastRef.current = mf.value; onChange(mf.value); };
// //         mf.addEventListener('input', handleInput);
// //         return () => mf.removeEventListener('input', handleInput);
// //     }, [onChange]);

// //     useEffect(() => {
// //         const mf = mfRef.current;
// //         if (!mf) return;
// //         const triggerNewline = () => {
// //             const hasMultilineEnv = mf.value.includes('\\begin{aligned}') || mf.value.includes('\\begin{matrix}') || mf.value.includes('\\begin{array}') || mf.value.includes('\\begin{cases}') || mf.value.includes('\\begin{gathered}');
// //             if (hasMultilineEnv) mf.executeCommand('addRowAfter');
// //             else {
// //                 mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
// //                 mf.executeCommand('moveToMathfieldEnd');
// //             }
// //         };
// //         const handleBeforeInput = (e: any) => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); triggerNewline(); } };
// //         mf.addEventListener('beforeinput', handleBeforeInput);
// //         return () => mf.removeEventListener('beforeinput', handleBeforeInput);
// //     }, [readOnly]);

// //     return (
// //         <div style={{ position: 'relative', width: '100%' }}>
// //             <style>{`
// //                 math-field::part(container) .ML__matrix,
// //                 math-field::part(container) .ML__array,
// //                 math-field::part(container) .ML__aligned,
// //                 math-field::part(container) .ML__matrix-row {
// //                     border: none !important;
// //                     outline: none !important;
// //                 }
// //             `}</style>
// //             {React.createElement('math-field', {
// //                 ref: mfRef,
// //                 style: {
// //                     width: '100%', fontSize: '1.4rem', padding: '12px',
// //                     border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
// //                     borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
// //                     outline: 'none', color: '#0f172a', display: 'block',
// //                     minHeight: '140px', height: 'auto'
// //                 }
// //             })}
// //         </div>
// //     );
// // };

// // const DrawingWorkspace: React.FC<{ value: string; onChange: (v: string) => void; readOnly: boolean; blockId: string; submissionId: string; toast: any; setSaving: (v: boolean) => void }> = ({ value, onChange, readOnly, blockId, submissionId, toast, setSaving }) => {
// //     const [editor, setEditor] = useState<any>(null);
// //     const [isUploading, setIsUploading] = useState(false);

// //     const handleSave = async () => {
// //         if (!editor) return;
// //         const shapeIds = Array.from(editor.getCurrentPageShapeIds());
// //         if (shapeIds.length === 0) return toast.warning("The workspace is empty!");

// //         setIsUploading(true);
// //         setSaving(true);
// //         toast.info("Saving workspace securely...");

// //         try {
// //             const { blob } = await editor.toImage(shapeIds, {
// //                 format: 'png',
// //                 background: true,
// //                 padding: 20
// //             });

// //             const storage = getStorage();
// //             const refPath = `evidence/${submissionId}/${blockId}_workspace_${Date.now()}.png`;
// //             const storageRef = fbStorageRef(storage, refPath);

// //             await uploadBytesResumable(storageRef, blob);
// //             const url = await getDownloadURL(storageRef);

// //             onChange(url);
// //             toast.success("Workspace saved securely!");
// //         } catch (err) {
// //             console.error(err);
// //             toast.error("Failed to save workspace. Please try again.");
// //         } finally {
// //             setIsUploading(false);
// //             setSaving(false);
// //         }
// //     };

// //     return (
// //         <div style={{ position: 'relative' }}>
// //             {readOnly && value ? (
// //                 <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// //                     <img src={value} alt="Learner workspace" crossOrigin="anonymous" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white' }} />
// //                 </div>
// //             ) : readOnly && !value ? (
// //                 <div className="ap-upload-empty">No workspace data provided.</div>
// //             ) : (
// //                 <>
// //                     <div style={{ height: '600px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
// //                         <Tldraw onMount={setEditor} hideUi={false} />
// //                     </div>
// //                     <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
// //                         <div style={{ flex: 1 }} />
// //                         {value && <span style={{ color: 'var(--mlab-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><CheckCircle size={14} /> Cloud Synced</span>}
// //                         <button type="button" onClick={handleSave} className="ap-btn ap-btn--primary" disabled={isUploading}>
// //                             {isUploading ? <><Loader2 className="ap-spin" size={14} /> Saving Workspace...</> : <><Save size={14} /> Submit Workspace Canvas</>}
// //                         </button>
// //                     </div>
// //                 </>
// //             )}
// //         </div>
// //     );
// // };

// // export interface AssessmentPlayerContentProps {
// //     user: any;
// //     assessment: any;
// //     submission: any;
// //     answers: Record<string, any>;
// //     learnerProfile: any;
// //     learnerEnrollment: any;
// //     assessorProfile: any;
// //     moderatorProfile: any;
// //     facilitatorProfile: any;
// //     employers: any[];
// //     staff: any[];
// //     moduleLogs: any[];
// //     approvedLogs: any[];
// //     logsLoading: boolean;
// //     saving: boolean;
// //     setSaving: (v: boolean) => void;
// //     uploadProgress: Record<string, number>;
// //     setUploadProgress: (fn: (prev: any) => any) => void;
// //     activeTabs: Record<string, string>;
// //     setActiveTabs: (tabs: Record<string, string>) => void;
// //     timeLeft: number | null;
// //     isGloballyLocked: boolean;
// //     isAwaitingSignoff: boolean;
// //     isPracticalModule: boolean;
// //     isWorkplaceModule: boolean;
// //     isRemediation: boolean;
// //     isAppealUpheld: boolean;
// //     isFacDone: boolean;
// //     isAssDone: boolean;
// //     isModDone: boolean;
// //     isSubmitted: boolean;
// //     isMissed: boolean;
// //     showGate: boolean;
// //     showLeaveWarning: boolean;
// //     setShowLeaveWarning: (v: boolean) => void;
// //     showSubmitConfirm: boolean;
// //     setShowSubmitConfirm: (v: boolean) => void;
// //     showAppealModal: boolean;
// //     setShowAppealModal: (v: boolean) => void;
// //     declarationChecked: boolean;
// //     setDeclarationChecked: (v: boolean) => void;
// //     isMobileMenuOpen: boolean;
// //     setIsMobileMenuOpen: (v: boolean) => void;
// //     willBeProctored: boolean;
// //     savedFacRole: string | null;
// //     grandTotalAwarded: number;
// //     grandTotalMax: number;
// //     grandTotalPct: number;
// //     sectionTotals: Record<string, { total: number; awarded: number }>;
// //     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
// //     safeNavigateBack: () => void;
// //     handleAnswerChange: (blockId: string, value: any) => void;
// //     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
// //     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
// //     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
// //     triggerSubmitConfirm: () => void;
// //     executeSubmit: () => void;
// //     executeAppeal: (reason: string) => void;
// //     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride?: boolean) => void;
// //     getBlockGrading: (blockId: string) => any;
// //     isBlockVerified: (blockId: string) => boolean;
// //     getSecureNow: () => number;
// //     toast: any;
// //     saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
// //     codeSnapshots: Record<string, any>;
// // }

// // export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
// //     const {
// //         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
// //         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving, setSaving,
// //         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
// //         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
// //         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
// //         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
// //         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
// //         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
// //         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
// //         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
// //     } = props;

// //     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
// //     const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});
    
// //     // 🚀 Tracks which image is currently opened in Fullscreen Modal
// //     const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

// //     const answersRef = useRef(answers);
// //     useEffect(() => { answersRef.current = answers; }, [answers]);

// //     // COMPUTED STATUS VARS FOR SIDEBAR AND PANELS
// //     const currentStatus = String(submission?.status || '').toLowerCase();
// //     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';
// //     const isMissed = currentStatus === 'missed';

// //     const codeBlockStorageSignature = useMemo(() => {
// //         if (!assessment?.blocks) return '';
// //         return assessment?.blocks
// //             .filter((b: any) => b.type === 'code_sandbox')
// //             .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
// //             .join('|');
// //     }, [assessment?.blocks, answers]);

// //     // 🚀 DIRECT FIREBASE STORAGE DOWNLOAD USING `getBytes`
// //     useEffect(() => {
// //         let cancelled = false;

// //         const fetchSnapshots = async () => {
// //             try {
// //                 if (!submission?.id || !assessment?.blocks) {
// //                     if (!cancelled) setIsFetchingSnapshots(false);
// //                     return;
// //                 }

// //                 const codeBlocks = assessment?.blocks.filter((b: any) => b.type === 'code_sandbox') || [];
// //                 if (codeBlocks.length === 0) {
// //                     if (!cancelled) setIsFetchingSnapshots(false);
// //                     return;
// //                 }

// //                 const newSnaps: Record<string, any> = {};
// //                 const storage = getStorage();
// //                 const currentAnswers = answersRef.current;

// //                 await Promise.all(codeBlocks.map(async (block: any) => {
// //                     const entry = currentAnswers[block.id] || answers[block.id];

// //                     const storagePath = entry?.storagePath || entry?.codeData?.storagePath;
// //                     const inlineSnapshot = entry?.snapshot || entry?.codeData?.snapshot;

// //                     if (storagePath) {
// //                         try {
// //                             const jsonRef = fbStorageRef(storage, storagePath);
// //                             const buffer = await getBytes(jsonRef);
// //                             const jsonStr = new TextDecoder().decode(buffer);
// //                             const files = JSON.parse(jsonStr);
// //                             newSnaps[block.id] = files;
// //                         } catch (err) {
// //                             console.error(`❌ [FETCH SNAPSHOTS ERROR] Failed to download storage snapshot for block [${block.id}]:`, err);
// //                         }
// //                     } else if (inlineSnapshot) {
// //                         newSnaps[block.id] = inlineSnapshot;
// //                     }
// //                 }));

// //                 if (!cancelled) {
// //                     setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
// //                 }
// //             } catch (err) {
// //                 console.error("Fatal error fetching snapshots:", err);
// //             } finally {
// //                 if (!cancelled) setIsFetchingSnapshots(false);
// //             }
// //         };

// //         fetchSnapshots();
// //         return () => { cancelled = true; };
// //     }, [submission?.id, codeBlockStorageSignature, assessment?.blocks]);

// //     const MAX_FILE_SIZE_MB = 10;
// //     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// //     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;
// //         if (file.size > MAX_FILE_SIZE_BYTES) {
// //             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
// //             e.target.value = ''; return;
// //         }
// //         handleFileUpload(file, blockId, nestedKey);
// //     };

// //     const navItems = assessment?.blocks?.reduce((acc: any[], block: any) => {
// //         if (block.type === 'section') {
// //             acc.push({ type: 'section', label: block.title, id: block.id });
// //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// //         }
// //         return acc;
// //     }, []) || [];

// //     const displayStatus = submission.status.replace('_', ' ');

// //     const canEditTask = !isGloballyLocked;
// //     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
// //     const canEditLogbook = !isGloballyLocked;
// //     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
// //     const canEditCode = !isGloballyLocked;

// //     // 🚀 Interactive Image Renderer with Expand overlay
// //     const renderBlockImage = (block: any) => {
// //         if (!block.imageUrl) return null;
// //         return (
// //             <div style={{ margin: '1rem 0', textAlign: 'center', position: 'relative', display: 'inline-block', width: '100%' }}>
// //                 <div 
// //                     style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
// //                     onClick={() => setExpandedImage({ url: block.imageUrl, caption: block.imageCaption })}
// //                 >
// //                     <img 
// //                         src={block.imageUrl} 
// //                         alt={block.imageCaption || "Assessment attachment"} 
// //                         crossOrigin="anonymous" 
// //                         style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain', display: 'block', margin: '0 auto' }} 
// //                     />
// //                     <div style={{ 
// //                         position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.7)', color: 'white', 
// //                         padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', 
// //                         backdropFilter: 'blur(4px)', transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' 
// //                     }}>
// //                         <Maximize size={14} /> View Fullscreen
// //                     </div>
// //                 </div>
// //                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
// //             </div>
// //         );
// //     };

// //     const renderBlockFile = (block: any) => {
// //         if (!block.fileUrl) return null;
// //         return (
// //             <div style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
// //                     <FileText size={20} color="#166534" />
// //                     <div style={{ overflow: 'hidden' }}>
// //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
// //                             {block.fileName || "Download Starter File"}
// //                         </span>
// //                         <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
// //                     </div>
// //                 </div>
// //                 <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0 }}>
// //                     <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// //                 </a>
// //             </div>
// //         );
// //     };

// //     let qNum = 0;

// //     const handleFooterSubmitClick = (e: React.MouseEvent) => {
// //         e.preventDefault();
// //         triggerSubmitConfirm();
// //     };

// //     return (
// //         <ProctoringWrapper
// //             assessmentId={assessment?.id || assessment?.assessmentId || user?.assessmentId || ''}
// //             learnerId={user?.uid || submission?.authUid || submission?.learnerId || ''}
// //             isProctored={willBeProctored}
// //         >
// //             <div className="ap-player ap-animate">
// //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// //                 {/* 🚀 MODALS MOUNT DIRECTLY INSIDE FULLSCREEN TOP-LAYER TARGET */}
// //                 {showLeaveWarning && <LeaveWarningModal onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}
// //                 {showSubmitConfirm && <SubmissionConfirmModal isAwaitingSignoff={isAwaitingSignoff} onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}
// //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// //                 {/* 🚀 PROCTOR-SAFE IN-DOM FULLSCREEN IMAGE MODAL */}
// //                 {expandedImage && createPortal(
// //                     <FullscreenImageModal 
// //                         url={expandedImage.url} 
// //                         caption={expandedImage.caption} 
// //                         onClose={() => setExpandedImage(null)} 
// //                     />,
// //                     getPortalTarget()
// //                 )}

// //                 <div className="ap-player-topbar no-print">
// //                     <div className="ap-player-topbar__left">
// //                         <button type="button" className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// //                         <button type="button" className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// //                         <h1 className="ap-player-topbar__title">
// //                             <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// //                         </h1>
// //                     </div>
// //                     <div className="ap-player-topbar__right">
// //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button type="button" className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
// //                         {isGloballyLocked && <button type="button" className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
                        
// //                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && (
// //                             <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}>
// //                                 <Timer size={14} /> {formatTime(timeLeft)}
// //                             </div>
// //                         )}

// //                         {/* 🚀 EXTRA TIME TOOLBAR BADGE FOR LEARNER */}
// //                         {submission?.extraTimeGranted > 0 && (
// //                             <div className="ap-timer ap-hide-mobile" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
// //                                 <Timer size={14} /> +{submission.extraTimeGranted}m Extra
// //                             </div>
// //                         )}

// //                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
// //                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// //                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// //                     </div>
// //                 </div>

// //                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// //                         <button type="button" className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
// //                         <div className="ap-sidebar__meta-block">
// //                             <div className="ap-sidebar__meta-title">
// //                                 <MathRenderedContent html={assessment?.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// //                             </div>
// //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment?.moduleInfo?.moduleNumber || '—'}</div>
// //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment?.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// //                         </div>

// //                         {/* 🚀 SIDEBAR EXTRA TIME BADGE */}
// //                         {assessment?.moduleInfo?.timeLimit > 0 && submission?.extraTimeGranted > 0 && (
// //                             <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
// //                                     <Timer size={12} style={{ marginRight: '6px' }} />
// //                                     +{submission.extraTimeGranted} Extra Minutes Granted
// //                                 </span>
// //                             </div>
// //                         )}

// //                         {!isWorkplaceModule && isFacDone && (
// //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// //                                 <div className="ap-score-card__stripe" aria-hidden="true" />
// //                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
// //                                 <div className="ap-score-card__body">
// //                                     <div className="ap-score-card__ring-wrap">
// //                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
// //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
// //                                     </div>
// //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// //                                     <div className="ap-score-card__fraction">
// //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// //                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
// //                                     </div>
// //                                 </div>
// //                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
// //                             </div>
// //                         )}

// //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// //                             <>
// //                                 <div className="ap-sidebar__label">Status Tracking</div>
// //                                 <div className="ap-sidebar__status-box">
// //                                     {isAssDone && outcome ? (
// //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment?.totalMarks} marks · {outcome.percentage}%</div>}
// //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="ap-sidebar__awaiting">
// //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// //                                         </div>
// //                                     )}
// //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// //                                     <div className="ap-sidebar__timeline-item">
// //                                         <div className={`ap-sidebar__timeline-icon${isFacDone ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// //                                             <UserCheck size={13} />
// //                                         </div>
// //                                         <div className="ap-sidebar__timeline-content">
// //                                             <span className="ap-sidebar__timeline-title">
// //                                                 {savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}
// //                                             </span>
// //                                             <span className="ap-sidebar__timeline-desc">
// //                                                 {isFacDone
// //                                                     ? `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt)}`
// //                                                     : isViolation
// //                                                         ? 'Pending Facilitator Review (Violation Flagged)'
// //                                                         : isMissed
// //                                                             ? 'Pending Staff Review (Missed)'
// //                                                             : savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator'}
// //                                             </span>
// //                                         </div>
// //                                     </div>

// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>

// //                                     {(facilitatorProfile?.bookingUrl || assessorProfile?.bookingUrl) && (
// //                                         <div className="ap-sidebar__booking-card" style={{ marginTop: '1.5rem', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 'bold' }}>
// //                                                 <Calendar size={14} color="#3b82f6" /> Schedule a Check-in
// //                                             </div>
// //                                             <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
// //                                                 Need help understanding your feedback or planning your next steps? Book a 1-on-1 session.
// //                                             </p>
// //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                                 {facilitatorProfile?.bookingUrl && (
// //                                                     <a href={facilitatorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// //                                                         Book with Facilitator
// //                                                     </a>
// //                                                 )}
// //                                                 {assessorProfile?.bookingUrl && !facilitatorProfile?.bookingUrl && (
// //                                                     <a href={assessorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// //                                                         Book with Assessor
// //                                                     </a>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </>
// //                         )}

// //                         <div className="ap-sidebar__label">Workbook Contents</div>
// //                         <div className="ap-sidebar__nav">
// //                             {navItems.map((item: any) =>
// //                                 item.type === 'section'
// //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// //                             )}
// //                         </div>
// //                     </nav>

// //                     <div className="ap-player-content print-pane">
// //                         <div className="ap-blocks">

// //                             {/* 🚀 LEARNER NOTICE: EXTRA TIME GRANTED BANNER */}
// //                             {submission?.extraTimeGranted > 0 && (
// //                                 <div style={{
// //                                     background: '#e0f2fe',
// //                                     border: '1px solid #bae6fd',
// //                                     padding: '12px 16px',
// //                                     borderRadius: '8px',
// //                                     marginBottom: '1rem',
// //                                     display: 'flex',
// //                                     alignItems: 'center',
// //                                     gap: '12px'
// //                                 }}>
// //                                     <Timer size={22} color="#0284c7" style={{ flexShrink: 0 }} />
// //                                     <div>
// //                                         <strong style={{ fontSize: '0.9rem', color: '#0369a1', display: 'block', marginBottom: '2px' }}>
// //                                             Extra Time Granted
// //                                         </strong>
// //                                         <span style={{ fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.4 }}>
// //                                             An additional <strong>{submission.extraTimeGranted} minutes</strong> have been added to your assessment timer. You may proceed with your work.
// //                                         </span>
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             {/* 🚀 SECURITY VIOLATION BANNER FOR LEARNERS */}
// //                             {submission?.status === 'violation' && (
// //                                 <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', margin: '1rem' }}>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// //                                         <div className="lfm-fg" style={{ flex: 1, minWidth: '300px' }}>
// //                                             <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)', marginBottom: '0.5rem' }}>
// //                                                 <ShieldAlert size={18} /> Security Violation Detected
// //                                             </div>
// //                                             <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
// //                                                 This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured and logged. Your invigilator has been notified.
// //                                             </p>
// //                                             {submission?.systemNote && (
// //                                                 <div className="lfm-flags-panel" style={{ background: '#ffffff', borderColor: '#fecaca', borderLeftColor: 'var(--mlab-red)' }}>
// //                                                     <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</span>
// //                                                     <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
// //                                                         "{submission.systemNote}"
// //                                                     </p>
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             {assessment?.blocks?.map((block: any) => {

// //                                 if (block.type === 'section') {
// //                                     const totals = sectionTotals[block.id];
// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// //                                             <span>{block.title}</span>
// //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// //                                             {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" />}
// //                                             {renderBlockImage(block)}
// //                                             {renderBlockFile(block)}
// //                                         </div>
// //                                     );
// //                                 }

// //                                 if (block.type === 'info') return (
// //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// //                                         <div className="ap-block-info__label"><Info size={13} /> {block.title || 'Reading Material'}</div>
// //                                         <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
// //                                         {renderBlockImage(block)}
// //                                         {renderBlockFile(block)}
// //                                     </div>
// //                                 );

// //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// //                                     qNum++;
// //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// //                                     const learnerAns = answers[block.id];
// //                                     let inkColor = '#64748b';
// //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

// //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

// //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'graph' ? 'ap-block-type-chip--graph' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : block.type === 'graph' ? 'PLOT' : `Q${qNum}.`;

// //                                     const isSectionVerified = isBlockVerified(block.id);
// //                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

// //                                     return (
// //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// //                                             <div className="ap-block-question__header">
// //                                                 <div className="ap-block-question__text-wrap">
// //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// //                                                         {block.type === 'qcto_workplace' ? (
// //                                                             <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} />
// //                                                         ) : block.type === 'code_sandbox' ? (
// //                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// //                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
// //                                                                 {block.question && <MathRenderedContent html={block.question} style={{ color: '#334155' }} />}
// //                                                             </div>
// //                                                         ) : block.question ? (
// //                                                             <MathRenderedContent html={block.question} />
// //                                                         ) : block.title ? (
// //                                                             <MathRenderedContent html={block.title} />
// //                                                         ) : null}
// //                                                     </span>
// //                                                     <div className="ap-grade-indicators">
// //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// //                                                     </div>
// //                                                 </div>
// //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// //                                             </div>

// //                                             <div className="ap-block-question__body">
// //                                                 {renderBlockImage(block)}
// //                                                 {renderBlockFile(block)}

// //                                                 {/* MCQ */}
// //                                                 {block.type === 'mcq' && (
// //                                                     <div className="ap-mcq-options">
// //                                                         {block.options?.map((opt: string, i: number) => {
// //                                                             const selected = learnerAns === i;
// //                                                             return (
// //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// //                                                                 </label>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* TEXT */}
// //                                                 {block.type === 'text' && (
// //                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// //                                                         ) : (
// //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// //                                                         )}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* CARTESIAN ENGINE GRAPH BLOCK */}
// //                                                 {block.type === 'graph' && (
// //                                                     <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// //                                                         <AxisWorkspace
// //                                                             value={learnerAns || { points: [], shapes: [] }}
// //                                                             onChange={(val) => handleAnswerChange(block.id, val)}
// //                                                             readOnly={isUploadLocked || !canEditTask}
// //                                                         />
// //                                                     </div>
// //                                                 )}

// //                                                 {/* MATHPAD WITH TABS */}
// //                                                 {block.type === 'mathpad' && (() => {
// //                                                     const itemAns = typeof learnerAns === 'string'
// //                                                         ? { equation: learnerAns }
// //                                                         : (learnerAns || {});

// //                                                     const mathTabs = [
// //                                                         { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', allowed: true, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
// //                                                         { id: 'graph', icon: <LineChart size={13} />, label: 'Graphing Calculator', allowed: block.allowGraphing !== false, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } },
// //                                                         { id: 'draw', icon: <Pencil size={13} />, label: 'Whiteboard Canvas', allowed: block.allowDrawing !== false, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } }
// //                                                     ].filter(t => t.allowed);

// //                                                     const activeTabId = activeTabs[block.id] || mathTabs[0]?.id;

// //                                                     return (
// //                                                         <div className="ap-evidence-container">
// //                                                             {mathTabs.length > 1 && (
// //                                                                 <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// //                                                                     {mathTabs.map(t => {
// //                                                                         const isActive = activeTabId === t.id;
// //                                                                         const isDone = ((t.id === 'equation' && itemAns.equation) || (t.id === 'graph' && itemAns.graphState?.points?.length > 0) || (t.id === 'draw' && itemAns.drawingUrl));
// //                                                                         return (
// //                                                                             <button
// //                                                                                 key={t.id}
// //                                                                                 type="button"
// //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// //                                                                                 style={{
// //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// //                                                                                     transition: 'all 0.2s ease',
// //                                                                                     opacity: isActive ? 1 : 0.7,
// //                                                                                     whiteSpace: 'nowrap'
// //                                                                                 }}
// //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// //                                                                             >
// //                                                                                 {t.icon} {t.label} {isDone && <CheckCircle size={12} />}
// //                                                                             </button>
// //                                                                         );
// //                                                                     })}
// //                                                                 </div>
// //                                                             )}
// //                                                             <div className="ap-tab-panel">
// //                                                                 {activeTabId === 'equation' && (
// //                                                                     <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                         <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: mathTabs.length > 1 ? '6px 6px 0 0' : '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
// //                                                                             <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
// //                                                                         </div>
// //                                                                         <MathpadEditor
// //                                                                             value={itemAns.equation || ''}
// //                                                                             onChange={(val) => handleAnswerChange(block.id, { ...itemAns, equation: val })}
// //                                                                             readOnly={isUploadLocked || !canEditTask}
// //                                                                         />
// //                                                                     </div>
// //                                                                 )}
// //                                                                 {activeTabId === 'graph' && (
// //                                                                     <AxisWorkspace
// //                                                                         value={itemAns.graphState}
// //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, graphState: val })}
// //                                                                         readOnly={isUploadLocked || !canEditTask}
// //                                                                     />
// //                                                                 )}
// //                                                                 {activeTabId === 'draw' && (
// //                                                                     <DrawingWorkspace
// //                                                                         value={itemAns.drawingUrl}
// //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, drawingUrl: val })}
// //                                                                         readOnly={isUploadLocked || !canEditTask}
// //                                                                         blockId={block.id}
// //                                                                         submissionId={submission.id}
// //                                                                         toast={toast}
// //                                                                         setSaving={setSaving}
// //                                                                     />
// //                                                                 )}
// //                                                             </div>
// //                                                         </div>
// //                                                     );
// //                                                 })()}

// //                                                 {/* TASK WITH OPTIONAL IDE */}
// //                                                 {block.type === 'task' && (() => {
// //                                                     const itemAns = learnerAns || {};

// //                                                     const taskTabs = [
// //                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// //                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio === true, val: itemAns.audioUrl, theme: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', activeBg: '#f3e8ff' } },
// //                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// //                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// //                                                         { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// //                                                     ].filter(t => t.allowed);

// //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// //                                                     const progress = uploadProgress[block.id];

// //                                                     const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// //                                                     const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// //                                                     return (
// //                                                         <div className="ap-evidence-container">
// //                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
// //                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}

// //                                                             {taskTabs.length > 1 && (
// //                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// //                                                                     {taskTabs.map(t => {
// //                                                                         const isActive = activeTabId === t.id;
// //                                                                         return (
// //                                                                             <button
// //                                                                                 key={t.id}
// //                                                                                 type="button"
// //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// //                                                                                 style={{
// //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// //                                                                                     transition: 'all 0.2s ease',
// //                                                                                     opacity: isActive ? 1 : 0.7
// //                                                                                 }}
// //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// //                                                                             >
// //                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// //                                                                             </button>
// //                                                                         );
// //                                                                     })}
// //                                                                 </div>
// //                                                             )}

// //                                                             <div className="ap-tab-panel">
// //                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your answer here…'} />}</div>}
// //                                                                 {activeTabId === 'audio' && (itemAns.audioUrl ? <audio controls src={itemAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// //                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
// //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}

// //                                                                 {/* 🚀 LIVE IDE SANDBOX ON TASK BLOCK */}
// //                                                                 {activeTabId === 'code' && (
// //                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// //                                                                         <CodeSandboxPlayer
// //                                                                             block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
// //                                                                             learnerAns={mappedCodeData}
// //                                                                             readOnly={isUploadLocked || !canEditTask}
// //                                                                             onChange={async (val) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// //                                                                         />
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         </div>
// //                                                     );
// //                                                 })()}

// //                                                 {/* CHECKLIST */}
// //                                                 {block.type === 'checklist' && (
// //                                                     <div className="ap-checklist">
// //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
// //                                                         {block.criteria?.map((crit: string, i: number) => {
// //                                                             const res = criteriaResults?.[i] || {};

// //                                                             const nestedKey = `evidence_${i}`;
// //                                                             const itemAns = learnerAns?.[nestedKey] || {};

// //                                                             const evidenceTabs = [
// //                                                                 { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// //                                                                 { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// //                                                                 { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// //                                                                 { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// //                                                             ].filter(t => t.allowed);

// //                                                             const tabStateKey = `${block.id}_${nestedKey}`;
// //                                                             const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// //                                                             const progress = uploadProgress[`${block.id}_${nestedKey}`];

// //                                                             const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// //                                                             const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// //                                                             return (
// //                                                                 <div key={i} className="ap-checklist__item">
// //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>

// //                                                                     {block.requireEvidencePerCriterion !== false && (
// //                                                                         <div className="ap-evidence-container" style={{ marginTop: '10px', marginBottom: '15px' }}>
// //                                                                             {evidenceTabs.length > 1 && (
// //                                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// //                                                                                     {evidenceTabs.map(t => {
// //                                                                                         const isActive = activeTabId === t.id;
// //                                                                                         return (
// //                                                                                             <button
// //                                                                                                 key={t.id}
// //                                                                                                 type="button"
// //                                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// //                                                                                                 style={{
// //                                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// //                                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// //                                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// //                                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// //                                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// //                                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// //                                                                                                     transition: 'all 0.2s ease',
// //                                                                                                     opacity: isActive ? 1 : 0.7
// //                                                                                                 }}
// //                                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// //                                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// //                                                                                             >
// //                                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// //                                                                                             </button>
// //                                                                                         );
// //                                                                                     })}
// //                                                                                 </div>
// //                                                                             )}

// //                                                                             <div className="ap-tab-panel">
// //                                                                                 {activeTabId === 'text' && (
// //                                                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// //                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// //                                                                                         ) : (
// //                                                                                             <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// //                                                                                         )}
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                                 {activeTabId === 'url' && (
// //                                                                                     <div>
// //                                                                                         {itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                                 {activeTabId === 'upload' && (
// //                                                                                     progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : (
// //                                                                                         <div className="ap-upload-empty">
// //                                                                                             {isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// //                                                                                                 <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// //                                                                                                 <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} />
// //                                                                                             </>}
// //                                                                                         </div>
// //                                                                                     )
// //                                                                                 )}

// //                                                                                 {activeTabId === 'code' && (
// //                                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// //                                                                                         <CodeSandboxPlayer
// //                                                                                             block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${crit}`, template: 'vanilla' }}
// //                                                                                             learnerAns={mappedCodeData}
// //                                                                                             readOnly={isUploadLocked || !canEditWorkplace}
// //                                                                                             onChange={async (val) => {
// //                                                                                                 const updatedAns = { ...answers[block.id] };
// //                                                                                                 const prevNested = updatedAns[nestedKey] || {};
// //                                                                                                 updatedAns[nestedKey] = { ...prevNested, codeData: val };
// //                                                                                                 handleAnswerChange(block.id, updatedAns);
// //                                                                                             }}
// //                                                                                         />
// //                                                                                     </div>
// //                                                                                 )}
// //                                                                             </div>
// //                                                                         </div>
// //                                                                     )}

// //                                                                     <div className="ap-checklist__assessor-row">
// //                                                                         {res.status ? (
// //                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
// //                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
// //                                                                             </div>
// //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// //                                                                     </div>
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* LOGBOOK */}
// //                                                 {block.type === 'logbook' && (
// //                                                     <div className="ap-logbook">
// //                                                         <MathRenderedContent html={block.content} className="ap-logbook__desc" />
// //                                                         <table className="ap-logbook__table">
// //                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
// //                                                             <tbody>
// //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// //                                                                     <tr key={i} className="ap-logbook__tbody">
// //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// //                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button type="button" className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// //                                                                     </tr>
// //                                                                 ))}
// //                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button type="button" className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// //                                                             </tbody>
// //                                                         </table>
// //                                                     </div>
// //                                                 )}

// //                                                 {/* QCTO WORKPLACE WITH FULL EVIDENCE SUPPORT & LIVE IDE */}
// //                                                 {block.type === 'qcto_workplace' && (
// //                                                     <div className="ap-workplace">
// //                                                         <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
// //                                                         {block.workActivities?.map((wa: any) => {
// //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// //                                                             return (
// //                                                                 <div key={wa.id} className="ap-workplace__activity">
// //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

// //                                                                     {wa.evidenceItems?.map((se: any) => {
// //                                                                         const nestedKey = `se_${se.id}`;
// //                                                                         const itemAns = learnerAns?.[nestedKey] || {};

// //                                                                         const evidenceTabs = [
// //                                                                             { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: true, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// //                                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: true, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// //                                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: true, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// //                                                                             { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: true, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// //                                                                         ];

// //                                                                         const tabStateKey = `${block.id}_${nestedKey}`;
// //                                                                         const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// //                                                                         const progress = uploadProgress[`${block.id}_${nestedKey}`];

// //                                                                         const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// //                                                                         const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// //                                                                         return (
// //                                                                             <div key={se.id} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
// //                                                                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>{se.code}: {se.description}</div>
// //                                                                                 <div className="ap-evidence-container">
// //                                                                                     {evidenceTabs.length > 1 && (
// //                                                                                         <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// //                                                                                             {evidenceTabs.map(t => {
// //                                                                                                 const isActive = activeTabId === t.id;
// //                                                                                                 return (
// //                                                                                                     <button
// //                                                                                                         key={t.id}
// //                                                                                                         type="button"
// //                                                                                                         onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// //                                                                                                         style={{
// //                                                                                                             display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// //                                                                                                             background: isActive ? t.theme.activeBg : t.theme.bg,
// //                                                                                                             padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// //                                                                                                             border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// //                                                                                                             cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// //                                                                                                             boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// //                                                                                                             transition: 'all 0.2s ease',
// //                                                                                                             opacity: isActive ? 1 : 0.7
// //                                                                                                         }}
// //                                                                                                         onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// //                                                                                                         onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// //                                                                                                     >
// //                                                                                                         {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// //                                                                                                     </button>
// //                                                                                                 );
// //                                                                                             })}
// //                                                                                         </div>
// //                                                                                     )}

// //                                                                                     <div className="ap-tab-panel">
// //                                                                                         {activeTabId === 'text' && (
// //                                                                                             <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// //                                                                                                 {isGloballyLocked && !isAwaitingSignoff ? (
// //                                                                                                     <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// //                                                                                                 ) : (
// //                                                                                                     <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// //                                                                                                 )}
// //                                                                                             </div>
// //                                                                                         )}
// //                                                                                         {activeTabId === 'url' && (
// //                                                                                             <div>
// //                                                                                                 {itemAns.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}
// //                                                                                             </div>
// //                                                                                         )}
// //                                                                                         {activeTabId === 'upload' && (
// //                                                                                             progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : (
// //                                                                                                 <div className="ap-upload-empty">
// //                                                                                                     {isUploadLocked || !canEditWorkplace ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// //                                                                                                         <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// //                                                                                                         <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditWorkplace} style={{ fontSize: '0.82rem' }} />
// //                                                                                                     </>}
// //                                                                                                 </div>
// //                                                                                             )
// //                                                                                         )}

// //                                                                                         {activeTabId === 'code' && (
// //                                                                                             <div style={{ height: '600px', marginTop: '10px' }}>
// //                                                                                                 <CodeSandboxPlayer
// //                                                                                                     block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${se.code}`, template: 'vanilla' }}
// //                                                                                                     learnerAns={mappedCodeData}
// //                                                                                                     readOnly={isUploadLocked || !canEditWorkplace}
// //                                                                                                     onChange={async (val) => {
// //                                                                                                         const updatedAns = { ...answers[block.id] };
// //                                                                                                         const prevNested = updatedAns[nestedKey] || {};
// //                                                                                                         updatedAns[nestedKey] = { ...prevNested, codeData: val };
// //                                                                                                         handleAnswerChange(block.id, updatedAns);
// //                                                                                                     }}
// //                                                                                                 />
// //                                                                                             </div>
// //                                                                                         )}
// //                                                                                     </div>
// //                                                                                 </div>
// //                                                                             </div>
// //                                                                         );
// //                                                                     })}

// //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// //                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// //                                                                     </label>
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 {/* 🚀 STANDALONE CODE SANDBOX BLOCK */}
// //                                                 {block.type === 'code_sandbox' && (
// //                                                     isFetchingSnapshots ? (
// //                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
// //                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
// //                                                             <p>Loading code environment...</p>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <CodeSandboxPlayer
// //                                                             block={block}
// //                                                             learnerAns={{
// //                                                                 ...(learnerAns || {}),
// //                                                                 snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot || learnerAns?.codeData?.snapshot
// //                                                             }}
// //                                                             readOnly={isUploadLocked || !canEditCode}
// //                                                             onChange={async (val: any) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// //                                                         />
// //                                                     )
// //                                                 )}

// //                                                 {/* Per-question feedback */}
// //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// //                                             </div>
// //                                         </div>
// //                                     );
// //                                 }
// //                                 return null;
// //                             })}
// //                         </div>

// //                         {/* FOOTER */}
// //                         {isAwaitingSignoff ? (
// //                             <div className="ap-footer ap-footer--signoff no-print">
// //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <button type="button" className="ap-btn ap-btn--amber" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Acknowledge &amp; Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : !isGloballyLocked ? (
// //                             <div className="ap-footer no-print">
// //                                 <h3 className="ap-footer__title">Final Submission</h3>
// //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// //                                 </label>
// //                                 <div className="ap-footer-actions">
// //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
// //                                     <button type="button" className="ap-btn ap-btn--green" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Submit for Grading</button>
// //                                 </div>
// //                             </div>
// //                         ) : (
// //                             <div className="ap-footer ap-footer--locked no-print">
// //                                 <div className="ap-footer--locked__icon-wrap">
// //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// //                                 </div>
// //                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// //                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
// //                                 <button type="button" className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>
// //             </div>
// //         </ProctoringWrapper>
// //     );
// // };

// // export default AssessmentPlayerContent;


// // // // src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

// // // import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
// // // import {
// // //     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
// // //     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
// // //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// // //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// // //     Menu, FileArchive, Loader2, Sigma, Calendar, LineChart, Pencil, Undo, Eraser, ShieldAlert,
// // //     Maximize, ZoomIn, ZoomOut
// // // } from 'lucide-react';
// // // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // // import ReactQuill from 'react-quill-new';
// // // import 'react-quill-new/dist/quill.snow.css';
// // // import './AssessmentPlayer.css';
// // // import { createPortal } from 'react-dom';
// // // import { UploadProgress } from '../../../components/common/UploadProgress';
// // // import { UrlPreview } from '../../../components/common/UrlPreview';
// // // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // // import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
// // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, getBytes } from 'firebase/storage';

// // // import katex from "katex";
// // // import "katex/dist/katex.min.css";
// // // import "mathlive";
// // // import { Tldraw } from 'tldraw';
// // // import 'tldraw/tldraw.css';
// // // import AxisWorkspace from '../../../components/common/AxisWorkspace/AxisWorkspace';

// // // (window as any).katex = katex;

// // // // 🚀 BULLETPROOF PORTAL TARGET RESOLVER FOR FULLSCREEN MODE
// // // const getPortalTarget = (): HTMLElement => {
// // //     const proctorRoot = document.getElementById('proctor-portal-root');
// // //     if (proctorRoot) return proctorRoot;
// // //     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
// // //     return document.body;
// // // };

// // // const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// // // const extractPlainText = (htmlString?: string) => {
// // //     if (!htmlString) return '';
// // //     const tmp = document.createElement("DIV");
// // //     tmp.innerHTML = htmlString;
// // //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // // };
// // // const getSafeDate = (ds: string) => {
// // //     if (!ds) return 'recently';
// // //     const d = new Date(ds);
// // //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// // // };
// // // const formatTime = (s: number) => {
// // //     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
// // //     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// // // };

// // // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
// // // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'formula'];

// // // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// // //     const radius = (size - strokeWidth) / 2;
// // //     const circumference = 2 * Math.PI * radius;
// // //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
// // //     return (
// // //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
// // //         </svg>
// // //     );
// // // };

// // // /* ─── INLINE FULLSCREEN-COMPATIBLE MODALS ─── */
// // // const SubmissionConfirmModal: React.FC<{
// // //     isAwaitingSignoff: boolean;
// // //     onConfirm: () => void;
// // //     onCancel: () => void;
// // // }> = ({ isAwaitingSignoff, onConfirm, onCancel }) => {
// // //     return createPortal(
// // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '500px', background: 'white', borderTop: '5px solid var(--mlab-green)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
// // //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc' }}>
// // //                     <ShieldCheck size={22} color="var(--mlab-green)" />
// // //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#0f172a' }}>
// // //                         {isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment for Grading?"}
// // //                     </h2>
// // //                 </div>
// // //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// // //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// // //                         {isAwaitingSignoff
// // //                             ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
// // //                             : "You are about to submit this workbook for final grading. You will NOT be able to change or edit your answers after submitting."}
// // //                     </p>
// // //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// // //                         <button
// // //                             type="button"
// // //                             onClick={onCancel}
// // //                             className="ap-btn ap-btn--outline"
// // //                             style={{ padding: '10px 18px', borderRadius: '4px', cursor: 'pointer' }}
// // //                         >
// // //                             Go Back
// // //                         </button>
// // //                         <button
// // //                             type="button"
// // //                             onClick={onConfirm}
// // //                             className="ap-btn ap-btn--green"
// // //                             style={{ padding: '10px 20px', borderRadius: '4px', background: 'var(--mlab-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
// // //                         >
// // //                             {isAwaitingSignoff ? "Acknowledge & Submit" : "Yes, Submit for Grading"}
// // //                         </button>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         getPortalTarget()
// // //     );
// // // };

// // // const LeaveWarningModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
// // //     return createPortal(
// // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '480px', background: 'white', borderTop: '5px solid #f59e0b' }}>
// // //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb' }}>
// // //                     <AlertTriangle size={22} color="#f59e0b" />
// // //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#92400e' }}>Leave Timed Assessment?</h2>
// // //                 </div>
// // //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// // //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// // //                         Your timer will <strong>NOT</strong> pause. If you leave, the clock will continue counting down in the background.
// // //                     </p>
// // //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// // //                         <button type="button" onClick={onCancel} className="ap-btn ap-btn--outline" style={{ padding: '10px 18px', cursor: 'pointer' }}>Stay Here</button>
// // //                         <button type="button" onClick={onConfirm} className="ap-btn" style={{ padding: '10px 18px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Leave</button>
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         getPortalTarget()
// // //     );
// // // };

// // // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// // //     const [reason, setReason] = useState('');
// // //     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
// // //     return createPortal(
// // //         <div className="ap-modal" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// // //                 <div className="ap-modal-header ap-modal-header--danger">
// // //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// // //                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
// // //                 </div>
// // //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// // //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// // //                     <div className="ap-form-group">
// // //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// // //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// // //                     </div>
// // //                     <div className="ap-modal-footer">
// // //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// // //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>,
// // //         getPortalTarget()
// // //     );
// // // };

// // // // 🚀 ENCAPSULATED FULLSCREEN IMAGE VIEWER WITH ZOOM & PAN
// // // const FullscreenImageModal: React.FC<{ url: string; caption?: string; onClose: () => void }> = ({ url, caption, onClose }) => {
// // //     const [scale, setScale] = useState(1);
// // //     const [position, setPosition] = useState({ x: 0, y: 0 });
// // //     const [isDragging, setIsDragging] = useState(false);
// // //     const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

// // //     const handleWheel = (e: React.WheelEvent) => {
// // //         e.stopPropagation();
// // //         setScale(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.005, 5)));
// // //     };

// // //     const handleMouseDown = (e: React.MouseEvent) => {
// // //         e.stopPropagation();
// // //         setIsDragging(true);
// // //         setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
// // //     };

// // //     const handleMouseMove = (e: React.MouseEvent) => {
// // //         if (!isDragging) return;
// // //         e.stopPropagation();
// // //         setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
// // //     };

// // //     const handleMouseUp = (e: React.MouseEvent) => {
// // //         e.stopPropagation();
// // //         setIsDragging(false);
// // //     };

// // //     const zoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
// // //     const zoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.max(p - 0.5, 0.5)); };
// // //     const resetZoom = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

// // //     const btnStyle = {
// // //         background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '10px',
// // //         borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center',
// // //         justifyContent: 'center', transition: 'background 0.2s', backdropFilter: 'blur(4px)'
// // //     };

// // //     return createPortal(
// // //         <div
// // //             style={{
// // //                 position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.95)',
// // //                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
// // //                 backdropFilter: 'blur(8px)', overflow: 'hidden', pointerEvents: 'auto'
// // //             }}
// // //             onWheel={handleWheel}
// // //             onMouseMove={handleMouseMove}
// // //             onMouseUp={handleMouseUp}
// // //             onMouseLeave={handleMouseUp}
// // //             onClick={onClose}
// // //         >
// // //             <div
// // //                 style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}
// // //                 onClick={e => e.stopPropagation()}
// // //                 onMouseDown={e => e.stopPropagation()}
// // //             >
// // //                 <button onClick={zoomOut} style={btnStyle} title="Zoom Out" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomOut size={20} /></button>
// // //                 <button onClick={resetZoom} style={btnStyle} title="Reset Zoom" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><Maximize size={20} /></button>
// // //                 <button onClick={zoomIn} style={btnStyle} title="Zoom In" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomIn size={20} /></button>
// // //                 <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
// // //                 <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.8)' }} title="Close" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}><X size={20} /></button>
// // //             </div>

// // //             <div
// // //                 style={{
// // //                     transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
// // //                     transition: isDragging ? 'none' : 'transform 0.1s ease-out',
// // //                     cursor: isDragging ? 'grabbing' : 'grab',
// // //                     display: 'flex', flexDirection: 'column', alignItems: 'center'
// // //                 }}
// // //                 onMouseDown={handleMouseDown}
// // //                 onClick={e => e.stopPropagation()}
// // //             >
// // //                 <img
// // //                     src={url}
// // //                     alt={caption || "Expanded view"}
// // //                     crossOrigin="anonymous"
// // //                     draggable={false}
// // //                     style={{
// // //                         maxWidth: '90vw',
// // //                         maxHeight: '80vh',
// // //                         objectFit: 'contain',
// // //                         borderRadius: '8px',
// // //                         boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
// // //                         pointerEvents: 'none'
// // //                     }}
// // //                 />
// // //                 {caption && (
// // //                     <p style={{ color: 'white', marginTop: '15px', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px', pointerEvents: 'none' }}>
// // //                         {caption}
// // //                     </p>
// // //                 )}
// // //             </div>
// // //             <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '20px' }}>
// // //                 Scroll to zoom • Click and drag to pan
// // //             </div>
// // //         </div>,
// // //         getPortalTarget()
// // //     );
// // // };

// // // const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
// // //     const containerRef = useRef<HTMLDivElement>(null);
// // //     const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

// // //     useEffect(() => {
// // //         if (!containerRef.current || !html) return;
// // //         // @ts-ignore
// // //         import('katex/dist/contrib/auto-render.mjs').then((module) => {
// // //             if (containerRef.current) {
// // //                 module.default(containerRef.current, {
// // //                     delimiters: [
// // //                         { left: '$$', right: '$$', display: true },
// // //                         { left: '$', right: '$', display: false },
// // //                         { left: '\\(', right: '\\)', display: false },
// // //                         { left: '\\[', right: '\\]', display: true }
// // //                     ],
// // //                     throwOnError: false
// // //                 });
// // //             }
// // //         }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
// // //     }, [html]);

// // //     return (
// // //         <div style={{ display: 'inline-block', width: style?.width }}>
// // //             {style?.color && <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>}
// // //             <div ref={containerRef} className={`quill-read-only-content ${uniqueClass} ${className || ''}`} style={{ lineHeight: 1.6, ...style }} dangerouslySetInnerHTML={{ __html: cleanRichText(html) }} />
// // //         </div>
// // //     );
// // // };

// // // const LearnerFilePreview: React.FC<{ url: string; onRemove?: () => void; disabled?: boolean }> = ({ url, onRemove, disabled }) => {
// // //     if (!url) return null;

// // //     const cleanUrl = url.split('?')[0];
// // //     const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded_Evidence');
// // //     const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

// // //     const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
// // //     const isPdf = ext === 'pdf';
// // //     const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

// // //     if (isImage) {
// // //         return (
// // //             <div style={{ position: 'relative', marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // //                 <img src={url} alt="Learner evidence preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '4px', display: 'block', margin: '0 auto' }} />
// // //                 {onRemove && !disabled && (
// // //                     <button type="button" onClick={onRemove} style={{ marginTop: '8px', padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                         <Trash2 size={13} /> Remove File
// // //                     </button>
// // //                 )}
// // //             </div>
// // //         );
// // //     }

// // //     if (isPdf) {
// // //         return (
// // //             <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
// // //                 <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
// // //                         <FileText size={18} color="#0284c7" />
// // //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // //                             {fileName}
// // //                         </span>
// // //                     </div>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                         <a href={url} target="_blank" rel="noopener noreferrer" download style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '6px 12px', background: '#0284c7', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
// // //                             <UploadCloud size={13} style={{ transform: 'rotate(180deg)' }} /> Open PDF
// // //                         </a>
// // //                         {onRemove && !disabled && (
// // //                             <button type="button" onClick={onRemove} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
// // //                                 <Trash2 size={13} />
// // //                             </button>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //                 <div style={{ height: '420px', width: '100%' }}>
// // //                     <object data={url} type="application/pdf" width="100%" height="100%">
// // //                         <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#475569' }}>
// // //                             Your browser does not support inline PDF viewing. <a href={url} target="_blank" rel="noreferrer">Click here to download PDF</a>
// // //                         </p>
// // //                     </object>
// // //                 </div>
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '16px' }}>
// // //             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
// // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
// // //                     <div style={{ background: isSpreadsheet ? '#dcfce7' : '#e0f2fe', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                         <FileText size={24} color={isSpreadsheet ? '#15803d' : '#0369a1'} />
// // //                     </div>
// // //                     <div style={{ overflow: 'hidden' }}>
// // //                         <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // //                             {fileName}
// // //                         </span>
// // //                         <span style={{ fontSize: '0.75rem', color: isSpreadsheet ? '#166534' : '#0284c7', fontWeight: 'bold' }}>
// // //                             {isSpreadsheet ? 'Excel / CSV Spreadsheet Evidence' : 'Uploaded Document Evidence'}
// // //                         </span>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                     <a
// // //                         href={url}
// // //                         target="_blank"
// // //                         rel="noopener noreferrer"
// // //                         download
// // //                         style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: isSpreadsheet ? '#166534' : '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // //                     >
// // //                         <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// // //                     </a>
// // //                     {onRemove && !disabled && (
// // //                         <button
// // //                             type="button"
// // //                             onClick={onRemove}
// // //                             style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
// // //                         >
// // //                             <Trash2 size={14} /> Remove
// // //                         </button>
// // //                     )}
// // //                 </div>
// // //             </div>

// // //             <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                 <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
// // //                 <span>Spreadsheets and binary files are downloaded directly to your device for viewing in Microsoft Excel or Google Sheets.</span>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
// // //     const mfRef = useRef<any>(null);
// // //     const lastBroadcastRef = useRef('');

// // //     const cleanValue = useMemo(() => {
// // //         let v = value || '';
// // //         if (v.includes('<p>') || v.includes('&nbsp;')) v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
// // //         return v;
// // //     }, [value]);

// // //     useEffect(() => {
// // //         const mf = mfRef.current;
// // //         if (!mf) return;
// // //         if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) mf.value = cleanValue;
// // //         mf.readOnly = readOnly;
// // //     }, [cleanValue, readOnly]);

// // //     useEffect(() => {
// // //         const mf = mfRef.current;
// // //         if (!mf) return;
// // //         const handleInput = () => { lastBroadcastRef.current = mf.value; onChange(mf.value); };
// // //         mf.addEventListener('input', handleInput);
// // //         return () => mf.removeEventListener('input', handleInput);
// // //     }, [onChange]);

// // //     useEffect(() => {
// // //         const mf = mfRef.current;
// // //         if (!mf) return;
// // //         const triggerNewline = () => {
// // //             const hasMultilineEnv = mf.value.includes('\\begin{aligned}') || mf.value.includes('\\begin{matrix}') || mf.value.includes('\\begin{array}') || mf.value.includes('\\begin{cases}') || mf.value.includes('\\begin{gathered}');
// // //             if (hasMultilineEnv) mf.executeCommand('addRowAfter');
// // //             else {
// // //                 mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
// // //                 mf.executeCommand('moveToMathfieldEnd');
// // //             }
// // //         };
// // //         const handleBeforeInput = (e: any) => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); triggerNewline(); } };
// // //         mf.addEventListener('beforeinput', handleBeforeInput);
// // //         return () => mf.removeEventListener('beforeinput', handleBeforeInput);
// // //     }, [readOnly]);

// // //     return (
// // //         <div style={{ position: 'relative', width: '100%' }}>
// // //             <style>{`
// // //                 math-field::part(container) .ML__matrix,
// // //                 math-field::part(container) .ML__array,
// // //                 math-field::part(container) .ML__aligned,
// // //                 math-field::part(container) .ML__matrix-row {
// // //                     border: none !important;
// // //                     outline: none !important;
// // //                 }
// // //             `}</style>
// // //             {React.createElement('math-field', {
// // //                 ref: mfRef,
// // //                 style: {
// // //                     width: '100%', fontSize: '1.4rem', padding: '12px',
// // //                     border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
// // //                     borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
// // //                     outline: 'none', color: '#0f172a', display: 'block',
// // //                     minHeight: '140px', height: 'auto'
// // //                 }
// // //             })}
// // //         </div>
// // //     );
// // // };

// // // const DrawingWorkspace: React.FC<{ value: string; onChange: (v: string) => void; readOnly: boolean; blockId: string; submissionId: string; toast: any; setSaving: (v: boolean) => void }> = ({ value, onChange, readOnly, blockId, submissionId, toast, setSaving }) => {
// // //     const [editor, setEditor] = useState<any>(null);
// // //     const [isUploading, setIsUploading] = useState(false);

// // //     const handleSave = async () => {
// // //         if (!editor) return;
// // //         const shapeIds = Array.from(editor.getCurrentPageShapeIds());
// // //         if (shapeIds.length === 0) return toast.warning("The workspace is empty!");

// // //         setIsUploading(true);
// // //         setSaving(true);
// // //         toast.info("Saving workspace securely...");

// // //         try {
// // //             const { blob } = await editor.toImage(shapeIds, {
// // //                 format: 'png',
// // //                 background: true,
// // //                 padding: 20
// // //             });

// // //             const storage = getStorage();
// // //             const refPath = `evidence/${submissionId}/${blockId}_workspace_${Date.now()}.png`;
// // //             const storageRef = fbStorageRef(storage, refPath);

// // //             await uploadBytesResumable(storageRef, blob);
// // //             const url = await getDownloadURL(storageRef);

// // //             onChange(url);
// // //             toast.success("Workspace saved securely!");
// // //         } catch (err) {
// // //             console.error(err);
// // //             toast.error("Failed to save workspace. Please try again.");
// // //         } finally {
// // //             setIsUploading(false);
// // //             setSaving(false);
// // //         }
// // //     };

// // //     return (
// // //         <div style={{ position: 'relative' }}>
// // //             {readOnly && value ? (
// // //                 <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // //                     <img src={value} alt="Learner workspace" crossOrigin="anonymous" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white' }} />
// // //                 </div>
// // //             ) : readOnly && !value ? (
// // //                 <div className="ap-upload-empty">No workspace data provided.</div>
// // //             ) : (
// // //                 <>
// // //                     <div style={{ height: '600px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
// // //                         <Tldraw onMount={setEditor} hideUi={false} />
// // //                     </div>
// // //                     <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
// // //                         <div style={{ flex: 1 }} />
// // //                         {value && <span style={{ color: 'var(--mlab-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><CheckCircle size={14} /> Cloud Synced</span>}
// // //                         <button type="button" onClick={handleSave} className="ap-btn ap-btn--primary" disabled={isUploading}>
// // //                             {isUploading ? <><Loader2 className="ap-spin" size={14} /> Saving Workspace...</> : <><Save size={14} /> Submit Workspace Canvas</>}
// // //                         </button>
// // //                     </div>
// // //                 </>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // export interface AssessmentPlayerContentProps {
// // //     user: any;
// // //     assessment: any;
// // //     submission: any;
// // //     answers: Record<string, any>;
// // //     learnerProfile: any;
// // //     learnerEnrollment: any;
// // //     assessorProfile: any;
// // //     moderatorProfile: any;
// // //     facilitatorProfile: any;
// // //     employers: any[];
// // //     staff: any[];
// // //     moduleLogs: any[];
// // //     approvedLogs: any[];
// // //     logsLoading: boolean;
// // //     saving: boolean;
// // //     setSaving: (v: boolean) => void;
// // //     uploadProgress: Record<string, number>;
// // //     setUploadProgress: (fn: (prev: any) => any) => void;
// // //     activeTabs: Record<string, string>;
// // //     setActiveTabs: (tabs: Record<string, string>) => void;
// // //     timeLeft: number | null;
// // //     isGloballyLocked: boolean;
// // //     isAwaitingSignoff: boolean;
// // //     isPracticalModule: boolean;
// // //     isWorkplaceModule: boolean;
// // //     isRemediation: boolean;
// // //     isAppealUpheld: boolean;
// // //     isFacDone: boolean;
// // //     isAssDone: boolean;
// // //     isModDone: boolean;
// // //     isSubmitted: boolean;
// // //     isMissed: boolean;
// // //     showGate: boolean;
// // //     showLeaveWarning: boolean;
// // //     setShowLeaveWarning: (v: boolean) => void;
// // //     showSubmitConfirm: boolean;
// // //     setShowSubmitConfirm: (v: boolean) => void;
// // //     showAppealModal: boolean;
// // //     setShowAppealModal: (v: boolean) => void;
// // //     declarationChecked: boolean;
// // //     setDeclarationChecked: (v: boolean) => void;
// // //     isMobileMenuOpen: boolean;
// // //     setIsMobileMenuOpen: (v: boolean) => void;
// // //     willBeProctored: boolean;
// // //     savedFacRole: string | null;
// // //     grandTotalAwarded: number;
// // //     grandTotalMax: number;
// // //     grandTotalPct: number;
// // //     sectionTotals: Record<string, { total: number; awarded: number }>;
// // //     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
// // //     safeNavigateBack: () => void;
// // //     handleAnswerChange: (blockId: string, value: any) => void;
// // //     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
// // //     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
// // //     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
// // //     triggerSubmitConfirm: () => void;
// // //     executeSubmit: () => void;
// // //     executeAppeal: (reason: string) => void;
// // //     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride?: boolean) => void;
// // //     getBlockGrading: (blockId: string) => any;
// // //     isBlockVerified: (blockId: string) => boolean;
// // //     getSecureNow: () => number;
// // //     toast: any;
// // //     saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
// // //     codeSnapshots: Record<string, any>;
// // // }

// // // export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
// // //     const {
// // //         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
// // //         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving, setSaving,
// // //         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
// // //         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
// // //         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
// // //         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
// // //         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
// // //         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
// // //         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
// // //         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
// // //     } = props;

// // //     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
// // //     const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});

// // //     // 🚀 NEW STATE: Tracks which image is currently opened in Fullscreen Modal
// // //     const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

// // //     const answersRef = useRef(answers);
// // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // //     // COMPUTED STATUS VARS FOR SIDEBAR AND PANELS
// // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // //     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';
// // //     const isMissed = currentStatus === 'missed';

// // //     const codeBlockStorageSignature = useMemo(() => {
// // //         if (!assessment?.blocks) return '';
// // //         return assessment.blocks
// // //             .filter((b: any) => b.type === 'code_sandbox')
// // //             .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
// // //             .join('|');
// // //     }, [assessment?.blocks, answers]);

// // //     // 🚀 DIRECT FIREBASE STORAGE DOWNLOAD USING `getBytes`
// // //     useEffect(() => {
// // //         let cancelled = false;

// // //         const fetchSnapshots = async () => {
// // //             try {
// // //                 if (!submission?.id || !assessment?.blocks) {
// // //                     if (!cancelled) setIsFetchingSnapshots(false);
// // //                     return;
// // //                 }

// // //                 const codeBlocks = assessment.blocks.filter((b: any) => b.type === 'code_sandbox');
// // //                 if (codeBlocks.length === 0) {
// // //                     if (!cancelled) setIsFetchingSnapshots(false);
// // //                     return;
// // //                 }

// // //                 console.log('🔍 [FETCH SNAPSHOTS] Initiating code snapshot fetch for blocks...', {
// // //                     submissionId: submission.id,
// // //                     codeBlocksCount: codeBlocks.length
// // //                 });

// // //                 const newSnaps: Record<string, any> = {};
// // //                 const storage = getStorage();
// // //                 const currentAnswers = answersRef.current;

// // //                 await Promise.all(codeBlocks.map(async (block: any) => {
// // //                     const entry = currentAnswers[block.id] || answers[block.id];

// // //                     const storagePath = entry?.storagePath || entry?.codeData?.storagePath;
// // //                     const inlineSnapshot = entry?.snapshot || entry?.codeData?.snapshot;

// // //                     if (storagePath) {
// // //                         console.log(`📥 [FETCH SNAPSHOTS] Downloading snapshot via Storage SDK: ${storagePath}...`);
// // //                         try {
// // //                             const jsonRef = fbStorageRef(storage, storagePath);
// // //                             const buffer = await getBytes(jsonRef);
// // //                             const jsonStr = new TextDecoder().decode(buffer);
// // //                             const files = JSON.parse(jsonStr);
// // //                             console.log(`✅ [FETCH SNAPSHOTS SUCCESS] Downloaded offloaded snapshot for block [${block.id}]. Total files: ${Object.keys(files || {}).length}`);
// // //                             newSnaps[block.id] = files;
// // //                         } catch (err) {
// // //                             console.error(`❌ [FETCH SNAPSHOTS ERROR] Failed to download storage snapshot for block [${block.id}]:`, err);
// // //                         }
// // //                     } else if (inlineSnapshot) {
// // //                         newSnaps[block.id] = inlineSnapshot;
// // //                     }
// // //                 }));

// // //                 if (!cancelled) {
// // //                     setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
// // //                 }
// // //             } catch (err) {
// // //                 console.error("Fatal error fetching snapshots:", err);
// // //             } finally {
// // //                 if (!cancelled) setIsFetchingSnapshots(false);
// // //             }
// // //         };

// // //         fetchSnapshots();
// // //         return () => { cancelled = true; };
// // //     }, [submission?.id, codeBlockStorageSignature]);

// // //     const MAX_FILE_SIZE_MB = 10;
// // //     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// // //     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;
// // //         if (file.size > MAX_FILE_SIZE_BYTES) {
// // //             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
// // //             e.target.value = ''; return;
// // //         }
// // //         handleFileUpload(file, blockId, nestedKey);
// // //     };

// // //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// // //         if (block.type === 'section') {
// // //             acc.push({ type: 'section', label: block.title, id: block.id });
// // //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// // //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// // //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// // //         }
// // //         return acc;
// // //     }, []) || [];

// // //     const displayStatus = submission.status.replace('_', ' ');

// // //     const canEditTask = !isGloballyLocked;
// // //     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
// // //     const canEditLogbook = !isGloballyLocked;
// // //     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
// // //     const canEditCode = !isGloballyLocked;

// // //     // 🚀 UPDATED: Interactive Image Renderer with Expand overlay
// // //     const renderBlockImage = (block: any) => {
// // //         if (!block.imageUrl) return null;
// // //         return (
// // //             <div style={{ margin: '1rem 0', textAlign: 'center', position: 'relative', display: 'inline-block', width: '100%' }}>
// // //                 <div
// // //                     style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
// // //                     onClick={() => setExpandedImage({ url: block.imageUrl, caption: block.imageCaption })}
// // //                 >
// // //                     <img
// // //                         src={block.imageUrl}
// // //                         alt={block.imageCaption || "Assessment attachment"}
// // //                         crossOrigin="anonymous"
// // //                         style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain', display: 'block', margin: '0 auto' }}
// // //                     />
// // //                     <div style={{
// // //                         position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.7)', color: 'white',
// // //                         padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px',
// // //                         backdropFilter: 'blur(4px)', transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
// // //                     }}>
// // //                         <Maximize size={14} /> View Fullscreen
// // //                     </div>
// // //                 </div>
// // //                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
// // //             </div>
// // //         );
// // //     };

// // //     const renderBlockFile = (block: any) => {
// // //         if (!block.fileUrl) return null;
// // //         return (
// // //             <div style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
// // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
// // //                     <FileText size={20} color="#166534" />
// // //                     <div style={{ overflow: 'hidden' }}>
// // //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
// // //                             {block.fileName || "Download Starter File"}
// // //                         </span>
// // //                         <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
// // //                     </div>
// // //                 </div>
// // //                 <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0 }}>
// // //                     <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// // //                 </a>
// // //             </div>
// // //         );
// // //     };

// // //     let qNum = 0;

// // //     const handleFooterSubmitClick = (e: React.MouseEvent) => {
// // //         e.preventDefault();
// // //         triggerSubmitConfirm();
// // //     };

// // //     return (
// // //         <ProctoringWrapper
// // //             assessmentId={assessment.id || assessment?.assessmentId || user?.assessmentId || ''}
// // //             learnerId={user?.uid || submission?.authUid || submission?.learnerId || ''}
// // //             isProctored={willBeProctored}
// // //         >
// // //             <div className="ap-player ap-animate">
// // //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// // //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// // //                 {/* 🚀 MODALS MOUNT DIRECTLY INSIDE FULLSCREEN TOP-LAYER TARGET */}
// // //                 {showLeaveWarning && <LeaveWarningModal onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}

// // //                 {showSubmitConfirm && <SubmissionConfirmModal isAwaitingSignoff={isAwaitingSignoff} onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}

// // //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// // //                 {/* 🚀 PROCTOR-SAFE IN-DOM FULLSCREEN IMAGE MODAL */}
// // //                 {expandedImage && createPortal(
// // //                     <FullscreenImageModal
// // //                         url={expandedImage.url}
// // //                         caption={expandedImage.caption}
// // //                         onClose={() => setExpandedImage(null)}
// // //                     />,
// // //                     getPortalTarget()
// // //                 )}

// // //                 <div className="ap-player-topbar no-print">
// // //                     <div className="ap-player-topbar__left">
// // //                         <button type="button" className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// // //                         <button type="button" className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// // //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// // //                         <h1 className="ap-player-topbar__title">
// // //                             <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// // //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// // //                         </h1>
// // //                     </div>
// // //                     <div className="ap-player-topbar__right">
// // //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button type="button" className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
// // //                         {isGloballyLocked && <button type="button" className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
// // //                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// // //                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
// // //                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// // //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// // //                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// // //                     </div>
// // //                 </div>

// // //                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// // //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// // //                         <button type="button" className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
// // //                         <div className="ap-sidebar__meta-block">
// // //                             <div className="ap-sidebar__meta-title">
// // //                                 <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// // //                             </div>
// // //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// // //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// // //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// // //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// // //                         </div>

// // //                         {!isWorkplaceModule && isFacDone && (
// // //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// // //                                 <div className="ap-score-card__stripe" aria-hidden="true" />
// // //                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
// // //                                 <div className="ap-score-card__body">
// // //                                     <div className="ap-score-card__ring-wrap">
// // //                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
// // //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
// // //                                     </div>
// // //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// // //                                     <div className="ap-score-card__fraction">
// // //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// // //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// // //                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
// // //                                     </div>
// // //                                 </div>
// // //                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
// // //                             </div>
// // //                         )}

// // //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// // //                             <>
// // //                                 <div className="ap-sidebar__label">Status Tracking</div>
// // //                                 <div className="ap-sidebar__status-box">
// // //                                     {isAssDone && outcome ? (
// // //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// // //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// // //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// // //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// // //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// // //                                         </div>
// // //                                     ) : (
// // //                                         <div className="ap-sidebar__awaiting">
// // //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// // //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// // //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// // //                                         </div>
// // //                                     )}
// // //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// // //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// // //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// // //                                     {/* ACCURATE FACILITATOR REVIEW TIMELINE STATUS */}
// // //                                     <div className="ap-sidebar__timeline-item">
// // //                                         <div className={`ap-sidebar__timeline-icon${isFacDone ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// // //                                             <UserCheck size={13} />
// // //                                         </div>
// // //                                         <div className="ap-sidebar__timeline-content">
// // //                                             <span className="ap-sidebar__timeline-title">
// // //                                                 {savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}
// // //                                             </span>
// // //                                             <span className="ap-sidebar__timeline-desc">
// // //                                                 {isFacDone
// // //                                                     ? `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt)}`
// // //                                                     : isViolation
// // //                                                         ? 'Pending Facilitator Review (Violation Flagged)'
// // //                                                         : isMissed
// // //                                                             ? 'Pending Staff Review (Missed)'
// // //                                                             : savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator'}
// // //                                             </span>
// // //                                         </div>
// // //                                     </div>

// // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>

// // //                                     {(facilitatorProfile?.bookingUrl || assessorProfile?.bookingUrl) && (
// // //                                         <div className="ap-sidebar__booking-card" style={{ marginTop: '1.5rem', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 'bold' }}>
// // //                                                 <Calendar size={14} color="#3b82f6" /> Schedule a Check-in
// // //                                             </div>
// // //                                             <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
// // //                                                 Need help understanding your feedback or planning your next steps? Book a 1-on-1 session.
// // //                                             </p>
// // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                                                 {facilitatorProfile?.bookingUrl && (
// // //                                                     <a href={facilitatorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// // //                                                         Book with Facilitator
// // //                                                     </a>
// // //                                                 )}
// // //                                                 {assessorProfile?.bookingUrl && !facilitatorProfile?.bookingUrl && (
// // //                                                     <a href={assessorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// // //                                                         Book with Assessor
// // //                                                     </a>
// // //                                                 )}
// // //                                             </div>
// // //                                         </div>
// // //                                     )}
// // //                                 </div>
// // //                             </>
// // //                         )}

// // //                         <div className="ap-sidebar__label">Workbook Contents</div>
// // //                         <div className="ap-sidebar__nav">
// // //                             {navItems.map((item: any) =>
// // //                                 item.type === 'section'
// // //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// // //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// // //                             )}
// // //                         </div>
// // //                     </nav>

// // //                     <div className="ap-player-content print-pane">
// // //                         <div className="ap-blocks">

// // //                             {/* 🚀 SECURITY VIOLATION BANNER FOR LEARNERS */}
// // //                             {submission?.status === 'violation' && (
// // //                                 <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', margin: '1rem' }}>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// // //                                         <div className="lfm-fg" style={{ flex: 1, minWidth: '300px' }}>
// // //                                             <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)', marginBottom: '0.5rem' }}>
// // //                                                 <ShieldAlert size={18} /> Security Violation Detected
// // //                                             </div>
// // //                                             <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
// // //                                                 This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured and logged. Your invigilator has been notified.
// // //                                             </p>
// // //                                             {submission?.systemNote && (
// // //                                                 <div className="lfm-flags-panel" style={{ background: '#ffffff', borderColor: '#fecaca', borderLeftColor: 'var(--mlab-red)' }}>
// // //                                                     <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</span>
// // //                                                     <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
// // //                                                         "{submission.systemNote}"
// // //                                                     </p>
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>
// // //                                 </div>
// // //                             )}
// // //                             {assessment.blocks?.map((block: any) => {

// // //                                 if (block.type === 'section') {
// // //                                     const totals = sectionTotals[block.id];
// // //                                     return (
// // //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// // //                                             <span>{block.title}</span>
// // //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// // //                                             {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" />}
// // //                                             {renderBlockImage(block)}
// // //                                             {renderBlockFile(block)}
// // //                                         </div>
// // //                                     );
// // //                                 }

// // //                                 if (block.type === 'info') return (
// // //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// // //                                         <div className="ap-block-info__label"><Info size={13} /> {block.title || 'Reading Material'}</div>
// // //                                         <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
// // //                                         {renderBlockImage(block)}
// // //                                         {renderBlockFile(block)}
// // //                                     </div>
// // //                                 );

// // //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// // //                                     qNum++;
// // //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// // //                                     const learnerAns = answers[block.id];
// // //                                     let inkColor = '#64748b';
// // //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// // //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// // //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

// // //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// // //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

// // //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'graph' ? 'ap-block-type-chip--graph' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// // //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : block.type === 'graph' ? 'PLOT' : `Q${qNum}.`;

// // //                                     const isSectionVerified = isBlockVerified(block.id);
// // //                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

// // //                                     return (
// // //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// // //                                             <div className="ap-block-question__header">
// // //                                                 <div className="ap-block-question__text-wrap">
// // //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// // //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// // //                                                         {block.type === 'qcto_workplace' ? (
// // //                                                             <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} />
// // //                                                         ) : block.type === 'code_sandbox' ? (
// // //                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// // //                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
// // //                                                                 {block.question && <MathRenderedContent html={block.question} style={{ color: '#334155' }} />}
// // //                                                             </div>
// // //                                                         ) : block.question ? (
// // //                                                             <MathRenderedContent html={block.question} />
// // //                                                         ) : block.title ? (
// // //                                                             <MathRenderedContent html={block.title} />
// // //                                                         ) : null}
// // //                                                     </span>
// // //                                                     <div className="ap-grade-indicators">
// // //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// // //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// // //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// // //                                                     </div>
// // //                                                 </div>
// // //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// // //                                             </div>

// // //                                             <div className="ap-block-question__body">
// // //                                                 {renderBlockImage(block)}
// // //                                                 {renderBlockFile(block)}

// // //                                                 {/* MCQ */}
// // //                                                 {block.type === 'mcq' && (
// // //                                                     <div className="ap-mcq-options">
// // //                                                         {block.options?.map((opt: string, i: number) => {
// // //                                                             const selected = learnerAns === i;
// // //                                                             return (
// // //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// // //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// // //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// // //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// // //                                                                 </label>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* TEXT */}
// // //                                                 {block.type === 'text' && (
// // //                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // //                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// // //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// // //                                                         ) : (
// // //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* CARTESIAN ENGINE GRAPH BLOCK */}
// // //                                                 {block.type === 'graph' && (
// // //                                                     <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // //                                                         <AxisWorkspace
// // //                                                             value={learnerAns || { points: [], shapes: [] }}
// // //                                                             onChange={(val) => handleAnswerChange(block.id, val)}
// // //                                                             readOnly={isUploadLocked || !canEditTask}
// // //                                                         />
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* MATHPAD WITH TABS */}
// // //                                                 {block.type === 'mathpad' && (() => {
// // //                                                     const itemAns = typeof learnerAns === 'string'
// // //                                                         ? { equation: learnerAns }
// // //                                                         : (learnerAns || {});

// // //                                                     const mathTabs = [
// // //                                                         { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', allowed: true, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
// // //                                                         { id: 'graph', icon: <LineChart size={13} />, label: 'Graphing Calculator', allowed: block.allowGraphing !== false, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } },
// // //                                                         { id: 'draw', icon: <Pencil size={13} />, label: 'Whiteboard Canvas', allowed: block.allowDrawing !== false, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } }
// // //                                                     ].filter(t => t.allowed);

// // //                                                     const activeTabId = activeTabs[block.id] || mathTabs[0]?.id;

// // //                                                     return (
// // //                                                         <div className="ap-evidence-container">
// // //                                                             {mathTabs.length > 1 && (
// // //                                                                 <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // //                                                                     {mathTabs.map(t => {
// // //                                                                         const isActive = activeTabId === t.id;
// // //                                                                         const isDone = ((t.id === 'equation' && itemAns.equation) || (t.id === 'graph' && itemAns.graphState?.points?.length > 0) || (t.id === 'draw' && itemAns.drawingUrl));
// // //                                                                         return (
// // //                                                                             <button
// // //                                                                                 key={t.id}
// // //                                                                                 type="button"
// // //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// // //                                                                                 style={{
// // //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // //                                                                                     transition: 'all 0.2s ease',
// // //                                                                                     opacity: isActive ? 1 : 0.7,
// // //                                                                                     whiteSpace: 'nowrap'
// // //                                                                                 }}
// // //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // //                                                                             >
// // //                                                                                 {t.icon} {t.label} {isDone && <CheckCircle size={12} />}
// // //                                                                             </button>
// // //                                                                         );
// // //                                                                     })}
// // //                                                                 </div>
// // //                                                             )}
// // //                                                             <div className="ap-tab-panel">
// // //                                                                 {activeTabId === 'equation' && (
// // //                                                                     <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // //                                                                         <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: mathTabs.length > 1 ? '6px 6px 0 0' : '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
// // //                                                                             <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
// // //                                                                         </div>
// // //                                                                         <MathpadEditor
// // //                                                                             value={itemAns.equation || ''}
// // //                                                                             onChange={(val) => handleAnswerChange(block.id, { ...itemAns, equation: val })}
// // //                                                                             readOnly={isUploadLocked || !canEditTask}
// // //                                                                         />
// // //                                                                     </div>
// // //                                                                 )}
// // //                                                                 {activeTabId === 'graph' && (
// // //                                                                     <AxisWorkspace
// // //                                                                         value={itemAns.graphState}
// // //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, graphState: val })}
// // //                                                                         readOnly={isUploadLocked || !canEditTask}
// // //                                                                     />
// // //                                                                 )}
// // //                                                                 {activeTabId === 'draw' && (
// // //                                                                     <DrawingWorkspace
// // //                                                                         value={itemAns.drawingUrl}
// // //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, drawingUrl: val })}
// // //                                                                         readOnly={isUploadLocked || !canEditTask}
// // //                                                                         blockId={block.id}
// // //                                                                         submissionId={submission.id}
// // //                                                                         toast={toast}
// // //                                                                         setSaving={setSaving}
// // //                                                                     />
// // //                                                                 )}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     );
// // //                                                 })()}

// // //                                                 {/* TASK WITH OPTIONAL IDE */}
// // //                                                 {block.type === 'task' && (() => {
// // //                                                     const itemAns = learnerAns || {};

// // //                                                     const taskTabs = [
// // //                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // //                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio === true, val: itemAns.audioUrl, theme: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', activeBg: '#f3e8ff' } },
// // //                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // //                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // //                                                         { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // //                                                     ].filter(t => t.allowed);

// // //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// // //                                                     const progress = uploadProgress[block.id];

// // //                                                     const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // //                                                     const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // //                                                     return (
// // //                                                         <div className="ap-evidence-container">
// // //                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
// // //                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}

// // //                                                             {taskTabs.length > 1 && (
// // //                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // //                                                                     {taskTabs.map(t => {
// // //                                                                         const isActive = activeTabId === t.id;
// // //                                                                         return (
// // //                                                                             <button
// // //                                                                                 key={t.id}
// // //                                                                                 type="button"
// // //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// // //                                                                                 style={{
// // //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // //                                                                                     transition: 'all 0.2s ease',
// // //                                                                                     opacity: isActive ? 1 : 0.7
// // //                                                                                 }}
// // //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // //                                                                             >
// // //                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // //                                                                             </button>
// // //                                                                         );
// // //                                                                     })}
// // //                                                                 </div>
// // //                                                             )}

// // //                                                             <div className="ap-tab-panel">
// // //                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your answer here…" />}</div>}
// // //                                                                 {activeTabId === 'audio' && (itemAns.audioUrl ? <audio controls src={itemAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// // //                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
// // //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}

// // //                                                                 {/* 🚀 LIVE IDE SANDBOX ON TASK BLOCK */}
// // //                                                                 {activeTabId === 'code' && (
// // //                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// // //                                                                         <CodeSandboxPlayer
// // //                                                                             block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
// // //                                                                             learnerAns={mappedCodeData}
// // //                                                                             readOnly={isUploadLocked || !canEditTask}
// // //                                                                             onChange={async (val) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// // //                                                                         />
// // //                                                                     </div>
// // //                                                                 )}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                     );
// // //                                                 })()}

// // //                                                 {/* CHECKLIST */}
// // //                                                 {block.type === 'checklist' && (
// // //                                                     <div className="ap-checklist">
// // //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
// // //                                                         {block.criteria?.map((crit: string, i: number) => {
// // //                                                             const res = criteriaResults?.[i] || {};

// // //                                                             const nestedKey = `evidence_${i}`;
// // //                                                             const itemAns = learnerAns?.[nestedKey] || {};

// // //                                                             const evidenceTabs = [
// // //                                                                 { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // //                                                                 { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // //                                                                 { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // //                                                                 { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // //                                                             ].filter(t => t.allowed);

// // //                                                             const tabStateKey = `${block.id}_${nestedKey}`;
// // //                                                             const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// // //                                                             const progress = uploadProgress[`${block.id}_${nestedKey}`];

// // //                                                             const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // //                                                             const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // //                                                             return (
// // //                                                                 <div key={i} className="ap-checklist__item">
// // //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>

// // //                                                                     {block.requireEvidencePerCriterion !== false && (
// // //                                                                         <div className="ap-evidence-container" style={{ marginTop: '10px', marginBottom: '15px' }}>
// // //                                                                             {evidenceTabs.length > 1 && (
// // //                                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // //                                                                                     {evidenceTabs.map(t => {
// // //                                                                                         const isActive = activeTabId === t.id;
// // //                                                                                         return (
// // //                                                                                             <button
// // //                                                                                                 key={t.id}
// // //                                                                                                 type="button"
// // //                                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// // //                                                                                                 style={{
// // //                                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // //                                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // //                                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // //                                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // //                                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // //                                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // //                                                                                                     transition: 'all 0.2s ease',
// // //                                                                                                     opacity: isActive ? 1 : 0.7
// // //                                                                                                 }}
// // //                                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // //                                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // //                                                                                             >
// // //                                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // //                                                                                             </button>
// // //                                                                                         );
// // //                                                                                     })}
// // //                                                                                 </div>
// // //                                                                             )}

// // //                                                                             <div className="ap-tab-panel">
// // //                                                                                 {activeTabId === 'text' && (
// // //                                                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // //                                                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// // //                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// // //                                                                                         ) : (
// // //                                                                                             <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// // //                                                                                         )}
// // //                                                                                     </div>
// // //                                                                                 )}
// // //                                                                                 {activeTabId === 'url' && (
// // //                                                                                     <div>
// // //                                                                                         {itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}
// // //                                                                                     </div>
// // //                                                                                 )}
// // //                                                                                 {activeTabId === 'upload' && (
// // //                                                                                     progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : (
// // //                                                                                         <div className="ap-upload-empty">
// // //                                                                                             {isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// // //                                                                                                 <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// // //                                                                                                 <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} />
// // //                                                                                             </>}
// // //                                                                                         </div>
// // //                                                                                     )
// // //                                                                                 )}

// // //                                                                                 {activeTabId === 'code' && (
// // //                                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// // //                                                                                         <CodeSandboxPlayer
// // //                                                                                             block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${crit}`, template: 'vanilla' }}
// // //                                                                                             learnerAns={mappedCodeData}
// // //                                                                                             readOnly={isUploadLocked || !canEditWorkplace}
// // //                                                                                             onChange={async (val) => {
// // //                                                                                                 const updatedAns = { ...answers[block.id] };
// // //                                                                                                 const prevNested = updatedAns[nestedKey] || {};
// // //                                                                                                 updatedAns[nestedKey] = { ...prevNested, codeData: val };
// // //                                                                                                 handleAnswerChange(block.id, updatedAns);
// // //                                                                                             }}
// // //                                                                                         />
// // //                                                                                     </div>
// // //                                                                                 )}
// // //                                                                             </div>
// // //                                                                         </div>
// // //                                                                     )}

// // //                                                                     <div className="ap-checklist__assessor-row">
// // //                                                                         {res.status ? (
// // //                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
// // //                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
// // //                                                                             </div>
// // //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// // //                                                                     </div>
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* LOGBOOK */}
// // //                                                 {block.type === 'logbook' && (
// // //                                                     <div className="ap-logbook">
// // //                                                         <MathRenderedContent html={block.content} className="ap-logbook__desc" />
// // //                                                         <table className="ap-logbook__table">
// // //                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
// // //                                                             <tbody>
// // //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// // //                                                                     <tr key={i} className="ap-logbook__tbody">
// // //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
// // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// // //                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button type="button" className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// // //                                                                     </tr>
// // //                                                                 ))}
// // //                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button type="button" className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// // //                                                             </tbody>
// // //                                                         </table>
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* QCTO WORKPLACE WITH FULL EVIDENCE SUPPORT & LIVE IDE */}
// // //                                                 {block.type === 'qcto_workplace' && (
// // //                                                     <div className="ap-workplace">
// // //                                                         <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
// // //                                                         {block.workActivities?.map((wa: any) => {
// // //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// // //                                                             return (
// // //                                                                 <div key={wa.id} className="ap-workplace__activity">
// // //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

// // //                                                                     {wa.evidenceItems?.map((se: any) => {
// // //                                                                         const nestedKey = `se_${se.id}`;
// // //                                                                         const itemAns = learnerAns?.[nestedKey] || {};

// // //                                                                         const evidenceTabs = [
// // //                                                                             { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: true, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // //                                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: true, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // //                                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: true, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // //                                                                             { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: true, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // //                                                                         ];

// // //                                                                         const tabStateKey = `${block.id}_${nestedKey}`;
// // //                                                                         const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// // //                                                                         const progress = uploadProgress[`${block.id}_${nestedKey}`];

// // //                                                                         const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // //                                                                         const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // //                                                                         return (
// // //                                                                             <div key={se.id} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
// // //                                                                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>{se.code}: {se.description}</div>
// // //                                                                                 <div className="ap-evidence-container">
// // //                                                                                     {evidenceTabs.length > 1 && (
// // //                                                                                         <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // //                                                                                             {evidenceTabs.map(t => {
// // //                                                                                                 const isActive = activeTabId === t.id;
// // //                                                                                                 return (
// // //                                                                                                     <button
// // //                                                                                                         key={t.id}
// // //                                                                                                         type="button"
// // //                                                                                                         onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// // //                                                                                                         style={{
// // //                                                                                                             display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // //                                                                                                             background: isActive ? t.theme.activeBg : t.theme.bg,
// // //                                                                                                             padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // //                                                                                                             border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // //                                                                                                             cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // //                                                                                                             boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // //                                                                                                             transition: 'all 0.2s ease',
// // //                                                                                                             opacity: isActive ? 1 : 0.7
// // //                                                                                                         }}
// // //                                                                                                         onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // //                                                                                                         onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // //                                                                                                     >
// // //                                                                                                         {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // //                                                                                                     </button>
// // //                                                                                                 );
// // //                                                                                             })}
// // //                                                                                         </div>
// // //                                                                                     )}

// // //                                                                                     <div className="ap-tab-panel">
// // //                                                                                         {activeTabId === 'text' && (
// // //                                                                                             <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // //                                                                                                 {isGloballyLocked && !isAwaitingSignoff ? (
// // //                                                                                                     <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// // //                                                                                                 ) : (
// // //                                                                                                     <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// // //                                                                                                 )}
// // //                                                                                             </div>
// // //                                                                                         )}
// // //                                                                                         {activeTabId === 'url' && (
// // //                                                                                             <div>
// // //                                                                                                 {itemAns.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}
// // //                                                                                             </div>
// // //                                                                                         )}
// // //                                                                                         {activeTabId === 'upload' && (
// // //                                                                                             progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : (
// // //                                                                                                 <div className="ap-upload-empty">
// // //                                                                                                     {isUploadLocked || !canEditWorkplace ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// // //                                                                                                         <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// // //                                                                                                         <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditWorkplace} style={{ fontSize: '0.82rem' }} />
// // //                                                                                                     </>}
// // //                                                                                                 </div>
// // //                                                                                             )
// // //                                                                                         )}

// // //                                                                                         {activeTabId === 'code' && (
// // //                                                                                             <div style={{ height: '600px', marginTop: '10px' }}>
// // //                                                                                                 <CodeSandboxPlayer
// // //                                                                                                     block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${se.code}`, template: 'vanilla' }}
// // //                                                                                                     learnerAns={mappedCodeData}
// // //                                                                                                     readOnly={isUploadLocked || !canEditWorkplace}
// // //                                                                                                     onChange={async (val: any) => {
// // //                                                                                                         const updatedAns = { ...answers[block.id] };
// // //                                                                                                         const prevNested = updatedAns[nestedKey] || {};
// // //                                                                                                         updatedAns[nestedKey] = { ...prevNested, codeData: val };
// // //                                                                                                         handleAnswerChange(block.id, updatedAns);
// // //                                                                                                     }}
// // //                                                                                                 />
// // //                                                                                             </div>
// // //                                                                                         )}
// // //                                                                                     </div>
// // //                                                                                 </div>
// // //                                                                             </div>
// // //                                                                         );
// // //                                                                     })}

// // //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// // //                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// // //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// // //                                                                     </label>
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}

// // //                                                 {/* 🚀 STANDALONE CODE SANDBOX BLOCK */}
// // //                                                 {block.type === 'code_sandbox' && (
// // //                                                     isFetchingSnapshots ? (
// // //                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
// // //                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
// // //                                                             <p>Loading code environment...</p>
// // //                                                         </div>
// // //                                                     ) : (
// // //                                                         <CodeSandboxPlayer
// // //                                                             block={block}
// // //                                                             learnerAns={{
// // //                                                                 ...(learnerAns || {}),
// // //                                                                 snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot || learnerAns?.codeData?.snapshot
// // //                                                             }}
// // //                                                             readOnly={isUploadLocked || !canEditCode}
// // //                                                             onChange={async (val: any) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// // //                                                         />
// // //                                                     )
// // //                                                 )}

// // //                                                 {/* Per-question feedback */}
// // //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// // //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// // //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// // //                                             </div>
// // //                                         </div>
// // //                                     );
// // //                                 }
// // //                                 return null;
// // //                             })}
// // //                         </div>

// // //                         {/* FOOTER */}
// // //                         {isAwaitingSignoff ? (
// // //                             <div className="ap-footer ap-footer--signoff no-print">
// // //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// // //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// // //                                 </label>
// // //                                 <div className="ap-footer-actions">
// // //                                     <button type="button" className="ap-btn ap-btn--amber" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Acknowledge &amp; Submit for Grading</button>
// // //                                 </div>
// // //                             </div>
// // //                         ) : !isGloballyLocked ? (
// // //                             <div className="ap-footer no-print">
// // //                                 <h3 className="ap-footer__title">Final Submission</h3>
// // //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// // //                                 </label>
// // //                                 <div className="ap-footer-actions">
// // //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
// // //                                     <button type="button" className="ap-btn ap-btn--green" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Submit for Grading</button>
// // //                                 </div>
// // //                             </div>
// // //                         ) : (
// // //                             <div className="ap-footer ap-footer--locked no-print">
// // //                                 <div className="ap-footer--locked__icon-wrap">
// // //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// // //                                 </div>
// // //                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// // //                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
// // //                                 <button type="button" className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </ProctoringWrapper>
// // //     );
// // // };

// // // export default AssessmentPlayerContent;



// // // // // src/components/views/AssessmentPlayer/AssessmentPlayerContent.tsx

// // // // import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
// // // // import {
// // // //     ArrowLeft, Save, CheckCircle, Info, AlertCircle, Clock,
// // // //     BookOpen, Scale, UserCheck, Timer, AlertTriangle,
// // // //     ShieldCheck, Award, BarChart, MessageSquare, Printer, Check, X,
// // // //     RotateCcw, FileText, Mic, UploadCloud, Link as LinkIcon, Code, Plus, Trash2, Lock,
// // // //     Menu, FileArchive, Loader2, Sigma, Calendar, LineChart, Pencil, Undo, Eraser, ShieldAlert,
// // // //     Maximize, ZoomIn, ZoomOut
// // // // } from 'lucide-react';
// // // // import { ToastContainer } from '../../../components/common/Toast/Toast';
// // // // import ReactQuill from 'react-quill-new';
// // // // import 'react-quill-new/dist/quill.snow.css';
// // // // import './AssessmentPlayer.css';
// // // // import { createPortal } from 'react-dom';
// // // // import { UploadProgress } from '../../../components/common/UploadProgress';
// // // // import { UrlPreview } from '../../../components/common/UrlPreview';
// // // // import { ProctoringWrapper } from '../../../components/common/ProctoringWrapper/ProctoringWrapper';
// // // // import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import { getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL, getBytes } from 'firebase/storage';

// // // // import katex from "katex";
// // // // import "katex/dist/katex.min.css";
// // // // import "mathlive";
// // // // import { Tldraw } from 'tldraw';
// // // // import 'tldraw/tldraw.css';
// // // // import AxisWorkspace from '../../../components/common/AxisWorkspace/AxisWorkspace';

// // // // (window as any).katex = katex;

// // // // // 🚀 BULLETPROOF PORTAL TARGET RESOLVER FOR FULLSCREEN MODE
// // // // const getPortalTarget = (): HTMLElement => {
// // // //     const proctorRoot = document.getElementById('proctor-portal-root');
// // // //     if (proctorRoot) return proctorRoot;
// // // //     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
// // // //     return document.body;
// // // // };

// // // // const cleanRichText = (html?: string) => html ? html.replace(/&nbsp;/g, ' ') : '';
// // // // const extractPlainText = (htmlString?: string) => {
// // // //     if (!htmlString) return '';
// // // //     const tmp = document.createElement("DIV");
// // // //     tmp.innerHTML = htmlString;
// // // //     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// // // // };
// // // // const getSafeDate = (ds: string) => {
// // // //     if (!ds) return 'recently';
// // // //     const d = new Date(ds);
// // // //     return isNaN(d.getTime()) ? 'recently' : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// // // // };
// // // // const formatTime = (s: number) => {
// // // //     const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
// // // //     return h > 0 ? `${h}h ${m}m ${sec.toString().padStart(2, '0')}s` : `${m}m ${sec.toString().padStart(2, '0')}s`;
// // // // };

// // // // const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ list: 'ordered' }, { list: 'bullet' }], ['formula'], ['clean']] };
// // // // const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'formula'];

// // // // const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ progress, size = 60, strokeWidth = 5, color = "#94c73d" }) => {
// // // //     const radius = (size - strokeWidth) / 2;
// // // //     const circumference = 2 * Math.PI * radius;
// // // //     const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;
// // // //     return (
// // // //         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
// // // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeOpacity={0.3} strokeWidth={strokeWidth} fill="none" />
// // // //             <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
// // // //         </svg>
// // // //     );
// // // // };

// // // // /* ─── INLINE FULLSCREEN-COMPATIBLE MODALS ─── */
// // // // const SubmissionConfirmModal: React.FC<{
// // // //     isAwaitingSignoff: boolean;
// // // //     onConfirm: () => void;
// // // //     onCancel: () => void;
// // // // }> = ({ isAwaitingSignoff, onConfirm, onCancel }) => {
// // // //     return createPortal(
// // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '500px', background: 'white', borderTop: '5px solid var(--mlab-green)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
// // // //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc' }}>
// // // //                     <ShieldCheck size={22} color="var(--mlab-green)" />
// // // //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#0f172a' }}>
// // // //                         {isAwaitingSignoff ? "Sign-Off Observation?" : "Submit Assessment for Grading?"}
// // // //                     </h2>
// // // //                 </div>
// // // //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// // // //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// // // //                         {isAwaitingSignoff
// // // //                             ? "You are acknowledging the mentor's observation and submitting directly to the Assessor for final grading."
// // // //                             : "You are about to submit this workbook for final grading. You will NOT be able to change or edit your answers after submitting."}
// // // //                     </p>
// // // //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={onCancel}
// // // //                             className="ap-btn ap-btn--outline"
// // // //                             style={{ padding: '10px 18px', borderRadius: '4px', cursor: 'pointer' }}
// // // //                         >
// // // //                             Go Back
// // // //                         </button>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={onConfirm}
// // // //                             className="ap-btn ap-btn--green"
// // // //                             style={{ padding: '10px 20px', borderRadius: '4px', background: 'var(--mlab-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
// // // //                         >
// // // //                             {isAwaitingSignoff ? "Acknowledge & Submit" : "Yes, Submit for Grading"}
// // // //                         </button>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </div>,
// // // //         getPortalTarget()
// // // //     );
// // // // };

// // // // const LeaveWarningModal: React.FC<{ onConfirm: () => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
// // // //     return createPortal(
// // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //             <div className="lfm-modal" style={{ width: '90%', maxWidth: '480px', background: 'white', borderTop: '5px solid #f59e0b' }}>
// // // //                 <div className="lfm-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb' }}>
// // // //                     <AlertTriangle size={22} color="#f59e0b" />
// // // //                     <h2 className="lfm-header__title" style={{ fontSize: '1.2rem', margin: 0, color: '#92400e' }}>Leave Timed Assessment?</h2>
// // // //                 </div>
// // // //                 <div className="lfm-body" style={{ padding: '1.5rem' }}>
// // // //                     <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
// // // //                         Your timer will <strong>NOT</strong> pause. If you leave, the clock will continue counting down in the background.
// // // //                     </p>
// // // //                     <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
// // // //                         <button type="button" onClick={onCancel} className="ap-btn ap-btn--outline" style={{ padding: '10px 18px', cursor: 'pointer' }}>Stay Here</button>
// // // //                         <button type="button" onClick={onConfirm} className="ap-btn" style={{ padding: '10px 18px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Leave</button>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </div>,
// // // //         getPortalTarget()
// // // //     );
// // // // };

// // // // const AppealModal: React.FC<{ onClose: () => void; onSubmit: (reason: string) => void }> = ({ onClose, onSubmit }) => {
// // // //     const [reason, setReason] = useState('');
// // // //     useEffect(() => { const s = document.createElement('style'); s.innerHTML = 'body,html{overflow:hidden!important}'; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);
// // // //     return createPortal(
// // // //         <div className="ap-modal" style={{ position: 'fixed', inset: 0, zIndex: 9999999, pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //             <div className="ap-modal-card animate-fade-in ap-modal-card--danger">
// // // //                 <div className="ap-modal-header ap-modal-header--danger">
// // // //                     <div className="ap-modal-icon ap-modal-icon--danger"><AlertTriangle size={24} /></div>
// // // //                     <div><h2 className="ap-modal-title">Lodge Formal Appeal</h2><p className="ap-modal-subtitle">National Qualifications Appeals Procedure</p></div>
// // // //                 </div>
// // // //                 <form onSubmit={e => { e.preventDefault(); onSubmit(reason); }} className="ap-modal-body">
// // // //                     <p className="ap-modal-desc">In accordance with the Academic Appeals Policy, you have the right to appeal a "Not Yet Competent" judgment. Your appeal will be escalated to the National Training Manager / Academic Board for review.</p>
// // // //                     <div className="ap-form-group">
// // // //                         <label className="ap-form-label"><MessageSquare size={13} /> Reason for Appeal *</label>
// // // //                         <textarea required rows={5} placeholder="Please detail why you believe the assessment judgment was incorrect or unfair…" value={reason} onChange={e => setReason(e.target.value)} className="ap-modal-textarea" />
// // // //                     </div>
// // // //                     <div className="ap-modal-footer">
// // // //                         <button type="button" onClick={onClose} className="ap-modal-btn ap-modal-btn--cancel">Cancel</button>
// // // //                         <button type="submit" disabled={!reason.trim()} className="ap-modal-btn ap-modal-btn--danger">Submit Appeal</button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>,
// // // //         getPortalTarget()
// // // //     );
// // // // };

// // // // // 🚀 ENCAPSULATED FULLSCREEN IMAGE VIEWER WITH ZOOM & PAN
// // // // const FullscreenImageModal: React.FC<{ url: string; caption?: string; onClose: () => void }> = ({ url, caption, onClose }) => {
// // // //     const [scale, setScale] = useState(1);
// // // //     const [position, setPosition] = useState({ x: 0, y: 0 });
// // // //     const [isDragging, setIsDragging] = useState(false);
// // // //     const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

// // // //     const handleWheel = (e: React.WheelEvent) => {
// // // //         e.stopPropagation();
// // // //         setScale(prev => Math.max(0.5, Math.min(prev - e.deltaY * 0.005, 5)));
// // // //     };

// // // //     const handleMouseDown = (e: React.MouseEvent) => {
// // // //         e.stopPropagation();
// // // //         setIsDragging(true);
// // // //         setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
// // // //     };

// // // //     const handleMouseMove = (e: React.MouseEvent) => {
// // // //         if (!isDragging) return;
// // // //         e.stopPropagation();
// // // //         setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
// // // //     };

// // // //     const handleMouseUp = (e: React.MouseEvent) => {
// // // //         e.stopPropagation();
// // // //         setIsDragging(false);
// // // //     };

// // // //     const zoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
// // // //     const zoomOut = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.max(p - 0.5, 0.5)); };
// // // //     const resetZoom = (e: React.MouseEvent) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); };

// // // //     const btnStyle = {
// // // //         background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '10px',
// // // //         borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center',
// // // //         justifyContent: 'center', transition: 'background 0.2s', backdropFilter: 'blur(4px)'
// // // //     };

// // // //     return createPortal(
// // // //         <div
// // // //             style={{
// // // //                 position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.95)',
// // // //                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
// // // //                 backdropFilter: 'blur(8px)', overflow: 'hidden', pointerEvents: 'auto' // 🚀 RESTORES CLICKABILITY
// // // //             }}
// // // //             onWheel={handleWheel}
// // // //             onMouseMove={handleMouseMove}
// // // //             onMouseUp={handleMouseUp}
// // // //             onMouseLeave={handleMouseUp}
// // // //             onClick={onClose}
// // // //         >
// // // //             <div
// // // //                 style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 10 }}
// // // //                 onClick={e => e.stopPropagation()} // 🚀 STOPS BUTTON CLICKS FROM CLOSING THE MODAL
// // // //                 onMouseDown={e => e.stopPropagation()} // 🚀 STOPS BUTTONS FROM TRIGGERING DRAG PAN
// // // //             >
// // // //                 <button onClick={zoomOut} style={btnStyle} title="Zoom Out" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomOut size={20} /></button>
// // // //                 <button onClick={resetZoom} style={btnStyle} title="Reset Zoom" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><Maximize size={20} /></button>
// // // //                 <button onClick={zoomIn} style={btnStyle} title="Zoom In" onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}><ZoomIn size={20} /></button>
// // // //                 <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
// // // //                 <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.8)' }} title="Close" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}><X size={20} /></button>
// // // //             </div>

// // // //             <div
// // // //                 style={{
// // // //                     transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
// // // //                     transition: isDragging ? 'none' : 'transform 0.1s ease-out',
// // // //                     cursor: isDragging ? 'grabbing' : 'grab',
// // // //                     display: 'flex', flexDirection: 'column', alignItems: 'center'
// // // //                 }}
// // // //                 onMouseDown={handleMouseDown}
// // // //                 onClick={e => e.stopPropagation()}
// // // //             >
// // // //                 <img
// // // //                     src={url}
// // // //                     alt={caption || "Expanded view"}
// // // //                     crossOrigin="anonymous"
// // // //                     draggable={false}
// // // //                     style={{
// // // //                         maxWidth: '90vw',
// // // //                         maxHeight: '80vh',
// // // //                         objectFit: 'contain',
// // // //                         borderRadius: '8px',
// // // //                         boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
// // // //                         pointerEvents: 'none'
// // // //                     }}
// // // //                 />
// // // //                 {caption && (
// // // //                     <p style={{ color: 'white', marginTop: '15px', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px', pointerEvents: 'none' }}>
// // // //                         {caption}
// // // //                     </p>
// // // //                 )}
// // // //             </div>
// // // //             <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '20px' }}>
// // // //                 Scroll to zoom • Click and drag to pan
// // // //             </div>
// // // //         </div>,
// // // //         getPortalTarget()
// // // //     );
// // // // };

// // // // const MathRenderedContent: React.FC<{ html?: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
// // // //     const containerRef = useRef<HTMLDivElement>(null);
// // // //     const uniqueClass = useMemo(() => `math-render-${Math.random().toString(36).slice(2, 7)}`, []);

// // // //     useEffect(() => {
// // // //         if (!containerRef.current || !html) return;
// // // //         // @ts-ignore
// // // //         import('katex/dist/contrib/auto-render.mjs').then((module) => {
// // // //             if (containerRef.current) {
// // // //                 module.default(containerRef.current, {
// // // //                     delimiters: [
// // // //                         { left: '$$', right: '$$', display: true },
// // // //                         { left: '$', right: '$', display: false },
// // // //                         { left: '\\(', right: '\\)', display: false },
// // // //                         { left: '\\[', right: '\\]', display: true }
// // // //                     ],
// // // //                     throwOnError: false
// // // //                 });
// // // //             }
// // // //         }).catch(err => console.error("Failed to load KaTeX auto-render:", err));
// // // //     }, [html]);

// // // //     return (
// // // //         <div style={{ display: 'inline-block', width: style?.width }}>
// // // //             {style?.color && <style>{`.${uniqueClass}, .${uniqueClass} * { color: ${style.color} !important; }`}</style>}
// // // //             <div ref={containerRef} className={`quill-read-only-content ${uniqueClass} ${className || ''}`} style={{ lineHeight: 1.6, ...style }} dangerouslySetInnerHTML={{ __html: cleanRichText(html) }} />
// // // //         </div>
// // // //     );
// // // // };

// // // // const LearnerFilePreview: React.FC<{ url: string; onRemove?: () => void; disabled?: boolean }> = ({ url, onRemove, disabled }) => {
// // // //     if (!url) return null;

// // // //     const cleanUrl = url.split('?')[0];
// // // //     const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded_Evidence');
// // // //     const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

// // // //     const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
// // // //     const isPdf = ext === 'pdf';
// // // //     const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

// // // //     if (isImage) {
// // // //         return (
// // // //             <div style={{ position: 'relative', marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // // //                 <img src={url} alt="Learner evidence preview" crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '4px', display: 'block', margin: '0 auto' }} />
// // // //                 {onRemove && !disabled && (
// // // //                     <button type="button" onClick={onRemove} style={{ marginTop: '8px', padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                         <Trash2 size={13} /> Remove File
// // // //                     </button>
// // // //                 )}
// // // //             </div>
// // // //         );
// // // //     }

// // // //     if (isPdf) {
// // // //         return (
// // // //             <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
// // // //                 <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
// // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
// // // //                         <FileText size={18} color="#0284c7" />
// // // //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // // //                             {fileName}
// // // //                         </span>
// // // //                     </div>
// // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                         <a href={url} target="_blank" rel="noopener noreferrer" download style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '6px 12px', background: '#0284c7', color: 'white', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
// // // //                             <UploadCloud size={13} style={{ transform: 'rotate(180deg)' }} /> Open PDF
// // // //                         </a>
// // // //                         {onRemove && !disabled && (
// // // //                             <button type="button" onClick={onRemove} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
// // // //                                 <Trash2 size={13} />
// // // //                             </button>
// // // //                         )}
// // // //                     </div>
// // // //                 </div>
// // // //                 <div style={{ height: '420px', width: '100%' }}>
// // // //                     <object data={url} type="application/pdf" width="100%" height="100%">
// // // //                         <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#475569' }}>
// // // //                             Your browser does not support inline PDF viewing. <a href={url} target="_blank" rel="noreferrer">Click here to download PDF</a>
// // // //                         </p>
// // // //                     </object>
// // // //                 </div>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '16px' }}>
// // // //             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
// // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
// // // //                     <div style={{ background: isSpreadsheet ? '#dcfce7' : '#e0f2fe', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //                         <FileText size={24} color={isSpreadsheet ? '#15803d' : '#0369a1'} />
// // // //                     </div>
// // // //                     <div style={{ overflow: 'hidden' }}>
// // // //                         <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // //                             {fileName}
// // // //                         </span>
// // // //                         <span style={{ fontSize: '0.75rem', color: isSpreadsheet ? '#166534' : '#0284c7', fontWeight: 'bold' }}>
// // // //                             {isSpreadsheet ? 'Excel / CSV Spreadsheet Evidence' : 'Uploaded Document Evidence'}
// // // //                         </span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                     <a
// // // //                         href={url}
// // // //                         target="_blank"
// // // //                         rel="noopener noreferrer"
// // // //                         download
// // // //                         style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: isSpreadsheet ? '#166534' : '#0284c7', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// // // //                     >
// // // //                         <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// // // //                     </a>
// // // //                     {onRemove && !disabled && (
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={onRemove}
// // // //                             style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
// // // //                         >
// // // //                             <Trash2 size={14} /> Remove
// // // //                         </button>
// // // //                     )}
// // // //                 </div>
// // // //             </div>

// // // //             <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                 <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
// // // //                 <span>Spreadsheets and binary files are downloaded directly to your device for viewing in Microsoft Excel or Google Sheets.</span>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // const MathpadEditor: React.FC<{ value: string; onChange: (val: string) => void; readOnly: boolean }> = ({ value, onChange, readOnly }) => {
// // // //     const mfRef = useRef<any>(null);
// // // //     const lastBroadcastRef = useRef('');

// // // //     const cleanValue = useMemo(() => {
// // // //         let v = value || '';
// // // //         if (v.includes('<p>') || v.includes('&nbsp;')) v = v.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
// // // //         return v;
// // // //     }, [value]);

// // // //     useEffect(() => {
// // // //         const mf = mfRef.current;
// // // //         if (!mf) return;
// // // //         if (cleanValue !== mf.value && cleanValue !== lastBroadcastRef.current) mf.value = cleanValue;
// // // //         mf.readOnly = readOnly;
// // // //     }, [cleanValue, readOnly]);

// // // //     useEffect(() => {
// // // //         const mf = mfRef.current;
// // // //         if (!mf) return;
// // // //         const handleInput = () => { lastBroadcastRef.current = mf.value; onChange(mf.value); };
// // // //         mf.addEventListener('input', handleInput);
// // // //         return () => mf.removeEventListener('input', handleInput);
// // // //     }, [onChange]);

// // // //     useEffect(() => {
// // // //         const mf = mfRef.current;
// // // //         if (!mf) return;
// // // //         const triggerNewline = () => {
// // // //             const hasMultilineEnv = mf.value.includes('\\begin{aligned}') || mf.value.includes('\\begin{matrix}') || mf.value.includes('\\begin{array}') || mf.value.includes('\\begin{cases}') || mf.value.includes('\\begin{gathered}');
// // // //             if (hasMultilineEnv) mf.executeCommand('addRowAfter');
// // // //             else {
// // // //                 mf.executeCommand(['insert', '\\begin{aligned}#0\\\\\\end{aligned}']);
// // // //                 mf.executeCommand('moveToMathfieldEnd');
// // // //             }
// // // //         };
// // // //         const handleBeforeInput = (e: any) => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); triggerNewline(); } };
// // // //         mf.addEventListener('beforeinput', handleBeforeInput);
// // // //         return () => mf.removeEventListener('beforeinput', handleBeforeInput);
// // // //     }, [readOnly]);

// // // //     return (
// // // //         <div style={{ position: 'relative', width: '100%' }}>
// // // //             <style>{`
// // // //                 math-field::part(container) .ML__matrix,
// // // //                 math-field::part(container) .ML__array,
// // // //                 math-field::part(container) .ML__aligned,
// // // //                 math-field::part(container) .ML__matrix-row {
// // // //                     border: none !important;
// // // //                     outline: none !important;
// // // //                 }
// // // //             `}</style>
// // // //             {React.createElement('math-field', {
// // // //                 ref: mfRef,
// // // //                 style: {
// // // //                     width: '100%', fontSize: '1.4rem', padding: '12px',
// // // //                     border: '1px solid #fbcfe8', borderRadius: '0 0 6px 6px',
// // // //                     borderTop: 'none', background: readOnly ? '#f8fafc' : '#fff',
// // // //                     outline: 'none', color: '#0f172a', display: 'block',
// // // //                     minHeight: '140px', height: 'auto'
// // // //                 }
// // // //             })}
// // // //         </div>
// // // //     );
// // // // };

// // // // const DrawingWorkspace: React.FC<{ value: string; onChange: (v: string) => void; readOnly: boolean; blockId: string; submissionId: string; toast: any; setSaving: (v: boolean) => void }> = ({ value, onChange, readOnly, blockId, submissionId, toast, setSaving }) => {
// // // //     const [editor, setEditor] = useState<any>(null);
// // // //     const [isUploading, setIsUploading] = useState(false);

// // // //     const handleSave = async () => {
// // // //         if (!editor) return;
// // // //         const shapeIds = Array.from(editor.getCurrentPageShapeIds());
// // // //         if (shapeIds.length === 0) return toast.warning("The workspace is empty!");

// // // //         setIsUploading(true);
// // // //         setSaving(true);
// // // //         toast.info("Saving workspace securely...");

// // // //         try {
// // // //             const { blob } = await editor.toImage(shapeIds, {
// // // //                 format: 'png',
// // // //                 background: true,
// // // //                 padding: 20
// // // //             });

// // // //             const storage = getStorage();
// // // //             const refPath = `evidence/${submissionId}/${blockId}_workspace_${Date.now()}.png`;
// // // //             const storageRef = fbStorageRef(storage, refPath);

// // // //             await uploadBytesResumable(storageRef, blob);
// // // //             const url = await getDownloadURL(storageRef);

// // // //             onChange(url);
// // // //             toast.success("Workspace saved securely!");
// // // //         } catch (err) {
// // // //             console.error(err);
// // // //             toast.error("Failed to save workspace. Please try again.");
// // // //         } finally {
// // // //             setIsUploading(false);
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     return (
// // // //         <div style={{ position: 'relative' }}>
// // // //             {readOnly && value ? (
// // // //                 <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // // //                     <img src={value} alt="Learner workspace" crossOrigin="anonymous" style={{ maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white' }} />
// // // //                 </div>
// // // //             ) : readOnly && !value ? (
// // // //                 <div className="ap-upload-empty">No workspace data provided.</div>
// // // //             ) : (
// // // //                 <>
// // // //                     <div style={{ height: '600px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
// // // //                         <Tldraw onMount={setEditor} hideUi={false} />
// // // //                     </div>
// // // //                     <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
// // // //                         <div style={{ flex: 1 }} />
// // // //                         {value && <span style={{ color: 'var(--mlab-green)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><CheckCircle size={14} /> Cloud Synced</span>}
// // // //                         <button type="button" onClick={handleSave} className="ap-btn ap-btn--primary" disabled={isUploading}>
// // // //                             {isUploading ? <><Loader2 className="ap-spin" size={14} /> Saving Workspace...</> : <><Save size={14} /> Submit Workspace Canvas</>}
// // // //                         </button>
// // // //                     </div>
// // // //                 </>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // export interface AssessmentPlayerContentProps {
// // // //     user: any;
// // // //     assessment: any;
// // // //     submission: any;
// // // //     answers: Record<string, any>;
// // // //     learnerProfile: any;
// // // //     learnerEnrollment: any;
// // // //     assessorProfile: any;
// // // //     moderatorProfile: any;
// // // //     facilitatorProfile: any;
// // // //     employers: any[];
// // // //     staff: any[];
// // // //     moduleLogs: any[];
// // // //     approvedLogs: any[];
// // // //     logsLoading: boolean;
// // // //     saving: boolean;
// // // //     setSaving: (v: boolean) => void;
// // // //     uploadProgress: Record<string, number>;
// // // //     setUploadProgress: (fn: (prev: any) => any) => void;
// // // //     activeTabs: Record<string, string>;
// // // //     setActiveTabs: (tabs: Record<string, string>) => void;
// // // //     timeLeft: number | null;
// // // //     isGloballyLocked: boolean;
// // // //     isAwaitingSignoff: boolean;
// // // //     isPracticalModule: boolean;
// // // //     isWorkplaceModule: boolean;
// // // //     isRemediation: boolean;
// // // //     isAppealUpheld: boolean;
// // // //     isFacDone: boolean;
// // // //     isAssDone: boolean;
// // // //     isModDone: boolean;
// // // //     isSubmitted: boolean;
// // // //     isMissed: boolean;
// // // //     showGate: boolean;
// // // //     showLeaveWarning: boolean;
// // // //     setShowLeaveWarning: (v: boolean) => void;
// // // //     showSubmitConfirm: boolean;
// // // //     setShowSubmitConfirm: (v: boolean) => void;
// // // //     showAppealModal: boolean;
// // // //     setShowAppealModal: (v: boolean) => void;
// // // //     declarationChecked: boolean;
// // // //     setDeclarationChecked: (v: boolean) => void;
// // // //     isMobileMenuOpen: boolean;
// // // //     setIsMobileMenuOpen: (v: boolean) => void;
// // // //     willBeProctored: boolean;
// // // //     savedFacRole: string | null;
// // // //     grandTotalAwarded: number;
// // // //     grandTotalMax: number;
// // // //     grandTotalPct: number;
// // // //     sectionTotals: Record<string, { total: number; awarded: number }>;
// // // //     outcome: { label: string; color: string; subtext: string; score?: number; percentage?: number; isCompetent: boolean } | null;
// // // //     safeNavigateBack: () => void;
// // // //     handleAnswerChange: (blockId: string, value: any) => void;
// // // //     handleTaskAnswerChange: (blockId: string, field: string, value: any) => void;
// // // //     handleNestedAnswerChange: (blockId: string, nestedKey: string, field: string, value: any) => void;
// // // //     handleFileUpload: (file: File, blockId: string, nestedKey?: string) => void;
// // // //     triggerSubmitConfirm: () => void;
// // // //     executeSubmit: () => void;
// // // //     executeAppeal: (reason: string) => void;
// // // //     preventCopyPasteAndDrop: (e: React.ClipboardEvent | React.DragEvent | React.KeyboardEvent, allowOverride?: boolean) => void;
// // // //     getBlockGrading: (blockId: string) => any;
// // // //     isBlockVerified: (blockId: string) => boolean;
// // // //     getSecureNow: () => number;
// // // //     toast: any;
// // // //     saveCodeSnapshot: (blockId: string, snapshot: string | Record<string, string> | undefined, dependencies?: Record<string, string>, immediate?: boolean) => void;
// // // //     codeSnapshots: Record<string, any>;
// // // // }

// // // // export const AssessmentPlayerContent: React.FC<AssessmentPlayerContentProps> = (props) => {
// // // //     const {
// // // //         user, assessment, submission, answers, learnerProfile, learnerEnrollment, assessorProfile,
// // // //         moderatorProfile, facilitatorProfile, employers, staff, approvedLogs, logsLoading, saving, setSaving,
// // // //         uploadProgress, setUploadProgress, activeTabs, setActiveTabs, timeLeft, isGloballyLocked,
// // // //         isAwaitingSignoff, isPracticalModule, isWorkplaceModule, isFacDone, isAssDone, isModDone,
// // // //         isSubmitted, showLeaveWarning, setShowLeaveWarning, showSubmitConfirm, setShowSubmitConfirm,
// // // //         showAppealModal, setShowAppealModal, declarationChecked, setDeclarationChecked, isMobileMenuOpen,
// // // //         setIsMobileMenuOpen, willBeProctored, savedFacRole, grandTotalAwarded, grandTotalMax,
// // // //         grandTotalPct, sectionTotals, outcome, safeNavigateBack, handleAnswerChange, handleTaskAnswerChange,
// // // //         handleNestedAnswerChange, handleFileUpload, saveCodeSnapshot, codeSnapshots, triggerSubmitConfirm, executeSubmit, executeAppeal,
// // // //         preventCopyPasteAndDrop, getBlockGrading, isBlockVerified, toast
// // // //     } = props;

// // // //     const [isFetchingSnapshots, setIsFetchingSnapshots] = useState(true);
// // // //     const [resolvedSnapshots, setResolvedSnapshots] = useState<Record<string, any>>({});

// // // //     // 🚀 NEW STATE: Tracks which image is currently opened in Fullscreen Modal
// // // //     const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

// // // //     const answersRef = useRef(answers);
// // // //     useEffect(() => { answersRef.current = answers; }, [answers]);

// // // //     // COMPUTED STATUS VARS FOR SIDEBAR AND PANELS
// // // //     const currentStatus = String(submission?.status || '').toLowerCase();
// // // //     const isViolation = currentStatus === 'violation' || currentStatus === 'terminated';
// // // //     const isMissed = currentStatus === 'missed';

// // // //     const codeBlockStorageSignature = useMemo(() => {
// // // //         if (!assessment?.blocks) return '';
// // // //         return assessment.blocks
// // // //             .filter((b: any) => b.type === 'code_sandbox')
// // // //             .map((b: any) => `${b.id}:${answers[b.id]?.storagePath || ''}`)
// // // //             .join('|');
// // // //     }, [assessment?.blocks, answers]);

// // // //     useEffect(() => {
// // // //         let cancelled = false;

// // // //         const fetchSnapshots = async () => {
// // // //             if (!submission?.id || !assessment?.blocks) {
// // // //                 if (!cancelled) setIsFetchingSnapshots(false);
// // // //                 return;
// // // //             }

// // // //             const codeBlocks = assessment.blocks.filter((b: any) => b.type === 'code_sandbox');
// // // //             if (codeBlocks.length === 0) {
// // // //                 if (!cancelled) setIsFetchingSnapshots(false);
// // // //                 return;
// // // //             }

// // // //             const newSnaps: Record<string, any> = {};
// // // //             const functions = getFunctions();
// // // //             const getFn = httpsCallable(functions, 'getCodeSnapshot');
// // // //             const currentAnswers = answersRef.current;

// // // //             await Promise.all(codeBlocks.map(async (block: any) => {
// // // //                 const entry = currentAnswers[block.id];
// // // //                 if (entry?.storagePath) {
// // // //                     try {
// // // //                         const res = await getFn({ submissionId: submission.id, blockId: block.id });
// // // //                         newSnaps[block.id] = (res.data as any).files;
// // // //                     } catch (err) {
// // // //                         console.error(`Failed to load snapshot for ${block.id}:`, err);
// // // //                     }
// // // //                 } else if (entry?.snapshot) {
// // // //                     newSnaps[block.id] = entry.snapshot;
// // // //                 }
// // // //             }));

// // // //             if (!cancelled) {
// // // //                 setResolvedSnapshots(prev => ({ ...prev, ...newSnaps }));
// // // //                 setIsFetchingSnapshots(false);
// // // //             }
// // // //         };
// // // //         fetchSnapshots();
// // // //         return () => { cancelled = true; };
// // // //     }, [submission?.id, codeBlockStorageSignature]);

// // // //     const MAX_FILE_SIZE_MB = 10;
// // // //     const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// // // //     const handleFileValidationAndUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, nestedKey?: string) => {
// // // //         const file = e.target.files?.[0];
// // // //         if (!file) return;
// // // //         if (file.size > MAX_FILE_SIZE_BYTES) {
// // // //             toast.error(`File "${file.name}" is too large. Maximum size allowed is ${MAX_FILE_SIZE_MB}MB.`);
// // // //             e.target.value = ''; return;
// // // //         }
// // // //         handleFileUpload(file, blockId, nestedKey);
// // // //     };

// // // //     const navItems = assessment.blocks?.reduce((acc: any[], block: any) => {
// // // //         if (block.type === 'section') {
// // // //             acc.push({ type: 'section', label: block.title, id: block.id });
// // // //         } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// // // //             const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
// // // //             acc.push({ type: 'q', label: cleanLabel, id: block.id });
// // // //         }
// // // //         return acc;
// // // //     }, []) || [];

// // // //     const displayStatus = submission.status.replace('_', ' ');

// // // //     const canEditTask = !isGloballyLocked;
// // // //     const canEditChecklist = !isGloballyLocked || isAwaitingSignoff;
// // // //     const canEditLogbook = !isGloballyLocked;
// // // //     const canEditWorkplace = !isGloballyLocked || isAwaitingSignoff;
// // // //     const canEditCode = !isGloballyLocked;

// // // //     // 🚀 UPDATED: Interactive Image Renderer with Expand overlay
// // // //     const renderBlockImage = (block: any) => {
// // // //         if (!block.imageUrl) return null;
// // // //         return (
// // // //             <div style={{ margin: '1rem 0', textAlign: 'center', position: 'relative', display: 'inline-block', width: '100%' }}>
// // // //                 <div
// // // //                     style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
// // // //                     onClick={() => setExpandedImage({ url: block.imageUrl, caption: block.imageCaption })}
// // // //                 >
// // // //                     <img
// // // //                         src={block.imageUrl}
// // // //                         alt={block.imageCaption || "Assessment attachment"}
// // // //                         crossOrigin="anonymous"
// // // //                         style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain', display: 'block', margin: '0 auto' }}
// // // //                     />
// // // //                     <div style={{
// // // //                         position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.7)', color: 'white',
// // // //                         padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px',
// // // //                         backdropFilter: 'blur(4px)', transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
// // // //                     }}>
// // // //                         <Maximize size={14} /> View Fullscreen
// // // //                     </div>
// // // //                 </div>
// // // //                 {block.imageCaption && <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>{block.imageCaption}</p>}
// // // //             </div>
// // // //         );
// // // //     };

// // // //     const renderBlockFile = (block: any) => {
// // // //         if (!block.fileUrl) return null;
// // // //         return (
// // // //             <div style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
// // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
// // // //                     <FileText size={20} color="#166534" />
// // // //                     <div style={{ overflow: 'hidden' }}>
// // // //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
// // // //                             {block.fileName || "Download Starter File"}
// // // //                         </span>
// // // //                         <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
// // // //                     </div>
// // // //                 </div>
// // // //                 <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0 }}>
// // // //                     <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// // // //                 </a>
// // // //             </div>
// // // //         );
// // // //     };

// // // //     let qNum = 0;

// // // //     const handleFooterSubmitClick = (e: React.MouseEvent) => {
// // // //         e.preventDefault();
// // // //         triggerSubmitConfirm();
// // // //     };

// // // //     return (
// // // //         <ProctoringWrapper
// // // //             assessmentId={assessment.id || assessment?.assessmentId || user?.assessmentId || ''}
// // // //             learnerId={user?.uid || submission?.authUid || submission?.learnerId || ''}
// // // //             isProctored={willBeProctored}
// // // //         >
// // // //             <div className="ap-player ap-animate">
// // // //                 <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// // // //                 {isMobileMenuOpen && <div className="ap-sidebar-overlay no-print" onClick={() => setIsMobileMenuOpen(false)} />}

// // // //                 {/* 🚀 MODALS MOUNT DIRECTLY INSIDE FULLSCREEN TOP-LAYER TARGET */}
// // // //                 {showLeaveWarning && <LeaveWarningModal onConfirm={safeNavigateBack} onCancel={() => setShowLeaveWarning(false)} />}

// // // //                 {showSubmitConfirm && <SubmissionConfirmModal isAwaitingSignoff={isAwaitingSignoff} onConfirm={executeSubmit} onCancel={() => setShowSubmitConfirm(false)} />}

// // // //                 {showAppealModal && <AppealModal onClose={() => setShowAppealModal(false)} onSubmit={executeAppeal} />}

// // // //                 {/* 🚀 PROCTOR-SAFE IN-DOM FULLSCREEN IMAGE MODAL */}
// // // //                 {expandedImage && createPortal(
// // // //                     <FullscreenImageModal
// // // //                         url={expandedImage.url}
// // // //                         caption={expandedImage.caption}
// // // //                         onClose={() => setExpandedImage(null)}
// // // //                     />,
// // // //                     getPortalTarget()
// // // //                 )}

// // // //                 <div className="ap-player-topbar no-print">
// // // //                     <div className="ap-player-topbar__left">
// // // //                         <button type="button" className="ap-hamburger-btn no-print" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
// // // //                         <button type="button" className="ap-player-topbar__back" onClick={safeNavigateBack}><ArrowLeft size={16} /> <span className="ap-hide-mobile">Portfolio</span></button>
// // // //                         <div className="ap-player-topbar__separator ap-hide-mobile" />
// // // //                         <h1 className="ap-player-topbar__title">
// // // //                             <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// // // //                             {submission?.attemptNumber > 1 && <span className="ap-attempt-badge">Attempt #{submission.attemptNumber}</span>}
// // // //                         </h1>
// // // //                     </div>
// // // //                     <div className="ap-player-topbar__right">
// // // //                         {assessment?.isOpenBook && assessment?.referenceManualUrl && <button type="button" className="ap-topbar-manual-btn ap-topbar-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')}><FileArchive size={16} /> <span className="ap-hide-mobile">View Manual</span></button>}
// // // //                         {isGloballyLocked && <button type="button" className="ap-topbar-print-btn" onClick={() => window.print()}><Printer size={16} /> <span className="ap-hide-mobile">Print Audit</span></button>}
// // // //                         {!isGloballyLocked && !isPracticalModule && timeLeft !== null && <div className={`ap-timer${timeLeft < 300 ? ' ap-timer--warning' : ''}`}><Timer size={14} /> {formatTime(timeLeft)}</div>}
// // // //                         {isGloballyLocked && !isPracticalModule && submission?.startedAt && submission?.submittedAt && <div className="ap-timer" style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' }}><Timer size={14} /> {formatTime(Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000))} taken</div>}
// // // //                         {!isGloballyLocked && isPracticalModule && <div className="ap-timer ap-timer--untimed ap-hide-mobile"><Info size={13} /> {assessment?.moduleType === 'workplace' ? 'Workplace Logbook' : 'Untimed Task'}</div>}
// // // //                         <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''} ap-hide-mobile`}>{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving…</> : <><CheckCircle size={12} /> Saved</>}</span>
// // // //                         <span className={`ap-status-badge${isGloballyLocked ? ' ap-status-badge--locked' : ' ap-status-badge--active'}`}>{displayStatus}</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className={`ap-player-body${isGloballyLocked && !isAwaitingSignoff ? ' is-locked' : ''}`}>
// // // //                     <nav className={`ap-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
// // // //                         <button type="button" className="ap-close-btn" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
// // // //                         <div className="ap-sidebar__meta-block">
// // // //                             <div className="ap-sidebar__meta-title">
// // // //                                 <MathRenderedContent html={assessment.title} style={{ color: '#ffffff', display: 'inline-block' }} />
// // // //                             </div>
// // // //                             {submission?.attemptNumber > 1 && <div className="ap-sidebar__detail ap-sidebar__detail--highlight"><RotateCcw size={11} /> Attempt #{submission.attemptNumber}</div>}
// // // //                             <div className="ap-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
// // // //                             {!isWorkplaceModule ? <div className="ap-sidebar__detail"><Scale size={11} /> {assessment.totalMarks} Total Marks</div> : <div className="ap-sidebar__detail"><Scale size={11} /> Competency-Based (C / NYC)</div>}
// // // //                             {!isWorkplaceModule && <div className="ap-sidebar__chip"><Award size={11} /> Pass: 60%</div>}
// // // //                         </div>

// // // //                         {!isWorkplaceModule && isFacDone && (
// // // //                             <div className={`ap-score-card${isModDone ? ' ap-score-card--verified' : ''}`}>
// // // //                                 <div className="ap-score-card__stripe" aria-hidden="true" />
// // // //                                 <div className="ap-score-card__state">{isModDone ? <><Award size={12} className="ap-score-card__state-icon ap-score-card__state-icon--verified" /> Final Verified Score</> : <><Clock size={12} className="ap-score-card__state-icon" /> Provisional Score</>}</div>
// // // //                                 <div className="ap-score-card__body">
// // // //                                     <div className="ap-score-card__ring-wrap">
// // // //                                         <ProgressRing progress={grandTotalPct} size={72} strokeWidth={5} color={isModDone ? 'var(--mlab-green)' : 'var(--mlab-blue)'} />
// // // //                                         <span className={`ap-score-card__pct${isModDone ? ' ap-score-card__pct--verified' : ''}`}>{grandTotalPct}%</span>
// // // //                                     </div>
// // // //                                     <div className="ap-score-card__divider" aria-hidden="true" />
// // // //                                     <div className="ap-score-card__fraction">
// // // //                                         <span className="ap-score-card__awarded">{grandTotalAwarded}</span>
// // // //                                         <span className="ap-score-card__max">/ {assessment?.totalMarks || grandTotalMax} marks</span>
// // // //                                         <span className="ap-score-card__pass-note">Pass mark: {Math.ceil((assessment?.totalMarks || grandTotalMax) * 0.6)} (60%)</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 {isModDone && outcome && <div className={`ap-score-card__result${outcome.isCompetent ? ' ap-score-card__result--c' : ' ap-score-card__result--nyc'}`}>{outcome.isCompetent ? <><CheckCircle size={13} /> Competent (C)</> : <><AlertCircle size={13} /> Not Yet Competent (NYC)</>}</div>}
// // // //                             </div>
// // // //                         )}

// // // //                         {!['not_started', 'in_progress'].includes(submission.status) && !isAwaitingSignoff && (
// // // //                             <>
// // // //                                 <div className="ap-sidebar__label">Status Tracking</div>
// // // //                                 <div className="ap-sidebar__status-box">
// // // //                                     {isAssDone && outcome ? (
// // // //                                         <div className="ap-sidebar__outcome-card" style={{ borderLeftColor: outcome.color }}>
// // // //                                             <div className="ap-sidebar__outcome-val" style={{ color: outcome.color }}>{outcome.label}</div>
// // // //                                             {!isWorkplaceModule && outcome.score !== undefined && <div className="ap-sidebar__outcome-score">{outcome.score} / {assessment.totalMarks} marks · {outcome.percentage}%</div>}
// // // //                                             {isWorkplaceModule && <div className="ap-sidebar__outcome-score">Competency-Based Assessment</div>}
// // // //                                             <div className="ap-sidebar__outcome-note">{outcome.subtext}</div>
// // // //                                         </div>
// // // //                                     ) : (
// // // //                                         <div className="ap-sidebar__awaiting">
// // // //                                             <Clock size={20} color="rgba(255,255,255,0.25)" />
// // // //                                             <span className="ap-sidebar__awaiting__title">Pending Outcome</span>
// // // //                                             <span className="ap-sidebar__awaiting__sub">The Assessor has not yet finalised your results.</span>
// // // //                                         </div>
// // // //                                     )}
// // // //                                     {isFacDone && submission.grading?.facilitatorOverallFeedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--fac"><strong className="ap-sidebar__feedback__heading"><Info size={11} /> {savedFacRole === 'mentor' ? 'Mentor Verification Summary' : 'Facilitator Summary'}</strong><p className="ap-sidebar__feedback__text">{submission.grading.facilitatorOverallFeedback}</p></div>}
// // // //                                     {isAssDone && (submission.grading?.assessorOverallFeedback || submission.grading?.overallFeedback) && <div className="ap-sidebar__feedback ap-sidebar__feedback--ass"><strong className="ap-sidebar__feedback__heading"><MessageSquare size={11} /> Assessor Remarks</strong><p className="ap-sidebar__feedback__text">{submission.grading.assessorOverallFeedback || submission.grading.overallFeedback}</p></div>}
// // // //                                     {isModDone && submission.moderation?.feedback && <div className="ap-sidebar__feedback ap-sidebar__feedback--mod"><strong className="ap-sidebar__feedback__heading"><ShieldCheck size={11} /> QA Endorsement Notes</strong><p className="ap-sidebar__feedback__text">{submission.moderation.feedback}</p></div>}

// // // //                                     <div className="ap-sidebar__timeline-item">
// // // //                                         <div className={`ap-sidebar__timeline-icon${isFacDone ? ' ap-sidebar__timeline-icon--done' : ''}`}>
// // // //                                             <UserCheck size={13} />
// // // //                                         </div>
// // // //                                         <div className="ap-sidebar__timeline-content">
// // // //                                             <span className="ap-sidebar__timeline-title">
// // // //                                                 {savedFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Review'}
// // // //                                             </span>
// // // //                                             <span className="ap-sidebar__timeline-desc">
// // // //                                                 {isFacDone
// // // //                                                     ? `Completed ${getSafeDate(submission.grading?.facilitatorReviewedAt)}`
// // // //                                                     : isViolation
// // // //                                                         ? 'Pending Facilitator Review (Violation Flagged)'
// // // //                                                         : isMissed
// // // //                                                             ? 'Pending Staff Review (Missed)'
// // // //                                                             : savedFacRole === 'mentor' ? 'Waiting for Mentor' : 'Waiting for Facilitator'}
// // // //                                             </span>
// // // //                                         </div>
// // // //                                     </div>

// // // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isAssDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><Award size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Assessor Grading</span><span className="ap-sidebar__timeline-desc">{isAssDone ? `Assessed ${getSafeDate(submission.grading?.gradedAt)}` : 'Waiting for Assessor'}</span></div></div>
// // // //                                     <div className="ap-sidebar__timeline-item"><div className={`ap-sidebar__timeline-icon${isModDone ? ' ap-sidebar__timeline-icon--done' : ''}`}><ShieldCheck size={13} /></div><div className="ap-sidebar__timeline-content"><span className="ap-sidebar__timeline-title">Internal Moderation</span><span className="ap-sidebar__timeline-desc">{isModDone ? `${submission.moderation?.outcome === 'Returned' ? 'Returned to Assessor' : 'Endorsed'} ${getSafeDate(submission.moderation?.moderatedAt)}` : 'Awaiting QA Verification'}</span></div></div>

// // // //                                     {(facilitatorProfile?.bookingUrl || assessorProfile?.bookingUrl) && (
// // // //                                         <div className="ap-sidebar__booking-card" style={{ marginTop: '1.5rem', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 'bold' }}>
// // // //                                                 <Calendar size={14} color="#3b82f6" /> Schedule a Check-in
// // // //                                             </div>
// // // //                                             <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
// // // //                                                 Need help understanding your feedback or planning your next steps? Book a 1-on-1 session.
// // // //                                             </p>
// // // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                                                 {facilitatorProfile?.bookingUrl && (
// // // //                                                     <a href={facilitatorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// // // //                                                         Book with Facilitator
// // // //                                                     </a>
// // // //                                                 )}
// // // //                                                 {assessorProfile?.bookingUrl && !facilitatorProfile?.bookingUrl && (
// // // //                                                     <a href={assessorProfile.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ef4444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none', transition: 'background 0.2s' }}>
// // // //                                                         Book with Assessor
// // // //                                                     </a>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>
// // // //                             </>
// // // //                         )}

// // // //                         <div className="ap-sidebar__label">Workbook Contents</div>
// // // //                         <div className="ap-sidebar__nav">
// // // //                             {navItems.map((item: any) =>
// // // //                                 item.type === 'section'
// // // //                                     ? <span key={item.id} className="ap-sidebar__nav-item ap-sidebar__nav-item--section">{item.label}</span>
// // // //                                     : <a key={item.id} href={`#block-${item.id}`} className="ap-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
// // // //                             )}
// // // //                         </div>
// // // //                     </nav>

// // // //                     <div className="ap-player-content print-pane">
// // // //                         <div className="ap-blocks">

// // // //                             {/* 🚀 SECURITY VIOLATION BANNER FOR LEARNERS */}
// // // //                             {submission?.status === 'violation' && (
// // // //                                 <div className="lfm-error-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', margin: '1rem' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// // // //                                         <div className="lfm-fg" style={{ flex: 1, minWidth: '300px' }}>
// // // //                                             <div className="lfm-section-hdr" style={{ color: '#991b1b', borderColor: 'var(--mlab-red)', marginBottom: '0.5rem' }}>
// // // //                                                 <ShieldAlert size={18} /> Security Violation Detected
// // // //                                             </div>
// // // //                                             <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
// // // //                                                 This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured and logged. Your invigilator has been notified.
// // // //                                             </p>
// // // //                                             {submission?.systemNote && (
// // // //                                                 <div className="lfm-flags-panel" style={{ background: '#ffffff', borderColor: '#fecaca', borderLeftColor: 'var(--mlab-red)' }}>
// // // //                                                     <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</span>
// // // //                                                     <p style={{ margin: 0, fontStyle: 'italic', color: '#7f1d1d' }}>
// // // //                                                         "{submission.systemNote}"
// // // //                                                     </p>
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             )}
// // // //                             {assessment.blocks?.map((block: any) => {

// // // //                                 if (block.type === 'section') {
// // // //                                     const totals = sectionTotals[block.id];
// // // //                                     return (
// // // //                                         <div key={block.id} id={`block-${block.id}`} className="ap-block-section">
// // // //                                             <span>{block.title}</span>
// // // //                                             {isAssDone && totals && totals.total > 0 && <span className="no-print ap-block-section__score"><BarChart size={13} /> {totals.awarded}/{totals.total}</span>}
// // // //                                             {block.content && <MathRenderedContent html={block.content} className="ap-block-section__content" />}
// // // //                                             {renderBlockImage(block)}
// // // //                                             {renderBlockFile(block)}
// // // //                                         </div>
// // // //                                     );
// // // //                                 }

// // // //                                 if (block.type === 'info') return (
// // // //                                     <div key={block.id} id={`block-${block.id}`} className="ap-block-info">
// // // //                                         <div className="ap-block-info__label"><Info size={13} /> {block.title || 'Reading Material'}</div>
// // // //                                         <MathRenderedContent html={block.content} className="ap-block-info__text" style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
// // // //                                         {renderBlockImage(block)}
// // // //                                         {renderBlockFile(block)}
// // // //                                     </div>
// // // //                                 );

// // // //                                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// // // //                                     qNum++;
// // // //                                     const { score: blockScore, facFeedback, assFeedback, modFeedback, facIsCorrect, assIsCorrect, modIsCorrect, criteriaResults } = getBlockGrading(block.id);
// // // //                                     const learnerAns = answers[block.id];
// // // //                                     let inkColor = '#64748b';
// // // //                                     if (isModDone) inkColor = 'var(--mlab-green)';
// // // //                                     else if (isAssDone) inkColor = 'var(--mlab-red)';
// // // //                                     else if (isFacDone && !isAwaitingSignoff) inkColor = '#3b82f6';

// // // //                                     const isWEBlock = ['qcto_workplace', 'logbook', 'checklist'].includes(block.type) && isWorkplaceModule;
// // // //                                     const markLabel = isWEBlock ? 'Competency Based' : (isFacDone && blockScore !== undefined && blockScore !== null ? `${blockScore} / ${block.marks || 0}` : `${block.marks || 0} Marks`);

// // // //                                     const typeChipClass = block.type === 'checklist' ? 'ap-block-type-chip--chk' : block.type === 'logbook' ? 'ap-block-type-chip--log' : block.type === 'qcto_workplace' ? 'ap-block-type-chip--qcto' : block.type === 'code_sandbox' ? 'ap-block-type-chip--code' : block.type === 'mathpad' ? 'ap-block-type-chip--math' : block.type === 'graph' ? 'ap-block-type-chip--graph' : block.type === 'task' ? 'ap-block-type-chip--task' : 'ap-block-type-chip--q';
// // // //                                     const typeLabel = block.type === 'checklist' ? 'CHK' : block.type === 'logbook' ? 'LOG' : block.type === 'qcto_workplace' ? 'QCTO' : block.type === 'code_sandbox' ? 'IDE' : block.type === 'mathpad' ? 'MATH' : block.type === 'graph' ? 'PLOT' : `Q${qNum}.`;

// // // //                                     const isSectionVerified = isBlockVerified(block.id);
// // // //                                     const isUploadLocked = isAwaitingSignoff ? false : (isGloballyLocked || isSectionVerified);

// // // //                                     return (
// // // //                                         <div key={block.id} id={`block-${block.id}`} className={`ap-block-question${isUploadLocked && !isAwaitingSignoff ? ' ap-block-question--locked' : ''}`}>
// // // //                                             <div className="ap-block-question__header">
// // // //                                                 <div className="ap-block-question__text-wrap">
// // // //                                                     <span className="ap-block-question__text" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// // // //                                                         <span className={`ap-block-type-chip ${typeChipClass}`} style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>{typeLabel}</span>

// // // //                                                         {block.type === 'qcto_workplace' ? (
// // // //                                                             <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} />
// // // //                                                         ) : block.type === 'code_sandbox' ? (
// // // //                                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// // // //                                                                 {block.title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{block.title}</h3>}
// // // //                                                                 {block.question && <MathRenderedContent html={block.question} style={{ color: '#334155' }} />}
// // // //                                                             </div>
// // // //                                                         ) : block.question ? (
// // // //                                                             <MathRenderedContent html={block.question} />
// // // //                                                         ) : block.title ? (
// // // //                                                             <MathRenderedContent html={block.title} />
// // // //                                                         ) : null}
// // // //                                                     </span>
// // // //                                                     <div className="ap-grade-indicators">
// // // //                                                         {isFacDone && !isAwaitingSignoff && facIsCorrect !== null && facIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--fac">{facIsCorrect ? <Check size={16} color="#0284c7" strokeWidth={3} /> : <X size={16} color="#0284c7" strokeWidth={3} />}</div>}
// // // //                                                         {isAssDone && assIsCorrect !== null && assIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--ass">{assIsCorrect ? <Check size={16} color="#ef4444" strokeWidth={3} /> : <X size={16} color="#ef4444" strokeWidth={3} />}</div>}
// // // //                                                         {isModDone && modIsCorrect !== null && modIsCorrect !== undefined && <div className="ap-grade-indicator ap-grade-indicator--mod">{modIsCorrect ? <Check size={16} color="#22c55e" strokeWidth={3} /> : <X size={16} color="#22c55e" strokeWidth={3} />}</div>}
// // // //                                                     </div>
// // // //                                                 </div>
// // // //                                                 <span className="ap-block-question__marks" style={{ color: inkColor }}>{markLabel}</span>
// // // //                                             </div>

// // // //                                             <div className="ap-block-question__body">
// // // //                                                 {renderBlockImage(block)}
// // // //                                                 {renderBlockFile(block)}

// // // //                                                 {/* MCQ */}
// // // //                                                 {block.type === 'mcq' && (
// // // //                                                     <div className="ap-mcq-options">
// // // //                                                         {block.options?.map((opt: string, i: number) => {
// // // //                                                             const selected = learnerAns === i;
// // // //                                                             return (
// // // //                                                                 <label key={i} className={['ap-mcq-label', selected ? 'ap-mcq-label--selected' : '', isUploadLocked || !canEditTask ? 'ap-mcq-label--locked' : ''].filter(Boolean).join(' ')}>
// // // //                                                                     <input type="radio" name={`mcq-${block.id}`} checked={selected} disabled={isUploadLocked || !canEditTask} onChange={() => handleAnswerChange(block.id, i)} />
// // // //                                                                     <span className="ap-mcq-label__letter">{String.fromCharCode(65 + i)}.</span>
// // // //                                                                     <span className="ap-mcq-label__text">{opt}</span>
// // // //                                                                 </label>
// // // //                                                             );
// // // //                                                         })}
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* TEXT */}
// // // //                                                 {block.type === 'text' && (
// // // //                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // // //                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// // // //                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) || '<em>No answer provided.</em>' }} />
// // // //                                                         ) : (
// // // //                                                             <ReactQuill theme="snow" value={learnerAns || ''} onChange={c => handleAnswerChange(block.id, c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your detailed response here…'} />
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* CARTESIAN ENGINE GRAPH BLOCK */}
// // // //                                                 {block.type === 'graph' && (
// // // //                                                     <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // // //                                                         <AxisWorkspace
// // // //                                                             value={learnerAns || { points: [], shapes: [] }}
// // // //                                                             onChange={(val) => handleAnswerChange(block.id, val)}
// // // //                                                             readOnly={isUploadLocked || !canEditTask}
// // // //                                                         />
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* MATHPAD WITH TABS */}
// // // //                                                 {block.type === 'mathpad' && (() => {
// // // //                                                     const itemAns = typeof learnerAns === 'string'
// // // //                                                         ? { equation: learnerAns }
// // // //                                                         : (learnerAns || {});

// // // //                                                     const mathTabs = [
// // // //                                                         { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', allowed: true, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
// // // //                                                         { id: 'graph', icon: <LineChart size={13} />, label: 'Graphing Calculator', allowed: block.allowGraphing !== false, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } },
// // // //                                                         { id: 'draw', icon: <Pencil size={13} />, label: 'Whiteboard Canvas', allowed: block.allowDrawing !== false, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } }
// // // //                                                     ].filter(t => t.allowed);

// // // //                                                     const activeTabId = activeTabs[block.id] || mathTabs[0]?.id;

// // // //                                                     return (
// // // //                                                         <div className="ap-evidence-container">
// // // //                                                             {mathTabs.length > 1 && (
// // // //                                                                 <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // // //                                                                     {mathTabs.map(t => {
// // // //                                                                         const isActive = activeTabId === t.id;
// // // //                                                                         const isDone = ((t.id === 'equation' && itemAns.equation) || (t.id === 'graph' && itemAns.graphState?.points?.length > 0) || (t.id === 'draw' && itemAns.drawingUrl));
// // // //                                                                         return (
// // // //                                                                             <button
// // // //                                                                                 key={t.id}
// // // //                                                                                 type="button"
// // // //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// // // //                                                                                 style={{
// // // //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // // //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // // //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // // //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // // //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // // //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // // //                                                                                     transition: 'all 0.2s ease',
// // // //                                                                                     opacity: isActive ? 1 : 0.7,
// // // //                                                                                     whiteSpace: 'nowrap'
// // // //                                                                                 }}
// // // //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // // //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // // //                                                                             >
// // // //                                                                                 {t.icon} {t.label} {isDone && <CheckCircle size={12} />}
// // // //                                                                             </button>
// // // //                                                                         );
// // // //                                                                     })}
// // // //                                                                 </div>
// // // //                                                             )}
// // // //                                                             <div className="ap-tab-panel">
// // // //                                                                 {activeTabId === 'equation' && (
// // // //                                                                     <div onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // // //                                                                         <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '8px 12px', borderRadius: mathTabs.length > 1 ? '6px 6px 0 0' : '6px 6px 0 0', borderBottom: 'none', color: '#be185d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
// // // //                                                                             <Sigma size={14} /> Mathematical Workspace (Click inside to open Virtual Keyboard)
// // // //                                                                         </div>
// // // //                                                                         <MathpadEditor
// // // //                                                                             value={itemAns.equation || ''}
// // // //                                                                             onChange={(val) => handleAnswerChange(block.id, { ...itemAns, equation: val })}
// // // //                                                                             readOnly={isUploadLocked || !canEditTask}
// // // //                                                                         />
// // // //                                                                     </div>
// // // //                                                                 )}
// // // //                                                                 {activeTabId === 'graph' && (
// // // //                                                                     <AxisWorkspace
// // // //                                                                         value={itemAns.graphState}
// // // //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, graphState: val })}
// // // //                                                                         readOnly={isUploadLocked || !canEditTask}
// // // //                                                                     />
// // // //                                                                 )}
// // // //                                                                 {activeTabId === 'draw' && (
// // // //                                                                     <DrawingWorkspace
// // // //                                                                         value={itemAns.drawingUrl}
// // // //                                                                         onChange={(val) => handleAnswerChange(block.id, { ...itemAns, drawingUrl: val })}
// // // //                                                                         readOnly={isUploadLocked || !canEditTask}
// // // //                                                                         blockId={block.id}
// // // //                                                                         submissionId={submission.id}
// // // //                                                                         toast={toast}
// // // //                                                                         setSaving={setSaving}
// // // //                                                                     />
// // // //                                                                 )}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     );
// // // //                                                 })()}

// // // //                                                 {/* TASK WITH OPTIONAL IDE */}
// // // //                                                 {block.type === 'task' && (() => {
// // // //                                                     const itemAns = learnerAns || {};

// // // //                                                     const taskTabs = [
// // // //                                                         { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // // //                                                         { id: 'audio', icon: <Mic size={13} />, label: 'Audio', allowed: block.allowAudio === true, val: itemAns.audioUrl, theme: { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', activeBg: '#f3e8ff' } },
// // // //                                                         { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // // //                                                         { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // // //                                                         { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // // //                                                     ].filter(t => t.allowed);

// // // //                                                     const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;
// // // //                                                     const progress = uploadProgress[block.id];

// // // //                                                     const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // // //                                                     const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // // //                                                     return (
// // // //                                                         <div className="ap-evidence-container">
// // // //                                                             {!isSectionVerified && !isGloballyLocked && <div className="ap-evidence-lock-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', marginBottom: '10px' }}><Info size={14} /> You may attach your evidence now. This section will lock automatically once your Facilitator/Mentor verifies it.</div>}
// // // //                                                             {isSectionVerified && !isGloballyLocked && !isAwaitingSignoff && <div className="ap-checklist__lock-notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><Lock size={14} color="#166534" />Evidence Locked: A facilitator has officially verified this section. You can no longer alter these files.</div>}

// // // //                                                             {taskTabs.length > 1 && (
// // // //                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // // //                                                                     {taskTabs.map(t => {
// // // //                                                                         const isActive = activeTabId === t.id;
// // // //                                                                         return (
// // // //                                                                             <button
// // // //                                                                                 key={t.id}
// // // //                                                                                 type="button"
// // // //                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// // // //                                                                                 style={{
// // // //                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // // //                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // // //                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // // //                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // // //                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // // //                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // // //                                                                                     transition: 'all 0.2s ease',
// // // //                                                                                     opacity: isActive ? 1 : 0.7
// // // //                                                                                 }}
// // // //                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // // //                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // // //                                                                             >
// // // //                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // // //                                                                             </button>
// // // //                                                                         );
// // // //                                                                     })}
// // // //                                                                 </div>
// // // //                                                             )}

// // // //                                                             <div className="ap-tab-panel">
// // // //                                                                 {activeTabId === 'text' && <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} /> : <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleTaskAnswerChange(block.id, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder={isUploadLocked || !canEditTask ? 'No answer provided.' : 'Type your answer here…'} />}</div>}
// // // //                                                                 {activeTabId === 'audio' && (itemAns.audioUrl ? <audio controls src={itemAns.audioUrl} style={{ width: '100%' }} /> : <div className="ap-upload-empty ap-upload-empty--simple">{isUploadLocked || !canEditTask ? 'No audio recorded.' : 'Audio recorder will appear here.'}</div>)}
// // // //                                                                 {activeTabId === 'url' && <div>{!isUploadLocked && canEditTask && <div className="ap-url-note"><strong>Note:</strong> Ensure Google Drive links are set to <em>"Anyone with the link can view"</em>.</div>}{itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleTaskAnswerChange(block.id, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}</div>}
// // // //                                                                 {activeTabId === 'upload' && (progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleTaskAnswerChange(block.id, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : <div className="ap-upload-empty">{isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <><p className="ap-upload-empty__hint">Select a file (Allowed: {block.allowedFileTypes || 'Any'}, Max {MAX_FILE_SIZE_MB}MB)</p><input type="file" onChange={e => handleFileValidationAndUpload(e, block.id)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} /></>}</div>)}

// // // //                                                                 {/* 🚀 LIVE IDE SANDBOX ON TASK BLOCK */}
// // // //                                                                 {activeTabId === 'code' && (
// // // //                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// // // //                                                                         <CodeSandboxPlayer
// // // //                                                                             block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
// // // //                                                                             learnerAns={mappedCodeData}
// // // //                                                                             readOnly={isUploadLocked || !canEditTask}
// // // //                                                                             onChange={async (val) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// // // //                                                                         />
// // // //                                                                     </div>
// // // //                                                                 )}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     );
// // // //                                                 })()}

// // // //                                                 {/* CHECKLIST */}
// // // //                                                 {block.type === 'checklist' && (
// // // //                                                     <div className="ap-checklist">
// // // //                                                         <p className="ap-checklist__info"><Info size={14} style={{ flexShrink: 0 }} /> Your Mentor/Assessor evaluates each item.</p>
// // // //                                                         {block.criteria?.map((crit: string, i: number) => {
// // // //                                                             const res = criteriaResults?.[i] || {};

// // // //                                                             const nestedKey = `evidence_${i}`;
// // // //                                                             const itemAns = learnerAns?.[nestedKey] || {};

// // // //                                                             const evidenceTabs = [
// // // //                                                                 { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: block.allowText !== false, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // // //                                                                 { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: block.allowUrl !== false, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // // //                                                                 { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: block.allowUpload !== false, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // // //                                                                 { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: block.allowCode !== false, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // // //                                                             ].filter(t => t.allowed);

// // // //                                                             const tabStateKey = `${block.id}_${nestedKey}`;
// // // //                                                             const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// // // //                                                             const progress = uploadProgress[`${block.id}_${nestedKey}`];

// // // //                                                             const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // // //                                                             const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // // //                                                             return (
// // // //                                                                 <div key={i} className="ap-checklist__item">
// // // //                                                                     <p className="ap-checklist__item-title">{i + 1}. {crit}</p>

// // // //                                                                     {block.requireEvidencePerCriterion !== false && (
// // // //                                                                         <div className="ap-evidence-container" style={{ marginTop: '10px', marginBottom: '15px' }}>
// // // //                                                                             {evidenceTabs.length > 1 && (
// // // //                                                                                 <div className="no-print" style={{ paddingLeft: 8, paddingTop: 8, paddingRight: 8, display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // // //                                                                                     {evidenceTabs.map(t => {
// // // //                                                                                         const isActive = activeTabId === t.id;
// // // //                                                                                         return (
// // // //                                                                                             <button
// // // //                                                                                                 key={t.id}
// // // //                                                                                                 type="button"
// // // //                                                                                                 onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// // // //                                                                                                 style={{
// // // //                                                                                                     display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // // //                                                                                                     background: isActive ? t.theme.activeBg : t.theme.bg,
// // // //                                                                                                     padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // // //                                                                                                     border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // // //                                                                                                     cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // // //                                                                                                     boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // // //                                                                                                     transition: 'all 0.2s ease',
// // // //                                                                                                     opacity: isActive ? 1 : 0.7
// // // //                                                                                                 }}
// // // //                                                                                                 onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // // //                                                                                                 onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // // //                                                                                             >
// // // //                                                                                                 {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // // //                                                                                             </button>
// // // //                                                                                         );
// // // //                                                                                     })}
// // // //                                                                                 </div>
// // // //                                                                             )}

// // // //                                                                             <div className="ap-tab-panel">
// // // //                                                                                 {activeTabId === 'text' && (
// // // //                                                                                     <div className={`ap-quill-wrapper${isUploadLocked || !canEditTask ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // // //                                                                                         {isGloballyLocked && !isAwaitingSignoff ? (
// // // //                                                                                             <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', wordBreak: 'normal', overflowWrap: 'break-word' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// // // //                                                                                         ) : (
// // // //                                                                                             <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditTask} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// // // //                                                                                         )}
// // // //                                                                                     </div>
// // // //                                                                                 )}
// // // //                                                                                 {activeTabId === 'url' && (
// // // //                                                                                     <div>
// // // //                                                                                         {itemAns.url && (isUploadLocked || !canEditTask) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditTask} placeholder="https://…" />}
// // // //                                                                                     </div>
// // // //                                                                                 )}
// // // //                                                                                 {activeTabId === 'upload' && (
// // // //                                                                                     progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditTask ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditTask} /> : (
// // // //                                                                                         <div className="ap-upload-empty">
// // // //                                                                                             {isUploadLocked || !canEditTask ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// // // //                                                                                                 <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// // // //                                                                                                 <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditTask} style={{ fontSize: '0.82rem' }} />
// // // //                                                                                             </>}
// // // //                                                                                         </div>
// // // //                                                                                     )
// // // //                                                                                 )}

// // // //                                                                                 {activeTabId === 'code' && (
// // // //                                                                                     <div style={{ height: '600px', marginTop: '10px' }}>
// // // //                                                                                         <CodeSandboxPlayer
// // // //                                                                                             block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${crit}`, template: 'vanilla' }}
// // // //                                                                                             learnerAns={mappedCodeData}
// // // //                                                                                             readOnly={isUploadLocked || !canEditWorkplace}
// // // //                                                                                             onChange={async (val) => {
// // // //                                                                                                 const updatedAns = { ...answers[block.id] };
// // // //                                                                                                 const prevNested = updatedAns[nestedKey] || {};
// // // //                                                                                                 updatedAns[nestedKey] = { ...prevNested, codeData: val };
// // // //                                                                                                 handleAnswerChange(block.id, updatedAns);
// // // //                                                                                             }}
// // // //                                                                                         />
// // // //                                                                                     </div>
// // // //                                                                                 )}
// // // //                                                                             </div>
// // // //                                                                         </div>
// // // //                                                                     )}

// // // //                                                                     <div className="ap-checklist__assessor-row">
// // // //                                                                         {res.status ? (
// // // //                                                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                                                                 <div><span className={`ap-checklist__status-chip ${res.status === 'C' ? 'ap-checklist__status-chip--c' : 'ap-checklist__status-chip--nyc'}`}>{savedFacRole === 'mentor' ? (res.status === 'C' ? 'Observed ✓' : 'Not Observed ✗') : (res.status === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)')}</span></div>
// // // //                                                                                 {res.comment && <span className="ap-checklist__assessor-comment">"{res.comment}"</span>}
// // // //                                                                             </div>
// // // //                                                                         ) : <span className="ap-checklist__status-chip ap-checklist__status-chip--pending">Pending Observation</span>}
// // // //                                                                     </div>
// // // //                                                                 </div>
// // // //                                                             );
// // // //                                                         })}
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* LOGBOOK */}
// // // //                                                 {block.type === 'logbook' && (
// // // //                                                     <div className="ap-logbook">
// // // //                                                         <MathRenderedContent html={block.content} className="ap-logbook__desc" />
// // // //                                                         <table className="ap-logbook__table">
// // // //                                                             <thead className="ap-logbook__thead"><tr><th>Date</th><th>Assignment Task</th><th>Start</th><th>Finish</th><th style={{ width: '80px' }}>Hours</th>{!isUploadLocked && canEditLogbook && <th style={{ width: '40px' }}></th>}</tr></thead>
// // // //                                                             <tbody>
// // // //                                                                 {(Array.isArray(learnerAns) ? learnerAns : []).map((entry: any, i: number) => (
// // // //                                                                     <tr key={i} className="ap-logbook__tbody">
// // // //                                                                         <td className="ap-logbook__td"><input type="date" className="ap-logbook__input" value={entry.date} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].date = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // // //                                                                         <td className="ap-logbook__td ap-logbook__task-cell"><div className={`ap-quill-wrapper ap-quill-wrapper--logbook${isUploadLocked || !canEditLogbook ? ' locked' : ''}`}>{isGloballyLocked && !isAwaitingSignoff ? <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task described.</em>' }} /> : <ReactQuill theme="snow" value={entry.task || ''} onChange={v => { const n = [...learnerAns]; n[i].task = v; handleAnswerChange(block.id, n); }} readOnly={isUploadLocked || !canEditLogbook} modules={quillModules} formats={quillFormats} placeholder="Task description…" />}</div></td>
// // // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.startTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].startTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // // //                                                                         <td className="ap-logbook__td"><input type="time" className="ap-logbook__input" value={entry.endTime} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].endTime = e.target.value; handleAnswerChange(block.id, n); }} /></td>
// // // //                                                                         <td className="ap-logbook__td"><input type="number" className="ap-logbook__input" value={entry.hours} disabled={isUploadLocked || !canEditLogbook} onChange={e => { const n = [...learnerAns]; n[i].hours = Number(e.target.value); handleAnswerChange(block.id, n); }} /></td>
// // // //                                                                         {!isUploadLocked && canEditLogbook && <td className="ap-logbook__td"><button type="button" className="ap-logbook__remove-btn" onClick={() => handleAnswerChange(block.id, learnerAns.filter((_: any, idx: number) => idx !== i))}><Trash2 size={14} /></button></td>}
// // // //                                                                     </tr>
// // // //                                                                 ))}
// // // //                                                                 {!isUploadLocked && canEditLogbook && <tr><td colSpan={6} className="ap-logbook__add-row"><button type="button" className="ap-logbook__add-btn" onClick={() => handleAnswerChange(block.id, [...(Array.isArray(learnerAns) ? learnerAns : []), { date: '', task: '', startTime: '', endTime: '', hours: 0 }])}><Plus size={13} /> Add Logbook Entry</button></td></tr>}
// // // //                                                             </tbody>
// // // //                                                         </table>
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* QCTO WORKPLACE WITH FULL EVIDENCE SUPPORT & LIVE IDE */}
// // // //                                                 {block.type === 'qcto_workplace' && (
// // // //                                                     <div className="ap-workplace">
// // // //                                                         <MathRenderedContent html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }} />
// // // //                                                         {block.workActivities?.map((wa: any) => {
// // // //                                                             const waDecl = learnerAns?.[`wa_${wa.id}_declaration`] || false;
// // // //                                                             return (
// // // //                                                                 <div key={wa.id} className="ap-workplace__activity">
// // // //                                                                     <h4 className="ap-workplace__activity-title">{wa.code}: {wa.description}</h4>

// // // //                                                                     {wa.evidenceItems?.map((se: any) => {
// // // //                                                                         const nestedKey = `se_${se.id}`;
// // // //                                                                         const itemAns = learnerAns?.[nestedKey] || {};

// // // //                                                                         const evidenceTabs = [
// // // //                                                                             { id: 'text', icon: <FileText size={13} />, label: 'Rich Text', allowed: true, val: itemAns.text, theme: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', activeBg: '#dbeafe' } },
// // // //                                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Link', allowed: true, val: itemAns.url, theme: { text: '#0f766e', bg: '#f0fdfa', border: '#ccfbf1', activeBg: '#99f6e4' } },
// // // //                                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Upload', allowed: true, val: itemAns.uploadUrl, theme: { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', activeBg: '#ffedd5' } },
// // // //                                                                             { id: 'code', icon: <Code size={13} />, label: 'Live IDE', allowed: true, val: itemAns.codeData?.snapshot || itemAns.code, theme: { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', activeBg: '#e0e7ff' } }
// // // //                                                                         ];

// // // //                                                                         const tabStateKey = `${block.id}_${nestedKey}`;
// // // //                                                                         const activeTabId = activeTabs[tabStateKey] || evidenceTabs[0]?.id;
// // // //                                                                         const progress = uploadProgress[`${block.id}_${nestedKey}`];

// // // //                                                                         const legacyCode = typeof itemAns.code === 'string' ? itemAns.code : undefined;
// // // //                                                                         const mappedCodeData = itemAns.codeData || (legacyCode ? { snapshot: JSON.stringify({ '/index.js': legacyCode }) } : undefined);

// // // //                                                                         return (
// // // //                                                                             <div key={se.id} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
// // // //                                                                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>{se.code}: {se.description}</div>
// // // //                                                                                 <div className="ap-evidence-container">
// // // //                                                                                     {evidenceTabs.length > 1 && (
// // // //                                                                                         <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
// // // //                                                                                             {evidenceTabs.map(t => {
// // // //                                                                                                 const isActive = activeTabId === t.id;
// // // //                                                                                                 return (
// // // //                                                                                                     <button
// // // //                                                                                                         key={t.id}
// // // //                                                                                                         type="button"
// // // //                                                                                                         onClick={() => setActiveTabs({ ...activeTabs, [tabStateKey]: t.id })}
// // // //                                                                                                         style={{
// // // //                                                                                                             display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// // // //                                                                                                             background: isActive ? t.theme.activeBg : t.theme.bg,
// // // //                                                                                                             padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// // // //                                                                                                             border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// // // //                                                                                                             cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// // // //                                                                                                             boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// // // //                                                                                                             transition: 'all 0.2s ease',
// // // //                                                                                                             opacity: isActive ? 1 : 0.7
// // // //                                                                                                         }}
// // // //                                                                                                         onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// // // //                                                                                                         onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// // // //                                                                                                     >
// // // //                                                                                                         {t.icon} {t.label} {!!t.val && <CheckCircle size={12} />}
// // // //                                                                                                     </button>
// // // //                                                                                                 );
// // // //                                                                                             })}
// // // //                                                                                         </div>
// // // //                                                                                     )}

// // // //                                                                                     <div className="ap-tab-panel">
// // // //                                                                                         {activeTabId === 'text' && (
// // // //                                                                                             <div className={`ap-quill-wrapper${isUploadLocked || !canEditWorkplace ? ' locked' : ''}`} onCopyCapture={preventCopyPasteAndDrop} onCutCapture={preventCopyPasteAndDrop} onPasteCapture={preventCopyPasteAndDrop} onDropCapture={preventCopyPasteAndDrop} onKeyDownCapture={preventCopyPasteAndDrop}>
// // // //                                                                                                 {isGloballyLocked && !isAwaitingSignoff ? (
// // // //                                                                                                     <div className="quill-read-only-content" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(itemAns.text) || '<em>No answer provided.</em>' }} />
// // // //                                                                                                 ) : (
// // // //                                                                                                     <ReactQuill theme="snow" value={itemAns.text || ''} onChange={c => handleNestedAnswerChange(block.id, nestedKey, 'text', c)} readOnly={isUploadLocked || !canEditWorkplace} modules={quillModules} formats={quillFormats} placeholder="Type your evidence here…" />
// // // //                                                                                                 )}
// // // //                                                                                             </div>
// // // //                                                                                         )}
// // // //                                                                                         {activeTabId === 'url' && (
// // // //                                                                                             <div>
// // // //                                                                                                 {itemAns.url && (isUploadLocked || !canEditWorkplace) ? <UrlPreview url={itemAns.url} /> : <input type="url" className="ab-input" value={itemAns.url || ''} onChange={e => handleNestedAnswerChange(block.id, nestedKey, 'url', e.target.value)} disabled={isUploadLocked || !canEditWorkplace} placeholder="https://…" />}
// // // //                                                                                             </div>
// // // //                                                                                         )}
// // // //                                                                                         {activeTabId === 'upload' && (
// // // //                                                                                             progress !== undefined ? <UploadProgress progress={progress} /> : itemAns.uploadUrl ? <LearnerFilePreview url={itemAns.uploadUrl} onRemove={!isUploadLocked && canEditWorkplace ? () => handleNestedAnswerChange(block.id, nestedKey, 'uploadUrl', '') : undefined} disabled={isUploadLocked || !canEditWorkplace} /> : (
// // // //                                                                                                 <div className="ap-upload-empty">
// // // //                                                                                                     {isUploadLocked || !canEditWorkplace ? <span className="ap-upload-empty__hint">No file uploaded.</span> : <>
// // // //                                                                                                         <p className="ap-upload-empty__hint">Select a file (Max {MAX_FILE_SIZE_MB}MB)</p>
// // // //                                                                                                         <input type="file" onChange={e => handleFileValidationAndUpload(e, block.id, nestedKey)} disabled={isUploadLocked || !canEditWorkplace} style={{ fontSize: '0.82rem' }} />
// // // //                                                                                                     </>}
// // // //                                                                                                 </div>
// // // //                                                                                             )
// // // //                                                                                         )}

// // // //                                                                                         {activeTabId === 'code' && (
// // // //                                                                                             <div style={{ height: '600px', marginTop: '10px' }}>
// // // //                                                                                                 <CodeSandboxPlayer
// // // //                                                                                                     block={{ id: `${block.id}_${nestedKey}`, title: `Evidence: ${se.code}`, template: 'vanilla' }}
// // // //                                                                                                     learnerAns={mappedCodeData}
// // // //                                                                                                     readOnly={isUploadLocked || !canEditWorkplace}
// // // //                                                                                                     onChange={async (val) => {
// // // //                                                                                                         const updatedAns = { ...answers[block.id] };
// // // //                                                                                                         const prevNested = updatedAns[nestedKey] || {};
// // // //                                                                                                         updatedAns[nestedKey] = { ...prevNested, codeData: val };
// // // //                                                                                                         handleAnswerChange(block.id, updatedAns);
// // // //                                                                                                     }}
// // // //                                                                                                 />
// // // //                                                                                             </div>
// // // //                                                                                         )}
// // // //                                                                                     </div>
// // // //                                                                                 </div>
// // // //                                                                             </div>
// // // //                                                                         );
// // // //                                                                     })}

// // // //                                                                     <label className={`ap-workplace__declaration${waDecl ? ' ap-workplace__declaration--checked' : ''}`}>
// // // //                                                                         <input type="checkbox" disabled={isUploadLocked || !canEditWorkplace} checked={waDecl} onChange={e => handleTaskAnswerChange(block.id, `wa_${wa.id}_declaration`, e.target.checked)} />
// // // //                                                                         <span className="ap-workplace__declaration-label">I declare that this is correct evidence and the task was performed by me.</span>
// // // //                                                                     </label>
// // // //                                                                 </div>
// // // //                                                             );
// // // //                                                         })}
// // // //                                                     </div>
// // // //                                                 )}

// // // //                                                 {/* 🚀 STANDALONE CODE SANDBOX BLOCK */}
// // // //                                                 {block.type === 'code_sandbox' && (
// // // //                                                     isFetchingSnapshots ? (
// // // //                                                         <div className="ap-spinner-container" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
// // // //                                                             <Loader2 size={24} className="ap-spin" style={{ margin: '0 auto 10px auto' }} />
// // // //                                                             <p>Loading code environment...</p>
// // // //                                                         </div>
// // // //                                                     ) : (
// // // //                                                         <CodeSandboxPlayer
// // // //                                                             block={block}
// // // //                                                             learnerAns={{
// // // //                                                                 ...(learnerAns || {}),
// // // //                                                                 snapshot: resolvedSnapshots[block.id] || codeSnapshots[block.id] || learnerAns?.snapshot || learnerAns?.codeData?.snapshot
// // // //                                                             }}
// // // //                                                             readOnly={isUploadLocked || !canEditCode}
// // // //                                                             onChange={async (val: any) => await saveCodeSnapshot(block.id, val.snapshot, val.dependencies, val.immediate)}
// // // //                                                         />
// // // //                                                     )
// // // //                                                 )}

// // // //                                                 {/* Per-question feedback */}
// // // //                                                 {isFacDone && facFeedback && <div className="ap-qfeedback ap-qfeedback--fac"><span className="ap-qfeedback__label"><Info size={12} /> {savedFacRole === 'mentor' ? 'Mentor Observation' : 'Facilitator Coaching'}</span><p className="ap-qfeedback__text">{facFeedback}</p></div>}
// // // //                                                 {isAssDone && assFeedback && <div className="ap-qfeedback ap-qfeedback--ass"><span className="ap-qfeedback__label"><Award size={12} /> Assessor {isWorkplaceModule ? 'Evaluation' : 'Grade'}</span><p className="ap-qfeedback__text">{assFeedback}</p></div>}
// // // //                                                 {isModDone && modFeedback && <div className="ap-qfeedback ap-qfeedback--mod"><span className="ap-qfeedback__label"><ShieldCheck size={12} /> Moderator QA Notes</span><p className="ap-qfeedback__text">{modFeedback}</p></div>}
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     );
// // // //                                 }
// // // //                                 return null;
// // // //                             })}
// // // //                         </div>

// // // //                         {/* FOOTER */}
// // // //                         {isAwaitingSignoff ? (
// // // //                             <div className="ap-footer ap-footer--signoff no-print">
// // // //                                 <h3 className="ap-footer__title">{assessment?.moduleType === 'workplace' ? 'Workplace Module Completed' : 'Practical Observation Completed'}</h3>
// // // //                                 <p className="ap-footer__desc">{assessment?.moduleType === 'workplace' ? 'Your Workplace Mentor has verified your tasks. Ensure you have uploaded all required evidence, review their feedback, and sign off below.' : "Your Mentor/Facilitator has evaluated your practical tasks. Upload your evidence, review their feedback, and sign off."}</p>
// // // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // // //                                     <span className="ap-footer-declaration__text"><strong>Learner Observation Acknowledgement</strong> I have provided the required evidence, read the mentor's feedback, and acknowledge that this observation took place.</span>
// // // //                                 </label>
// // // //                                 <div className="ap-footer-actions">
// // // //                                     <button type="button" className="ap-btn ap-btn--amber" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Acknowledge &amp; Submit for Grading</button>
// // // //                                 </div>
// // // //                             </div>
// // // //                         ) : !isGloballyLocked ? (
// // // //                             <div className="ap-footer no-print">
// // // //                                 <h3 className="ap-footer__title">Final Submission</h3>
// // // //                                 <p className="ap-footer__desc">Review your answers carefully. Once submitted, this workbook cannot be edited.</p>
// // // //                                 <label className={`ap-footer-declaration${declarationChecked ? ' ap-footer-declaration--checked' : ''}`}>
// // // //                                     <input type="checkbox" checked={declarationChecked} onChange={e => setDeclarationChecked(e.target.checked)} />
// // // //                                     <span className="ap-footer-declaration__text"><strong>Learner Final Declaration</strong> I confirm that this is my own work, completed without unauthorised assistance.</span>
// // // //                                 </label>
// // // //                                 <div className="ap-footer-actions">
// // // //                                     <span className="ap-autosave-label">{saving ? <><div className="ap-spinner ap-spinner--sm" /> Saving changes…</> : <><CheckCircle size={14} color="var(--mlab-green)" /> Progress saved automatically</>}</span>
// // // //                                     <button type="button" className="ap-btn ap-btn--green" onClick={handleFooterSubmitClick} disabled={saving}><Save size={14} /> Submit for Grading</button>
// // // //                                 </div>
// // // //                             </div>
// // // //                         ) : (
// // // //                             <div className="ap-footer ap-footer--locked no-print">
// // // //                                 <div className="ap-footer--locked__icon-wrap">
// // // //                                     {isModDone && outcome?.isCompetent === false ? <AlertTriangle size={36} color="#d97706" /> : <CheckCircle size={36} color="var(--mlab-green)" />}
// // // //                                 </div>
// // // //                                 <h3 className="ap-footer--locked__title">{submission.autoSubmitted ? 'Time Expired — Auto Submitted' : 'Workbook Submitted'}</h3>
// // // //                                 <p className="ap-footer--locked__desc">This assessment was submitted on <strong>{getSafeDate(submission.submittedAt)}</strong>. It is currently under review by our faculty.</p>
// // // //                                 <button type="button" className="ap-btn ap-btn--primary" style={{ marginTop: '1rem' }} onClick={safeNavigateBack}><ArrowLeft size={14} /> Return to Portfolio</button>
// // // //                             </div>
// // // //                         )}
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </ProctoringWrapper>
// // // //     );
// // // // };

// // // // export default AssessmentPlayerContent;

