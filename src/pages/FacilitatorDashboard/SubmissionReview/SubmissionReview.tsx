// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query, where, onSnapshot, writeBatch, arrayUnion, getFirestore } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    ArrowLeft, CheckCircle, AlertCircle, Clock, Award, ShieldCheck, Printer, Info, Lock, Loader2, Scale, Undo2, ShieldAlert, Unlock, Users, FileArchive, Timer, Video, Save, X, Check, Edit3, Globe, Github, Figma, Smartphone, ExternalLink, Link as LinkIcon, Layers, FileText, Mic, UploadCloud, Code, CalendarRange, Play, Square, Award as AwardIcon, BarChart, Sigma, ChevronDown, ChevronUp,
    RefreshCw,
    Sparkles,
    MessageSquare,
    AlertTriangle
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './SubmissionReview.css';
import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { createPortal } from 'react-dom';
import { RemediationModal, ResolveAppealModal, ReturnToLearnerModal } from './SubmissionReview/SubmissionReviewModals';
import { type CriterionResult, type GradeData } from './SubmissionReview/SubmissionReviewBlocks';
import moment from 'moment';
import { GroupObservationMatrix } from './SubmissionReview/GroupObservationMatrix';
import { HistoryModal, type ProctorSession } from '../../../components/views/InvigilatorDashboard/InvigilatorDashboard';
import { ExcuseReopenModal } from './SubmissionReview/ExcuseReopenModal';

import { getStorage, ref as fbStorageRef, getDownloadURL } from 'firebase/storage';

import { CartesianPlane } from '@zakq/axisjs';
import "mathlive";
import katex from "katex";
import "katex/dist/katex.min.css";

import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
import { FilePreview, UrlPreview } from './SubmissionReview/SubmissionReviewPreviews';
import { LogbookHoursTally } from './SubmissionReview/SubmissionReviewHelpers';
import type { CompetencyStatus } from '../../Portfolio/ViewPortfolio';

(window as any).katex = katex;

const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];

// 🚀 ROBUST CSS WRAPPER TO PREVENT IDE OVERLAP
const ideWrapperStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 10,
    minHeight: '650px',
    height: 'auto',
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    overflow: 'visible',
    background: '#1e293b',
    display: 'flex',
    flexDirection: 'column',
    marginTop: '10px',
    marginBottom: '20px'
};

// ─── HELPER FOR EXTERNAL RESOURCE LINKS ─────────────────────────────────────
const renderResourceLinks = (links: any[]) => {
    if (!links || links.length === 0) return null;

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'live': return <Globe size={15} color="#10b981" />;
            case 'github': return <Github size={15} color="#6366f1" />;
            case 'apk': return <Smartphone size={15} color="#f59e0b" />;
            case 'figma': return <Figma size={15} color="#ec4899" />;
            case 'doc': return <FileText size={15} color="#06b6d4" />;
            default: return <LinkIcon size={15} color="#64748b" />;
        }
    };

    return (
        <div style={{ marginTop: '1rem', marginBottom: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                External Resources & Links
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {links.map((link: any, idx: number) => (
                    <div key={link.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', flexWrap: 'wrap' }}>
                        {getCategoryIcon(link.category)}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>{link.label}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {link.url} <ExternalLink size={12} />
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 🚀 HELPER FOR FULLSCREEN PORTAL MOUNTING
const getPortalTarget = (): HTMLElement => {
    const proctorRoot = document.getElementById('proctor-portal-root');
    if (proctorRoot) return proctorRoot;
    if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
    return document.body;
};

// ─── PROCTOR EVIDENCE INSPECTOR WRAPPER ─────────────────────────────────────
const SubmissionProctorEvidenceModal = ({ submission, onClose }: { submission: any; onClose: () => void }) => {
    const [session, setSession] = useState<ProctorSession | null>(null);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
                const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
                const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

                const sessionSnap = await getDoc(doc(db, 'live_proctor_sessions', sessionDocId));
                if (sessionSnap.exists()) {
                    setSession({ id: sessionSnap.id, ...sessionSnap.data() } as ProctorSession);
                } else {
                    setSession({
                        id: sessionDocId,
                        learnerId: targetLearnerUid,
                        learnerName: submission?.learnerDeclaration?.learnerName || 'Learner',
                        status: submission?.status === 'violation' ? 'violation' : 'offline',
                        latestWarning: submission?.systemNote || null,
                        lastHeartbeat: null,
                        violationHistory: submission?.violationHistory || []
                    });
                }
            } catch (e) {
                console.error("Failed to load proctoring session:", e);
            }
        };
        fetchSession();
    }, [submission]);

    if (!session) return null;

    return <HistoryModal session={session} onClose={onClose} />;
};

// ─── REVIEW STAGE CARD COMPONENT ─────────────────────────────────────────────
const ReviewStageCard = ({ colorTheme, title, status, lockedMessage, awaitingTitle, awaitingMessage, showScore, scoreAwarded, scoreMax, scorePct, activeControls, feedbackLabel, feedbackValue, onFeedbackChange, feedbackPlaceholder, signatureLabel, signatureUrl, signatureName, signatureDate, signatureMeta, signatureTagline, onSubmit, submitLabel, isSaving, timeOverrideValue, onTimeOverrideChange, autoTimeSeconds, autoSummedMinutes }: any) => {
    const colorHex = colorTheme === 'blue' ? 'blue' : colorTheme === 'red' ? 'red' : '#22c55e';
    const colorHexDark = colorTheme === 'blue' ? '#1e3a8a' : colorTheme === 'red' ? '#7f1d1d' : '#14532d';
    const bgLight = colorTheme === 'blue' ? '#eff6ff' : colorTheme === 'red' ? '#fef2f2' : '#f0fdf4';
    const themeVar = colorTheme === 'blue' ? 'blue' : `var(--mlab-${colorTheme})`;

    return (
        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid ${themeVar}` }}>
            <h3 className="sr-summary-title" style={{ color: themeVar }}>{title}</h3>
            {status === 'locked' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Lock size={24} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: '#334155', display: 'block', fontSize: '0.9rem' }}>Locked</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{lockedMessage}</p>
                </div>
            )}
            {status === 'awaiting' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Clock size={24} color={colorHex} style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: colorHexDark, display: 'block', fontSize: '0.9rem' }}>{awaitingTitle}</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{awaitingMessage}</p>
                </div>
            )}
            {(status === 'active' || status === 'done') && (
                <>
                    {showScore && (
                        <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                            <div className="sr-score-circle" style={{ borderColor: themeVar }}>
                                <span className="sr-score-val" style={{ color: themeVar }}>{scoreAwarded}</span>
                                <span className="sr-score-max" style={{ color: themeVar }}>/ {scoreMax}</span>
                            </div>
                            <div className="sr-score-percent" style={{ color: themeVar }}>{scorePct}%</div>
                        </div>
                    )}
                    {activeControls}
                    <div className="sr-overall-feedback" style={{ marginTop: showScore || activeControls ? '1.5rem' : '1rem' }}>
                        <label className="sr-sidebar-label" style={{ color: themeVar }}>{feedbackLabel}</label>
                        {status === 'active' ? (
                            <textarea className="sr-textarea" rows={3} style={{ color: themeVar, fontStyle: 'italic', borderColor: themeVar, background: 'whitesmoke', fontWeight: 500 }} placeholder={feedbackPlaceholder} value={feedbackValue} onChange={e => onFeedbackChange(e.target.value)} />
                        ) : (
                            <div style={{ background: bgLight, padding: '10px', borderRadius: '6px', color: colorHexDark, fontStyle: 'italic', fontSize: '0.85rem', borderLeft: `3px solid ${colorHex}`, whiteSpace: 'pre-wrap' }}>
                                {feedbackValue || "No overall remarks provided."}
                            </div>
                        )}
                    </div>
                    {status === 'active' && (
                        <div style={{ marginTop: '1rem', background: bgLight, padding: '12px', borderRadius: '6px', border: `1px solid ${colorHex}40` }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: colorHexDark, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <Clock size={14} /> Logged Grading / Review Time (Minutes)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                <input type="number" min="1" style={{ width: '90px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: autoSummedMinutes > 0 && timeOverrideValue === '' ? '#e0f2fe' : 'white' }} value={timeOverrideValue} onChange={(e) => onTimeOverrideChange(e.target.value)} placeholder={autoSummedMinutes > 0 ? autoSummedMinutes.toString() : Math.max(1, Math.floor(autoTimeSeconds / 60)).toString()} />
                            </div>
                        </div>
                    )}
                    {status === 'active' ? (
                        <div className="sr-action-area" style={{ marginTop: '1rem' }}>
                            <button className="sr-submit-btn" style={{ background: themeVar }} onClick={onSubmit} disabled={isSaving}>{submitLabel}</button>
                        </div>
                    ) : (
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: themeVar, textTransform: 'uppercase' }}>{signatureLabel}</p>
                            {signatureUrl ? <img src={signatureUrl} alt="Signature" crossOrigin="anonymous" style={{ height: '40px', objectFit: 'contain', filter: `brightness(0) saturate(100%) ${colorTheme === 'blue' ? 'invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)' : colorTheme === 'red' ? 'invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)' : 'invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'}`, marginBottom: '8px' }} /> : <div style={{ height: '40px', color: themeVar, display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: themeVar }}>{signatureName}</p>
                            {signatureMeta && <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: themeVar }}>{signatureMeta}</p>}
                            {signatureDate && <p style={{ margin: 0, fontSize: '0.75rem', color: themeVar }}><Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{signatureDate}</p>}
                            {signatureTagline && <div className="sr-sig-line" style={{ borderTop: `1px dashed ${themeVar}`, paddingTop: '6px', marginTop: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: themeVar }}>{signatureTagline}</div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// 🚀 PREDEFINED AUDIT REASONS FOR TIMED ASSESSMENTS
const PRESET_EXTRA_TIME_REASONS = [
    "Network / Internet Disconnection",
    "Power Outage / Loadshedding",
    "Browser / IDE Technical Crash",
    "Hardware / Device Failure",
    "Invigilator / Facilitator Discretion",
    "Medical / Personal Emergency",
    "Accommodation for Learning Disability",
    "Other (Details specified below)"
];

// 🚀 EXTRA TIME MODAL WITH DROPDOWN + SUPPORTING EVIDENCE
const ExtraTimeModal: React.FC<{
    onClose: () => void;
    onSubmit: (minutes: number, reason: string) => void
}> = ({ onClose, onSubmit }) => {
    const [minutes, setMinutes] = useState<number>(15);
    const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_EXTRA_TIME_REASONS[0]);
    const [details, setDetails] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const combinedReason = details.trim()
            ? `${selectedPreset} — ${details.trim()}`
            : selectedPreset;

        if (minutes > 0 && combinedReason) {
            onSubmit(minutes, combinedReason);
        }
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999999, pointerEvents: 'auto' }}>
            <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Timer size={16} /> Grant Extra Time
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div className="lfm-body">
                        <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
                                Add additional minutes to the learner's timer. If the assessment was locked due to time expiring or connection loss, <strong>this will automatically unlock it</strong> so they can continue.
                            </p>
                        </div>

                        <div className="lfm-fg">
                            <label>Minutes to Add *</label>
                            <input
                                className="lfm-input"
                                type="number"
                                min="1"
                                value={minutes}
                                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
                                required
                            />
                        </div>

                        <div className="lfm-fg">
                            <label>Standard Audit Category *</label>
                            <select
                                className="lfm-input lfm-select"
                                value={selectedPreset}
                                onChange={(e) => setSelectedPreset(e.target.value)}
                                required
                            >
                                {PRESET_EXTRA_TIME_REASONS.map((reason, idx) => (
                                    <option key={idx} value={reason}>
                                        {reason}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="lfm-fg">
                            <label>Additional Notes / Supporting Evidence</label>
                            <textarea
                                className="lfm-input"
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                rows={3}
                                placeholder="Optional details (e.g., ticket number, invigilator notes, specific error message...)"
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="lfm-btn lfm-btn--primary"
                            disabled={minutes < 1}
                        >
                            <Save size={13} /> Grant Time
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        getPortalTarget()
    );
};

const getAnswerString = (ans: any): string => {
    if (ans === null || ans === undefined) return '';
    if (typeof ans === 'string') return ans;
    if (typeof ans === 'number' || typeof ans === 'boolean') return String(ans);
    if (typeof ans === 'object') {
        return ans.text || ans.equation || ans.value || ans.content || ans.html || ans.url || ans.uploadUrl || ans.code || '';
    }
    return '';
};

const cleanRichText = (html?: any): string => {
    const str = getAnswerString(html);
    if (!str) return '';
    return str.replace(/&nbsp;/g, ' ');
};

const RichMathText: React.FC<{ html?: any; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const safeHtml = cleanRichText(html);

    useEffect(() => {
        if (!containerRef.current || !safeHtml) return;

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
    }, [safeHtml]);

    return (
        <div
            ref={containerRef}
            className={`quill-read-only-content ${className || ''}`}
            style={{ wordBreak: 'normal', overflowWrap: 'break-word', lineHeight: 1.6, ...style }}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
    );
};

const renderBlockImage = (block: any) => {
    if (!block.imageUrl) return null;
    return (
        <div className="no-print" style={{ margin: '1rem 0', textAlign: 'center' }}>
            <img
                src={block.imageUrl}
                alt={block.imageCaption || "Assessment attachment"}
                style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
            />
            {block.imageCaption && (
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
                    {block.imageCaption}
                </p>
            )}
        </div>
    );
};

const renderBlockFile = (block: any) => {
    if (!block.fileUrl) return null;
    return (
        <div className="no-print" style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <FileText size={20} color="#166534" />
                <div style={{ overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {block.fileName || "Download Starter File"}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
                </div>
            </div>
            <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0, fontWeight: 'bold' }}>
                <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
            </a>
        </div>
    );
};

// 🚀 EXPANDABLE "READ MORE" WRAPPER FOR MASSIVE TEXT BLOCKS
const ExpandableInfoBlock: React.FC<{ block: any; isPrintMode: boolean }> = ({ block, isPrintMode }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contentRef.current) {
            setIsOverflowing(contentRef.current.scrollHeight > 250);
        }
    }, [block.content, block.imageUrl]);

    const shouldCollapse = !isPrintMode && !isExpanded && isOverflowing;

    return (
        <div className="sr-q-card" style={{ borderLeft: '4px solid #0ea5e9', background: '#f0f9ff', padding: '1.25rem', marginBottom: '1.5rem', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Info size={16} /> {block.title || 'Reading Material'}
            </div>

            <div style={{ position: 'relative' }}>
                <div
                    ref={contentRef}
                    style={{
                        maxHeight: shouldCollapse ? '250px' : 'none',
                        overflow: 'hidden',
                        transition: 'max-height 0.3s ease-out'
                    }}
                >
                    {block.content && (
                        <RichMathText html={block.content} style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
                    )}
                    {renderBlockImage(block)}
                    {renderBlockFile(block)}
                </div>

                {shouldCollapse && (
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '80px',
                        background: 'linear-gradient(to bottom, transparent, #f0f9ff)',
                        pointerEvents: 'none'
                    }} />
                )}
            </div>

            {!isPrintMode && isOverflowing && (
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        marginTop: '12px',
                        background: '#e0f2fe',
                        border: '1px solid #bae6fd',
                        color: '#0369a1',
                        padding: '6px 14px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#bae6fd'}
                    onMouseLeave={e => e.currentTarget.style.background = '#e0f2fe'}
                >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {isExpanded ? 'Show Less' : 'Read More'}
                </button>
            )}
        </div>
    );
};

const ReviewAxisGraph: React.FC<{ learnerAns: any }> = ({ learnerAns }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const planeRef = useRef<CartesianPlane | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const plane = new CartesianPlane(canvasRef.current, {
            stepSequences: [1, 2, 5],
            autoFit: false,
        });
        planeRef.current = plane;

        const ro = new ResizeObserver(() => {
            plane.resize();
        });
        if (containerRef.current) {
            ro.observe(containerRef.current);
        }

        return () => {
            ro.disconnect();
            plane.destroy();
            planeRef.current = null;
        };
    }, []);

    useEffect(() => {
        const plane = planeRef.current;
        if (!plane) return;

        plane.clear();
        const allCoords: { x: number; y: number }[] = [];

        const pointsList = learnerAns?.points || [];
        const shapesList = learnerAns?.shapes || [];

        pointsList.forEach((p: any, i: number) => {
            const px = parseFloat(String(p.x));
            const py = parseFloat(String(p.y));
            if (!isNaN(px) && !isNaN(py)) {
                allCoords.push({ x: px, y: py });
                const color = POINT_COLORS[i % POINT_COLORS.length];
                plane.addPoint(px, py, color, `(${px}, ${py})`, true, 5);
            }
        });

        shapesList.forEach((shape: any) => {
            const shapeCoords: { x: number; y: number }[] = [];
            shape.points?.forEach((p: any) => {
                const px = parseFloat(String(p.x));
                const py = parseFloat(String(p.y));
                if (!isNaN(px) && !isNaN(py)) {
                    shapeCoords.push({ x: px, y: py });
                    allCoords.push({ x: px, y: py });
                }
            });

            if (shapeCoords.length > 0) {
                plane.addPolygon(shapeCoords, `${shape.color}1f`, shape.color, 2);
                shapeCoords.forEach((coord) => {
                    plane.addPoint(coord.x, coord.y, shape.color, `(${coord.x}, ${coord.y})`, false, 5);
                });
            }
        });

        if (allCoords.length > 0) {
            setTimeout(() => {
                planeRef.current?.animateToFit(allCoords);
            }, 100);
        } else {
            setTimeout(() => {
                planeRef.current?.animateToFit([{ x: -10, y: -10 }, { x: 10, y: 10 }], 0);
            }, 50);
        }
    }, [learnerAns]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '420px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    );
};

const ReviewCodeSandbox: React.FC<{ block: any, learnerAns: any }> = ({ block, learnerAns }) => {
    const [snapshot, setSnapshot] = useState<any>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isBooted, setIsBooted] = useState<boolean>(false);

    const codePayload = useMemo(() => {
        if (!learnerAns) return null;
        if (typeof learnerAns === 'object' && learnerAns.codeData) return learnerAns.codeData;
        return learnerAns;
    }, [learnerAns]);

    const storagePath = codePayload?.storagePath;
    const inlineSnapshot = codePayload?.snapshot;
    const lastSavedAt = codePayload?.lastSavedAt;

    useEffect(() => {
        if (!isBooted) return;

        let isMounted = true;
        setIsLoading(true);

        const loadLearnerCode = async () => {
            if (storagePath) {
                try {
                    const storage = getStorage();
                    const jsonRef = fbStorageRef(storage, storagePath);
                    const downloadUrl = await getDownloadURL(jsonRef);
                    const res = await fetch(downloadUrl);
                    if (res.ok) {
                        const files = await res.json();
                        if (isMounted) {
                            setSnapshot(files);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to download Storage snapshot for block [${block.id}]:`, err);
                } finally {
                    if (isMounted) setIsLoading(false);
                }
            } else if (inlineSnapshot) {
                if (isMounted) {
                    const parsed = typeof inlineSnapshot === 'string' ? JSON.parse(inlineSnapshot) : inlineSnapshot;
                    setSnapshot(parsed);
                    setIsLoading(false);
                }
            } else {
                if (isMounted) {
                    setSnapshot(null);
                    setIsLoading(false);
                }
            }
        };

        loadLearnerCode();

        return () => {
            isMounted = false;
        };
    }, [block.id, storagePath, inlineSnapshot, lastSavedAt, isBooted]);

    if (!isBooted) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', gap: '10px' }}>
                <Code size={32} color="#94a3b8" />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: '#334155' }}>Facilitator Code Preview is Paused</p>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', textAlign: 'center', maxWidth: '400px' }}>This button boots the IDE on <strong>YOUR</strong> screen to inspect learner code. Use the Network Control switch above to unlock the Learner's screen in real-time.</p>
                <button
                    onClick={() => setIsBooted(true)}
                    style={{ background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}
                >
                    <Play size={14} /> Boot Facilitator Preview (Local)
                </button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#1e293b', borderRadius: '8px', color: '#94a3b8', gap: '10px' }}>
                <Loader2 size={24} className="animate-spin" />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Retrieving learner's code snapshot from cloud storage...</p>
            </div>
        );
    }

    return (
        <div style={ideWrapperStyle}>
            <CodeSandboxPlayer
                block={block}
                learnerAns={{ ...(codePayload || {}), snapshot }}
                readOnly={true}
            />
        </div>
    );
};

export const RenderBlocks: React.FC<any> = (props) => {
    const {
        assessment, submission, facBreakdown, assBreakdown, modBreakdown,
        activeTabs, setActiveTabs, sectionTotals,
        isPrintMode, canFacilitatorMark, canGrade, canModerate,
        isFacDone, isAssDone, isModDone, isMentor, isWorkplaceModule,
        savedFacRole, facReadOnlyLabel,
        handleVisualMark, handleScoreChange, handleFeedbackChange,
        handleCriterionChange, handleActivityStatusChange, handleActivityCommentChange,
        handleGlobalChecklistChange, handleSetToNow
    } = props;

    const [expandedGraphMemos, setExpandedGraphMemos] = useState<Record<string, boolean>>({});
    const [togglingIDE, setTogglingIDE] = useState<string | null>(null);

    const toggleGraphMemo = (blockId: string) => {
        setExpandedGraphMemos(prev => ({ ...prev, [blockId]: !prev[blockId] }));
    };

    const handleNetworkIDEToggle = async (blockId: string, currentState: boolean) => {
        if (!submission?.id) return;
        setTogglingIDE(blockId);
        try {
            const dbInstance = getFirestore();
            const subRef = doc(dbInstance, 'learner_submissions', submission.id);
            const nextState = !currentState;

            await updateDoc(subRef, {
                [`ideUnlocks.${blockId}`]: nextState,
                lastStaffEditAt: new Date().toISOString()
            });
        } catch (err: any) {
            try {
                const dbInstance = getFirestore();
                const subRef = doc(dbInstance, 'learner_submissions', submission.id);
                await setDoc(subRef, {
                    ideUnlocks: { [blockId]: !currentState },
                    lastStaffEditAt: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.error("Failed to toggle IDE network access:", e);
            }
        } finally {
            setTogglingIDE(null);
        }
    };

    const renderNetworkIDEToggleUI = (block: any) => {
        const hasIDE = block.type === 'code_sandbox' || (['task', 'checklist', 'qcto_workplace'].includes(block.type) && block.allowCode !== false);
        if (!hasIDE || isPrintMode) return null;

        const isUnlocked = submission?.ideUnlocks?.[block.id] === true;
        const isProcessing = togglingIDE === block.id;

        return (
            <div className="no-print" style={{ marginBottom: '1rem', background: isUnlocked ? '#eff6ff' : '#f8fafc', border: isUnlocked ? '1px solid #bfdbfe' : '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: isUnlocked ? '#dbeafe' : '#e2e8f0', padding: '8px', borderRadius: '8px' }}>
                        <Code size={18} color={isUnlocked ? '#2563eb' : '#64748b'} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isUnlocked ? '#1e3a8a' : '#334155' }}>Network IDE Access (Remote Control)</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Remotely unlock the Live IDE on the learner's screen in real-time.</div>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleNetworkIDEToggle(block.id, isUnlocked)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isUnlocked ? '#2563eb' : 'white', color: isUnlocked ? 'white' : '#475569', padding: '6px 12px', borderRadius: '20px', border: isUnlocked ? '1px solid #2563eb' : '1px solid #cbd5e1', cursor: isProcessing ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem', transition: 'all 0.2s ease' }}
                >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : (isUnlocked ? <CheckCircle size={14} /> : <Lock size={14} />)}
                    {isUnlocked ? 'Unlocked for Learner' : 'Unlock for Learner'}
                </button>
            </div>
        );
    };

    let qNum = 0;

    if (!assessment?.blocks || !Array.isArray(assessment.blocks)) return null;

    return (
        <>
            {assessment.blocks.map((block: any) => {
                const maxM = block.marks || 0;
                const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
                const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
                const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };

                let activeInkColor = 'blue';
                let activeData = fData;
                let isActiveRole = false;

                if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
                else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
                else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
                else {
                    if (isModDone) { activeInkColor = 'green'; activeData = mData; }
                    else if (isAssDone) { activeInkColor = 'red'; activeData = aData; }
                    else { activeInkColor = 'blue'; activeData = fData; }
                }

                // Only show ReadOnly layers for stages that are completed or graded, and not editable by the current role
                const renderFacReadOnly = (isFacDone || fData?.feedback || fData?.score > 0) && (!canFacilitatorMark || isPrintMode);
                const renderAssReadOnly = (isAssDone || aData?.feedback || aData?.score > 0) && (!canGrade || isPrintMode);
                const renderModReadOnly = (isModDone || mData?.feedback) && (!canModerate || isPrintMode);

                const mentorActiveOnScorableBlock = isMentor && canFacilitatorMark && ['mcq', 'text', 'task', 'code_sandbox', 'mathpad', 'graph'].includes(block.type);

                let decData = activeData;
                let isDeclarationInteractive = isActiveRole;
                if (canModerate) {
                    decData = isWorkplaceModule ? fData : aData;
                    isDeclarationInteractive = false;
                } else if (canGrade && isWorkplaceModule) {
                    decData = fData;
                    isDeclarationInteractive = false;
                }

                const renderReadOnlyLayers = () => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: (!isPrintMode && isActiveRole) ? '1rem' : '0' }}>
                        {renderFacReadOnly && (
                            <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Info size={13} /> {facReadOnlyLabel}
                                </div>
                                {!isWorkplaceModule && savedFacRole !== 'mentor' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <label style={{ color: '#0369a1', fontWeight: 'bold', fontSize: '0.85rem' }}>Facilitator Score:</label>
                                        <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #7dd3fc`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#e0f2fe', color: '#0369a1', cursor: 'not-allowed' }}>
                                            {fData.score ?? 0}
                                        </span>
                                        <span style={{ color: '#0369a1', fontWeight: 'bold' }}>/ {maxM}</span>
                                    </div>
                                )}
                                <div style={{ color: '#0369a1', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {fData.feedback || <em style={{ opacity: 0.7 }}>No specific {savedFacRole === 'mentor' ? 'supervisor comments' : 'coaching'} provided.</em>}
                                </div>
                            </div>
                        )}
                        {renderAssReadOnly && (
                            <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '4px', border: '1px solid #fecaca' }}>
                                <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AwardIcon size={13} /> Assessor Grade
                                </div>
                                {!isWorkplaceModule && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <label style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '0.85rem' }}>Assessor Score:</label>
                                        <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #fca5a5`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#fee2e2', color: '#991b1b', cursor: 'not-allowed' }}>
                                            {aData.score ?? 0}
                                        </span>
                                        <span style={{ color: '#991b1b', fontWeight: 'bold' }}>/ {maxM}</span>
                                    </div>
                                )}
                                <div style={{ color: '#991b1b', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}
                                </div>
                            </div>
                        )}
                        {renderModReadOnly && (
                            <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldCheck size={13} /> Moderator QA
                                </div>
                                {!isWorkplaceModule && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <label style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem' }}>Moderated Score:</label>
                                        <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #86efac`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#dcfce7', color: '#16a34a', cursor: 'not-allowed' }}>
                                            {mData.score ?? 0}
                                        </span>
                                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>/ {maxM}</span>
                                    </div>
                                )}
                                <div style={{ color: '#16a34a', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                    {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}
                                </div>
                            </div>
                        )}
                    </div>
                );

                const renderActiveGradeControls = (blockId: string) => {
                    if (canModerate && isWorkplaceModule) {
                        return (
                            <div>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#15803d', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                        <ShieldCheck size={14} /> Moderator QA Notes
                                    </div>
                                    <textarea
                                        className="sr-feedback-input"
                                        rows={2}
                                        style={{ width: '100%', color: 'green', fontStyle: 'italic', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '4px', resize: 'vertical', background: 'white' }}
                                        placeholder="Moderator Green Pen QA notes for this item (optional)..."
                                        value={activeData.feedback || ''}
                                        onChange={e => handleFeedbackChange(blockId, e.target.value)}
                                    />
                                </div>
                            </div>
                        );
                    }

                    if (mentorActiveOnScorableBlock) {
                        return (
                            <div>
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                        <ShieldCheck size={14} /> Supervisor Observation Comments
                                    </div>
                                    <textarea
                                        className="sr-feedback-input"
                                        rows={2}
                                        style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
                                        placeholder="Add any supervisor observation notes for this item (optional)..."
                                        value={activeData.feedback || ''}
                                        onChange={e => handleFeedbackChange(blockId, e.target.value)}
                                    />
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div>
                            {!isWorkplaceModule && (
                                <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <label style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.85rem' }}>Your Score Awarded:</label>
                                    <input
                                        type="number"
                                        className="sr-score-input"
                                        style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: 'white' }}
                                        value={activeData.score ?? 0}
                                        onChange={e => handleScoreChange(blockId, parseInt(e.target.value) || 0, maxM)}
                                    />
                                    <span style={{ color: '#0f172a', fontWeight: 'bold' }}>/ {maxM}</span>
                                </div>
                            )}
                            <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
                                <textarea
                                    className="sr-feedback-input"
                                    rows={2}
                                    style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
                                    placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
                                    value={activeData.feedback || ''}
                                    onChange={e => handleFeedbackChange(blockId, e.target.value)}
                                />
                            </div>
                        </div>
                    );
                };

                if (block.type === 'section') {
                    const totals = sectionTotals[block.id];
                    return (
                        <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
                                {isAssDone && totals && totals.total > 0 && (
                                    <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}>
                                        <BarChart size={14} /> {totals.awarded}/{totals.total}
                                    </span>
                                )}
                            </div>
                            {block.content && (
                                <RichMathText html={block.content} style={{ color: '#334155', fontSize: '0.95rem' }} />
                            )}
                            {renderBlockImage(block)}
                            {renderBlockFile(block)}
                        </div>
                    );
                }

                // 🚀 MASSIVE TEXT EXPANDABLE INFO BLOCKS
                if (block.type === 'info') {
                    return <ExpandableInfoBlock key={(isPrintMode ? 'print-' : '') + block.id} block={block} isPrintMode={isPrintMode} />;
                }

                if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
                    qNum++;
                    let learnerAns = submission.answers?.[block.id];

                    if (learnerAns === undefined && submission.answers && Object.keys(submission.answers).length > 0) {
                        const answerKeys = Object.keys(submission.answers);
                        const scorableBlocks = assessment.blocks.filter((b: any) =>
                            ['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(b.type)
                        );
                        const currentBlockIndex = scorableBlocks.findIndex((b: any) => b.id === block.id);
                        if (currentBlockIndex >= 0 && currentBlockIndex < answerKeys.length) {
                            const recoveredKey = answerKeys[currentBlockIndex];
                            learnerAns = submission.answers[recoveredKey];
                        }
                    }

                    if (block.type === 'graph') {
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0f766e', flexShrink: 0 }}>PLOT</span>
                                        <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-q-body">
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}

                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <BarChart size={14} /> Learner's Plotted Cartesian Graph:
                                        </div>
                                        <ReviewAxisGraph learnerAns={learnerAns} />
                                    </div>

                                    {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
                                        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
                                                <Lock size={14} /> Assessor Memorandum Graph (Hidden from Learner)
                                            </div>
                                            <ReviewAxisGraph learnerAns={block.memoGraph} />
                                        </div>
                                    )}

                                    <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                        {renderReadOnlyLayers()}
                                        {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (block.type === 'mathpad') {
                        const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { equation: getAnswerString(learnerAns) };

                        const mathTabs = [
                            { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', val: safeLearnerAns.equation !== undefined ? safeLearnerAns.equation : null, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
                            { id: 'graph', icon: <BarChart size={13} />, label: 'Graphing Calculator', val: safeLearnerAns.graphState, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } }
                        ].filter(t => t.val !== null && t.val !== undefined);

                        const activeTabId = activeTabs[block.id] || (mathTabs.length > 0 ? mathTabs[0].id : 'equation');
                        const isGraphMemoExpanded = expandedGraphMemos[block.id] || false;

                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#fce7f3', color: '#db2777', flexShrink: 0 }}>MATH</span>
                                        <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-q-body">
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}

                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px' }}>
                                            <Layers size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} />Learner's Math Response:
                                        </div>

                                        {mathTabs.length === 0 ? (
                                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>No answer provided.</span>
                                        ) : (
                                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
                                                {mathTabs.length > 1 && (
                                                    <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', padding: '10px' }}>
                                                        {mathTabs.map(t => {
                                                            const isActive = activeTabId === t.id;
                                                            return (
                                                                <button
                                                                    key={t.id}
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
                                                                    {t.icon} {t.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div style={{ padding: '15px' }}>
                                                    {activeTabId === 'equation' && (
                                                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            {React.createElement('math-field', {
                                                                'read-only': 'true',
                                                                style: { width: '100%', fontSize: '1.4rem', outline: 'none', background: 'transparent', border: 'none', color: '#0f172a' }
                                                            }, safeLearnerAns.equation || '')}
                                                        </div>
                                                    )}
                                                    {activeTabId === 'graph' && (
                                                        <ReviewAxisGraph learnerAns={safeLearnerAns.graphState} />
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {(block.correctAnswer || block.modelSolution || block.memoGraph) && (
                                            <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
                                                    <Lock size={14} /> Assessor Memorandum (Hidden from Learner)
                                                </div>

                                                {block.correctAnswer && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Final Answer</div>
                                                        {React.createElement('math-field', {
                                                            'read-only': 'true',
                                                            style: { width: '100%', fontSize: '1.2rem', padding: '8px', background: 'white', border: '1px solid #fbcfe8', borderRadius: '4px', color: '#0f172a' }
                                                        }, block.correctAnswer)}
                                                    </div>
                                                )}

                                                {block.modelSolution && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Step-by-Step Solution</div>
                                                        <RichMathText html={block.modelSolution} style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px dashed #fbcfe8', fontSize: '0.9rem', color: '#334155' }} />
                                                    </div>
                                                )}

                                                {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
                                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #fbcfe8' }}>
                                                        <div
                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#fce7f3', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}
                                                            onClick={(e) => { e.stopPropagation(); toggleGraphMemo(block.id); }}
                                                        >
                                                            <div>
                                                                <label style={{ color: '#9d174d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                                                    <BarChart size={14} /> Expected Graph Solution
                                                                </label>
                                                                <p style={{ fontSize: '0.75rem', color: '#be185d', margin: '2px 0 0 0' }}>
                                                                    Click to {isGraphMemoExpanded ? 'collapse' : 'expand'} the expected visual solution graph.
                                                                </p>
                                                            </div>
                                                            <div style={{ color: '#9d174d', padding: '4px', background: '#fdf2f8', borderRadius: '4px' }}>
                                                                {isGraphMemoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                            </div>
                                                        </div>

                                                        {isGraphMemoExpanded && (
                                                            <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease-out' }}>
                                                                <ReviewAxisGraph learnerAns={block.memoGraph} />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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

                    if (block.type === 'code_sandbox') {
                        const codePayload = typeof learnerAns === 'object' && learnerAns?.codeData ? learnerAns.codeData : learnerAns;
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#eff6ff', color: '#3b82f6', flexShrink: 0 }}>IDE</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                            <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
                                                {block.title && (
                                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                        {block.title}
                                                    </h3>
                                                )}
                                                {block.question && (
                                                    <RichMathText html={block.question} style={{ color: '#334155' }} />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>

                                <div className="sr-q-body">
                                    {renderNetworkIDEToggleUI(block)}
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}

                                    <div className="sr-answer-box">
                                        {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
                                        {renderResourceLinks(codePayload?.resourceLinks || learnerAns?.resourceLinks)}

                                        <ReviewCodeSandbox
                                            block={block}
                                            learnerAns={learnerAns}
                                        />
                                    </div>

                                    <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                        {renderReadOnlyLayers()}
                                        {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (block.type === 'mcq') {
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
                                        <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-q-body">
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                        <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
                                            <span style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + Number(learnerAns))}. ${block.options?.[learnerAns] || ''}` : 'No answer provided.'}</span>
                                            {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
                                        </div>
                                        <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + Number(block.correctOption))}. {block.options?.[block.correctOption]}</strong></div>
                                    </div>
                                    <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
                                        {renderReadOnlyLayers()}
                                        {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (block.type === 'text') {
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
                                        <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-q-body">
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                        <div className="sr-text-ans">
                                            {learnerAns ? <RichMathText html={getAnswerString(learnerAns)} style={{ color: 'black' }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
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

                    if (block.type === 'task') {
                        const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { text: getAnswerString(learnerAns) };

                        const taskTabs = [
                            { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', val: safeLearnerAns.text },
                            { id: 'audio', icon: <Mic size={14} />, label: 'Audio', val: safeLearnerAns.audioUrl },
                            { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', val: safeLearnerAns.url },
                            { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', val: safeLearnerAns.uploadUrl },
                            { id: 'code', icon: <Code size={14} />, label: 'Code IDE', val: safeLearnerAns.codeData || safeLearnerAns.code }
                        ].filter(t => !!t.val);

                        const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;

                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#ede9fe', color: '#8b5cf6', flexShrink: 0 }}>Q{qNum}</span>
                                        <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                    {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
                                        <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
                                            <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
                                            <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
                                        </div>
                                    )}
                                </div>
                                <div className="sr-q-body">
                                    {renderNetworkIDEToggleUI(block)}
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Learner Evidence Submitted:</div>

                                        {(!safeLearnerAns || Object.keys(safeLearnerAns).length === 0 || (!safeLearnerAns.text && !safeLearnerAns.audioUrl && !safeLearnerAns.url && !safeLearnerAns.uploadUrl && !safeLearnerAns.code && !safeLearnerAns.codeData && !safeLearnerAns.resourceLinks)) ? (
                                            <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No evidence uploaded by learner.</span>
                                        ) : isPrintMode ? (
                                            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: 'white' }}>
                                                {safeLearnerAns.resourceLinks && safeLearnerAns.resourceLinks.length > 0 && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Attached Links:</strong><ul>{safeLearnerAns.resourceLinks.map((l: any, i: number) => <li key={i}><a href={l.url}>{l.label}</a></li>)}</ul></div>}
                                                {safeLearnerAns.text && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Rich Text Response:</strong><RichMathText html={safeLearnerAns.text} /></div>}
                                                {safeLearnerAns.audioUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Audio Recording:</strong><div>URL: {safeLearnerAns.audioUrl}</div></div>}
                                                {safeLearnerAns.url && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Link:</strong><div><a href={safeLearnerAns.url} target="_blank" rel="noreferrer">{safeLearnerAns.url}</a></div></div>}
                                                {safeLearnerAns.uploadUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Uploaded File:</strong><FilePreview url={safeLearnerAns.uploadUrl} /></div>}
                                                {(safeLearnerAns.codeData || safeLearnerAns.code) && <div><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Code:</strong><pre style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}>{typeof safeLearnerAns.code === 'string' ? safeLearnerAns.code : '[Interactive IDE Snapshot]'}</pre></div>}
                                            </div>
                                        ) : (
                                            <>
                                                {renderResourceLinks(safeLearnerAns?.resourceLinks || safeLearnerAns?.codeData?.resourceLinks)}

                                                {taskTabs.length === 0 ? null : (
                                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
                                                        <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                                                            {taskTabs.map(t => (
                                                                <button key={t.id} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })} style={{ padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent', background: activeTabId === t.id ? 'white' : 'transparent', color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTabId === t.id ? 'bold' : 'normal', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                                    {t.icon} {t.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div style={{ padding: '15px' }}>
                                                            {activeTabId === 'text' && <RichMathText html={safeLearnerAns.text} />}
                                                            {activeTabId === 'audio' && <audio controls src={safeLearnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />}
                                                            {activeTabId === 'url' && <UrlPreview url={safeLearnerAns.url} />}
                                                            {activeTabId === 'upload' && <FilePreview url={safeLearnerAns.uploadUrl} />}
                                                            {activeTabId === 'code' && (
                                                                <ReviewCodeSandbox
                                                                    block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
                                                                    learnerAns={safeLearnerAns.codeData || safeLearnerAns}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
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

                    if (block.type === 'logbook') {
                        const entries = Array.isArray(learnerAns) ? learnerAns : [];
                        const totalHours = entries.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0);

                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#ffedd5', color: '#ea580c', flexShrink: 0 }}>LOG</span>
                                        <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
                                    </div>
                                </div>
                                <div className="sr-q-body">
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    <div className="sr-answer-box">
                                        <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarRange size={14} /> Workplace Hours Logged:</div>
                                        {entries.length === 0 ? (
                                            <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No entries logged by learner.</span>
                                        ) : (
                                            <div>
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
                                                                        <RichMathText html={entry.task || '<em>No task description provided.</em>'} style={{ fontSize: '0.85rem' }} />
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
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (block.type === 'checklist') {
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0d9488', flexShrink: 0 }}>CHK</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                            <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {isMentor ? 'Workplace observation checklist — verify each criterion.' : 'Assessor observation checklist.'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="sr-q-body">
                                    {renderNetworkIDEToggleUI(block)}
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    <div style={{ marginTop: '1rem' }}>
                                        {block.criteria?.map((crit: string, i: number) => {
                                            const mentorResult = fData.criteriaResults?.[i] || { status: null, comment: '' };
                                            const assessorResult = aData.criteriaResults?.[i] || { status: null, comment: '' };
                                            const modResult = mData.criteriaResults?.[i] || { status: null, comment: '' };
                                            const myResult = activeData.criteriaResults?.[i] || { status: null, comment: '', startTime: '', endTime: '' };

                                            let durationStr = '0m 0s';
                                            if (myResult.startTime && myResult.endTime) {
                                                const diffMs = new Date(myResult.endTime).getTime() - new Date(myResult.startTime).getTime();
                                                if (diffMs > 0) {
                                                    const m = Math.floor(diffMs / 60000);
                                                    const s = Math.floor((diffMs % 60000) / 1000);
                                                    durationStr = `${m}m ${s}s`;
                                                }
                                            }

                                            return (
                                                <div key={i} style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
                                                    <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '0.95rem' }}>{i + 1}. {crit}</p>

                                                    {block.requireEvidencePerCriterion !== false && (() => {
                                                        const rawEv = learnerAns?.[`evidence_${i}`];
                                                        const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});
                                                        const safeText = getAnswerString(critEvidence.text);
                                                        const cleanTextCheck = safeText ? safeText.replace(/<[^>]*>/g, '').trim() : '';
                                                        const isTextTrulyEmpty = cleanTextCheck.length === 0;

                                                        const allTabs = [
                                                            { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Artifact', val: critEvidence.uploadUrl, render: () => <FilePreview url={critEvidence.uploadUrl} /> },
                                                            { id: 'url', icon: <LinkIcon size={13} />, label: 'Web Link', val: critEvidence.url, render: () => <UrlPreview url={critEvidence.url} /> },
                                                            { id: 'code', icon: <Code size={13} />, label: 'Source Code', val: critEvidence.codeData || critEvidence.code, render: () => <ReviewCodeSandbox block={{ id: `${block.id}_ev_${i}`, title: `Criterion ${i + 1} Code Evidence`, template: 'vanilla' }} learnerAns={critEvidence.codeData || critEvidence} /> },
                                                            { id: 'text', icon: <FileText size={13} />, label: 'Learner Notes', val: isTextTrulyEmpty ? null : critEvidence.text, render: () => <RichMathText html={critEvidence.text} /> }
                                                        ];

                                                        const activeEvidenceTabs = allTabs.filter(t => !!t.val);
                                                        const hasUploadedEvidence = activeEvidenceTabs.length > 0;
                                                        const isObservedOrTimed = !!(myResult.startTime || myResult.status || mentorResult.status || assessorResult.status);

                                                        if (!hasUploadedEvidence) {
                                                            if (isObservedOrTimed) {
                                                                return (
                                                                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 15px', borderRadius: '6px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
                                                                        <AlertCircle size={18} className="animate-pulse" style={{ color: '#d97706', flexShrink: 0 }} />
                                                                        <div>
                                                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Evidence Pending</span>
                                                                            <span style={{ fontSize: '0.75rem', color: '#78350f' }}>Observation logged, but waiting for the learner to upload their supporting files.</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>Awaiting learner evidence upload.</p>;
                                                        }

                                                        const isDraft = ['not_started', 'in_progress'].includes(String(submission?.status || '').toLowerCase());
                                                        const subTabKey = `${block.id}_ev_${i}`;
                                                        const activeSubTab = activeTabs[subTabKey] || activeEvidenceTabs[0]?.id;
                                                        const selectedTabConfig = activeEvidenceTabs.find(t => t.id === activeSubTab) || activeEvidenceTabs[0];
                                                        const expandKey = `${subTabKey}_expanded`;
                                                        const isTabExpanded = activeTabs[expandKey] === 'true';

                                                        return (
                                                            <div style={{ background: isDraft ? '#fffdf5' : '#f5f3ff', border: isDraft ? '1px solid #fef08a' : '1px solid #c4b5fd', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: isDraft ? '#b45309' : '#6d28d9', textTransform: 'uppercase' }}>
                                                                        <Layers size={16} /> {isDraft ? 'Learner Evidence (Live Draft Preview)' : 'Learner Evidence Submitted'}
                                                                    </label>
                                                                    {isDraft && (
                                                                        <span style={{ fontSize: '0.68rem', background: '#d97706', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                            Learner Modifying · Not Yet Submitted
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
                                                                {renderResourceLinks(critEvidence.resourceLinks || critEvidence.codeData?.resourceLinks)}

                                                                <div className="no-print" style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
                                                                    {activeEvidenceTabs.map(tab => (
                                                                        <button key={tab.id} type="button" onClick={() => setActiveTabs({ ...activeTabs, [subTabKey]: tab.id })} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '0.75rem', border: 'none', borderBottom: activeSubTab === tab.id ? (isDraft ? '2px solid #b45309' : '2px solid #6d28d9') : '2px solid transparent', background: activeSubTab === tab.id ? 'white' : 'transparent', color: activeSubTab === tab.id ? (isDraft ? '#b45309' : '#6d28d9') : '#64748b', fontWeight: activeSubTab === tab.id ? 'bold' : 'normal', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: '4px 4px 0 0' }}>
                                                                            {tab.icon} {tab.label}
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                <div style={{ position: 'relative' }}>
                                                                    <div style={{ maxHeight: isTabExpanded ? 'none' : '150px', overflow: 'hidden', transition: 'max-height 0.2s ease-out', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px', background: 'white' }}>
                                                                        {selectedTabConfig?.render()}
                                                                        {!isTabExpanded && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(to top, white, transparent)', pointerEvents: 'none' }} />}
                                                                    </div>
                                                                    <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-start' }}>
                                                                        <button type="button" onClick={() => setActiveTabs({ ...activeTabs, [expandKey]: isTabExpanded ? 'false' : 'true' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 'bold', color: '#475569', borderRadius: '4px', cursor: 'pointer' }}>
                                                                            {isTabExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

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
                                                                <AwardIcon size={12} /> Assessor Grade
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

                                                    {(!isPrintMode && isActiveRole) && (
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                                                            {block.requirePerCriterionTiming !== false && !canModerate && (
                                                                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                                                                    <Timer size={16} color="#64748b" style={{ flexShrink: 0 }} />
                                                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', minWidth: '80px' }}>Task Timer:</span>

                                                                    {!myResult.startTime ? (
                                                                        <button onClick={() => handleCriterionChange(block.id, i, 'startTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Play size={12} /> Start</button>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
                                                                                <strong>Start:</strong>
                                                                                <input type="datetime-local" className="datetime-input" value={myResult.startTime ? moment(myResult.startTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'startTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
                                                                            </div>

                                                                            {!myResult.endTime ? (
                                                                                <button onClick={() => handleCriterionChange(block.id, i, 'endTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Square size={12} /> Stop</button>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
                                                                                        <strong>End:</strong>
                                                                                        <input type="datetime-local" className="datetime-input" value={myResult.endTime ? moment(myResult.endTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'endTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
                                                                                    </div>
                                                                                    <span style={{ color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Duration: {durationStr}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
                                                                    <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleCriterionChange(block.id, i, 'status', 'C')} style={{ accentColor: '#22c55e' }} />
                                                                    {isMentor ? 'Observed ✓' : 'Competent (C)'}
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
                                                                    <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleCriterionChange(block.id, i, 'status', 'NYC')} style={{ accentColor: '#ef4444' }} />
                                                                    {isMentor ? 'Not Observed ✗' : 'NYC'}
                                                                </label>
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: '250px' }}>
                                                                <textarea className="ab-input" disabled={canModerate && !isWorkplaceModule && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor observation notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleCriterionChange(block.id, i, 'comment', e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
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

                                        {block.requireObservationDeclaration !== false && !canModerate && (
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

                    if (block.type === 'qcto_workplace') {
                        return (
                            <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                                <div className="sr-q-header">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                        <span className="sr-q-num" style={{ background: '#ffe4e6', color: '#e11d48', flexShrink: 0 }}>QCTO</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                            <RichMathText html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {isMentor ? 'Workplace Experience — Mentor Verification' : 'Workplace Experience Checkpoint'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="sr-q-body">
                                    {renderNetworkIDEToggleUI(block)}
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                    {block.workActivities?.map((wa: any, actIdx: number) => {
                                        const taskKey = `wa_${wa.id}_task`;
                                        const dateKey = `wa_${wa.id}_date`;
                                        const task = learnerAns?.[taskKey] || '';
                                        const date = learnerAns?.[dateKey] || '';

                                        const mentorResult = fData.activityResults?.[actIdx] || { status: null, comment: '' };
                                        const assessorResult = aData.activityResults?.[actIdx] || { status: null, comment: '' };
                                        const modResult = mData.activityResults?.[actIdx] || { status: null, comment: '' };
                                        const myResult = activeData.activityResults?.[actIdx] || { status: null, comment: '' };

                                        return (
                                            <div key={wa.id} style={{ marginBottom: '2rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
                                                <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                    <h4 style={{ margin: 0, color: '#073f4e' }}>{wa.code}: {wa.description}</h4>
                                                </div>
                                                <div style={{ padding: '1rem' }}>
                                                    <div style={{ marginBottom: '1.5rem' }}>
                                                        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
                                                            {task && <div style={{ flex: 1, minWidth: '250px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Task Performed:</strong><RichMathText html={task} style={{ marginTop: '6px' }} /></div>}
                                                            {date && <div style={{ minWidth: '120px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Date:</strong><div style={{ marginTop: '6px' }}>{new Date(date).toLocaleDateString()}</div></div>}
                                                        </div>

                                                        {wa.evidenceItems?.map((evItem: any) => {
                                                            const seKey = `se_${evItem.id}`;
                                                            const rawSe = learnerAns?.[seKey];
                                                            const seData = typeof rawSe === 'string' ? { text: rawSe } : (rawSe || {});

                                                            return (
                                                                <div key={evItem.id} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e11d48', display: 'block', marginBottom: '8px' }}>
                                                                        Evidence: {evItem.code} - {evItem.description}
                                                                    </span>
                                                                    {seData.uploadUrl && <div style={{ marginBottom: '10px' }}><FilePreview url={seData.uploadUrl} /></div>}
                                                                    {seData.url && <div style={{ marginBottom: '10px' }}><UrlPreview url={seData.url} /></div>}
                                                                    {(seData.codeData || seData.code) && (
                                                                        <div style={{ marginBottom: '10px' }}>
                                                                            {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
                                                                            {renderResourceLinks(seData.codeData?.resourceLinks || seData.resourceLinks)}
                                                                            <ReviewCodeSandbox
                                                                                block={{ id: `${block.id}_se_${evItem.id}`, title: `Evidence: ${evItem.code}`, template: 'vanilla' }}
                                                                                learnerAns={seData.codeData || seData}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                    {seData.text && <RichMathText html={seData.text} />}
                                                                    {(!seData.uploadUrl && !seData.url && !seData.code && !seData.codeData && !seData.text) && <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No evidence attached for this item.</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
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
                                                                    <AwardIcon size={12} /> Assessor Grade
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

                                                        {(!isPrintMode && isActiveRole) && (
                                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
                                                                        <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'C')} style={{ accentColor: '#22c55e' }} />
                                                                        {isMentor ? 'Verified ✓' : 'Competent (C)'}
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
                                                                        <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'NYC')} style={{ accentColor: '#ef4444' }} />
                                                                        {isMentor ? 'Not Verified ✗' : 'NYC'}
                                                                    </label>
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: '250px' }}>
                                                                    <textarea className="ab-input" disabled={canModerate && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor verification notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleActivityCommentChange(block.id, actIdx, e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="ap-workplace__toggles" style={{ marginTop: '1rem' }}>
                                        {block.requireSelfAssessment !== false && (
                                            <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}>
                                                <CheckCircle size={16} color={learnerAns?.selfAssessmentDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
                                                <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.selfAssessmentDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner completed self-assessment.</span>
                                            </label>
                                        )}
                                        {block.requireGoalPlanning !== false && (
                                            <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}>
                                                <CheckCircle size={16} color={learnerAns?.goalPlanningDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
                                                <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.goalPlanningDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner updated goal planning document.</span>
                                            </label>
                                        )}
                                    </div>

                                    <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
                                        {renderReadOnlyLayers()}
                                        {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
                                    </div>

                                    {block.requireObservationDeclaration !== false && !canModerate && (
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
            })}
        </>
    );
};

export const SubmissionReview: React.FC = () => {
    const { submissionId } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const { user } = useStore();
    const toast = useToast();

    const filterBlack = { height: '50px', objectFit: 'contain' as const, filter: 'brightness(0)', marginBottom: '8px' };
    const filterBlue = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)', marginBottom: '8px' };
    const filterRed = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)', marginBottom: '8px' };
    const filterGreen = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)', marginBottom: '8px' };

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [submission, setSubmission] = useState<any>(null);
    const [assessment, setAssessment] = useState<any>(null);
    const [learner, setLearner] = useState<any>(null);

    const [proctorSession, setProctorSession] = useState<any>(null);

    const [learnerProfile, setLearnerProfile] = useState<any>(null);
    const [assessorProfile, setAssessorProfile] = useState<any>(null);
    const [moderatorProfile, setModeratorProfile] = useState<any>(null);
    const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);

    const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
    const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
    const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

    const [facOverallFeedback, setFacOverallFeedback] = useState('');
    const [assOverallFeedback, setAssOverallFeedback] = useState('');
    // const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);
    const [competency, setCompetency] = useState<CompetencyStatus>(null);

    const [modFeedback, setModFeedback] = useState('');
    const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

    const [facTimeOverride, setFacTimeOverride] = useState<number | ''>('');
    const [assTimeOverride, setAssTimeOverride] = useState<number | ''>('');
    const [modTimeOverride, setModTimeOverride] = useState<number | ''>('');
    const [learnerTimeOverride, setLearnerTimeOverride] = useState<number | ''>('');

    const [, setLiveTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setLiveTick(p => p + 1), 30000);
        return () => clearInterval(interval);
    }, []);

    const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm: () => void; onCancel?: () => void; confirmText?: string; } | null>(null);
    const [showRemediationModal, setShowRemediationModal] = useState(false);
    const [showReturnToLearnerModal, setShowReturnToLearnerModal] = useState(false);
    const [showResolveAppealModal, setShowResolveAppealModal] = useState(false);
    const [showProctorEvidenceModal, setShowProctorEvidenceModal] = useState(false);
    const [showExcuseModal, setShowExcuseModal] = useState(false);
    const [showExtraTimeModal, setShowExtraTimeModal] = useState(false);

    const [showGroupMatrix, setShowGroupMatrix] = useState(false);
    const [availablePeers, setAvailablePeers] = useState<any[]>([]);
    const [isFetchingPeers, setIsFetchingPeers] = useState(false);

    const [selectedGroupPeers, setSelectedGroupPeers] = useState<any[]>([]);
    const [groupMatrixGrades, setGroupMatrixGrades] = useState<Record<string, Record<string, boolean>>>({});
    const [groupTimeMatrix, setGroupTimeMatrix] = useState<Record<string, Record<string, { startTime?: string; endTime?: string }>>>({});
    const [groupRemarks, setGroupRemarks] = useState('');
    const [isGroupSessionActive, setIsGroupSessionActive] = useState(false);

    const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartRef = useRef<number>(performance.now());
    const initialFacTimeRef = useRef<number>(0);
    const initialAssTimeRef = useRef<number>(0);
    const initialModTimeRef = useRef<number>(0);

    const currentStatus = String(submission?.status || '').toLowerCase();
    const currentAttempt = submission?.attemptNumber || 1;

    const hasChecklists = assessment?.blocks?.some((b: any) => b.type === 'checklist');
    const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
    const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
    const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task', 'code_sandbox'].includes(b.type));
    const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;

    const isPureKnowledge = hasKnowledgeBlocks && !hasChecklists && !hasWorkplace && !hasLogbook;
    const isAppealUpheld = submission?.appeal?.status === 'upheld';

    const isMissed = currentStatus === 'missed';
    const isViolation = currentStatus === 'violation';
    const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
    const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
    const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
    const isModDone = ['moderated', 'appealed'].includes(currentStatus);

    // DETECT SECAM / BOOTCAMP FRAMEWORK
    const isSECAM = Boolean(
        submission?.isBootcamp ||
        assessment?.isBootcamp ||
        assessment?.framework === 'secam' ||
        learnerProfile?.isBootcamp
    );

    const isSummative = String(assessment?.type || '').toLowerCase().includes('summative');

    // STRICT QCTO & COHORT-SCOPED ROLE IDENTIFICATION
    const isMentor = user?.role === 'mentor';
    const isFacilitator = user?.role === 'facilitator' || user?.role === 'assistant_facilitator';
    const isAssessor = user?.role === 'assessor';
    const isModerator = user?.role === 'moderator';
    const isAdmin = user?.role === 'admin' || user?.role === 'assistant_admin';
    const isSuperAdmin = Boolean(user?.isSuperAdmin);

    const secondaryRoles = Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [];
    const userAssignedCohorts = Array.isArray(user?.assignedCohortIds) ? user.assignedCohortIds : [];

    // 1. Verify if the user is explicitly assigned to this submission's cohort
    const isAssignedToCurrentCohort = Boolean(
        submission?.cohortId && userAssignedCohorts.includes(submission.cohortId)
    );

    // 2. Strict QCTO Assessor Accreditation Checks
    const isCertifiedAssessor = isAssessor ||
        secondaryRoles.includes('assessor') ||
        Boolean(user?.canMarkAssessments);

    const hasAssessorReg = Boolean(
        user?.assessorRegNumber ||
        user?.assessorRegistrationNumber ||
        submission?.grading?.assessorRegNumber
    );

    // 3. Enforce Strict Rights (Bypasses SETA Registration number if SECAM / Bootcamp):
    const hasAssessorRights = isSuperAdmin || isAdmin || (
        isSECAM
            ? (isCertifiedAssessor || isFacilitator || isMentor)
            : (isCertifiedAssessor && hasAssessorReg)
    );

    // cskonst isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus00-);
    // const isModDone = ['moderated', 'appealed'].includes(currentStatus);

    // // 🚀 STRICT QCTO & COHORT-SCOPED ROLE IDENTIFICATION
    // const isMentor = user?.role === 'mentor';
    // const isFacilitator = user?.role === 'facilitator' || user?.role === 'assistant_facilitator';
    // const isAssessor = user?.role === 'assessor';
    // const isModerator = user?.role === 'moderator';
    // const isAdmin = user?.role === 'admin' || user?.role === 'assistant_admin';
    // const isSuperAdmin = Boolean(user?.isSuperAdmin);

    // const secondaryRoles = Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [];
    // const userAssignedCohorts = Array.isArray(user?.assignedCohortIds) ? user.assignedCohortIds : [];

    // // 1. Verify if the user is explicitly assigned to this submission's cohort
    // const isAssignedToCurrentCohort = Boolean(
    //     submission?.cohortId && userAssignedCohorts.includes(submission.cohortId)
    // );

    // // // 2. Strict QCTO Assessor Accreditation Checks
    // // const isCertifiedAssessor = isAssessor ||
    // //     secondaryRoles.includes('assessor') ||
    // //     Boolean(user?.canMarkAssessments);

    // // const hasAssessorReg = Boolean(
    // //     user?.assessorRegNumber ||
    // //     user?.assessorRegistrationNumber ||
    // //     submission?.grading?.assessorRegNumber
    // // );

    // // // 3. Enforce Strict Rights:
    // // const hasAssessorRights = isSuperAdmin || isAdmin || (isCertifiedAssessor && hasAssessorReg);

    // // 2. Strict QCTO Assessor Accreditation Checks
    // const isCertifiedAssessor = isAssessor ||
    //     secondaryRoles.includes('assessor') ||
    //     Boolean(user?.canMarkAssessments);

    // const hasAssessorReg = Boolean(
    //     user?.assessorRegNumber ||
    //     user?.assessorRegistrationNumber ||
    //     submission?.grading?.assessorRegNumber
    // );

    // // 3. Enforce Strict Rights (Bypasses SETA Registration number if SECAM / Bootcamp):
    // const hasAssessorRights = isSuperAdmin || isAdmin || (
    //     isSECAM
    //         ? (isCertifiedAssessor || isFacilitator || isMentor)
    //         : (isCertifiedAssessor && hasAssessorReg)
    // );

    const hasFacilitatorRights = isSuperAdmin || isAdmin || isFacilitator || Boolean(user?.canFacilitateCohorts) || secondaryRoles.includes('facilitator') || isMentor;

    // Bypassed isAssignedToCurrentCohort for Moderators and Admins
    const hasModeratorRights = isSuperAdmin || isAdmin || isModerator || secondaryRoles.includes('moderator');

    const isAdminOrFacilitator = isSuperAdmin || ((isAdmin || isFacilitator || hasFacilitatorRights) && isAssignedToCurrentCohort);

    const savedFacRole = submission?.grading?.facilitatorRole;
    const displayFacRole = isFacDone ? savedFacRole : user?.role;

    const facPanelTitle = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : `Facilitator Pre-Marking`;
    const facRemarksLabel = displayFacRole === 'mentor' ? 'Supervisor Comments' : `Facilitator Remarks`;
    const facSubmitLabel = displayFacRole === 'mentor' ? 'Verify & Send to Assessor' : 'Send to Assessor';
    const facReadOnlyLabel = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark';

    const canFacilitatorMark = hasFacilitatorRights && (
        currentStatus === 'submitted' ||
        (!isPureKnowledge && ['not_started', 'in_progress'].includes(currentStatus))
    );

    const canGrade = hasAssessorRights && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned' || currentStatus === 'missed' || currentStatus === 'violation');
    const canModerate = hasModeratorRights && currentStatus === 'graded';
    const canReturnToLearner = isMentor && ['submitted', 'in_progress'].includes(currentStatus);

    const isPast48Hours = useMemo(() => {
        const refDate = submission?.submittedAt || submission?.startedAt;
        if (!refDate) return false;
        const diffHours = (new Date().getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60);
        return diffHours >= 48;
    }, [submission?.submittedAt, submission?.startedAt]);

    const disableExtraTime = isAssDone || isPast48Hours;

    // 🚀 PROCTOR SNAPSHOT LISTENER WITH ERROR HANDLER
    useEffect(() => {
        if (!submission) return;
        const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
        const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
        const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

        const unsubscribe = onSnapshot(
            doc(db, 'live_proctor_sessions', sessionDocId),
            (snap) => {
                if (snap.exists()) {
                    setProctorSession(snap.data());
                }
            },
            (err) => {
                console.warn("Live proctor session snapshot error caught:", err.message);
            }
        );
        return () => unsubscribe();
    }, [submission?.assessmentId, submission?.authUid, submission?.learnerId, submission?.learnerDeclaration]);

    // 🚀 MAIN SUBMISSION SNAPSHOT LISTENER WITH ERROR HANDLER
    useEffect(() => {
        if (!submissionId) return;

        let isInitialLoad = true;

        const unsubscribe = onSnapshot(
            doc(db, 'learner_submissions', submissionId),
            async (subSnap) => {
                try {
                    if (!subSnap.exists()) throw new Error("Submission not found");
                    const subData = subSnap.data();

                    setSubmission({ id: subSnap.id, ...subData });

                    if (isInitialLoad) {
                        const assRef = doc(db, 'assessments', subData.assessmentId);
                        const assSnap = await getDoc(assRef);
                        if (!assSnap.exists()) throw new Error("Assessment template missing");
                        const assData = assSnap.data();
                        setAssessment(assData);

                        const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || subData.authUid || subData.learnerId;
                        const learnerRef = doc(db, 'learners', subData.learnerId || targetLearnerUid);
                        const learnerSnap = await getDoc(learnerRef);

                        let lData = null;
                        if (learnerSnap.exists()) {
                            lData = learnerSnap.data();
                        } else {
                            const fallbackQ = query(collection(db, 'learners'), where('authUid', '==', targetLearnerUid));
                            const fallbackSnap = await getDocs(fallbackQ);
                            if (!fallbackSnap.empty) {
                                lData = fallbackSnap.docs[0].data();
                            } else {
                                const fallbackQ2 = query(collection(db, 'learners'), where('idNumber', '==', subData.learnerId));
                                const fallbackSnap2 = await getDocs(fallbackQ2);
                                if (!fallbackSnap2.empty) lData = fallbackSnap2.docs[0].data();
                            }
                        }

                        if (lData) {
                            setLearner(lData);
                            setLearnerProfile(lData);
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
                                } else if (block.type === 'text' || block.type === 'task' || block.type === 'code_sandbox') {
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
                        setLearnerTimeOverride(subData.learnerDurationOverride || '');

                        isInitialLoad = false;
                    }
                } catch (err: any) {
                    toast.error(err.message || "Failed to load data.");
                } finally {
                    setLoading(false);
                }
            },
            (err) => {
                console.warn("Submission review snapshot error caught:", err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [submissionId]);

    const groupSessionKey = useMemo(() => `group_obs_${assessment?.id}_${submission?.cohortId}_${user?.uid}`, [assessment?.id, submission?.cohortId, user?.uid]);

    useEffect(() => {
        if (!groupSessionKey) return;
        const saved = localStorage.getItem(groupSessionKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.isGroupSessionActive) {
                    setSelectedGroupPeers(parsed.selectedGroupPeers || []);
                    setGroupMatrixGrades(parsed.groupMatrixGrades || {});
                    setGroupTimeMatrix(parsed.groupTimeMatrix || {});
                    setGroupRemarks(parsed.groupRemarks || '');
                    setIsGroupSessionActive(true);
                }
            } catch (e) {
                console.error("Failed to parse local group session cache", e);
            }
        }
    }, [groupSessionKey]);

    useEffect(() => {
        if (!groupSessionKey) return;
        if (isGroupSessionActive || selectedGroupPeers.length > 0) {
            localStorage.setItem(groupSessionKey, JSON.stringify({
                selectedGroupPeers,
                groupMatrixGrades,
                groupTimeMatrix,
                groupRemarks,
                isGroupSessionActive
            }));
        }
    }, [selectedGroupPeers, groupMatrixGrades, groupTimeMatrix, groupRemarks, isGroupSessionActive, groupSessionKey]);

    const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
    const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

    const resolveAssTime = () => assTimeOverride !== '' ? Number(assTimeOverride) * 60 : getAssTime();
    const resolveModTime = () => modTimeOverride !== '' ? Number(modTimeOverride) * 60 : getModTime();

    const groupCriteriaList = useMemo(() => {
        const list: any[] = [];
        if (!assessment?.blocks) return list;
        assessment.blocks.forEach((b: any) => {
            if (b.type === 'checklist') {
                b.criteria?.forEach((crit: string, i: number) => {
                    list.push({ id: `${b.id}_${i}`, description: `[${b.title}] ${crit}`, blockId: b.id, index: i, type: 'checklist' });
                });
            } else if (b.type === 'qcto_workplace') {
                b.workActivities?.forEach((wa: any, i: number) => {
                    list.push({ id: `${b.id}_${i}`, description: `[${b.weCode}] ${wa.code}: ${wa.description}`, blockId: b.id, index: i, type: 'workplace' });
                });
            }
        });
        return list;
    }, [assessment]);

    const handleOpenGroupMode = async () => {
        setIsFetchingPeers(true);
        try {
            const q = query(
                collection(db, 'learner_submissions'),
                where('assessmentId', '==', assessment.id),
                where('cohortId', '==', submission.cohortId)
            );
            const snap = await getDocs(q);

            const peers: any[] = [];
            for (const docSnap of snap.docs) {
                if (docSnap.id === submission.id) continue;
                const subData = docSnap.data();

                const st = subData.status?.toLowerCase();
                if (['graded', 'moderated', 'appealed'].includes(st)) continue;

                let peerName = subData.learnerDeclaration?.learnerName || 'Unknown Learner';
                if (peerName === 'Unknown Learner' && subData.authUid) {
                    const uSnap = await getDoc(doc(db, 'users', subData.authUid));
                    if (uSnap.exists()) peerName = uSnap.data().fullName || peerName;
                }

                peers.push({ id: docSnap.id, name: peerName });
            }
            setAvailablePeers(peers);

            if (selectedGroupPeers.length === 0) {
                setSelectedGroupPeers([{ id: submission.id, name: learner?.fullName || 'Current Learner' }]);
            }

            setShowGroupMatrix(true);
        } catch (e) {
            toast.error("Failed to fetch available peers for group observation.");
        } finally {
            setIsFetchingPeers(false);
        }
    };

    const handleDisbandGroupSession = () => {
        setModalConfig({
            isOpen: true,
            type: 'warning',
            title: 'Disband Group Session?',
            message: "Are you sure you want to disband this group session? Ongoing timers and unsaved grades will be cleared.",
            confirmText: 'Yes, Disband',
            onConfirm: () => {
                setModalConfig(null);
                setSelectedGroupPeers([]);
                setGroupMatrixGrades({});
                setGroupTimeMatrix({});
                setGroupRemarks('');
                setIsGroupSessionActive(false);
                localStorage.removeItem(groupSessionKey);
                setShowGroupMatrix(false);
                toast.info("Group session disbanded.");
            },
            onCancel: () => setModalConfig(null)
        });
    };

    const handleSaveGroupMatrix = async () => {
        setSaving(true);
        try {
            const nowIso = new Date().toISOString();
            const batch = writeBatch(db);

            const allSubIds = new Set<string>();
            Object.values(groupMatrixGrades).forEach(critMap => {
                Object.keys(critMap).forEach(subId => allSubIds.add(subId));
            });
            allSubIds.add(submission.id);

            for (const subId of Array.from(allSubIds)) {
                const subRef = doc(db, 'learner_submissions', subId);

                const individualSubSnap = await getDoc(subRef);
                if (!individualSubSnap.exists()) continue;
                const individualSubData = individualSubSnap.data();

                const patchPayload: Record<string, any> = {
                    'grading.facilitatorOverallFeedback': groupRemarks,
                    'grading.facilitatorId': user?.uid,
                    'grading.facilitatorName': user?.fullName,
                    'grading.facilitatorRole': user?.role,
                    'grading.facilitatorSignatureUrl': user?.signatureUrl,
                    'grading.facilitatorReviewedAt': nowIso,
                    lastStaffEditAt: nowIso
                };

                let individualTaskMinutes = 0;

                groupCriteriaList.forEach(crit => {
                    const isChecked = groupMatrixGrades[crit.id]?.[subId] || false;
                    const cellTime = groupTimeMatrix?.[crit.id]?.[subId] || {};
                    const baseBlockPath = `grading.facilitatorBreakdown.${crit.blockId}`;

                    if (crit.type === 'checklist') {
                        patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.status`] = isChecked ? 'C' : null;
                        if (cellTime.startTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.startTime`] = cellTime.startTime;
                        if (cellTime.endTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.endTime`] = cellTime.endTime;
                    } else if (crit.type === 'workplace') {
                        patchPayload[`${baseBlockPath}.activityResults.${crit.index}.status`] = isChecked ? 'C' : null;
                    }

                    if (isChecked) {
                        patchPayload[`${baseBlockPath}.obsDeclaration`] = true;
                    }

                    if (cellTime.startTime && cellTime.endTime) {
                        const diffMs = new Date(cellTime.endTime).getTime() - new Date(cellTime.startTime).getTime();
                        if (diffMs > 0) individualTaskMinutes += Math.floor(diffMs / 60000);
                    }
                });

                if (individualTaskMinutes > 0) {
                    patchPayload['grading.facilitatorTimeSpent'] = individualTaskMinutes * 60;
                } else if (subId === submission.id) {
                    patchPayload['grading.facilitatorTimeSpent'] = resolveFacTime();
                }

                if (!individualSubData.grading?.facilitatorStartedAt) {
                    patchPayload['grading.facilitatorStartedAt'] = nowIso;
                }

                const individualCurrentStatus = String(individualSubData.status || '').toLowerCase();
                const newStatus = ['not_started', 'in_progress'].includes(individualCurrentStatus)
                    ? 'awaiting_learner_signoff'
                    : individualSubData.status;

                patchPayload.status = newStatus;

                batch.update(subRef, patchPayload);
            }

            await batch.commit();

            let activeFacBreakdown = { ...facBreakdown };

            groupCriteriaList.forEach(crit => {
                if (!activeFacBreakdown[crit.blockId]) {
                    activeFacBreakdown[crit.blockId] = { score: 0, feedback: '', criteriaResults: [], activityResults: [] };
                }

                const isChecked = groupMatrixGrades[crit.id]?.[submission.id] || false;
                const cellTime = groupTimeMatrix?.[crit.id]?.[submission.id] || {};

                const targetBlock = activeFacBreakdown[crit.blockId];

                if (crit.type === 'checklist') {
                    if (!targetBlock.criteriaResults) {
                        targetBlock.criteriaResults = [];
                    }

                    const critResults = targetBlock.criteriaResults;

                    while (critResults.length <= crit.index) {
                        critResults.push({ status: null, comment: '', startTime: '', endTime: '' });
                    }

                    const currentItem = critResults[crit.index];
                    if (currentItem) {
                        currentItem.status = isChecked ? 'C' : null;
                        if (cellTime.startTime) currentItem.startTime = cellTime.startTime;
                        if (cellTime.endTime) currentItem.endTime = cellTime.endTime;
                    }
                }

                if (isChecked) targetBlock.obsDeclaration = true;
            });

            setFacBreakdown(activeFacBreakdown);
            setFacOverallFeedback(groupRemarks);
            toast.success("Group metrics and individual task timers synchronized successfully!");

            setSelectedGroupPeers([]);
            setGroupMatrixGrades({});
            setGroupTimeMatrix({});
            setGroupRemarks('');
            setIsGroupSessionActive(false);
            localStorage.removeItem(groupSessionKey);
            setShowGroupMatrix(false);

        } catch (e) {
            console.error(e);
            toast.error("Failed to commit group matrix update configurations.");
        } finally {
            setSaving(false);
        }
    };

    const handleFacOverallFeedbackChange = (val: string) => {
        if (!canFacilitatorMark) return;
        setFacOverallFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
    };

    const handleAssOverallFeedbackChange = (val: string) => {
        if (!canGrade) return;
        setAssOverallFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
    };

    const handleModFeedbackChange = (val: string) => {
        if (!canModerate) return;
        setModFeedback(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
    };

    const handleCompetencySelect = (val: CompetencyStatus) => {
        if (!canGrade) return;
        setCompetency(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
    };

    const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
        if (!canModerate) return;
        setModOutcome(val);
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
    };

    const handleLearnerTimeOverrideChange = (val: string) => {
        const parsedVal = val === '' ? '' : Math.max(1, parseInt(val) || 0);
        setLearnerTimeOverride(parsedVal);
        setSubmission((prev: any) => ({ ...prev, learnerDurationOverride: parsedVal }));
        triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
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
                    learnerDurationOverride: learnerTimeOverride === '' ? deleteField() : Number(learnerTimeOverride),
                    lastStaffEditAt: new Date().toISOString()
                };
                if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
                if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

                if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = resolveFacTime();
                if (canGrade) updatePayload['grading.assessorTimeSpent'] = resolveAssTime();
                if (canModerate) updatePayload['moderation.timeSpent'] = resolveModTime();

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

    const computedLearnerDurationText = useMemo(() => {
        if (submission?.learnerDurationOverride) {
            return `${submission.learnerDurationOverride}m 0s (Manually Adjusted)`;
        }
        if (submission?.startedAt && submission?.submittedAt) {
            const diffSecs = Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000);
            const h = Math.floor(diffSecs / 3600), m = Math.floor((diffSecs % 3600) / 60), s = diffSecs % 60;
            return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
        }
        return 'N/A';
    }, [submission?.startedAt, submission?.submittedAt, submission?.learnerDurationOverride]);

    const executeZeroGrade = () => {
        setModalConfig({
            isOpen: true,
            type: 'warning',
            title: 'Assign Zero-Grade?',
            message: "Are you sure you want to assign a Zero-Grade for this submission? This action cannot be undone.",
            confirmText: 'Yes, Assign Zero',
            onConfirm: async () => {
                setModalConfig(null);
                setSaving(true);
                try {
                    const fallbackAssessorReg =
                        (user as any)?.assessorRegNumber ||
                        (user as any)?.assessorRegistrationNumber ||
                        ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'graded',
                        marks: 0,
                        competency: 'NYC',
                        'grading.assessorOverallFeedback': submission?.systemNote || 'Unexcused Absence / Security Violation: Learner failed to complete the assessment successfully.',
                        'grading.gradedBy': user?.uid,
                        'grading.assessorName': user?.fullName,
                        'grading.assessorSignatureUrl': user?.signatureUrl,
                        'grading.assessorRegNumber': fallbackAssessorReg,
                        'grading.gradedAt': new Date().toISOString(),
                        lastStaffEditAt: new Date().toISOString()
                    });
                    toast.success("Zero-Grade officially assigned.");
                    setTimeout(() => window.location.reload(), 1000);
                } catch (e) {
                    toast.error("Failed to apply zero grade.");
                } finally {
                    setSaving(false);
                }
            },
            onCancel: () => setModalConfig(null)
        });
    };

    const handleReopenMissedAssessment = () => {
        setShowExcuseModal(true);
    };

    const executeExcuseAndReopen = async (excuseReason: string) => {
        setShowExcuseModal(false);
        setSaving(true);

        try {
            const timestampIso = new Date().toISOString();

            const excuseLogEntry = {
                excusedAt: timestampIso,
                excusedBy: user?.uid,
                excusedByName: user?.fullName || 'Staff Member',
                excusedByRole: user?.role || 'facilitator',
                reason: excuseReason,
                previousStatus: currentStatus,
                previousSystemNote: submission?.systemNote || null
            };

            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission,
                archivedAt: timestampIso,
                snapshotReason: `Attempt Restarted - Internet/Tech Failure Excused`
            });

            const subRef = doc(db, 'learner_submissions', submission.id);
            await updateDoc(subRef, {
                status: 'not_started',
                overrideUnlock: true,
                startedAt: deleteField(),
                submittedAt: deleteField(),
                attemptNumber: (submission.attemptNumber || 1) + 1,
                systemNote: `Excused & Restarted by ${user?.fullName || 'Staff'}: "${excuseReason}"`,
                excusedLogs: arrayUnion(excuseLogEntry),
                lastStaffEditAt: timestampIso
            });

            setSubmission((prev: any) => ({
                ...prev,
                status: 'not_started',
                overrideUnlock: true,
                attemptNumber: (prev.attemptNumber || 1) + 1,
                systemNote: `Excused: ${excuseReason}`
            }));

            toast.success("Assessment excused and reopened for learner. Timer reset.");
        } catch (e) {
            console.error("Failed to excuse and reopen assessment:", e);
            toast.error("Failed to update submission record.");
        } finally {
            setSaving(false);
        }
    };

    const grantExtraTime = async (minutes: number, reason: string = 'Staff granted extra time') => {
        setSaving(true);
        const targetSubId = submissionId || submission?.id;

        try {
            const subRef = doc(db, 'learner_submissions', targetSubId);
            const timestampIso = new Date().toISOString();
            const nowMs = Date.now();

            const extraTimeLog = {
                grantedAt: timestampIso,
                grantedBy: user?.uid,
                grantedByName: user?.fullName || 'Staff',
                minutesAdded: minutes,
                reason: reason
            };

            const baseLimitMins = assessment?.moduleInfo?.timeLimit || 60;

            let usedBaseMins = baseLimitMins;
            if (submission?.startedAt) {
                const startMs = new Date(submission.startedAt).getTime();
                const endMs = submission?.submittedAt ? new Date(submission.submittedAt).getTime() : nowMs;
                const diffMins = Math.floor((endMs - startMs) / 60000);
                usedBaseMins = Math.min(baseLimitMins, Math.max(0, diffMins));
            }

            const newStartIso = new Date(nowMs - (usedBaseMins * 60 * 1000)).toISOString();

            const payload: any = {
                status: 'in_progress',
                extraTimeGranted: (submission?.extraTimeGranted || 0) + minutes,
                extraTimeLogs: arrayUnion(extraTimeLog),
                startedAt: newStartIso,
                lastStaffEditAt: timestampIso
            };

            if (submission?.submittedAt || submission?.autoSubmitted) {
                payload.previousSubmissionAudit = {
                    submittedAt: submission.submittedAt || null,
                    autoSubmitted: submission.autoSubmitted || false,
                    unlockedAt: timestampIso,
                    unlockedBy: user?.uid,
                    unlockedByName: user?.fullName || 'Staff'
                };
                payload.submittedAt = deleteField();
                payload.autoSubmitted = deleteField();
            }

            await updateDoc(subRef, payload);

            setSubmission((prev: any) => {
                const next = {
                    ...prev,
                    status: 'in_progress',
                    startedAt: newStartIso,
                    extraTimeGranted: (prev?.extraTimeGranted || 0) + minutes,
                    previousSubmissionAudit: payload.previousSubmissionAudit || prev?.previousSubmissionAudit
                };
                if (payload.submittedAt) delete next.submittedAt;
                if (payload.autoSubmitted) delete next.autoSubmitted;
                return next;
            });

            toast.success(`Granted ${minutes} extra minutes! Assessment unlocked and resumed.`);
            setShowExtraTimeModal(false);
        } catch (error: any) {
            console.error("❌ Extra time update failed:", error);
            toast.error(`Failed to grant extra time: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleDeferredAccess = async () => {
        setSaving(true);
        const newState = !submission.overrideUnlock;
        try {
            const subRef = doc(db, 'learner_submissions', submissionId!);
            const payload: any = {
                overrideUnlock: newState,
                lastStaffEditAt: new Date().toISOString()
            };

            await updateDoc(subRef, payload);
            setSubmission((prev: any) => ({
                ...prev,
                overrideUnlock: newState
            }));
            toast.success(newState ? "Deferred access granted. Assessment unlocked!" : "Deferred access revoked. Assessment locked.");
        } catch (error) {
            toast.error("Failed to update access settings.");
        } finally {
            setSaving(false);
        }
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
                status: 'not_started',
                startedAt: deleteField(),
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

    const autoSummedTaskMinutes = useMemo(() => {
        let totalMs = 0;
        Object.values(facBreakdown).forEach((grade: GradeData) => {
            (grade.criteriaResults || []).forEach((crit: CriterionResult) => {
                if (crit.startTime && crit.endTime) {
                    const st = new Date(crit.startTime).getTime();
                    const et = new Date(crit.endTime).getTime();
                    if (et > st) totalMs += (et - st);
                }
            });
        });
        return Math.floor(totalMs / 60000);
    }, [facBreakdown]);

    const showAssessorPanel = true;
    const showModeratorPanel = true;

    let activeTotals = facTotals;
    if (showAssessorPanel) activeTotals = assTotals;
    if (showModeratorPanel) activeTotals = modTotals;

    const resolveFacTime = () => {
        if (facTimeOverride !== '') return Number(facTimeOverride) * 60;
        if (autoSummedTaskMinutes > 0) return autoSummedTaskMinutes * 60;
        return getFacTime();
    };

    // const executeQuickUnlock = async (reason: string) => {
    //     setSaving(true);
    //     try {
    //         const timestampIso = new Date().toISOString();

    //         // 1. Archive the failed attempt
    //         const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
    //         await setDoc(historyRef, {
    //             ...submission,
    //             archivedAt: timestampIso,
    //             snapshotReason: `Quick Unlock (Coaching Waived): ${reason}`
    //         });

    //         // 2. Reset the main submission and inject a system note
    //         await updateDoc(doc(db, 'learner_submissions', submission.id), {
    //             status: 'not_started',
    //             startedAt: deleteField(),
    //             competency: deleteField(),
    //             grading: deleteField(),
    //             moderation: deleteField(),
    //             submittedAt: deleteField(),
    //             learnerDeclaration: deleteField(),
    //             attemptNumber: (submission.attemptNumber || 1) + 1,
    //             lastStaffEditAt: timestampIso,
    //             hasOverride: true, // 🚀 This tells the AssessmentGate to bypass the coaching check!
    //             systemNote: `Coaching Waived. Quick-Unlocked by ${user?.fullName}: "${reason}"`
    //         });

    //         toast.success("Workbook quick-unlocked for the learner!");
    //         setTimeout(() => window.location.reload(), 1500);
    //     } catch (err) {
    //         toast.error("Failed to quick-unlock workbook.");
    //     } finally {
    //         setSaving(false);
    //     }
    // };

    // const executeQuickUnlock = async (reason: string) => {
    //     setSaving(true);
    //     try {
    //         const timestampIso = new Date().toISOString();

    //         // 1. Archive the failed attempt for the audit trail
    //         const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
    //         await setDoc(historyRef, {
    //             ...submission,
    //             archivedAt: timestampIso,
    //             snapshotReason: `Quick Unlock (Coaching Waived): ${reason}`,
    //             // 🚀 FIX: Attach the coaching log to the history snapshot so the Archive UI displays it!
    //             coachingLog: {
    //                 date: timestampIso,
    //                 notes: `Formative Fast-Tracked (Coaching Waived): ${reason}`,
    //                 facilitatorId: user?.uid || 'system',
    //                 facilitatorName: user?.fullName || 'Facilitator',
    //                 acknowledged: true,
    //                 acknowledgedAt: timestampIso
    //             }
    //         });

    //         // 2. Reset the main submission and inject the "Fast-Tracked" coaching log
    //         await updateDoc(doc(db, 'learner_submissions', submission.id), {
    //             status: 'not_started',
    //             startedAt: deleteField(),
    //             competency: deleteField(),
    //             grading: deleteField(),
    //             moderation: deleteField(),
    //             submittedAt: deleteField(),
    //             learnerDeclaration: deleteField(),
    //             attemptNumber: (submission.attemptNumber || 1) + 1,
    //             lastStaffEditAt: timestampIso,
    //             hasOverride: true,
    //             latestCoachingLog: {
    //                 date: timestampIso,
    //                 notes: `Formative Fast-Tracked (Coaching Waived): ${reason}`,
    //                 facilitatorId: user?.uid || 'system',
    //                 facilitatorName: user?.fullName || 'Facilitator',
    //                 acknowledged: true, // Auto-acknowledges so the Gate doesn't block them
    //                 acknowledgedAt: timestampIso
    //             }
    //         });

    //         toast.success("Workbook quick-unlocked for the learner!");
    //         setTimeout(() => window.location.reload(), 1500);
    //     } catch (err) {
    //         toast.error("Failed to quick-unlock workbook.");
    //     } finally {
    //         setSaving(false);
    //     }
    // };

    const executeQuickUnlock = async (reason: string) => {
        setSaving(true);
        try {
            const timestampIso = new Date().toISOString();

            // 1. Archive the failed attempt for the audit trail
            const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
            await setDoc(historyRef, {
                ...submission,
                archivedAt: timestampIso,
                snapshotReason: `Quick Unlock (Coaching Waived): ${reason}`,
                // 🚀 FIX: Attach the coaching log to the history snapshot so the Archive UI displays it!
                coachingLog: {
                    date: timestampIso,
                    notes: `Formative Fast-Tracked (Coaching Waived): ${reason}`,
                    facilitatorId: user?.uid || 'system',
                    facilitatorName: user?.fullName || 'Facilitator',
                    acknowledged: true,
                    acknowledgedAt: timestampIso
                }
            });

            // 2. Reset the main submission and inject the "Fast-Tracked" coaching log
            await updateDoc(doc(db, 'learner_submissions', submission.id), {
                status: 'not_started',
                startedAt: deleteField(),
                competency: deleteField(),
                grading: deleteField(),
                moderation: deleteField(),
                submittedAt: deleteField(),
                learnerDeclaration: deleteField(),
                coachingRequested: deleteField(),
                coachingRequestedAt: deleteField(),
                attemptNumber: (submission.attemptNumber || 1) + 1,
                lastStaffEditAt: timestampIso,
                hasOverride: true,
                latestCoachingLog: {
                    date: timestampIso,
                    notes: `Formative Fast-Tracked (Coaching Waived): ${reason}`,
                    facilitatorId: user?.uid || 'system',
                    facilitatorName: user?.fullName || 'Facilitator',
                    acknowledged: true, // Auto-acknowledges so the Gate doesn't block them
                    acknowledgedAt: timestampIso
                }
            });

            toast.success("Workbook quick-unlocked for the learner!");
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            toast.error("Failed to quick-unlock workbook.");
        } finally {
            setSaving(false);
        }
    };

    const sectionTotals: Record<string, { total: number, awarded: number }> = {};
    let currentSectionId = '';
    if (assessment?.blocks) {
        assessment.blocks.forEach((block: any) => {
            if (block.type === 'section') {
                currentSectionId = block.id;
                sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
            } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type) && currentSectionId) {
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

            if (isWorkplaceModule && (isAdmin || isFacilitator) && !isModerating) {
                return false;
            }

            if (['mcq', 'text', 'task', 'code_sandbox'].includes(block.type)) {
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
                        'grading.facilitatorSignatureUrl': user?.signatureUrl,
                        'grading.facilitatorReviewedAt': new Date().toISOString(),
                        'grading.facilitatorTimeSpent': resolveFacTime()
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
                    const fallbackAssessorReg =
                        (user as any)?.assessorRegNumber ||
                        (user as any)?.assessorRegistrationNumber ||
                        ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: 'graded', marks: assTotals.score, competency,
                        'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback,
                        'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName,
                        'grading.assessorSignatureUrl': user?.signatureUrl,
                        'grading.assessorRegNumber': fallbackAssessorReg,
                        'grading.gradedAt': new Date().toISOString(),
                        'grading.assessorTimeSpent': resolveAssTime()
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
                    const fallbackModReg =
                        (user as any)?.moderatorRegNumber ||
                        (user as any)?.assessorRegNumber ||
                        ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

                    const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';

                    await updateDoc(doc(db, 'learner_submissions', submission.id), {
                        status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome,
                        'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid,
                        'moderation.moderatorName': user?.fullName,
                        'moderation.moderatorSignatureUrl': user?.signatureUrl,
                        'moderation.moderatorRegNumber': fallbackModReg,
                        'moderation.moderatedAt': new Date().toISOString(),
                        'moderation.timeSpent': resolveModTime()
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

    // if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;
    if (!submission || !assessment) {
        return (
            <div className="sr-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
                <div
                    className="animate-fade-in"
                    style={{
                        maxWidth: '460px',
                        width: '100%',
                        textAlign: 'center',
                        padding: '2.5rem 2rem',
                        background: 'white',
                        border: '1px solid var(--mlab-border)',
                        borderRadius: '8px',
                        borderTop: '4px solid var(--mlab-red, #ef4444)',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)'
                    }}
                >
                    <div style={{ background: '#fef2f2', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', border: '1px solid #fecaca' }}>
                        <AlertTriangle size={28} color="var(--mlab-red, #ef4444)" />
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0', letterSpacing: '0.05em' }}>
                        Record Unavailable
                    </h2>
                    <p style={{ fontSize: '0.88rem', color: 'var(--mlab-grey)', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
                        The requested assessment submission or template record could not be retrieved from the database.
                    </p>
                    <button
                        type="button"
                        className="lfm-btn lfm-btn--ghost"
                        onClick={() => navigate(-1)}
                        style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                        <ArrowLeft size={14} /> Return to Portfolio
                    </button>
                </div>
            </div>
        );
    }

    // const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
    const printOutcomeColor = submission.competency === 'C' || submission.competency === 'HC' ? 'green' : (['NYC', 'DEV', '1', '2'].includes(String(submission.competency || '').toUpperCase()) ? 'red' : 'black');

    const getCompetencyLabelText = (compStr: string) => {
        switch (compStr.toUpperCase()) {
            case 'HC':
            case '4':
                return 'Highly Competent (HC)';
            case 'C':
            case '3':
                return 'Competent (C)';
            case 'DEV':
            case '2':
                return 'Developing (DEV)';
            case 'NYC':
            case '1':
                return 'Not Yet Competent (NYC)';
            default:
                return compStr;
        }
    };
    const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');
    const canPrint = !['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus);

    const getFacilitatorStatus = () => {
        if (isFacDone) return 'done';
        if (canFacilitatorMark) return 'active';
        if (isAwaitingSignoff) return 'awaiting';
        if (['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus)) return 'locked';
        return 'awaiting';
    };

    const getAssessorStatus = () => {
        if (isAssDone) return 'done';
        if (canGrade) return 'active';
        if (['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff'].includes(currentStatus)) return 'locked';
        return 'awaiting';
    };

    const getModeratorStatus = () => {
        if (isModDone) return 'done';
        if (canModerate) return 'active';
        if (currentStatus !== 'graded') return 'locked';
        return 'awaiting';
    };

    const facPanelStatus = getFacilitatorStatus();
    const assPanelStatus = getAssessorStatus();
    const modPanelStatus = getModeratorStatus();

    const violationHistoryCount = proctorSession?.violationHistory?.length || submission?.violationHistory?.length || 0;

    const isProctoredAssessment = Boolean(
        assessment?.requiresInvigilation || assessment?.isProctored || assessment?.proctored || assessment?.isInvigilated || assessment?.proctoring
    );
    const showProctoringAuditCard = isViolation || isProctoredAssessment || violationHistoryCount > 0;

    return (
        <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {modalConfig && modalConfig.isOpen && createPortal(
                <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} onClose={modalConfig.onConfirm} onCancel={modalConfig.onCancel} />,
                document.body
            )}

            {showRemediationModal && createPortal(
                <RemediationModal submissionTitle={submission.title} attemptNumber={currentAttempt} onClose={() => setShowRemediationModal(false)} onSubmit={executeRemediation} />,
                document.body
            )}

            {showReturnToLearnerModal && createPortal(
                <ReturnToLearnerModal onClose={() => setShowReturnToLearnerModal(false)} onSubmit={executeReturnToLearner} />,
                document.body
            )}

            {showResolveAppealModal && createPortal(
                <ResolveAppealModal appealReason={submission.appeal?.reason || ''} onClose={() => setShowResolveAppealModal(false)} onSubmit={executeAppealResolution} />,
                document.body
            )}

            {showProctorEvidenceModal && (
                <SubmissionProctorEvidenceModal submission={submission} onClose={() => setShowProctorEvidenceModal(false)} />
            )}

            {showExcuseModal && createPortal(
                <ExcuseReopenModal
                    learnerName={learner?.fullName || submission?.learnerDeclaration?.learnerName || 'Learner'}
                    onClose={() => setShowExcuseModal(false)}
                    onSubmit={executeExcuseAndReopen}
                />,
                document.body
            )}

            {showExtraTimeModal && (
                <ExtraTimeModal
                    onClose={() => setShowExtraTimeModal(false)}
                    onSubmit={grantExtraTime}
                />
            )}

            {showGroupMatrix && createPortal(
                <GroupObservationMatrix
                    currentLearner={{ id: submission.id, name: learner?.fullName || 'Current Learner' }}
                    availablePeers={availablePeers}
                    criteria={groupCriteriaList}
                    selectedGroup={selectedGroupPeers}
                    setSelectedGroup={setSelectedGroupPeers}
                    matrix={groupMatrixGrades}
                    setMatrix={setGroupMatrixGrades}
                    groupTimeMatrix={groupTimeMatrix}
                    setGroupTimeMatrix={setGroupTimeMatrix}
                    groupRemarks={groupRemarks}
                    setGroupRemarks={setGroupRemarks}
                    isGroupSessionActive={isGroupSessionActive}
                    setIsGroupSessionActive={setIsGroupSessionActive}
                    onCancel={() => setShowGroupMatrix(false)}
                    onDisband={handleDisbandGroupSession}
                    onSaveGroup={handleSaveGroupMatrix}
                />,
                document.body
            )}

            <div className="ap-player-topbar no-print">
                <div className="ap-player-topbar__left">
                    <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
                    <div className="ap-player-topbar__separator" />
                    <h1 className="ap-player-topbar__title">
                        {/* {assessment.title}
                        {isSECAM && (
                            <span style={{ marginLeft: '10px', fontSize: '0.72rem', background: 'var(--mlab-blue)', color: 'var(--mlab-green)', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                mLab Skills SECAM
                            </span>
                        )}
                        {submission?.attemptNumber > 1 && (
                            <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
                                Attempt {submission.attemptNumber}
                            </span>
                        )} */}
                        {assessment.title}
                        {isSECAM && (
                            <span style={{ marginLeft: '10px', fontSize: '0.72rem', background: 'var(--mlab-blue)', color: 'var(--mlab-green)', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                mLab Skills SECAM
                            </span>
                        )}
                        {submission?.attemptNumber > 1 && (
                            <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
                                Attempt {submission.attemptNumber}
                            </span>
                        )}
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
                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
                            <FileArchive size={13} /> View Manual
                        </button>
                    )}

                    {isAdminOrFacilitator && assessment?.moduleInfo?.timeLimit > 0 && (
                        <button
                            type="button"
                            className="ap-topbar-print-btn"
                            onClick={() => !disableExtraTime && setShowExtraTimeModal(true)}
                            disabled={disableExtraTime}
                            title={disableExtraTime ? "Extra time cannot be granted after grading or 48 hours post-attempt." : "Grant extra time"}
                            style={{
                                background: disableExtraTime ? '#f1f5f9' : '#e0f2fe',
                                color: disableExtraTime ? '#94a3b8' : '#0369a1',
                                borderColor: disableExtraTime ? '#e2e8f0' : '#bae6fd',
                                fontWeight: 'bold',
                                cursor: disableExtraTime ? 'not-allowed' : 'pointer',
                                opacity: disableExtraTime ? 0.7 : 1
                            }}
                        >
                            <Timer size={14} style={{ marginRight: '4px' }} /> <span className="ap-hide-mobile">Add Time</span>
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

            <div className="sr-print-wrap">
                <div className="print-only-cover">
                    <div className="print-page">
                        <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
                            {isSECAM ? 'mLAB SKILLS SECAM EVALUATION REPORT' : `${assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}
                        </h1>
                        <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
                            {isSECAM ? 'PRACTICAL COMPETENCY ASSESSMENT' : `LEARNER WORKBOOK ${submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}`}
                        </h2>

                        <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
                            <tbody>
                                <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Framework</td><td>{isSECAM ? 'mLab Skills SECAM' : 'QCTO / SETA Accredited'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Program / Module</td><td>{assessment?.title || 'Bootcamp Module'}</td></tr>
                                <tr><td style={{ fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission?.attemptNumber || 1}</td></tr>
                                {!isSECAM && (
                                    <>
                                        <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
                                        <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
                                    </>
                                )}
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
                                    {(submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
                                        <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
                                    ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                    <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
                                    <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
                                    <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
                                </div>
                                <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
                                    <span style={{ color: 'black' }}>Learner Acknowledgement</span>
                                    {submission.latestCoachingLog.acknowledged ? (
                                        <>
                                            {(submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl) ? (
                                                <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={filterBlack} />
                                            ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
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

                <div className="sr-print-header">
                    <div className="sr-print-header-info">
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <p><strong>Learner Name:</strong> {learner?.fullName}</p>
                                <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
                                <p><strong>Submitted:</strong> {isSubmitted ? new Date(submission.submittedAt).toLocaleDateString() : 'Pending Submission'}</p>
                                <p><strong>Duration:</strong> {computedLearnerDurationText}</p>
                            </div>
                            <div>
                                <p><strong>Module:</strong> {assessment?.moduleInfo?.moduleNumber}</p>
                                <p><strong>Score:</strong> <span style={{ color: isWorkplaceModule ? '#64748b' : (isFacDone ? printInkColor : '#94a3b8'), fontWeight: 'bold' }}>{isWorkplaceModule ? 'N/A (Competency Based)' : (isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review')}</span></p>
                                {/* <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p> */}
                                <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? getCompetencyLabelText(submission.competency || 'Pending') : 'Pending Assessment'}</span></p>

                            </div>
                        </div>
                    </div>
                </div>

                <div className="sr-blocks">
                    <RenderBlocks
                        isSECAM={isSECAM}
                        assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
                        activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={true}
                        canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
                        isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
                        savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
                        handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
                        handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
                        handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
                        handleSetToNow={handleSetToNow}
                    />
                </div>

                <div className="print-page" style={{ marginTop: '20px' }}>
                    <h3 style={{ borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>Overall Assessment Feedback</h3>
                    {facOverallFeedback && (
                        <div style={{ borderLeft: '4px solid blue', padding: '15px', background: '#eff6ff', marginBottom: '15px', borderRadius: '4px' }}>
                            <h4 style={{ color: 'blue', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>{displayFacRole === 'mentor' ? 'Mentor Supervisor Comments' : `Facilitator Pre-Marking Remarks`}</h4>
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

                    {submission?.appeal?.status && (
                        <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                            <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
                            </h4>
                            <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
                            {submission.appeal.status !== 'pending' && (
                                <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
                                    <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="sr-signature-block">
                    <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
                        <span style={{ color: 'black' }}>Learner Declaration</span>
                        {isSubmitted ? (
                            <>
                                {(submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl) ? (
                                    <img src={submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl} alt="Learner signature" crossOrigin="anonymous" style={filterBlack} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
                                <strong style={{ color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</strong>
                                <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'black' }}>Awaiting Submission</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue' }}>
                        <span style={{ color: 'blue' }}>{displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
                        {isFacDone ? (
                            <>
                                {(submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
                                    <img src={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</strong>
                                <em style={{ color: 'blue' }}>Signed: {new Date(submission.grading?.facilitatorReviewedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>{displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'blue' }}>Awaiting Verification</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
                        <span style={{ color: 'red' }}>Assessor Sign-off</span>
                        {isAssDone ? (
                            <>
                                {(submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl) ? (
                                    <img src={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl} alt="Assessor Signature" crossOrigin="anonymous" style={filterRed} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'red', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
                                <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
                                <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'red' }}>Awaiting Assessment</div>}
                    </div>
                    <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
                        <span style={{ color: 'green' }}>Internal Moderation</span>
                        {isModDone ? (
                            <>
                                {(submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl) ? (
                                    <img src={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl} alt="Moderator Signature" crossOrigin="anonymous" style={filterGreen} />
                                ) : <div className="sr-sig-no-image" style={{ color: 'green', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
                                <strong style={{ color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
                                <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
                                <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
                                <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
                            </>
                        ) : <div className="sr-sig-no-image" style={{ color: 'green' }}>Awaiting Moderation</div>}
                    </div>
                </div>
            </div>

            {/* SCREEN LAYOUT */}
            <div className="sr-layout no-print">
                <div className="sr-content-pane">
                    {canFacilitatorMark && groupCriteriaList.length > 0 && (
                        <div className="no-print" style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
                            {isGroupSessionActive && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', background: '#fffbeb', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #fef3c7' }}>
                                    <Timer size={14} className="animate-pulse" /> Active Group Session Running...
                                </div>
                            )}
                            <button className="mlab-btn mlab-btn--primary" onClick={handleOpenGroupMode} disabled={isFetchingPeers || saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isFetchingPeers ? <Loader2 size={16} className="lfm-spin" /> : <Users size={16} />}
                                {isGroupSessionActive ? 'Resume Group Session' : 'Grade as Group'}
                            </button>
                        </div>
                    )}

                    {submission?.latestCoachingLog && currentAttempt > 1 && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase' }}><CheckCircle size={16} /> Remediation Coaching Logged</h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}><strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word' }}>"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
                        </div>
                    )}

                    {/* 🚀 FLEXIBLE INVIGILATION & PROCTORING INTEGRITY AUDIT CARD */}
                    {showProctoringAuditCard && (
                        <div style={{
                            background: isViolation ? '#fef2f2' : violationHistoryCount > 0 ? '#fffbeb' : '#f0fdf4',
                            border: `2px solid ${isViolation ? '#ef4444' : violationHistoryCount > 0 ? '#fde68a' : '#bbf7d0'}`,
                            padding: '1.25rem',
                            borderRadius: '8px',
                            marginBottom: '1.5rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                <div style={{ flex: 1, minWidth: '280px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <ShieldAlert size={20} color={isViolation ? '#dc2626' : violationHistoryCount > 0 ? '#b45309' : '#15803d'} />
                                        <h4 style={{ margin: 0, color: isViolation ? '#991b1b' : violationHistoryCount > 0 ? '#b45309' : '#14532d', textTransform: 'uppercase', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                            {isViolation ? 'Security Violation - Terminated' : violationHistoryCount > 0 ? 'Invigilation Audit: Warnings Logged' : 'Invigilation Audit: Clean Record'}
                                        </h4>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: isViolation ? '#b91c1c' : violationHistoryCount > 0 ? '#78350f' : '#166534', lineHeight: 1.4 }}>
                                        {isViolation
                                            ? 'This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured for staff inspection.'
                                            : violationHistoryCount > 0
                                                ? `AI tracking & screen monitoring were active. A total of ${violationHistoryCount} security warning(s) were captured during this attempt.`
                                                : 'AI face tracking and screen monitoring remained active throughout this session. Zero security anomalies were recorded.'}
                                    </p>
                                    {submission?.systemNote && isViolation && (
                                        <div style={{ background: '#ffffff', border: '1px solid #fecaca', padding: '8px 12px', marginTop: '10px', borderRadius: '4px' }}>
                                            <strong style={{ fontSize: '0.75rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</strong>
                                            <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#7f1d1d', fontStyle: 'italic' }}>
                                                "{submission.systemNote}"
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
                                    <button
                                        className="mlab-btn mlab-btn--sm"
                                        style={{
                                            background: isViolation ? '#2563eb' : violationHistoryCount > 0 ? '#d97706' : '#0284c7',
                                            color: 'white',
                                            border: 'none',
                                            padding: '8px 12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            fontWeight: 'bold',
                                            fontSize: '0.8rem'
                                        }}
                                        onClick={() => setShowProctorEvidenceModal(true)}
                                    >
                                        <Video size={14} /> View Proctoring Snapshots ({violationHistoryCount})
                                    </button>

                                    {isViolation && (isAdmin || isFacilitator) && (
                                        <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 12px', fontWeight: 'bold' }} onClick={handleReopenMissedAssessment} disabled={saving}>
                                            <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse & Reopen
                                        </button>
                                    )}
                                    {isViolation && canGrade && (
                                        <button className="mlab-btn mlab-btn--sm mlab-btn--error" style={{ padding: '8px 12px', fontWeight: 'bold' }} onClick={executeZeroGrade} disabled={saving}>
                                            Assign Zero Grade
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {isMissed && !isViolation && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontSize: '0.95rem' }}>
                                        <ShieldAlert size={18} /> Assessment Missed
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c', lineHeight: 1.5, maxWidth: '600px' }}>
                                        This learner failed to attend the scheduled assessment window. Please determine if this is an <strong>Excused Absence</strong> (reopen for the learner) or an <strong>Unexcused Absence</strong> (assign a zero grade).
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {(isAdmin || isFacilitator) && (
                                        <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none' }} onClick={handleReopenMissedAssessment} disabled={saving}>
                                            <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse Absence & Reopen
                                        </button>
                                    )}
                                    {canGrade && (
                                        <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={executeZeroGrade} disabled={saving}>
                                            Assign Zero Grade (Unexcused)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="sr-blocks">
                        <RenderBlocks
                            assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
                            activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={false}
                            canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
                            isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
                            savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
                            handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
                            handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
                            handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
                            handleSetToNow={handleSetToNow}
                        />
                    </div>
                </div>

                <aside className="sr-sidebar no-print">
                    <ReviewStageCard
                        colorTheme="blue" title={facPanelTitle} status={facPanelStatus}
                        lockedMessage="The learner has not submitted this assessment yet. Marking and feedback are locked until they complete their attempt."
                        awaitingTitle={isAwaitingSignoff ? 'Awaiting Learner Signature' : 'Awaiting Facilitator Review'}
                        awaitingMessage={isAwaitingSignoff ? 'You have saved your verification. The learner must now log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.' : 'The learner has submitted this assessment. Awaiting the Facilitator to complete their pre-marking.'}
                        showScore={!isWorkplaceModule && displayFacRole !== 'mentor'}
                        scoreAwarded={facTotals.score} scoreMax={facTotals.max} scorePct={facTotals.pct}
                        feedbackLabel={facRemarksLabel} feedbackPlaceholder="Add overall coaching comments..."
                        feedbackValue={facOverallFeedback} onFeedbackChange={handleFacOverallFeedbackChange}
                        submitLabel={facSubmitLabel} onSubmit={triggerSubmitFacilitator} isSaving={saving}
                        signatureLabel={displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}
                        signatureName={submission.grading?.facilitatorName || 'Facilitator'}
                        signatureUrl={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl}
                        signatureDate={submission.grading?.facilitatorReviewedAt ? new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString() : undefined}
                        signatureTagline={displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}
                        timeOverrideValue={facTimeOverride} onTimeOverrideChange={setFacTimeOverride}
                        autoTimeSeconds={getFacTime()} autoSummedMinutes={autoSummedTaskMinutes}
                        activeControls={
                            <>
                                {canReturnToLearner && (
                                    <button className="mlab-btn mlab-btn--ghost" style={{ width: '100%', marginTop: '10px', borderColor: '#bfdbfe', color: '#1d4ed8' }} onClick={() => setShowReturnToLearnerModal(true)} disabled={saving}>
                                        <Undo2 size={14} style={{ marginRight: '6px' }} /> Return to Learner for Corrections
                                    </button>
                                )}

                                {(isFacilitator || isAdmin) && ((submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0) || ['not_started', 'submitted', 'facilitator_reviewed', 'awaiting_learner_signoff'].includes(submission.status)) && (
                                    <div className="no-print" style={{ marginTop: '10px', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                        <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ShieldAlert size={14} /> Facilitator Overrides
                                        </p>

                                        {!isPureKnowledge && (
                                            <>
                                                {submission.status !== 'not_started' && (
                                                    <div style={{ marginBottom: '12px', borderBottom: '1px dashed #bfdbfe', paddingBottom: '10px' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e40af', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Learner Task Timer Override (Mins)</label>
                                                        <input type="number" min="1" placeholder="Enter true duration in minutes..." style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} value={learnerTimeOverride} onChange={(e) => handleLearnerTimeOverrideChange(e.target.value)} disabled={saving} />
                                                    </div>
                                                )}
                                                {submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0 && (
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                                        <button onClick={() => !disableExtraTime && grantExtraTime(15, 'Facilitator +15 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#cbd5e1' : '#3b82f6', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+15 Mins</button>
                                                        <button onClick={() => !disableExtraTime && grantExtraTime(30, 'Facilitator +30 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#94a3b8' : '#2563eb', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+30 Mins</button>
                                                        {submission.extraTimeGranted > 0 && <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold' }}>({submission.extraTimeGranted} min active)</span>}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {(submission.status === 'not_started') && (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button onClick={toggleDeferredAccess} className="mlab-btn mlab-btn--sm" style={{ background: submission.overrideUnlock ? '#ef4444' : '#10b981', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {submission.overrideUnlock ? <><Lock size={12} /> Revoke Access</> : <><Unlock size={12} /> Grant Deferred Access</>}
                                                </button>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{submission.overrideUnlock ? "Learner can bypass scheduling locks." : "Bound by global schedule."}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        }
                    />

                    <ReviewStageCard
                        colorTheme="red" title="Official Assessor Grading" status={assPanelStatus}
                        lockedMessage="Awaiting prior steps to be completed before grading can begin."
                        awaitingTitle="Awaiting Assessor Grading"
                        awaitingMessage="This submission is ready and waiting for the Assessor to assign final marks."
                        showScore={!isWorkplaceModule}
                        scoreAwarded={assTotals.score} scoreMax={assTotals.max} scorePct={assTotals.pct}
                        feedbackLabel="Assessor Remarks" feedbackPlaceholder="Provide holistic feedback..."
                        feedbackValue={assOverallFeedback} onFeedbackChange={handleAssOverallFeedbackChange}
                        submitLabel="Apply Signature & Finalise" onSubmit={triggerSubmitGrade} isSaving={saving}
                        signatureLabel="Assessor Signature" signatureName={submission.grading?.assessorName || 'Assessor'}
                        signatureUrl={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl}
                        signatureDate={submission.grading?.gradedAt ? new Date(submission.grading.gradedAt).toLocaleDateString() : undefined}
                        signatureMeta={`Reg: ${assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}`}
                        signatureTagline="Digital Signature Confirmed"
                        timeOverrideValue={assTimeOverride} onTimeOverrideChange={setAssTimeOverride} autoTimeSeconds={getAssTime()}
                        activeControls={
                            canGrade && !isMissed && !isViolation && (
                                <div className="sr-competency-section">
                                    <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
                                    <label className="sr-sidebar-label" style={{ color: 'red', marginTop: '1rem' }}>Final Competency</label>
                                    {/* <div className="sr-comp-toggles">
                                        <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
                                        <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent</button>
                                    </div> */}
                                    <div className="sr-comp-toggles" style={{ flexWrap: 'wrap', gap: '6px' }}>
                                        {isSECAM ? (
                                            <>
                                                <button className={`sr-comp-btn ${competency === 'HC' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('HC')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><Sparkles size={14} /> L4: Highly Competent</button>
                                                <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><Award size={14} /> L3: Competent</button>
                                                <button className={`sr-comp-btn ${competency === 'DEV' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('DEV')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><RefreshCw size={14} /> L2: Developing</button>
                                                <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><AlertCircle size={14} /> L1: NYC</button>
                                            </>
                                        ) : (
                                            <>
                                                <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
                                                <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent (NYC)</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        }
                    />

                    <ReviewStageCard
                        colorTheme="green" title="Internal Moderation (QA)" status={modPanelStatus}
                        lockedMessage="Awaiting Assessor to complete official grading before moderation can occur."
                        awaitingTitle="Awaiting Moderation"
                        awaitingMessage="This submission is ready and waiting for QA review by the Moderator."
                        showScore={true} scoreAwarded={modTotals.score} scoreMax={modTotals.max} scorePct={modTotals.pct}
                        feedbackLabel="Moderator Feedback" feedbackPlaceholder="Moderation feedback..."
                        feedbackValue={modFeedback} onFeedbackChange={handleModFeedbackChange}
                        submitLabel="Finalise QA & Endorse" onSubmit={triggerSubmitModeration} isSaving={saving}
                        signatureLabel="Moderator QA" signatureName={submission.moderation?.moderatorName || moderatorProfile?.fullName || 'Moderator'}
                        signatureUrl={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl}
                        signatureDate={submission.moderation?.moderatedAt ? new Date(submission.moderation.moderatedAt).toLocaleDateString() : undefined}
                        signatureMeta={`Outcome: ${submission.moderation?.outcome || modOutcome}`} signatureTagline="QA Sign-off Confirmed"
                        timeOverrideValue={modTimeOverride} onTimeOverrideChange={setModTimeOverride} autoTimeSeconds={getModTime()}
                        activeControls={
                            canGrade && !isMissed && !isViolation && (
                                <div className="sr-competency-section">
                                    <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
                                    <label className="sr-sidebar-label" style={{ color: 'red', marginTop: '1rem' }}>Final Competency</label>

                                    <div className="sr-comp-toggles" style={{ flexWrap: 'wrap', gap: '6px' }}>
                                        {isSECAM ? (
                                            <>
                                                <button className={`sr-comp-btn ${competency === 'HC' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('HC')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><Sparkles size={14} /> L4: Highly Competent</button>
                                                <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><Award size={14} /> L3: Competent</button>
                                                <button className={`sr-comp-btn ${competency === 'DEV' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('DEV')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><RefreshCw size={14} /> L2: Developing</button>
                                                <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')} style={{ fontSize: '0.75rem', padding: '6px 10px' }}><AlertCircle size={14} /> L1: NYC</button>
                                            </>
                                        ) : (
                                            <>
                                                <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
                                                <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent (NYC)</button>
                                            </>
                                        )}
                                    </div>

                                    {/* 🚀 ADDED: REMEDIATION & QUICK UNLOCK CONTROLS */}
                                    {isAssDone && ['NYC', 'DEV', '1', '2'].includes(String(submission?.competency || '').toUpperCase()) && !isAppealUpheld && (
                                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed #fca5a5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <label className="sr-sidebar-label" style={{ color: '#b91c1c' }}>Re-assessment Actions</label>

                                            <button
                                                className="mlab-btn mlab-btn--warning mlab-btn--sm"
                                                style={{ width: '100%', justifyContent: 'center' }}
                                                onClick={() => setShowRemediationModal(true)}
                                            >
                                                <MessageSquare size={14} style={{ marginRight: '6px' }} /> Log Coaching & Unlock Attempt #{(submission?.attemptNumber || 1) + 1}
                                            </button>

                                            {/* Only show Quick Unlock for Formatives or Admins */}
                                            {(!isSummative || isAdmin) && (
                                                <button
                                                    className="mlab-btn mlab-btn--outline mlab-btn--sm"
                                                    style={{ width: '100%', justifyContent: 'center', borderColor: '#fca5a5', color: '#b91c1c' }}
                                                    onClick={() => {
                                                        const reason = window.prompt("Reason for waiving the coaching session (e.g., 'Wrong file uploaded'):");
                                                        if (reason) {
                                                            executeQuickUnlock(reason);
                                                        }
                                                    }}
                                                >
                                                    <Unlock size={14} style={{ marginRight: '6px' }} /> Quick Unlock (Waive Coaching)
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        }
                    />

                    {/* ACADEMIC BOARD ACTIONS PANEL */}
                    {/* {(isAdmin || isSuperAdmin || isModerator) && (
                        <div className="sr-panel" style={{ marginTop: '1.5rem', borderTop: '3px solid #fca5a5', background: '#fef2f2', padding: '1.5rem' }}> */}
                    {/* ACADEMIC BOARD ACTIONS PANEL */}
                    {(isAdmin || isSuperAdmin || isModerator) && (submission?.appeal?.status === 'pending' || ['graded', 'moderated', 'appealed', 'missed', 'violation'].includes(currentStatus)) && (
                        <div className="sr-panel" style={{ marginTop: '1.5rem', border: '1px solid #fca5a5', background: '#fef2f2', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 className="sr-panel-title" style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0' }}>
                                <ShieldAlert size={16} /> Academic Board Actions
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '1rem', lineHeight: 1.4 }}>
                                As a Moderator or Admin, you have the authority to override system lockouts, uphold learner appeals, and grant special additional attempts.
                            </p>

                            {submission?.appeal?.status === 'pending' && (
                                <div style={{ background: '#fff', border: '1px solid #fecaca', padding: '10px', borderRadius: '6px', marginBottom: '1rem' }}>
                                    <strong style={{ fontSize: '0.75rem', color: '#dc2626', textTransform: 'uppercase' }}>Pending Learner Appeal:</strong>
                                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: '4px 0 0 0', fontStyle: 'italic' }}>
                                        "{submission.appeal.reason}"
                                    </p>
                                </div>
                            )}

                            <button
                                className="mlab-btn mlab-btn--warning "
                                style={{ width: '100%', justifyContent: 'center', color: 'red' }}
                                disabled={saving}
                                onClick={() => {
                                    const overrideReason = window.prompt("Enter the official reason for granting this override (Required for QCTO Auditing):");
                                    if (overrideReason) {
                                        setSaving(true);
                                        const newAttemptNum = (submission.attemptNumber || 1) + 1;

                                        // 1. Archive the old attempt
                                        setDoc(doc(collection(db, 'learner_submissions', submission.id, 'history')), {
                                            ...submission,
                                            archivedAt: new Date().toISOString(),
                                            archivedReason: 'Admin Override Granted'
                                        }).then(() => {
                                            // 2. Reset the main document and unlock
                                            updateDoc(doc(db, 'learner_submissions', submission.id), {
                                                status: 'not_started',
                                                competency: deleteField(),
                                                grading: deleteField(),
                                                moderation: deleteField(),
                                                submittedAt: deleteField(),
                                                attemptNumber: newAttemptNum,
                                                hasOverride: true,
                                                'appeal.status': 'upheld',
                                                'appeal.grantedBy': user?.uid || 'system',
                                                'appeal.grantedReason': overrideReason,
                                                'appeal.grantedAt': new Date().toISOString(),
                                                lastStaffEditAt: new Date().toISOString()
                                            }).then(() => {
                                                toast.success(`Override granted. Attempt #${newAttemptNum} unlocked.`);
                                                setTimeout(() => window.location.reload(), 1500);
                                            });
                                        }).catch(() => {
                                            toast.error("Failed to grant override.");
                                            setSaving(false);
                                        });
                                    }
                                }}
                            >
                                {saving ? <Loader2 size={14} className="vp-spin" style={{ marginRight: '6px' }} /> : <Unlock size={14} style={{ marginRight: '6px' }} />}
                                {submission?.appeal?.status === 'pending' ? 'Uphold Appeal & Unlock' : 'Grant Special Override'}
                            </button>
                        </div>
                    )}
                    {/* END ACADEMIC BOARD ACTIONS PANEL */}

                    <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />
                </aside>
            </div>
        </div>
    );
};

export default SubmissionReview;




// // src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx

// import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query, where, onSnapshot, writeBatch, arrayUnion, getFirestore } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import {
//     ArrowLeft, CheckCircle, AlertCircle, Clock, Award, ShieldCheck, Printer, Info, Lock, Loader2, Scale, Undo2, ShieldAlert, Unlock, Users, FileArchive, Timer, Video, Save, X, Check, Edit3, Globe, Github, Figma, Smartphone, ExternalLink, Link as LinkIcon, Layers, FileText, Mic, UploadCloud, Code, CalendarRange, Play, Square, Award as AwardIcon, BarChart, Sigma, ChevronDown, ChevronUp
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import './SubmissionReview.css';
// import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import { createPortal } from 'react-dom';
// import { RemediationModal, ResolveAppealModal, ReturnToLearnerModal } from './SubmissionReview/SubmissionReviewModals';
// import { type CriterionResult, type GradeData } from './SubmissionReview/SubmissionReviewBlocks';
// import moment from 'moment';
// import { GroupObservationMatrix } from './SubmissionReview/GroupObservationMatrix';
// import { HistoryModal, type ProctorSession } from '../../../components/views/InvigilatorDashboard/InvigilatorDashboard';
// import { ExcuseReopenModal } from './SubmissionReview/ExcuseReopenModal';

// import { getStorage, ref as fbStorageRef, getDownloadURL } from 'firebase/storage';

// import { CartesianPlane } from '@zakq/axisjs';
// import "mathlive";
// import katex from "katex";
// import "katex/dist/katex.min.css";

// import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';
// import { FilePreview, UrlPreview } from './SubmissionReview/SubmissionReviewPreviews';
// import { LogbookHoursTally } from './SubmissionReview/SubmissionReviewHelpers';

// (window as any).katex = katex;

// const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];

// // ─── HELPER FOR EXTERNAL RESOURCE LINKS ─────────────────────────────────────
// const renderResourceLinks = (links: any[]) => {
//     if (!links || links.length === 0) return null;

//     const getCategoryIcon = (category: string) => {
//         switch (category) {
//             case 'live': return <Globe size={15} color="#10b981" />;
//             case 'github': return <Github size={15} color="#6366f1" />;
//             case 'apk': return <Smartphone size={15} color="#f59e0b" />;
//             case 'figma': return <Figma size={15} color="#ec4899" />;
//             case 'doc': return <FileText size={15} color="#06b6d4" />;
//             default: return <LinkIcon size={15} color="#64748b" />;
//         }
//     };

//     return (
//         <div style={{ marginTop: '1rem', marginBottom: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem' }}>
//             <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                 External Resources & Links
//             </div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                 {links.map((link: any, idx: number) => (
//                     <div key={link.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', flexWrap: 'wrap' }}>
//                         {getCategoryIcon(link.category)}
//                         <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>{link.label}</span>
//                         <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                             {link.url} <ExternalLink size={12} />
//                         </a>
//                     </div>
//                 ))}
//             </div>
//         </div>
//     );
// };

// // 🚀 HELPER FOR FULLSCREEN PORTAL MOUNTING
// const getPortalTarget = (): HTMLElement => {
//     const proctorRoot = document.getElementById('proctor-portal-root');
//     if (proctorRoot) return proctorRoot;
//     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
//     return document.body;
// };

// // ─── PROCTOR EVIDENCE INSPECTOR WRAPPER ─────────────────────────────────────
// const SubmissionProctorEvidenceModal = ({ submission, onClose }: { submission: any; onClose: () => void }) => {
//     const [session, setSession] = useState<ProctorSession | null>(null);

//     useEffect(() => {
//         const fetchSession = async () => {
//             try {
//                 const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
//                 const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
//                 const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

//                 const sessionSnap = await getDoc(doc(db, 'live_proctor_sessions', sessionDocId));
//                 if (sessionSnap.exists()) {
//                     setSession({ id: sessionSnap.id, ...sessionSnap.data() } as ProctorSession);
//                 } else {
//                     setSession({
//                         id: sessionDocId,
//                         learnerId: targetLearnerUid,
//                         learnerName: submission?.learnerDeclaration?.learnerName || 'Learner',
//                         status: submission?.status === 'violation' ? 'violation' : 'offline',
//                         latestWarning: submission?.systemNote || null,
//                         lastHeartbeat: null,
//                         violationHistory: submission?.violationHistory || []
//                     });
//                 }
//             } catch (e) {
//                 console.error("Failed to load proctoring session:", e);
//             }
//         };
//         fetchSession();
//     }, [submission]);

//     if (!session) return null;

//     return <HistoryModal session={session} onClose={onClose} />;
// };

// // ─── REVIEW STAGE CARD COMPONENT ─────────────────────────────────────────────
// const ReviewStageCard = ({ colorTheme, title, status, lockedMessage, awaitingTitle, awaitingMessage, showScore, scoreAwarded, scoreMax, scorePct, activeControls, feedbackLabel, feedbackValue, onFeedbackChange, feedbackPlaceholder, signatureLabel, signatureUrl, signatureName, signatureDate, signatureMeta, signatureTagline, onSubmit, submitLabel, isSaving, timeOverrideValue, onTimeOverrideChange, autoTimeSeconds, autoSummedMinutes }: any) => {
//     const colorHex = colorTheme === 'blue' ? 'blue' : colorTheme === 'red' ? 'red' : '#22c55e';
//     const colorHexDark = colorTheme === 'blue' ? '#1e3a8a' : colorTheme === 'red' ? '#7f1d1d' : '#14532d';
//     const bgLight = colorTheme === 'blue' ? '#eff6ff' : colorTheme === 'red' ? '#fef2f2' : '#f0fdf4';
//     const themeVar = colorTheme === 'blue' ? 'blue' : `var(--mlab-${colorTheme})`;

//     return (
//         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid ${themeVar}` }}>
//             <h3 className="sr-summary-title" style={{ color: themeVar }}>{title}</h3>
//             {status === 'locked' && (
//                 <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
//                     <Lock size={24} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
//                     <strong style={{ color: '#334155', display: 'block', fontSize: '0.9rem' }}>Locked</strong>
//                     <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{lockedMessage}</p>
//                 </div>
//             )}
//             {status === 'awaiting' && (
//                 <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
//                     <Clock size={24} color={colorHex} style={{ margin: '0 auto 10px' }} />
//                     <strong style={{ color: colorHexDark, display: 'block', fontSize: '0.9rem' }}>{awaitingTitle}</strong>
//                     <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{awaitingMessage}</p>
//                 </div>
//             )}
//             {(status === 'active' || status === 'done') && (
//                 <>
//                     {showScore && (
//                         <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
//                             <div className="sr-score-circle" style={{ borderColor: themeVar }}>
//                                 <span className="sr-score-val" style={{ color: themeVar }}>{scoreAwarded}</span>
//                                 <span className="sr-score-max" style={{ color: themeVar }}>/ {scoreMax}</span>
//                             </div>
//                             <div className="sr-score-percent" style={{ color: themeVar }}>{scorePct}%</div>
//                         </div>
//                     )}
//                     {activeControls}
//                     <div className="sr-overall-feedback" style={{ marginTop: showScore || activeControls ? '1.5rem' : '1rem' }}>
//                         <label className="sr-sidebar-label" style={{ color: themeVar }}>{feedbackLabel}</label>
//                         {status === 'active' ? (
//                             <textarea className="sr-textarea" rows={3} style={{ color: themeVar, fontStyle: 'italic', borderColor: themeVar, background: 'whitesmoke', fontWeight: 500 }} placeholder={feedbackPlaceholder} value={feedbackValue} onChange={e => onFeedbackChange(e.target.value)} />
//                         ) : (
//                             <div style={{ background: bgLight, padding: '10px', borderRadius: '6px', color: colorHexDark, fontStyle: 'italic', fontSize: '0.85rem', borderLeft: `3px solid ${colorHex}`, whiteSpace: 'pre-wrap' }}>
//                                 {feedbackValue || "No overall remarks provided."}
//                             </div>
//                         )}
//                     </div>
//                     {status === 'active' && (
//                         <div style={{ marginTop: '1rem', background: bgLight, padding: '12px', borderRadius: '6px', border: `1px solid ${colorHex}40` }}>
//                             <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: colorHexDark, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
//                                 <Clock size={14} /> Logged Grading / Review Time (Minutes)
//                             </label>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
//                                 <input type="number" min="1" style={{ width: '90px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: autoSummedMinutes > 0 && timeOverrideValue === '' ? '#e0f2fe' : 'white' }} value={timeOverrideValue} onChange={(e) => onTimeOverrideChange(e.target.value)} placeholder={autoSummedMinutes > 0 ? autoSummedMinutes.toString() : Math.max(1, Math.floor(autoTimeSeconds / 60)).toString()} />
//                             </div>
//                         </div>
//                     )}
//                     {status === 'active' ? (
//                         <div className="sr-action-area" style={{ marginTop: '1rem' }}>
//                             <button className="sr-submit-btn" style={{ background: themeVar }} onClick={onSubmit} disabled={isSaving}>{submitLabel}</button>
//                         </div>
//                     ) : (
//                         <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
//                             <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: themeVar, textTransform: 'uppercase' }}>{signatureLabel}</p>
//                             {signatureUrl ? <img src={signatureUrl} alt="Signature" crossOrigin="anonymous" style={{ height: '40px', objectFit: 'contain', filter: `brightness(0) saturate(100%) ${colorTheme === 'blue' ? 'invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)' : colorTheme === 'red' ? 'invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)' : 'invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'}`, marginBottom: '8px' }} /> : <div style={{ height: '40px', color: themeVar, display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
//                             <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: themeVar }}>{signatureName}</p>
//                             {signatureMeta && <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: themeVar }}>{signatureMeta}</p>}
//                             {signatureDate && <p style={{ margin: 0, fontSize: '0.75rem', color: themeVar }}><Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{signatureDate}</p>}
//                             {signatureTagline && <div className="sr-sig-line" style={{ borderTop: `1px dashed ${themeVar}`, paddingTop: '6px', marginTop: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: themeVar }}>{signatureTagline}</div>}
//                         </div>
//                     )}
//                 </>
//             )}
//         </div>
//     );
// };

// // 🚀 PREDEFINED AUDIT REASONS FOR TIMED ASSESSMENTS
// const PRESET_EXTRA_TIME_REASONS = [
//     "Network / Internet Disconnection",
//     "Power Outage / Loadshedding",
//     "Browser / IDE Technical Crash",
//     "Hardware / Device Failure",
//     "Invigilator / Facilitator Discretion",
//     "Medical / Personal Emergency",
//     "Accommodation for Learning Disability",
//     "Other (Details specified below)"
// ];

// // 🚀 EXTRA TIME MODAL WITH DROPDOWN + SUPPORTING EVIDENCE
// const ExtraTimeModal: React.FC<{
//     onClose: () => void;
//     onSubmit: (minutes: number, reason: string) => void
// }> = ({ onClose, onSubmit }) => {
//     const [minutes, setMinutes] = useState<number>(15);
//     const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_EXTRA_TIME_REASONS[0]);
//     const [details, setDetails] = useState('');

//     const handleSubmit = (e: React.FormEvent) => {
//         e.preventDefault();

//         const combinedReason = details.trim()
//             ? `${selectedPreset} — ${details.trim()}`
//             : selectedPreset;

//         if (minutes > 0 && combinedReason) {
//             onSubmit(minutes, combinedReason);
//         }
//     };

//     return createPortal(
//         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999999, pointerEvents: 'auto' }}>
//             <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title">
//                         <Timer size={16} /> Grant Extra Time
//                     </h2>
//                     <button className="lfm-close-btn" type="button" onClick={onClose}>
//                         <X size={20} />
//                     </button>
//                 </div>

//                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
//                     <div className="lfm-body">
//                         <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
//                             <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
//                                 Add additional minutes to the learner's timer. If the assessment was locked due to time expiring or connection loss, <strong>this will automatically unlock it</strong> so they can continue.
//                             </p>
//                         </div>

//                         <div className="lfm-fg">
//                             <label>Minutes to Add *</label>
//                             <input
//                                 className="lfm-input"
//                                 type="number"
//                                 min="1"
//                                 value={minutes}
//                                 onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
//                                 required
//                             />
//                         </div>

//                         <div className="lfm-fg">
//                             <label>Standard Audit Category *</label>
//                             <select
//                                 className="lfm-input lfm-select"
//                                 value={selectedPreset}
//                                 onChange={(e) => setSelectedPreset(e.target.value)}
//                                 required
//                             >
//                                 {PRESET_EXTRA_TIME_REASONS.map((reason, idx) => (
//                                     <option key={idx} value={reason}>
//                                         {reason}
//                                     </option>
//                                 ))}
//                             </select>
//                         </div>

//                         <div className="lfm-fg">
//                             <label>Additional Notes / Supporting Evidence</label>
//                             <textarea
//                                 className="lfm-input"
//                                 value={details}
//                                 onChange={(e) => setDetails(e.target.value)}
//                                 rows={3}
//                                 placeholder="Optional details (e.g., ticket number, invigilator notes, specific error message...)"
//                                 style={{ resize: 'vertical' }}
//                             />
//                         </div>
//                     </div>

//                     <div className="lfm-footer">
//                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
//                             Cancel
//                         </button>
//                         <button
//                             type="submit"
//                             className="lfm-btn lfm-btn--primary"
//                             disabled={minutes < 1}
//                         >
//                             <Save size={13} /> Grant Time
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         getPortalTarget()
//     );
// };

// const getAnswerString = (ans: any): string => {
//     if (ans === null || ans === undefined) return '';
//     if (typeof ans === 'string') return ans;
//     if (typeof ans === 'number' || typeof ans === 'boolean') return String(ans);
//     if (typeof ans === 'object') {
//         return ans.text || ans.equation || ans.value || ans.content || ans.html || ans.url || ans.uploadUrl || ans.code || '';
//     }
//     return '';
// };

// const cleanRichText = (html?: any): string => {
//     const str = getAnswerString(html);
//     if (!str) return '';
//     return str.replace(/&nbsp;/g, ' ');
// };

// const RichMathText: React.FC<{ html?: any; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
//     const containerRef = useRef<HTMLDivElement>(null);
//     const safeHtml = cleanRichText(html);

//     useEffect(() => {
//         if (!containerRef.current || !safeHtml) return;

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
//     }, [safeHtml]);

//     return (
//         <div
//             ref={containerRef}
//             className={`quill-read-only-content ${className || ''}`}
//             style={{ wordBreak: 'normal', overflowWrap: 'break-word', lineHeight: 1.6, ...style }}
//             dangerouslySetInnerHTML={{ __html: safeHtml }}
//         />
//     );
// };

// const renderBlockImage = (block: any) => {
//     if (!block.imageUrl) return null;
//     return (
//         <div className="no-print" style={{ margin: '1rem 0', textAlign: 'center' }}>
//             <img
//                 src={block.imageUrl}
//                 alt={block.imageCaption || "Assessment attachment"}
//                 style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
//             />
//             {block.imageCaption && (
//                 <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
//                     {block.imageCaption}
//                 </p>
//             )}
//         </div>
//     );
// };

// const renderBlockFile = (block: any) => {
//     if (!block.fileUrl) return null;
//     return (
//         <div className="no-print" style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
//                 <FileText size={20} color="#166534" />
//                 <div style={{ overflow: 'hidden' }}>
//                     <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
//                         {block.fileName || "Download Starter File"}
//                     </span>
//                     <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
//                 </div>
//             </div>
//             <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0, fontWeight: 'bold' }}>
//                 <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
//             </a>
//         </div>
//     );
// };

// const ReviewAxisGraph: React.FC<{ learnerAns: any }> = ({ learnerAns }) => {
//     const containerRef = useRef<HTMLDivElement>(null);
//     const canvasRef = useRef<HTMLCanvasElement>(null);
//     const planeRef = useRef<CartesianPlane | null>(null);

//     useEffect(() => {
//         if (!canvasRef.current) return;

//         const plane = new CartesianPlane(canvasRef.current, {
//             stepSequences: [1, 2, 5],
//             autoFit: false,
//         });
//         planeRef.current = plane;

//         const ro = new ResizeObserver(() => {
//             plane.resize();
//         });
//         if (containerRef.current) {
//             ro.observe(containerRef.current);
//         }

//         return () => {
//             ro.disconnect();
//             plane.destroy();
//             planeRef.current = null;
//         };
//     }, []);

//     useEffect(() => {
//         const plane = planeRef.current;
//         if (!plane) return;

//         plane.clear();
//         const allCoords: { x: number; y: number }[] = [];

//         const pointsList = learnerAns?.points || [];
//         const shapesList = learnerAns?.shapes || [];

//         pointsList.forEach((p: any, i: number) => {
//             const px = parseFloat(String(p.x));
//             const py = parseFloat(String(p.y));
//             if (!isNaN(px) && !isNaN(py)) {
//                 allCoords.push({ x: px, y: py });
//                 const color = POINT_COLORS[i % POINT_COLORS.length];
//                 plane.addPoint(px, py, color, `(${px}, ${py})`, true, 5);
//             }
//         });

//         shapesList.forEach((shape: any) => {
//             const shapeCoords: { x: number; y: number }[] = [];
//             shape.points?.forEach((p: any) => {
//                 const px = parseFloat(String(p.x));
//                 const py = parseFloat(String(p.y));
//                 if (!isNaN(px) && !isNaN(py)) {
//                     shapeCoords.push({ x: px, y: py });
//                     allCoords.push({ x: px, y: py });
//                 }
//             });

//             if (shapeCoords.length > 0) {
//                 plane.addPolygon(shapeCoords, `${shape.color}1f`, shape.color, 2);
//                 shapeCoords.forEach((coord) => {
//                     plane.addPoint(coord.x, coord.y, shape.color, `(${coord.x}, ${coord.y})`, false, 5);
//                 });
//             }
//         });

//         if (allCoords.length > 0) {
//             setTimeout(() => {
//                 planeRef.current?.animateToFit(allCoords);
//             }, 100);
//         } else {
//             setTimeout(() => {
//                 planeRef.current?.animateToFit([{ x: -10, y: -10 }, { x: 10, y: 10 }], 0);
//             }, 50);
//         }
//     }, [learnerAns]);

//     return (
//         <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '420px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
//             <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
//         </div>
//     );
// };


// const ideWrapperStyle: React.CSSProperties = {
//     position: 'relative',
//     zIndex: 10,
//     minHeight: '650px',
//     height: 'auto',
//     width: '100%',
//     border: '1px solid #cbd5e1',
//     borderRadius: '8px',
//     background: '#1e293b',
//     display: 'flex',
//     flexDirection: 'column',
//     marginTop: '10px',
//     marginBottom: '20px',
// };

// const ReviewCodeSandbox: React.FC<{ block: any, learnerAns: any }> = ({ block, learnerAns }) => {
//     const [snapshot, setSnapshot] = useState<any>(null);
//     const [isLoading, setIsLoading] = useState<boolean>(true);
//     const [isBooted, setIsBooted] = useState<boolean>(false);

//     const codePayload = useMemo(() => {
//         if (!learnerAns) return null;
//         if (typeof learnerAns === 'object' && learnerAns.codeData) return learnerAns.codeData;
//         return learnerAns;
//     }, [learnerAns]);

//     const storagePath = codePayload?.storagePath;
//     const inlineSnapshot = codePayload?.snapshot;
//     const lastSavedAt = codePayload?.lastSavedAt;

//     useEffect(() => {
//         if (!isBooted) return;

//         let isMounted = true;
//         setIsLoading(true);

//         const loadLearnerCode = async () => {
//             if (storagePath) {
//                 try {
//                     const storage = getStorage();
//                     const jsonRef = fbStorageRef(storage, storagePath);
//                     const downloadUrl = await getDownloadURL(jsonRef);
//                     const res = await fetch(downloadUrl);
//                     if (res.ok) {
//                         const files = await res.json();
//                         if (isMounted) {
//                             setSnapshot(files);
//                         }
//                     }
//                 } catch (err) {
//                     console.error(`Failed to download Storage snapshot for block [${block.id}]:`, err);
//                 } finally {
//                     if (isMounted) setIsLoading(false);
//                 }
//             } else if (inlineSnapshot) {
//                 if (isMounted) {
//                     const parsed = typeof inlineSnapshot === 'string' ? JSON.parse(inlineSnapshot) : inlineSnapshot;
//                     setSnapshot(parsed);
//                     setIsLoading(false);
//                 }
//             } else {
//                 if (isMounted) {
//                     setSnapshot(null);
//                     setIsLoading(false);
//                 }
//             }
//         };

//         loadLearnerCode();

//         return () => {
//             isMounted = false;
//         };
//     }, [block.id, storagePath, inlineSnapshot, lastSavedAt, isBooted]);

//     if (!isBooted) {
//         return (
//             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', gap: '10px' }}>
//                 <Code size={32} color="#94a3b8" />
//                 <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: '#334155' }}>Facilitator Code Preview is Paused</p>
//                 <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', textAlign: 'center', maxWidth: '400px' }}>This button boots the IDE on <strong>YOUR</strong> screen to inspect learner code. Use the Network Control switch above to unlock the Learner's screen in real-time.</p>
//                 <button
//                     onClick={() => setIsBooted(true)}
//                     style={{ background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}
//                 >
//                     <Play size={14} /> Boot Facilitator Preview (Local)
//                 </button>
//             </div>
//         );
//     }

//     if (isLoading) {
//         return (
//             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#1e293b', borderRadius: '8px', color: '#94a3b8', gap: '10px' }}>
//                 <Loader2 size={24} className="animate-spin" />
//                 <p style={{ margin: 0, fontSize: '0.85rem' }}>Retrieving learner's code snapshot from cloud storage...</p>
//             </div>
//         );
//     }

//     return (
//         <div style={ideWrapperStyle}>
//             <CodeSandboxPlayer
//                 block={block}
//                 learnerAns={{ ...(codePayload || {}), snapshot }}
//                 readOnly={true}
//             />
//         </div>
//     );
// };

// export const RenderBlocks: React.FC<any> = (props) => {
//     const {
//         assessment, submission, facBreakdown, assBreakdown, modBreakdown,
//         activeTabs, setActiveTabs, sectionTotals,
//         isPrintMode, canFacilitatorMark, canGrade, canModerate,
//         isFacDone, isAssDone, isModDone, isMentor, isWorkplaceModule,
//         savedFacRole, facReadOnlyLabel,
//         handleVisualMark, handleScoreChange, handleFeedbackChange,
//         handleCriterionChange, handleActivityStatusChange, handleActivityCommentChange,
//         handleGlobalChecklistChange, handleSetToNow
//     } = props;

//     const [expandedGraphMemos, setExpandedGraphMemos] = useState<Record<string, boolean>>({});
//     const [togglingIDE, setTogglingIDE] = useState<string | null>(null);

//     const toggleGraphMemo = (blockId: string) => {
//         setExpandedGraphMemos(prev => ({ ...prev, [blockId]: !prev[blockId] }));
//     };

//     const handleNetworkIDEToggle = async (blockId: string, currentState: boolean) => {
//         if (!submission?.id) return;
//         setTogglingIDE(blockId);
//         try {
//             const dbInstance = getFirestore();
//             const subRef = doc(dbInstance, 'learner_submissions', submission.id);
//             const nextState = !currentState;

//             await updateDoc(subRef, {
//                 [`ideUnlocks.${blockId}`]: nextState,
//                 lastStaffEditAt: new Date().toISOString()
//             });
//         } catch (err: any) {
//             try {
//                 const dbInstance = getFirestore();
//                 const subRef = doc(dbInstance, 'learner_submissions', submission.id);
//                 await setDoc(subRef, {
//                     ideUnlocks: { [blockId]: !currentState },
//                     lastStaffEditAt: new Date().toISOString()
//                 }, { merge: true });
//             } catch (e) {
//                 console.error("Failed to toggle IDE network access:", e);
//             }
//         } finally {
//             setTogglingIDE(null);
//         }
//     };

//     const renderNetworkIDEToggleUI = (block: any) => {
//         const hasIDE = block.type === 'code_sandbox' || (['task', 'checklist', 'qcto_workplace'].includes(block.type) && block.allowCode !== false);
//         if (!hasIDE || isPrintMode) return null;

//         const isUnlocked = submission?.ideUnlocks?.[block.id] === true;
//         const isProcessing = togglingIDE === block.id;

//         return (
//             <div className="no-print" style={{ marginBottom: '1rem', background: isUnlocked ? '#eff6ff' : '#f8fafc', border: isUnlocked ? '1px solid #bfdbfe' : '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                     <div style={{ background: isUnlocked ? '#dbeafe' : '#e2e8f0', padding: '8px', borderRadius: '8px' }}>
//                         <Code size={18} color={isUnlocked ? '#2563eb' : '#64748b'} />
//                     </div>
//                     <div>
//                         <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isUnlocked ? '#1e3a8a' : '#334155' }}>Network IDE Access (Remote Control)</div>
//                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Remotely unlock the Live IDE on the learner's screen in real-time.</div>
//                     </div>
//                 </div>
//                 <button
//                     type="button"
//                     disabled={isProcessing}
//                     onClick={() => handleNetworkIDEToggle(block.id, isUnlocked)}
//                     style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isUnlocked ? '#2563eb' : 'white', color: isUnlocked ? 'white' : '#475569', padding: '6px 12px', borderRadius: '20px', border: isUnlocked ? '1px solid #2563eb' : '1px solid #cbd5e1', cursor: isProcessing ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem', transition: 'all 0.2s ease' }}
//                 >
//                     {isProcessing ? <Loader2 size={14} className="animate-spin" /> : (isUnlocked ? <CheckCircle size={14} /> : <Lock size={14} />)}
//                     {isUnlocked ? 'Unlocked for Learner' : 'Unlock for Learner'}
//                 </button>
//             </div>
//         );
//     };

//     let qNum = 0;

//     if (!assessment?.blocks || !Array.isArray(assessment.blocks)) return null;

//     return (
//         <>
//             {assessment.blocks.map((block: any) => {
//                 const maxM = block.marks || 0;
//                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
//                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
//                 const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };

//                 let activeInkColor = 'blue';
//                 let activeData = fData;
//                 let isActiveRole = false;

//                 if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
//                 else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
//                 else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
//                 else {
//                     if (isModDone) { activeInkColor = 'green'; activeData = mData; }
//                     else if (isAssDone) { activeInkColor = 'red'; activeData = aData; }
//                     else { activeInkColor = 'blue'; activeData = fData; }
//                 }

//                 // Only show ReadOnly layers for stages that are completed or graded, and not editable by the current role
//                 const renderFacReadOnly = (isFacDone || fData?.feedback || fData?.score > 0) && (!canFacilitatorMark || isPrintMode);
//                 const renderAssReadOnly = (isAssDone || aData?.feedback || aData?.score > 0) && (!canGrade || isPrintMode);
//                 const renderModReadOnly = (isModDone || mData?.feedback) && (!canModerate || isPrintMode);

//                 const mentorActiveOnScorableBlock = isMentor && canFacilitatorMark && ['mcq', 'text', 'task', 'code_sandbox', 'mathpad', 'graph'].includes(block.type);

//                 let decData = activeData;
//                 let isDeclarationInteractive = isActiveRole;
//                 if (canModerate) {
//                     decData = isWorkplaceModule ? fData : aData;
//                     isDeclarationInteractive = false;
//                 } else if (canGrade && isWorkplaceModule) {
//                     decData = fData;
//                     isDeclarationInteractive = false;
//                 }

//                 const renderReadOnlyLayers = () => (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: (!isPrintMode && isActiveRole) ? '1rem' : '0' }}>
//                         {renderFacReadOnly && (
//                             <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
//                                 <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                     <Info size={13} /> {facReadOnlyLabel}
//                                 </div>
//                                 {!isWorkplaceModule && savedFacRole !== 'mentor' && (
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                         <label style={{ color: '#0369a1', fontWeight: 'bold', fontSize: '0.85rem' }}>Facilitator Score:</label>
//                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #7dd3fc`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#e0f2fe', color: '#0369a1', cursor: 'not-allowed' }}>
//                                             {fData.score ?? 0}
//                                         </span>
//                                         <span style={{ color: '#0369a1', fontWeight: 'bold' }}>/ {maxM}</span>
//                                     </div>
//                                 )}
//                                 <div style={{ color: '#0369a1', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
//                                     {fData.feedback || <em style={{ opacity: 0.7 }}>No specific {savedFacRole === 'mentor' ? 'supervisor comments' : 'coaching'} provided.</em>}
//                                 </div>
//                             </div>
//                         )}
//                         {renderAssReadOnly && (
//                             <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '4px', border: '1px solid #fecaca' }}>
//                                 <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                     <AwardIcon size={13} /> Assessor Grade
//                                 </div>
//                                 {!isWorkplaceModule && (
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                         <label style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '0.85rem' }}>Assessor Score:</label>
//                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #fca5a5`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#fee2e2', color: '#991b1b', cursor: 'not-allowed' }}>
//                                             {aData.score ?? 0}
//                                         </span>
//                                         <span style={{ color: '#991b1b', fontWeight: 'bold' }}>/ {maxM}</span>
//                                     </div>
//                                 )}
//                                 <div style={{ color: '#991b1b', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
//                                     {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}
//                                 </div>
//                             </div>
//                         )}
//                         {renderModReadOnly && (
//                             <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
//                                 <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                     <ShieldCheck size={13} /> Moderator QA
//                                 </div>
//                                 {!isWorkplaceModule && (
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                         <label style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem' }}>Moderated Score:</label>
//                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #86efac`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#dcfce7', color: '#16a34a', cursor: 'not-allowed' }}>
//                                             {mData.score ?? 0}
//                                         </span>
//                                         <span style={{ color: '#16a34a', fontWeight: 'bold' }}>/ {maxM}</span>
//                                     </div>
//                                 )}
//                                 <div style={{ color: '#16a34a', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
//                                     {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                 );

//                 const renderActiveGradeControls = (blockId: string) => {
//                     if (canModerate && isWorkplaceModule) {
//                         return (
//                             <div>
//                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#15803d', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
//                                         <ShieldCheck size={14} /> Moderator QA Notes
//                                     </div>
//                                     <textarea
//                                         className="sr-feedback-input"
//                                         rows={2}
//                                         style={{ width: '100%', color: 'green', fontStyle: 'italic', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '4px', resize: 'vertical', background: 'white' }}
//                                         placeholder="Moderator Green Pen QA notes for this item (optional)..."
//                                         value={activeData.feedback || ''}
//                                         onChange={e => handleFeedbackChange(blockId, e.target.value)}
//                                     />
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (mentorActiveOnScorableBlock) {
//                         return (
//                             <div>
//                                 <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
//                                         <ShieldCheck size={14} /> Supervisor Observation Comments
//                                     </div>
//                                     <textarea
//                                         className="sr-feedback-input"
//                                         rows={2}
//                                         style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
//                                         placeholder="Add any supervisor observation notes for this item (optional)..."
//                                         value={activeData.feedback || ''}
//                                         onChange={e => handleFeedbackChange(blockId, e.target.value)}
//                                     />
//                                 </div>
//                             </div>
//                         );
//                     }

//                     return (
//                         <div>
//                             {!isWorkplaceModule && (
//                                 <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                     <label style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.85rem' }}>Your Score Awarded:</label>
//                                     <input
//                                         type="number"
//                                         className="sr-score-input"
//                                         style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: 'white' }}
//                                         value={activeData.score ?? 0}
//                                         onChange={e => handleScoreChange(blockId, parseInt(e.target.value) || 0, maxM)}
//                                     />
//                                     <span style={{ color: '#0f172a', fontWeight: 'bold' }}>/ {maxM}</span>
//                                 </div>
//                             )}
//                             <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
//                                 <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
//                                 <textarea
//                                     className="sr-feedback-input"
//                                     rows={2}
//                                     style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
//                                     placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
//                                     value={activeData.feedback || ''}
//                                     onChange={e => handleFeedbackChange(blockId, e.target.value)}
//                                 />
//                             </div>
//                         </div>
//                     );
//                 };

//                 if (block.type === 'section') {
//                     const totals = sectionTotals[block.id];
//                     return (
//                         <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                 <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
//                                 {isAssDone && totals && totals.total > 0 && (
//                                     <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}>
//                                         <BarChart size={14} /> {totals.awarded}/{totals.total}
//                                     </span>
//                                 )}
//                             </div>
//                             {block.content && (
//                                 <RichMathText html={block.content} style={{ color: '#334155', fontSize: '0.95rem' }} />
//                             )}
//                             {renderBlockImage(block)}
//                             {renderBlockFile(block)}
//                         </div>
//                     );
//                 }

//                 if (block.type === 'info') {
//                     return (
//                         <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderLeft: '4px solid #0ea5e9', background: '#f0f9ff', padding: '1.25rem', marginBottom: '1.5rem', borderRadius: '6px' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                 <Info size={16} /> {block.title || 'Reading Material'}
//                             </div>
//                             {block.content && (
//                                 <RichMathText html={block.content} style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
//                             )}
//                             {renderBlockImage(block)}
//                             {renderBlockFile(block)}
//                         </div>
//                     );
//                 }

//                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
//                     qNum++;
//                     let learnerAns = submission.answers?.[block.id];

//                     if (learnerAns === undefined && submission.answers && Object.keys(submission.answers).length > 0) {
//                         const answerKeys = Object.keys(submission.answers);
//                         const scorableBlocks = assessment.blocks.filter((b: any) =>
//                             ['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(b.type)
//                         );
//                         const currentBlockIndex = scorableBlocks.findIndex((b: any) => b.id === block.id);
//                         if (currentBlockIndex >= 0 && currentBlockIndex < answerKeys.length) {
//                             const recoveredKey = answerKeys[currentBlockIndex];
//                             learnerAns = submission.answers[recoveredKey];
//                         }
//                     }

//                     if (block.type === 'graph') {
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0f766e', flexShrink: 0 }}>PLOT</span>
//                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}

//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                             <BarChart size={14} /> Learner's Plotted Cartesian Graph:
//                                         </div>
//                                         <ReviewAxisGraph learnerAns={learnerAns} />
//                                     </div>

//                                     {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
//                                         <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
//                                                 <Lock size={14} /> Assessor Memorandum Graph (Hidden from Learner)
//                                             </div>
//                                             <ReviewAxisGraph learnerAns={block.memoGraph} />
//                                         </div>
//                                     )}

//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'mathpad') {
//                         const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { equation: getAnswerString(learnerAns) };

//                         const mathTabs = [
//                             { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', val: safeLearnerAns.equation !== undefined ? safeLearnerAns.equation : null, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
//                             { id: 'graph', icon: <BarChart size={13} />, label: 'Graphing Calculator', val: safeLearnerAns.graphState, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } }
//                         ].filter(t => t.val !== null && t.val !== undefined);

//                         const activeTabId = activeTabs[block.id] || (mathTabs.length > 0 ? mathTabs[0].id : 'equation');
//                         const isGraphMemoExpanded = expandedGraphMemos[block.id] || false;

//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#fce7f3', color: '#db2777', flexShrink: 0 }}>MATH</span>
//                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}

//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px' }}>
//                                             <Layers size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} />Learner's Math Response:
//                                         </div>

//                                         {mathTabs.length === 0 ? (
//                                             <span style={{ color: '#64748b', fontStyle: 'italic' }}>No answer provided.</span>
//                                         ) : (
//                                             <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
//                                                 {mathTabs.length > 1 && (
//                                                     <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', padding: '10px' }}>
//                                                         {mathTabs.map(t => {
//                                                             const isActive = activeTabId === t.id;
//                                                             return (
//                                                                 <button
//                                                                     key={t.id}
//                                                                     onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
//                                                                     style={{
//                                                                         display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
//                                                                         background: isActive ? t.theme.activeBg : t.theme.bg,
//                                                                         padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
//                                                                         border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
//                                                                         cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
//                                                                         boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
//                                                                         transition: 'all 0.2s ease',
//                                                                         opacity: isActive ? 1 : 0.7,
//                                                                         whiteSpace: 'nowrap'
//                                                                     }}
//                                                                     onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
//                                                                     onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
//                                                                 >
//                                                                     {t.icon} {t.label}
//                                                                 </button>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 <div style={{ padding: '15px' }}>
//                                                     {activeTabId === 'equation' && (
//                                                         <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
//                                                             {React.createElement('math-field', {
//                                                                 'read-only': 'true',
//                                                                 style: { width: '100%', fontSize: '1.4rem', outline: 'none', background: 'transparent', border: 'none', color: '#0f172a' }
//                                                             }, safeLearnerAns.equation || '')}
//                                                         </div>
//                                                     )}
//                                                     {activeTabId === 'graph' && (
//                                                         <ReviewAxisGraph learnerAns={safeLearnerAns.graphState} />
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         )}

//                                         {(block.correctAnswer || block.modelSolution || block.memoGraph) && (
//                                             <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
//                                                     <Lock size={14} /> Assessor Memorandum (Hidden from Learner)
//                                                 </div>

//                                                 {block.correctAnswer && (
//                                                     <div style={{ marginBottom: '12px' }}>
//                                                         <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Final Answer</div>
//                                                         {React.createElement('math-field', {
//                                                             'read-only': 'true',
//                                                             style: { width: '100%', fontSize: '1.2rem', padding: '8px', background: 'white', border: '1px solid #fbcfe8', borderRadius: '4px', color: '#0f172a' }
//                                                         }, block.correctAnswer)}
//                                                     </div>
//                                                 )}

//                                                 {block.modelSolution && (
//                                                     <div style={{ marginBottom: '12px' }}>
//                                                         <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Step-by-Step Solution</div>
//                                                         <RichMathText html={block.modelSolution} style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px dashed #fbcfe8', fontSize: '0.9rem', color: '#334155' }} />
//                                                     </div>
//                                                 )}

//                                                 {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
//                                                     <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #fbcfe8' }}>
//                                                         <div
//                                                             style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#fce7f3', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}
//                                                             onClick={(e) => { e.stopPropagation(); toggleGraphMemo(block.id); }}
//                                                         >
//                                                             <div>
//                                                                 <label style={{ color: '#9d174d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
//                                                                     <BarChart size={14} /> Expected Graph Solution
//                                                                 </label>
//                                                                 <p style={{ fontSize: '0.75rem', color: '#be185d', margin: '2px 0 0 0' }}>
//                                                                     Click to {isGraphMemoExpanded ? 'collapse' : 'expand'} the expected visual solution graph.
//                                                                 </p>
//                                                             </div>
//                                                             <div style={{ color: '#9d174d', padding: '4px', background: '#fdf2f8', borderRadius: '4px' }}>
//                                                                 {isGraphMemoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
//                                                             </div>
//                                                         </div>

//                                                         {isGraphMemoExpanded && (
//                                                             <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease-out' }}>
//                                                                 <ReviewAxisGraph learnerAns={block.memoGraph} />
//                                                             </div>
//                                                         )}
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'code_sandbox') {
//                         const codePayload = typeof learnerAns === 'object' && learnerAns?.codeData ? learnerAns.codeData : learnerAns;
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#eff6ff', color: '#3b82f6', flexShrink: 0 }}>IDE</span>
//                                         <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
//                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
//                                                 {block.title && (
//                                                     <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
//                                                         {block.title}
//                                                     </h3>
//                                                 )}
//                                                 {block.question && (
//                                                     <RichMathText html={block.question} style={{ color: '#334155' }} />
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </div>

//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>

//                                 <div className="sr-q-body">
//                                     {renderNetworkIDEToggleUI(block)}
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}

//                                     <div className="sr-answer-box">
//                                         {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
//                                         {renderResourceLinks(codePayload?.resourceLinks || learnerAns?.resourceLinks)}

//                                         <ReviewCodeSandbox
//                                             block={block}
//                                             learnerAns={learnerAns}
//                                         />
//                                     </div>

//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'mcq') {
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
//                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
//                                         <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
//                                             <span style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + Number(learnerAns))}. ${block.options?.[learnerAns] || ''}` : 'No answer provided.'}</span>
//                                             {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
//                                         </div>
//                                         <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + Number(block.correctOption))}. {block.options?.[block.correctOption]}</strong></div>
//                                     </div>
//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'text') {
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
//                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
//                                         <div className="sr-text-ans">
//                                             {learnerAns ? <RichMathText html={getAnswerString(learnerAns)} style={{ color: 'black' }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
//                                         </div>
//                                     </div>
//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'task') {
//                         const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { text: getAnswerString(learnerAns) };

//                         const taskTabs = [
//                             { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', val: safeLearnerAns.text },
//                             { id: 'audio', icon: <Mic size={14} />, label: 'Audio', val: safeLearnerAns.audioUrl },
//                             { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', val: safeLearnerAns.url },
//                             { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', val: safeLearnerAns.uploadUrl },
//                             { id: 'code', icon: <Code size={14} />, label: 'Code IDE', val: safeLearnerAns.codeData || safeLearnerAns.code }
//                         ].filter(t => !!t.val);

//                         const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;

//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#ede9fe', color: '#8b5cf6', flexShrink: 0 }}>Q{qNum}</span>
//                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
//                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
//                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
//                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderNetworkIDEToggleUI(block)}
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Learner Evidence Submitted:</div>

//                                         {(!safeLearnerAns || Object.keys(safeLearnerAns).length === 0 || (!safeLearnerAns.text && !safeLearnerAns.audioUrl && !safeLearnerAns.url && !safeLearnerAns.uploadUrl && !safeLearnerAns.code && !safeLearnerAns.codeData && !safeLearnerAns.resourceLinks)) ? (
//                                             <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No evidence uploaded by learner.</span>
//                                         ) : isPrintMode ? (
//                                             <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: 'white' }}>
//                                                 {safeLearnerAns.resourceLinks && safeLearnerAns.resourceLinks.length > 0 && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Attached Links:</strong><ul>{safeLearnerAns.resourceLinks.map((l: any, i: number) => <li key={i}><a href={l.url}>{l.label}</a></li>)}</ul></div>}
//                                                 {safeLearnerAns.text && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Rich Text Response:</strong><RichMathText html={safeLearnerAns.text} /></div>}
//                                                 {safeLearnerAns.audioUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Audio Recording:</strong><div>URL: {safeLearnerAns.audioUrl}</div></div>}
//                                                 {safeLearnerAns.url && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Link:</strong><div><a href={safeLearnerAns.url} target="_blank" rel="noreferrer">{safeLearnerAns.url}</a></div></div>}
//                                                 {safeLearnerAns.uploadUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Uploaded File:</strong><FilePreview url={safeLearnerAns.uploadUrl} /></div>}
//                                                 {(safeLearnerAns.codeData || safeLearnerAns.code) && <div><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Code:</strong><pre style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}>{typeof safeLearnerAns.code === 'string' ? safeLearnerAns.code : '[Interactive IDE Snapshot]'}</pre></div>}
//                                             </div>
//                                         ) : (
//                                             <>
//                                                 {renderResourceLinks(safeLearnerAns?.resourceLinks || safeLearnerAns?.codeData?.resourceLinks)}

//                                                 {taskTabs.length === 0 ? null : (
//                                                     <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
//                                                         <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
//                                                             {taskTabs.map(t => (
//                                                                 <button key={t.id} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })} style={{ padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent', background: activeTabId === t.id ? 'white' : 'transparent', color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTabId === t.id ? 'bold' : 'normal', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
//                                                                     {t.icon} {t.label}
//                                                                 </button>
//                                                             ))}
//                                                         </div>
//                                                         <div style={{ padding: '15px' }}>
//                                                             {activeTabId === 'text' && <RichMathText html={safeLearnerAns.text} />}
//                                                             {activeTabId === 'audio' && <audio controls src={safeLearnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />}
//                                                             {activeTabId === 'url' && <UrlPreview url={safeLearnerAns.url} />}
//                                                             {activeTabId === 'upload' && <FilePreview url={safeLearnerAns.uploadUrl} />}
//                                                             {activeTabId === 'code' && (
//                                                                 <ReviewCodeSandbox
//                                                                     block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
//                                                                     learnerAns={safeLearnerAns.codeData || safeLearnerAns}
//                                                                 />
//                                                             )}
//                                                         </div>
//                                                     </div>
//                                                 )}
//                                             </>
//                                         )}
//                                     </div>
//                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'logbook') {
//                         const entries = Array.isArray(learnerAns) ? learnerAns : [];
//                         const totalHours = entries.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0);

//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#ffedd5', color: '#ea580c', flexShrink: 0 }}>LOG</span>
//                                         <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
//                                     </div>
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     <div className="sr-answer-box">
//                                         <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarRange size={14} /> Workplace Hours Logged:</div>
//                                         {entries.length === 0 ? (
//                                             <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No entries logged by learner.</span>
//                                         ) : (
//                                             <div>
//                                                 <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
//                                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', background: 'white' }}>
//                                                         <thead>
//                                                             <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
//                                                                 <th style={{ padding: '10px' }}>Date</th>
//                                                                 <th style={{ padding: '10px' }}>Assignment Task & Evidence</th>
//                                                                 <th style={{ padding: '10px' }}>Start Time</th>
//                                                                 <th style={{ padding: '10px' }}>Finish Time</th>
//                                                                 <th style={{ padding: '10px' }}>Total Hours</th>
//                                                             </tr>
//                                                         </thead>
//                                                         <tbody>
//                                                             {entries.map((entry: any, i: number) => (
//                                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: 'white', verticalAlign: 'top' }}>
//                                                                     <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.date}</td>
//                                                                     <td style={{ padding: '10px', color: '#334155' }}>
//                                                                         <RichMathText html={entry.task || '<em>No task description provided.</em>'} style={{ fontSize: '0.85rem' }} />
//                                                                         {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} /></div>}
//                                                                         {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
//                                                                     </td>
//                                                                     <td style={{ padding: '10px', color: '#475569' }}>{entry.startTime}</td>
//                                                                     <td style={{ padding: '10px', color: '#475569' }}>{entry.endTime}</td>
//                                                                     <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.hours}</td>
//                                                                 </tr>
//                                                             ))}
//                                                             <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
//                                                                 <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.8rem', color: '#475569' }}>Total Logged Hours:</td>
//                                                                 <td style={{ padding: '10px', color: '#ea580c', fontSize: '1.1rem' }}>{totalHours}</td>
//                                                             </tr>
//                                                         </tbody>
//                                                     </table>
//                                                 </div>

//                                                 <LogbookHoursTally entries={entries} requiredHours={block.requiredHours} />

//                                                 {isMentor && canFacilitatorMark && (
//                                                     <div style={{ marginTop: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem' }}>
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
//                                                             <ShieldCheck size={14} /> Supervisor Comments on Logbook
//                                                         </div>
//                                                         <textarea
//                                                             className="sr-feedback-input"
//                                                             rows={3}
//                                                             style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
//                                                             placeholder="Comment on the accuracy and completeness of hours logged..."
//                                                             value={activeData.feedback || ''}
//                                                             onChange={e => handleFeedbackChange(block.id, e.target.value)}
//                                                         />
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'checklist') {
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0d9488', flexShrink: 0 }}>CHK</span>
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
//                                             <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
//                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
//                                                 {isMentor ? 'Workplace observation checklist — verify each criterion.' : 'Assessor observation checklist.'}
//                                             </span>
//                                         </div>
//                                     </div>
//                                 </div>
//                                 <div className="sr-q-body">
//                                     {renderNetworkIDEToggleUI(block)}
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     <div style={{ marginTop: '1rem' }}>
//                                         {block.criteria?.map((crit: string, i: number) => {
//                                             const mentorResult = fData.criteriaResults?.[i] || { status: null, comment: '' };
//                                             const assessorResult = aData.criteriaResults?.[i] || { status: null, comment: '' };
//                                             const modResult = mData.criteriaResults?.[i] || { status: null, comment: '' };
//                                             const myResult = activeData.criteriaResults?.[i] || { status: null, comment: '', startTime: '', endTime: '' };

//                                             let durationStr = '0m 0s';
//                                             if (myResult.startTime && myResult.endTime) {
//                                                 const diffMs = new Date(myResult.endTime).getTime() - new Date(myResult.startTime).getTime();
//                                                 if (diffMs > 0) {
//                                                     const m = Math.floor(diffMs / 60000);
//                                                     const s = Math.floor((diffMs % 60000) / 1000);
//                                                     durationStr = `${m}m ${s}s`;
//                                                 }
//                                             }

//                                             return (
//                                                 <div key={i} style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
//                                                     <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '0.95rem' }}>{i + 1}. {crit}</p>

//                                                     {block.requireEvidencePerCriterion !== false && (() => {
//                                                         const rawEv = learnerAns?.[`evidence_${i}`];
//                                                         const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});
//                                                         const safeText = getAnswerString(critEvidence.text);
//                                                         const cleanTextCheck = safeText ? safeText.replace(/<[^>]*>/g, '').trim() : '';
//                                                         const isTextTrulyEmpty = cleanTextCheck.length === 0;

//                                                         const allTabs = [
//                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Artifact', val: critEvidence.uploadUrl, render: () => <FilePreview url={critEvidence.uploadUrl} /> },
//                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Web Link', val: critEvidence.url, render: () => <UrlPreview url={critEvidence.url} /> },
//                                                             { id: 'code', icon: <Code size={13} />, label: 'Source Code', val: critEvidence.codeData || critEvidence.code, render: () => <ReviewCodeSandbox block={{ id: `${block.id}_ev_${i}`, title: `Criterion ${i + 1} Code Evidence`, template: 'vanilla' }} learnerAns={critEvidence.codeData || critEvidence} /> },
//                                                             { id: 'text', icon: <FileText size={13} />, label: 'Learner Notes', val: isTextTrulyEmpty ? null : critEvidence.text, render: () => <RichMathText html={critEvidence.text} /> }
//                                                         ];

//                                                         const activeEvidenceTabs = allTabs.filter(t => !!t.val);
//                                                         const hasUploadedEvidence = activeEvidenceTabs.length > 0;
//                                                         const isObservedOrTimed = !!(myResult.startTime || myResult.status || mentorResult.status || assessorResult.status);

//                                                         if (!hasUploadedEvidence) {
//                                                             if (isObservedOrTimed) {
//                                                                 return (
//                                                                     <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 15px', borderRadius: '6px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
//                                                                         <AlertCircle size={18} className="animate-pulse" style={{ color: '#d97706', flexShrink: 0 }} />
//                                                                         <div>
//                                                                             <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Evidence Pending</span>
//                                                                             <span style={{ fontSize: '0.75rem', color: '#78350f' }}>Observation logged, but waiting for the learner to upload their supporting files.</span>
//                                                                         </div>
//                                                                     </div>
//                                                                 );
//                                                             }
//                                                             return <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>Awaiting learner evidence upload.</p>;
//                                                         }

//                                                         const isDraft = ['not_started', 'in_progress'].includes(String(submission?.status || '').toLowerCase());
//                                                         const subTabKey = `${block.id}_ev_${i}`;
//                                                         const activeSubTab = activeTabs[subTabKey] || activeEvidenceTabs[0]?.id;
//                                                         const selectedTabConfig = activeEvidenceTabs.find(t => t.id === activeSubTab) || activeEvidenceTabs[0];
//                                                         const expandKey = `${subTabKey}_expanded`;
//                                                         const isTabExpanded = activeTabs[expandKey] === 'true';

//                                                         return (
//                                                             <div style={{ background: isDraft ? '#fffdf5' : '#f5f3ff', border: isDraft ? '1px solid #fef08a' : '1px solid #c4b5fd', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
//                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: isDraft ? '#b45309' : '#6d28d9', textTransform: 'uppercase' }}>
//                                                                         <Layers size={16} /> {isDraft ? 'Learner Evidence (Live Draft Preview)' : 'Learner Evidence Submitted'}
//                                                                     </label>
//                                                                     {isDraft && (
//                                                                         <span style={{ fontSize: '0.68rem', background: '#d97706', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                                             Learner Modifying · Not Yet Submitted
//                                                                         </span>
//                                                                     )}
//                                                                 </div>

//                                                                 {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
//                                                                 {renderResourceLinks(critEvidence.resourceLinks || critEvidence.codeData?.resourceLinks)}

//                                                                 <div className="no-print" style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
//                                                                     {activeEvidenceTabs.map(tab => (
//                                                                         <button key={tab.id} type="button" onClick={() => setActiveTabs({ ...activeTabs, [subTabKey]: tab.id })} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '0.75rem', border: 'none', borderBottom: activeSubTab === tab.id ? (isDraft ? '2px solid #b45309' : '2px solid #6d28d9') : '2px solid transparent', background: activeSubTab === tab.id ? 'white' : 'transparent', color: activeSubTab === tab.id ? (isDraft ? '#b45309' : '#6d28d9') : '#64748b', fontWeight: activeSubTab === tab.id ? 'bold' : 'normal', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: '4px 4px 0 0' }}>
//                                                                             {tab.icon} {tab.label}
//                                                                         </button>
//                                                                     ))}
//                                                                 </div>

//                                                                 <div style={{ position: 'relative' }}>
//                                                                     <div style={{ maxHeight: isTabExpanded ? 'none' : '150px', overflow: 'hidden', transition: 'max-height 0.2s ease-out', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px', background: 'white' }}>
//                                                                         {selectedTabConfig?.render()}
//                                                                         {!isTabExpanded && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(to top, white, transparent)', pointerEvents: 'none' }} />}
//                                                                     </div>
//                                                                     <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-start' }}>
//                                                                         <button type="button" onClick={() => setActiveTabs({ ...activeTabs, [expandKey]: isTabExpanded ? 'false' : 'true' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 'bold', color: '#475569', borderRadius: '4px', cursor: 'pointer' }}>
//                                                                             {isTabExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
//                                                                         </button>
//                                                                     </div>
//                                                                 </div>
//                                                             </div>
//                                                         );
//                                                     })()}

//                                                     {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
//                                                         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                 <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Observation' : 'Facilitator Pre-Mark'}
//                                                             </span>
//                                                             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                 {mentorResult.status === 'C' ? (savedFacRole === 'mentor' ? 'Observed ✓' : 'Competent (C)') : mentorResult.status === 'NYC' ? (savedFacRole === 'mentor' ? 'Not Observed ✗' : 'NYC') : 'Not Reviewed'}
//                                                             </span>
//                                                             {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
//                                                         </div>
//                                                     )}

//                                                     {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
//                                                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                 <AwardIcon size={12} /> Assessor Grade
//                                                             </span>
//                                                             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                 {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
//                                                             </span>
//                                                             {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
//                                                         </div>
//                                                     )}

//                                                     {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
//                                                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                 <ShieldCheck size={12} /> Moderator QA
//                                                             </span>
//                                                             {modResult.status && (
//                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                     {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
//                                                                 </span>
//                                                             )}
//                                                             {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
//                                                         </div>
//                                                     )}

//                                                     {(!isPrintMode && isActiveRole) && (
//                                                         <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
//                                                             {block.requirePerCriterionTiming !== false && !canModerate && (
//                                                                 <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
//                                                                     <Timer size={16} color="#64748b" style={{ flexShrink: 0 }} />
//                                                                     <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', minWidth: '80px' }}>Task Timer:</span>

//                                                                     {!myResult.startTime ? (
//                                                                         <button onClick={() => handleCriterionChange(block.id, i, 'startTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Play size={12} /> Start</button>
//                                                                     ) : (
//                                                                         <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
//                                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
//                                                                                 <strong>Start:</strong>
//                                                                                 <input type="datetime-local" className="datetime-input" value={myResult.startTime ? moment(myResult.startTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'startTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
//                                                                             </div>

//                                                                             {!myResult.endTime ? (
//                                                                                 <button onClick={() => handleCriterionChange(block.id, i, 'endTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Square size={12} /> Stop</button>
//                                                                             ) : (
//                                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
//                                                                                         <strong>End:</strong>
//                                                                                         <input type="datetime-local" className="datetime-input" value={myResult.endTime ? moment(myResult.endTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'endTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
//                                                                                     </div>
//                                                                                     <span style={{ color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Duration: {durationStr}</span>
//                                                                                 </div>
//                                                                             )}
//                                                                         </div>
//                                                                     )}
//                                                                 </div>
//                                                             )}
//                                                             <div style={{ display: 'flex', gap: '10px' }}>
//                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
//                                                                     <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleCriterionChange(block.id, i, 'status', 'C')} style={{ accentColor: '#22c55e' }} />
//                                                                     {isMentor ? 'Observed ✓' : 'Competent (C)'}
//                                                                 </label>
//                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
//                                                                     <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleCriterionChange(block.id, i, 'status', 'NYC')} style={{ accentColor: '#ef4444' }} />
//                                                                     {isMentor ? 'Not Observed ✗' : 'NYC'}
//                                                                 </label>
//                                                             </div>
//                                                             <div style={{ flex: 1, minWidth: '250px' }}>
//                                                                 <textarea className="ab-input" disabled={canModerate && !isWorkplaceModule && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor observation notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleCriterionChange(block.id, i, 'comment', e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
//                                                             </div>
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             );
//                                         })}

//                                         <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
//                                             {renderReadOnlyLayers()}
//                                             {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                         </div>

//                                         {block.requireObservationDeclaration !== false && !canModerate && (
//                                             <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
//                                                 <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <ShieldCheck size={16} color={activeInkColor} />
//                                                     {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
//                                                 </h4>

//                                                 {block.requireTimeTracking !== false && (
//                                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
//                                                         {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
//                                                             const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
//                                                             const types = ['date', 'time', 'time'];
//                                                             const val = decData[field];
//                                                             return (
//                                                                 <div key={field}>
//                                                                     <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                                         {labels[fi]}
//                                                                         {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
//                                                                     </label>
//                                                                     {(!isDeclarationInteractive || isPrintMode)
//                                                                         ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
//                                                                         : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
//                                                                     }
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 )}

//                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
//                                                     <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
//                                                     {isWorkplaceModule
//                                                         ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
//                                                         : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
//                                                 </label>
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     if (block.type === 'qcto_workplace') {
//                         return (
//                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
//                                 <div className="sr-q-header">
//                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
//                                         <span className="sr-q-num" style={{ background: '#ffe4e6', color: '#e11d48', flexShrink: 0 }}>QCTO</span>
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
//                                             <RichMathText html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
//                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
//                                                 {isMentor ? 'Workplace Experience — Mentor Verification' : 'Workplace Experience Checkpoint'}
//                                             </span>
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div className="sr-q-body">
//                                     {renderNetworkIDEToggleUI(block)}
//                                     {renderBlockImage(block)}
//                                     {renderBlockFile(block)}
//                                     {block.workActivities?.map((wa: any, actIdx: number) => {
//                                         const taskKey = `wa_${wa.id}_task`;
//                                         const dateKey = `wa_${wa.id}_date`;
//                                         const task = learnerAns?.[taskKey] || '';
//                                         const date = learnerAns?.[dateKey] || '';

//                                         const mentorResult = fData.activityResults?.[actIdx] || { status: null, comment: '' };
//                                         const assessorResult = aData.activityResults?.[actIdx] || { status: null, comment: '' };
//                                         const modResult = mData.activityResults?.[actIdx] || { status: null, comment: '' };
//                                         const myResult = activeData.activityResults?.[actIdx] || { status: null, comment: '' };

//                                         return (
//                                             <div key={wa.id} style={{ marginBottom: '2rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
//                                                 <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
//                                                     <h4 style={{ margin: 0, color: '#073f4e' }}>{wa.code}: {wa.description}</h4>
//                                                 </div>
//                                                 <div style={{ padding: '1rem' }}>
//                                                     <div style={{ marginBottom: '1.5rem' }}>
//                                                         <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
//                                                             {task && <div style={{ flex: 1, minWidth: '250px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Task Performed:</strong><RichMathText html={task} style={{ marginTop: '6px' }} /></div>}
//                                                             {date && <div style={{ minWidth: '120px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Date:</strong><div style={{ marginTop: '6px' }}>{new Date(date).toLocaleDateString()}</div></div>}
//                                                         </div>

//                                                         {wa.evidenceItems?.map((evItem: any) => {
//                                                             const seKey = `se_${evItem.id}`;
//                                                             const rawSe = learnerAns?.[seKey];
//                                                             const seData = typeof rawSe === 'string' ? { text: rawSe } : (rawSe || {});

//                                                             return (
//                                                                 <div key={evItem.id} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
//                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e11d48', display: 'block', marginBottom: '8px' }}>
//                                                                         Evidence: {evItem.code} - {evItem.description}
//                                                                     </span>
//                                                                     {seData.uploadUrl && <div style={{ marginBottom: '10px' }}><FilePreview url={seData.uploadUrl} /></div>}
//                                                                     {seData.url && <div style={{ marginBottom: '10px' }}><UrlPreview url={seData.url} /></div>}
//                                                                     {(seData.codeData || seData.code) && (
//                                                                         <div style={{ marginBottom: '10px' }}>
//                                                                             {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
//                                                                             {renderResourceLinks(seData.codeData?.resourceLinks || seData.resourceLinks)}
//                                                                             <ReviewCodeSandbox
//                                                                                 block={{ id: `${block.id}_se_${evItem.id}`, title: `Evidence: ${evItem.code}`, template: 'vanilla' }}
//                                                                                 learnerAns={seData.codeData || seData}
//                                                                             />
//                                                                         </div>
//                                                                     )}
//                                                                     {seData.text && <RichMathText html={seData.text} />}
//                                                                     {(!seData.uploadUrl && !seData.url && !seData.code && !seData.codeData && !seData.text) && <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No evidence attached for this item.</span>}
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>

//                                                     <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
//                                                         {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
//                                                             <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                     <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Observation' : 'Facilitator Pre-Mark'}
//                                                                 </span>
//                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                     {mentorResult.status === 'C' ? (savedFacRole === 'mentor' ? 'Observed ✓' : 'Competent (C)') : mentorResult.status === 'NYC' ? (savedFacRole === 'mentor' ? 'Not Observed ✗' : 'NYC') : 'Not Reviewed'}
//                                                                 </span>
//                                                                 {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
//                                                             </div>
//                                                         )}

//                                                         {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
//                                                             <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                     <AwardIcon size={12} /> Assessor Grade
//                                                                 </span>
//                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                     {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
//                                                                 </span>
//                                                                 {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
//                                                             </div>
//                                                         )}

//                                                         {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
//                                                             <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
//                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
//                                                                     <ShieldCheck size={12} /> Moderator QA
//                                                                 </span>
//                                                                 {modResult.status && (
//                                                                     <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
//                                                                         {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
//                                                                     </span>
//                                                                 )}
//                                                                 {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
//                                                             </div>
//                                                         )}

//                                                         {(!isPrintMode && isActiveRole) && (
//                                                             <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
//                                                                 <div style={{ display: 'flex', gap: '10px' }}>
//                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
//                                                                         <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'C')} style={{ accentColor: '#22c55e' }} />
//                                                                         {isMentor ? 'Verified ✓' : 'Competent (C)'}
//                                                                     </label>
//                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
//                                                                         <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'NYC')} style={{ accentColor: '#ef4444' }} />
//                                                                         {isMentor ? 'Not Verified ✗' : 'NYC'}
//                                                                     </label>
//                                                                 </div>
//                                                                 <div style={{ flex: 1, minWidth: '250px' }}>
//                                                                     <textarea className="ab-input" disabled={canModerate && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor verification notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleActivityCommentChange(block.id, actIdx, e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
//                                                                 </div>
//                                                             </div>
//                                                         )}
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         );
//                                     })}
//                                     <div className="ap-workplace__toggles" style={{ marginTop: '1rem' }}>
//                                         {block.requireSelfAssessment !== false && (
//                                             <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}>
//                                                 <CheckCircle size={16} color={learnerAns?.selfAssessmentDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
//                                                 <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.selfAssessmentDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner completed self-assessment.</span>
//                                             </label>
//                                         )}
//                                         {block.requireGoalPlanning !== false && (
//                                             <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}>
//                                                 <CheckCircle size={16} color={learnerAns?.goalPlanningDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
//                                                 <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.goalPlanningDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner updated goal planning document.</span>
//                                             </label>
//                                         )}
//                                     </div>

//                                     <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
//                                         {renderReadOnlyLayers()}
//                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
//                                     </div>

//                                     {block.requireObservationDeclaration !== false && !canModerate && (
//                                         <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
//                                             <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 <ShieldCheck size={16} color={activeInkColor} />
//                                                 {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
//                                             </h4>

//                                             {block.requireTimeTracking !== false && (
//                                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
//                                                     {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
//                                                         const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
//                                                         const types = ['date', 'time', 'time'];
//                                                         const val = decData[field];
//                                                         return (
//                                                             <div key={field}>
//                                                                 <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                                     {labels[fi]}
//                                                                     {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
//                                                                 </label>
//                                                                 {(!isDeclarationInteractive || isPrintMode)
//                                                                     ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
//                                                                     : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
//                                                                 }
//                                                             </div>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}

//                                             <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
//                                                 <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
//                                                 {isWorkplaceModule
//                                                     ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
//                                                     : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
//                                             </label>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         );
//                     }
//                 }
//                 return null;
//             })}
//         </>
//     );
// };

// export const SubmissionReview: React.FC = () => {
//     const { submissionId } = useParams<{ submissionId: string }>();
//     const navigate = useNavigate();
//     const { user } = useStore();
//     const toast = useToast();

//     const filterBlack = { height: '50px', objectFit: 'contain' as const, filter: 'brightness(0)', marginBottom: '8px' };
//     const filterBlue = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)', marginBottom: '8px' };
//     const filterRed = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)', marginBottom: '8px' };
//     const filterGreen = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)', marginBottom: '8px' };

//     const [loading, setLoading] = useState(true);
//     const [saving, setSaving] = useState(false);

//     const [submission, setSubmission] = useState<any>(null);
//     const [assessment, setAssessment] = useState<any>(null);
//     const [learner, setLearner] = useState<any>(null);

//     const [proctorSession, setProctorSession] = useState<any>(null);

//     const [learnerProfile, setLearnerProfile] = useState<any>(null);
//     const [assessorProfile, setAssessorProfile] = useState<any>(null);
//     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
//     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);

//     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
//     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
//     const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

//     const [facOverallFeedback, setFacOverallFeedback] = useState('');
//     const [assOverallFeedback, setAssOverallFeedback] = useState('');
//     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

//     const [modFeedback, setModFeedback] = useState('');
//     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

//     const [facTimeOverride, setFacTimeOverride] = useState<number | ''>('');
//     const [assTimeOverride, setAssTimeOverride] = useState<number | ''>('');
//     const [modTimeOverride, setModTimeOverride] = useState<number | ''>('');
//     const [learnerTimeOverride, setLearnerTimeOverride] = useState<number | ''>('');

//     const [, setLiveTick] = useState(0);

//     useEffect(() => {
//         const interval = setInterval(() => setLiveTick(p => p + 1), 30000);
//         return () => clearInterval(interval);
//     }, []);

//     const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);

//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm: () => void; onCancel?: () => void; confirmText?: string; } | null>(null);
//     const [showRemediationModal, setShowRemediationModal] = useState(false);
//     const [showReturnToLearnerModal, setShowReturnToLearnerModal] = useState(false);
//     const [showResolveAppealModal, setShowResolveAppealModal] = useState(false);
//     const [showProctorEvidenceModal, setShowProctorEvidenceModal] = useState(false);
//     const [showExcuseModal, setShowExcuseModal] = useState(false);
//     const [showExtraTimeModal, setShowExtraTimeModal] = useState(false);

//     const [showGroupMatrix, setShowGroupMatrix] = useState(false);
//     const [availablePeers, setAvailablePeers] = useState<any[]>([]);
//     const [isFetchingPeers, setIsFetchingPeers] = useState(false);

//     const [selectedGroupPeers, setSelectedGroupPeers] = useState<any[]>([]);
//     const [groupMatrixGrades, setGroupMatrixGrades] = useState<Record<string, Record<string, boolean>>>({});
//     const [groupTimeMatrix, setGroupTimeMatrix] = useState<Record<string, Record<string, { startTime?: string; endTime?: string }>>>({});
//     const [groupRemarks, setGroupRemarks] = useState('');
//     const [isGroupSessionActive, setIsGroupSessionActive] = useState(false);

//     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const sessionStartRef = useRef<number>(performance.now());
//     const initialFacTimeRef = useRef<number>(0);
//     const initialAssTimeRef = useRef<number>(0);
//     const initialModTimeRef = useRef<number>(0);

//     const currentStatus = String(submission?.status || '').toLowerCase();
//     const currentAttempt = submission?.attemptNumber || 1;

//     const hasChecklists = assessment?.blocks?.some((b: any) => b.type === 'checklist');
//     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
//     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
//     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task', 'code_sandbox'].includes(b.type));
//     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;

//     const isPureKnowledge = hasKnowledgeBlocks && !hasChecklists && !hasWorkplace && !hasLogbook;
//     const isAppealUpheld = submission?.appeal?.status === 'upheld';

//     const isMissed = currentStatus === 'missed';
//     const isViolation = currentStatus === 'violation';
//     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
//     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
//     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
//     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
//     const isModDone = ['moderated', 'appealed'].includes(currentStatus);

//     // 🚀 STRICT QCTO & COHORT-SCOPED ROLE IDENTIFICATION
//     const isMentor = user?.role === 'mentor';
//     const isFacilitator = user?.role === 'facilitator' || user?.role === 'assistant_facilitator';
//     const isAssessor = user?.role === 'assessor';
//     const isModerator = user?.role === 'moderator';
//     const isAdmin = user?.role === 'admin' || user?.role === 'assistant_admin';
//     const isSuperAdmin = Boolean(user?.isSuperAdmin);

//     const secondaryRoles = Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [];
//     const userAssignedCohorts = Array.isArray(user?.assignedCohortIds) ? user.assignedCohortIds : [];

//     // 1. Verify if the user is explicitly assigned to this submission's cohort
//     const isAssignedToCurrentCohort = Boolean(
//         submission?.cohortId && userAssignedCohorts.includes(submission.cohortId)
//     );

//     // 2. Strict QCTO Assessor Accreditation Checks
//     const isCertifiedAssessor = isAssessor ||
//         secondaryRoles.includes('assessor') ||
//         Boolean(user?.canMarkAssessments);

//     const hasAssessorReg = Boolean(
//         user?.assessorRegNumber ||
//         user?.assessorRegistrationNumber ||
//         submission?.grading?.assessorRegNumber
//     );

//     // 3. Enforce Strict Rights:
//     // An Admin CANNOT mark unless they are a certified Assessor, hold an Assessor Reg #, AND are assigned to this cohort.
//     const hasAssessorRights = (isCertifiedAssessor && hasAssessorReg && isAssignedToCurrentCohort) ||
//         (isSuperAdmin && isCertifiedAssessor && hasAssessorReg);

//     const hasFacilitatorRights = isSuperAdmin || (
//         (isFacilitator || Boolean(user?.canFacilitateCohorts) || secondaryRoles.includes('facilitator') || isMentor || isAdmin)
//         && isAssignedToCurrentCohort
//     );

//     const hasModeratorRights = isSuperAdmin || (
//         (secondaryRoles.includes('moderator') || isModerator || isAdmin)
//         && isAssignedToCurrentCohort
//     );

//     const isAdminOrFacilitator = isSuperAdmin || ((isAdmin || isFacilitator || hasFacilitatorRights) && isAssignedToCurrentCohort);

//     const savedFacRole = submission?.grading?.facilitatorRole;
//     const displayFacRole = isFacDone ? savedFacRole : user?.role;

//     const facPanelTitle = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : `Facilitator Pre-Marking`;
//     const facRemarksLabel = displayFacRole === 'mentor' ? 'Supervisor Comments' : `Facilitator Remarks`;
//     const facSubmitLabel = displayFacRole === 'mentor' ? 'Verify & Send to Assessor' : 'Send to Assessor';
//     const facReadOnlyLabel = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark';

//     const canFacilitatorMark = hasFacilitatorRights && (
//         currentStatus === 'submitted' ||
//         (!isPureKnowledge && ['not_started', 'in_progress'].includes(currentStatus))
//     );

//     const canGrade = hasAssessorRights && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned' || currentStatus === 'missed' || currentStatus === 'violation');
//     const canModerate = hasModeratorRights && currentStatus === 'graded';
//     const canReturnToLearner = isMentor && ['submitted', 'in_progress'].includes(currentStatus);

//     const isPast48Hours = useMemo(() => {
//         const refDate = submission?.submittedAt || submission?.startedAt;
//         if (!refDate) return false;
//         const diffHours = (new Date().getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60);
//         return diffHours >= 48;
//     }, [submission?.submittedAt, submission?.startedAt]);

//     const disableExtraTime = isAssDone || isPast48Hours;

//     // 🚀 PROCTOR SNAPSHOT LISTENER WITH ERROR HANDLER
//     useEffect(() => {
//         if (!submission) return;
//         const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
//         const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
//         const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

//         const unsubscribe = onSnapshot(
//             doc(db, 'live_proctor_sessions', sessionDocId),
//             (snap) => {
//                 if (snap.exists()) {
//                     setProctorSession(snap.data());
//                 }
//             },
//             (err) => {
//                 console.warn("Live proctor session snapshot error caught:", err.message);
//             }
//         );
//         return () => unsubscribe();
//     }, [submission?.assessmentId, submission?.authUid, submission?.learnerId, submission?.learnerDeclaration]);

//     // 🚀 MAIN SUBMISSION SNAPSHOT LISTENER WITH ERROR HANDLER
//     useEffect(() => {
//         if (!submissionId) return;

//         let isInitialLoad = true;

//         const unsubscribe = onSnapshot(
//             doc(db, 'learner_submissions', submissionId),
//             async (subSnap) => {
//                 try {
//                     if (!subSnap.exists()) throw new Error("Submission not found");
//                     const subData = subSnap.data();

//                     setSubmission({ id: subSnap.id, ...subData });

//                     if (isInitialLoad) {
//                         const assRef = doc(db, 'assessments', subData.assessmentId);
//                         const assSnap = await getDoc(assRef);
//                         if (!assSnap.exists()) throw new Error("Assessment template missing");
//                         const assData = assSnap.data();
//                         setAssessment(assData);

//                         const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || subData.authUid || subData.learnerId;
//                         const learnerRef = doc(db, 'learners', subData.learnerId || targetLearnerUid);
//                         const learnerSnap = await getDoc(learnerRef);

//                         let lData = null;
//                         if (learnerSnap.exists()) {
//                             lData = learnerSnap.data();
//                         } else {
//                             const fallbackQ = query(collection(db, 'learners'), where('authUid', '==', targetLearnerUid));
//                             const fallbackSnap = await getDocs(fallbackQ);
//                             if (!fallbackSnap.empty) {
//                                 lData = fallbackSnap.docs[0].data();
//                             } else {
//                                 const fallbackQ2 = query(collection(db, 'learners'), where('idNumber', '==', subData.learnerId));
//                                 const fallbackSnap2 = await getDocs(fallbackQ2);
//                                 if (!fallbackSnap2.empty) lData = fallbackSnap2.docs[0].data();
//                             }
//                         }

//                         if (lData) {
//                             setLearner(lData);
//                             setLearnerProfile(lData);
//                         }

//                         if (subData.grading?.gradedBy) {
//                             const assProfSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
//                             if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
//                         }

//                         if (subData.moderation?.moderatedBy) {
//                             const modProfSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
//                             if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
//                         }

//                         const facId = subData.latestCoachingLog?.facilitatorId || subData.grading?.facilitatorId;
//                         if (facId) {
//                             const facProfSnap = await getDoc(doc(db, 'users', facId));
//                             if (facProfSnap.exists()) setFacilitatorProfile(facProfSnap.data());
//                         }

//                         const historyRef = collection(db, 'learner_submissions', submissionId, 'history');
//                         const historySnapshotsRes = await getDocs(query(historyRef));
//                         const hData = historySnapshotsRes.docs.map(d => ({ id: d.id, ...d.data() } as any));
//                         hData.sort((a: any, b: any) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
//                         setHistorySnapshots(hData);

//                         initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
//                         initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
//                         initialModTimeRef.current = subData.moderation?.timeSpent || 0;
//                         sessionStartRef.current = performance.now();

//                         let fBreakdown = subData.grading?.facilitatorBreakdown;
//                         let aBreakdown = subData.grading?.assessorBreakdown;
//                         let mBreakdown = subData.moderation?.breakdown;

//                         const dbStatus = String(subData.status || '').toLowerCase();

//                         const generateFreshBreakdown = (includeFeedback: boolean) => {
//                             const fresh: Record<string, GradeData> = {};
//                             assData.blocks?.forEach((block: any) => {
//                                 if (block.type === 'mcq') {
//                                     const isCorrect = subData.answers?.[block.id] === block.correctOption;
//                                     fresh[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '', isCorrect };
//                                 } else if (block.type === 'text' || block.type === 'task' || block.type === 'code_sandbox') {
//                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
//                                 } else if (block.type === 'checklist') {
//                                     const critInit = block.criteria?.map(() => ({ status: null, comment: '', startTime: '', endTime: '' })) || [];
//                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null, criteriaResults: critInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
//                                 } else if (block.type === 'logbook') {
//                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
//                                 } else if (block.type === 'qcto_workplace') {
//                                     const actInit = block.workActivities?.map(() => ({ status: null, comment: '' })) || [];
//                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null, activityResults: actInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
//                                 }
//                             });
//                             return fresh;
//                         };

//                         if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
//                             if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) fBreakdown = subData.grading.breakdown;
//                             else fBreakdown = generateFreshBreakdown(true);
//                         }
//                         setFacBreakdown(fBreakdown);

//                         if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
//                             if (['facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(dbStatus)) {
//                                 aBreakdown = generateFreshBreakdown(false);
//                                 assData.blocks?.forEach((b: any) => {
//                                     if ((b.type === 'checklist' || b.type === 'qcto_workplace') && fBreakdown[b.id]) {
//                                         aBreakdown[b.id] = { ...JSON.parse(JSON.stringify(fBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
//                                     }
//                                 });
//                             } else {
//                                 aBreakdown = {};
//                             }
//                         }
//                         setAssBreakdown(aBreakdown);

//                         if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
//                             if (['graded', 'moderated', 'returned', 'appealed'].includes(dbStatus)) {
//                                 mBreakdown = generateFreshBreakdown(false);
//                                 assData.blocks?.forEach((b: any) => {
//                                     if ((b.type === 'checklist' || b.type === 'qcto_workplace') && aBreakdown[b.id]) {
//                                         mBreakdown[b.id] = { ...JSON.parse(JSON.stringify(aBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
//                                     }
//                                 });
//                             } else {
//                                 mBreakdown = {};
//                             }
//                         }
//                         setModBreakdown(mBreakdown);

//                         setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
//                         setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');
//                         setCompetency(subData.competency || null);
//                         setModFeedback(subData.moderation?.feedback || '');
//                         setModOutcome(subData.moderation?.outcome || null);
//                         setLearnerTimeOverride(subData.learnerDurationOverride || '');

//                         isInitialLoad = false;
//                     }
//                 } catch (err: any) {
//                     toast.error(err.message || "Failed to load data.");
//                 } finally {
//                     setLoading(false);
//                 }
//             },
//             (err) => {
//                 console.warn("Submission review snapshot error caught:", err.message);
//                 setLoading(false);
//             }
//         );

//         return () => unsubscribe();
//     }, [submissionId]);

//     const groupSessionKey = useMemo(() => `group_obs_${assessment?.id}_${submission?.cohortId}_${user?.uid}`, [assessment?.id, submission?.cohortId, user?.uid]);

//     useEffect(() => {
//         if (!groupSessionKey) return;
//         const saved = localStorage.getItem(groupSessionKey);
//         if (saved) {
//             try {
//                 const parsed = JSON.parse(saved);
//                 if (parsed.isGroupSessionActive) {
//                     setSelectedGroupPeers(parsed.selectedGroupPeers || []);
//                     setGroupMatrixGrades(parsed.groupMatrixGrades || {});
//                     setGroupTimeMatrix(parsed.groupTimeMatrix || {});
//                     setGroupRemarks(parsed.groupRemarks || '');
//                     setIsGroupSessionActive(true);
//                 }
//             } catch (e) {
//                 console.error("Failed to parse local group session cache", e);
//             }
//         }
//     }, [groupSessionKey]);

//     useEffect(() => {
//         if (!groupSessionKey) return;
//         if (isGroupSessionActive || selectedGroupPeers.length > 0) {
//             localStorage.setItem(groupSessionKey, JSON.stringify({
//                 selectedGroupPeers,
//                 groupMatrixGrades,
//                 groupTimeMatrix,
//                 groupRemarks,
//                 isGroupSessionActive
//             }));
//         }
//     }, [selectedGroupPeers, groupMatrixGrades, groupTimeMatrix, groupRemarks, isGroupSessionActive, groupSessionKey]);

//     const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
//     const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
//     const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

//     const resolveAssTime = () => assTimeOverride !== '' ? Number(assTimeOverride) * 60 : getAssTime();
//     const resolveModTime = () => modTimeOverride !== '' ? Number(modTimeOverride) * 60 : getModTime();

//     const groupCriteriaList = useMemo(() => {
//         const list: any[] = [];
//         if (!assessment?.blocks) return list;
//         assessment.blocks.forEach((b: any) => {
//             if (b.type === 'checklist') {
//                 b.criteria?.forEach((crit: string, i: number) => {
//                     list.push({ id: `${b.id}_${i}`, description: `[${b.title}] ${crit}`, blockId: b.id, index: i, type: 'checklist' });
//                 });
//             } else if (b.type === 'qcto_workplace') {
//                 b.workActivities?.forEach((wa: any, i: number) => {
//                     list.push({ id: `${b.id}_${i}`, description: `[${b.weCode}] ${wa.code}: ${wa.description}`, blockId: b.id, index: i, type: 'workplace' });
//                 });
//             }
//         });
//         return list;
//     }, [assessment]);

//     const handleOpenGroupMode = async () => {
//         setIsFetchingPeers(true);
//         try {
//             const q = query(
//                 collection(db, 'learner_submissions'),
//                 where('assessmentId', '==', assessment.id),
//                 where('cohortId', '==', submission.cohortId)
//             );
//             const snap = await getDocs(q);

//             const peers: any[] = [];
//             for (const docSnap of snap.docs) {
//                 if (docSnap.id === submission.id) continue;
//                 const subData = docSnap.data();

//                 const st = subData.status?.toLowerCase();
//                 if (['graded', 'moderated', 'appealed'].includes(st)) continue;

//                 let peerName = subData.learnerDeclaration?.learnerName || 'Unknown Learner';
//                 if (peerName === 'Unknown Learner' && subData.authUid) {
//                     const uSnap = await getDoc(doc(db, 'users', subData.authUid));
//                     if (uSnap.exists()) peerName = uSnap.data().fullName || peerName;
//                 }

//                 peers.push({ id: docSnap.id, name: peerName });
//             }
//             setAvailablePeers(peers);

//             if (selectedGroupPeers.length === 0) {
//                 setSelectedGroupPeers([{ id: submission.id, name: learner?.fullName || 'Current Learner' }]);
//             }

//             setShowGroupMatrix(true);
//         } catch (e) {
//             toast.error("Failed to fetch available peers for group observation.");
//         } finally {
//             setIsFetchingPeers(false);
//         }
//     };

//     const handleDisbandGroupSession = () => {
//         setModalConfig({
//             isOpen: true,
//             type: 'warning',
//             title: 'Disband Group Session?',
//             message: "Are you sure you want to disband this group session? Ongoing timers and unsaved grades will be cleared.",
//             confirmText: 'Yes, Disband',
//             onConfirm: () => {
//                 setModalConfig(null);
//                 setSelectedGroupPeers([]);
//                 setGroupMatrixGrades({});
//                 setGroupTimeMatrix({});
//                 setGroupRemarks('');
//                 setIsGroupSessionActive(false);
//                 localStorage.removeItem(groupSessionKey);
//                 setShowGroupMatrix(false);
//                 toast.info("Group session disbanded.");
//             },
//             onCancel: () => setModalConfig(null)
//         });
//     };

//     const handleSaveGroupMatrix = async () => {
//         setSaving(true);
//         try {
//             const nowIso = new Date().toISOString();
//             const batch = writeBatch(db);

//             const allSubIds = new Set<string>();
//             Object.values(groupMatrixGrades).forEach(critMap => {
//                 Object.keys(critMap).forEach(subId => allSubIds.add(subId));
//             });
//             allSubIds.add(submission.id);

//             for (const subId of Array.from(allSubIds)) {
//                 const subRef = doc(db, 'learner_submissions', subId);

//                 const individualSubSnap = await getDoc(subRef);
//                 if (!individualSubSnap.exists()) continue;
//                 const individualSubData = individualSubSnap.data();

//                 const patchPayload: Record<string, any> = {
//                     'grading.facilitatorOverallFeedback': groupRemarks,
//                     'grading.facilitatorId': user?.uid,
//                     'grading.facilitatorName': user?.fullName,
//                     'grading.facilitatorRole': user?.role,
//                     'grading.facilitatorSignatureUrl': user?.signatureUrl,
//                     'grading.facilitatorReviewedAt': nowIso,
//                     lastStaffEditAt: nowIso
//                 };

//                 let individualTaskMinutes = 0;

//                 groupCriteriaList.forEach(crit => {
//                     const isChecked = groupMatrixGrades[crit.id]?.[subId] || false;
//                     const cellTime = groupTimeMatrix?.[crit.id]?.[subId] || {};
//                     const baseBlockPath = `grading.facilitatorBreakdown.${crit.blockId}`;

//                     if (crit.type === 'checklist') {
//                         patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.status`] = isChecked ? 'C' : null;
//                         if (cellTime.startTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.startTime`] = cellTime.startTime;
//                         if (cellTime.endTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.endTime`] = cellTime.endTime;
//                     } else if (crit.type === 'workplace') {
//                         patchPayload[`${baseBlockPath}.activityResults.${crit.index}.status`] = isChecked ? 'C' : null;
//                     }

//                     if (isChecked) {
//                         patchPayload[`${baseBlockPath}.obsDeclaration`] = true;
//                     }

//                     if (cellTime.startTime && cellTime.endTime) {
//                         const diffMs = new Date(cellTime.endTime).getTime() - new Date(cellTime.startTime).getTime();
//                         if (diffMs > 0) individualTaskMinutes += Math.floor(diffMs / 60000);
//                     }
//                 });

//                 if (individualTaskMinutes > 0) {
//                     patchPayload['grading.facilitatorTimeSpent'] = individualTaskMinutes * 60;
//                 } else if (subId === submission.id) {
//                     patchPayload['grading.facilitatorTimeSpent'] = resolveFacTime();
//                 }

//                 if (!individualSubData.grading?.facilitatorStartedAt) {
//                     patchPayload['grading.facilitatorStartedAt'] = nowIso;
//                 }

//                 const individualCurrentStatus = String(individualSubData.status || '').toLowerCase();
//                 const newStatus = ['not_started', 'in_progress'].includes(individualCurrentStatus)
//                     ? 'awaiting_learner_signoff'
//                     : individualSubData.status;

//                 patchPayload.status = newStatus;

//                 batch.update(subRef, patchPayload);
//             }

//             await batch.commit();

//             let activeFacBreakdown = { ...facBreakdown };

//             groupCriteriaList.forEach(crit => {
//                 if (!activeFacBreakdown[crit.blockId]) {
//                     activeFacBreakdown[crit.blockId] = { score: 0, feedback: '', criteriaResults: [], activityResults: [] };
//                 }

//                 const isChecked = groupMatrixGrades[crit.id]?.[submission.id] || false;
//                 const cellTime = groupTimeMatrix?.[crit.id]?.[submission.id] || {};

//                 const targetBlock = activeFacBreakdown[crit.blockId];

//                 if (crit.type === 'checklist') {
//                     if (!targetBlock.criteriaResults) {
//                         targetBlock.criteriaResults = [];
//                     }

//                     const critResults = targetBlock.criteriaResults;

//                     while (critResults.length <= crit.index) {
//                         critResults.push({ status: null, comment: '', startTime: '', endTime: '' });
//                     }

//                     const currentItem = critResults[crit.index];
//                     if (currentItem) {
//                         currentItem.status = isChecked ? 'C' : null;
//                         if (cellTime.startTime) currentItem.startTime = cellTime.startTime;
//                         if (cellTime.endTime) currentItem.endTime = cellTime.endTime;
//                     }
//                 }

//                 if (isChecked) targetBlock.obsDeclaration = true;
//             });

//             setFacBreakdown(activeFacBreakdown);
//             setFacOverallFeedback(groupRemarks);
//             toast.success("Group metrics and individual task timers synchronized successfully!");

//             setSelectedGroupPeers([]);
//             setGroupMatrixGrades({});
//             setGroupTimeMatrix({});
//             setGroupRemarks('');
//             setIsGroupSessionActive(false);
//             localStorage.removeItem(groupSessionKey);
//             setShowGroupMatrix(false);

//         } catch (e) {
//             console.error(e);
//             toast.error("Failed to commit group matrix update configurations.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const handleFacOverallFeedbackChange = (val: string) => {
//         if (!canFacilitatorMark) return;
//         setFacOverallFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
//     };

//     const handleAssOverallFeedbackChange = (val: string) => {
//         if (!canGrade) return;
//         setAssOverallFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
//     };

//     const handleModFeedbackChange = (val: string) => {
//         if (!canModerate) return;
//         setModFeedback(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
//     };

//     const handleCompetencySelect = (val: 'C' | 'NYC') => {
//         if (!canGrade) return;
//         setCompetency(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
//     };

//     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
//         if (!canModerate) return;
//         setModOutcome(val);
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
//     };

//     const handleLearnerTimeOverrideChange = (val: string) => {
//         const parsedVal = val === '' ? '' : Math.max(1, parseInt(val) || 0);
//         setLearnerTimeOverride(parsedVal);
//         setSubmission((prev: any) => ({ ...prev, learnerDurationOverride: parsedVal }));
//         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//     };

//     const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
//         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
//         setSaving(true);
//         saveTimeoutRef.current = setTimeout(async () => {
//             if (!submission?.id) return;
//             try {
//                 const updatePayload: any = {
//                     'grading.facilitatorBreakdown': fBreak,
//                     'grading.assessorBreakdown': aBreak,
//                     'moderation.breakdown': mBreak,
//                     'grading.facilitatorOverallFeedback': fOverall,
//                     'grading.assessorOverallFeedback': aOverall,
//                     'moderation.feedback': updatedModFeedback,
//                     learnerDurationOverride: learnerTimeOverride === '' ? deleteField() : Number(learnerTimeOverride),
//                     lastStaffEditAt: new Date().toISOString()
//                 };
//                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
//                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

//                 if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = resolveFacTime();
//                 if (canGrade) updatePayload['grading.assessorTimeSpent'] = resolveAssTime();
//                 if (canModerate) updatePayload['moderation.timeSpent'] = resolveModTime();

//                 const nowIso = new Date().toISOString();
//                 if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
//                     updatePayload['grading.facilitatorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
//                 }
//                 if (canGrade && !submission.grading?.assessorStartedAt) {
//                     updatePayload['grading.assessorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
//                 }
//                 if (canModerate && !submission.moderation?.moderatorStartedAt) {
//                     updatePayload['moderation.moderatorStartedAt'] = nowIso;
//                     setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
//                 }
//                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
//             } catch (error) { console.error("Auto-save failed:", error); } finally { setSaving(false); }
//         }, 1500);
//     };

//     const computedLearnerDurationText = useMemo(() => {
//         if (submission?.learnerDurationOverride) {
//             return `${submission.learnerDurationOverride}m 0s (Manually Adjusted)`;
//         }
//         if (submission?.startedAt && submission?.submittedAt) {
//             const diffSecs = Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000);
//             const h = Math.floor(diffSecs / 3600), m = Math.floor((diffSecs % 3600) / 60), s = diffSecs % 60;
//             return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
//         }
//         return 'N/A';
//     }, [submission?.startedAt, submission?.submittedAt, submission?.learnerDurationOverride]);

//     const executeZeroGrade = () => {
//         setModalConfig({
//             isOpen: true,
//             type: 'warning',
//             title: 'Assign Zero-Grade?',
//             message: "Are you sure you want to assign a Zero-Grade for this submission? This action cannot be undone.",
//             confirmText: 'Yes, Assign Zero',
//             onConfirm: async () => {
//                 setModalConfig(null);
//                 setSaving(true);
//                 try {
//                     const fallbackAssessorReg =
//                         (user as any)?.assessorRegNumber ||
//                         (user as any)?.assessorRegistrationNumber ||
//                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'graded',
//                         marks: 0,
//                         competency: 'NYC',
//                         'grading.assessorOverallFeedback': submission?.systemNote || 'Unexcused Absence / Security Violation: Learner failed to complete the assessment successfully.',
//                         'grading.gradedBy': user?.uid,
//                         'grading.assessorName': user?.fullName,
//                         'grading.assessorSignatureUrl': user?.signatureUrl,
//                         'grading.assessorRegNumber': fallbackAssessorReg,
//                         'grading.gradedAt': new Date().toISOString(),
//                         lastStaffEditAt: new Date().toISOString()
//                     });
//                     toast.success("Zero-Grade officially assigned.");
//                     setTimeout(() => window.location.reload(), 1000);
//                 } catch (e) {
//                     toast.error("Failed to apply zero grade.");
//                 } finally {
//                     setSaving(false);
//                 }
//             },
//             onCancel: () => setModalConfig(null)
//         });
//     };

//     const handleReopenMissedAssessment = () => {
//         setShowExcuseModal(true);
//     };

//     const executeExcuseAndReopen = async (excuseReason: string) => {
//         setShowExcuseModal(false);
//         setSaving(true);

//         try {
//             const timestampIso = new Date().toISOString();

//             const excuseLogEntry = {
//                 excusedAt: timestampIso,
//                 excusedBy: user?.uid,
//                 excusedByName: user?.fullName || 'Staff Member',
//                 excusedByRole: user?.role || 'facilitator',
//                 reason: excuseReason,
//                 previousStatus: currentStatus,
//                 previousSystemNote: submission?.systemNote || null
//             };

//             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
//             await setDoc(historyRef, {
//                 ...submission,
//                 archivedAt: timestampIso,
//                 snapshotReason: `Attempt Restarted - Internet/Tech Failure Excused`
//             });

//             const subRef = doc(db, 'learner_submissions', submission.id);
//             await updateDoc(subRef, {
//                 status: 'not_started',
//                 overrideUnlock: true,
//                 startedAt: deleteField(),
//                 submittedAt: deleteField(),
//                 attemptNumber: (submission.attemptNumber || 1) + 1,
//                 systemNote: `Excused & Restarted by ${user?.fullName || 'Staff'}: "${excuseReason}"`,
//                 excusedLogs: arrayUnion(excuseLogEntry),
//                 lastStaffEditAt: timestampIso
//             });

//             setSubmission((prev: any) => ({
//                 ...prev,
//                 status: 'not_started',
//                 overrideUnlock: true,
//                 attemptNumber: (prev.attemptNumber || 1) + 1,
//                 systemNote: `Excused: ${excuseReason}`
//             }));

//             toast.success("Assessment excused and reopened for learner. Timer reset.");
//         } catch (e) {
//             console.error("Failed to excuse and reopen assessment:", e);
//             toast.error("Failed to update submission record.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const grantExtraTime = async (minutes: number, reason: string = 'Staff granted extra time') => {
//         setSaving(true);
//         const targetSubId = submissionId || submission?.id;

//         try {
//             const subRef = doc(db, 'learner_submissions', targetSubId);
//             const timestampIso = new Date().toISOString();
//             const nowMs = Date.now();

//             const extraTimeLog = {
//                 grantedAt: timestampIso,
//                 grantedBy: user?.uid,
//                 grantedByName: user?.fullName || 'Staff',
//                 minutesAdded: minutes,
//                 reason: reason
//             };

//             const baseLimitMins = assessment?.moduleInfo?.timeLimit || 60;

//             let usedBaseMins = baseLimitMins;
//             if (submission?.startedAt) {
//                 const startMs = new Date(submission.startedAt).getTime();
//                 const endMs = submission?.submittedAt ? new Date(submission.submittedAt).getTime() : nowMs;
//                 const diffMins = Math.floor((endMs - startMs) / 60000);
//                 usedBaseMins = Math.min(baseLimitMins, Math.max(0, diffMins));
//             }

//             const newStartIso = new Date(nowMs - (usedBaseMins * 60 * 1000)).toISOString();

//             const payload: any = {
//                 status: 'in_progress',
//                 extraTimeGranted: (submission?.extraTimeGranted || 0) + minutes,
//                 extraTimeLogs: arrayUnion(extraTimeLog),
//                 startedAt: newStartIso,
//                 lastStaffEditAt: timestampIso
//             };

//             if (submission?.submittedAt || submission?.autoSubmitted) {
//                 payload.previousSubmissionAudit = {
//                     submittedAt: submission.submittedAt || null,
//                     autoSubmitted: submission.autoSubmitted || false,
//                     unlockedAt: timestampIso,
//                     unlockedBy: user?.uid,
//                     unlockedByName: user?.fullName || 'Staff'
//                 };
//                 payload.submittedAt = deleteField();
//                 payload.autoSubmitted = deleteField();
//             }

//             await updateDoc(subRef, payload);

//             setSubmission((prev: any) => {
//                 const next = {
//                     ...prev,
//                     status: 'in_progress',
//                     startedAt: newStartIso,
//                     extraTimeGranted: (prev?.extraTimeGranted || 0) + minutes,
//                     previousSubmissionAudit: payload.previousSubmissionAudit || prev?.previousSubmissionAudit
//                 };
//                 if (payload.submittedAt) delete next.submittedAt;
//                 if (payload.autoSubmitted) delete next.autoSubmitted;
//                 return next;
//             });

//             toast.success(`Granted ${minutes} extra minutes! Assessment unlocked and resumed.`);
//             setShowExtraTimeModal(false);
//         } catch (error: any) {
//             console.error("❌ Extra time update failed:", error);
//             toast.error(`Failed to grant extra time: ${error.message}`);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const toggleDeferredAccess = async () => {
//         setSaving(true);
//         const newState = !submission.overrideUnlock;
//         try {
//             const subRef = doc(db, 'learner_submissions', submissionId!);
//             const payload: any = {
//                 overrideUnlock: newState,
//                 lastStaffEditAt: new Date().toISOString()
//             };

//             await updateDoc(subRef, payload);
//             setSubmission((prev: any) => ({
//                 ...prev,
//                 overrideUnlock: newState
//             }));
//             toast.success(newState ? "Deferred access granted. Assessment unlocked!" : "Deferred access revoked. Assessment locked.");
//         } catch (error) {
//             toast.error("Failed to update access settings.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const getActiveBreakdownData = (blockId: string) => {
//         if (canFacilitatorMark) return { ...facBreakdown[blockId] };
//         if (canGrade) return { ...assBreakdown[blockId] };
//         if (canModerate) return { ...modBreakdown[blockId] };
//         return null;
//     };

//     const setActiveBreakdownData = (blockId: string, newData: GradeData) => {
//         if (canFacilitatorMark) {
//             const next = { ...facBreakdown, [blockId]: newData };
//             setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canGrade) {
//             const next = { ...assBreakdown, [blockId]: newData };
//             setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         } else if (canModerate) {
//             const next = { ...modBreakdown, [blockId]: newData };
//             setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
//         }
//     };

//     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         active.isCorrect = isCorrect;
//         active.score = isCorrect ? maxMarks : 0;
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleScoreChange = (blockId: string, score: number, max: number) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         active.score = Math.min(Math.max(0, score), max);
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleFeedbackChange = (blockId: string, feedback: string) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         active.feedback = feedback;
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleCriterionChange = (blockId: string, index: number, field: keyof CriterionResult, value: any) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         const crits = [...(active.criteriaResults || [])];
//         if (!crits[index]) crits[index] = { status: null, comment: '', startTime: '', endTime: '' };
//         crits[index] = { ...crits[index], [field]: value };
//         active.criteriaResults = crits;
//         const block = assessment?.blocks?.find((b: any) => b.id === blockId);
//         const total = block?.criteria?.length || 0;
//         if (total > 0 && crits.length >= total && crits.slice(0, total).every((c: any) => c?.status)) {
//             active.isCorrect = crits.slice(0, total).every((c: any) => c?.status === 'C');
//         }
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleActivityStatusChange = (blockId: string, index: number, status: 'C' | 'NYC') => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         const activities = [...(active.activityResults || [])];
//         if (!activities[index]) activities[index] = { status: null, comment: '' };
//         activities[index].status = status;
//         active.activityResults = activities;
//         const block = assessment?.blocks?.find((b: any) => b.id === blockId);
//         const total = block?.workActivities?.length || 0;
//         if (total > 0 && activities.length >= total && activities.slice(0, total).every((a: any) => a?.status)) {
//             active.isCorrect = activities.slice(0, total).every((a: any) => a?.status === 'C');
//         }
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleActivityCommentChange = (blockId: string, index: number, comment: string) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         const activities = [...(active.activityResults || [])];
//         if (!activities[index]) activities[index] = { status: null, comment: '' };
//         activities[index].comment = comment;
//         active.activityResults = activities;
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleGlobalChecklistChange = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime' | 'obsDeclaration', value: any) => {
//         const active = getActiveBreakdownData(blockId);
//         if (!active) return;
//         (active as any)[field] = value;
//         setActiveBreakdownData(blockId, active);
//     };

//     const handleSetToNow = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime') => {
//         if (field === 'obsDate') handleGlobalChecklistChange(blockId, field, moment().format('YYYY-MM-DD'));
//         else handleGlobalChecklistChange(blockId, field, moment().format('HH:mm'));
//     };

//     const executeReturnToLearner = async (reason: string) => {
//         setShowReturnToLearnerModal(false);
//         setSaving(true);
//         try {
//             await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                 status: 'in_progress',
//                 mentorReturnReason: reason,
//                 mentorReturnedAt: new Date().toISOString(),
//                 mentorReturnedBy: user?.uid,
//                 mentorReturnedByName: user?.fullName,
//                 lastStaffEditAt: new Date().toISOString(),
//             });
//             toast.success("Logbook returned to learner for correction.");
//             setTimeout(() => navigate(-1), 1500);
//         } catch (err) {
//             toast.error("Failed to return logbook to learner.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
//         setShowRemediationModal(false);
//         setSaving(true);
//         try {
//             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
//             await setDoc(historyRef, {
//                 ...submission, archivedAt: new Date().toISOString(), snapshotReason: 'Remediation requested after NYC outcome',
//                 coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
//             });
//             await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                 status: 'not_started',
//                 startedAt: deleteField(),
//                 competency: deleteField(),
//                 grading: deleteField(),
//                 moderation: deleteField(),
//                 submittedAt: deleteField(),
//                 learnerDeclaration: deleteField(),
//                 attemptNumber: (submission.attemptNumber || 1) + 1,
//                 lastStaffEditAt: new Date().toISOString(),
//                 latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName, acknowledged: false }
//             });
//             toast.success("Workbook grading cleared and unlocked for learner!");
//             setTimeout(() => navigate(-1), 1500);
//         } catch (err) { toast.error("Failed to unlock for remediation."); } finally { setSaving(false); }
//     };

//     const executeAppealResolution = async (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => {
//         setShowResolveAppealModal(false);
//         setSaving(true);
//         try {
//             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
//             await setDoc(historyRef, {
//                 ...submission, archivedAt: new Date().toISOString(), snapshotReason: `Appeal Resolution: ${decision}`
//             });

//             const updatePayload: any = {
//                 'appeal.status': decision === 'overturn' || decision === 'new_attempt' ? 'upheld' : 'rejected',
//                 'appeal.resolutionNotes': notes,
//                 'appeal.resolvedBy': user?.uid,
//                 'appeal.resolvedByName': user?.fullName,
//                 'appeal.resolvedAt': new Date().toISOString(),
//                 lastStaffEditAt: new Date().toISOString()
//             };

//             if (decision === 'overturn') {
//                 updatePayload.status = 'moderated';
//                 updatePayload.competency = 'C';
//                 updatePayload['moderation.outcome'] = 'Endorsed';
//                 updatePayload['moderation.feedback'] = `APPEAL UPHELD: ${notes}`;
//             } else if (decision === 'new_attempt') {
//                 updatePayload.status = 'not_started';
//                 updatePayload.startedAt = deleteField();
//                 updatePayload.competency = deleteField();
//                 updatePayload.grading = deleteField();
//                 updatePayload.moderation = deleteField();
//                 updatePayload.submittedAt = deleteField();
//                 updatePayload.learnerDeclaration = deleteField();
//                 updatePayload.attemptNumber = (submission.attemptNumber || 1) + 1;
//             } else if (decision === 'reject') {
//                 updatePayload.status = 'moderated';
//             }

//             await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
//             toast.success("Appeal resolved successfully!");
//             setTimeout(() => window.location.reload(), 1500);
//         } catch (err) {
//             toast.error("Failed to resolve appeal.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const getTotals = (breakdown: Record<string, GradeData>) => {
//         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
//         const max = assessment?.totalMarks || 0;
//         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
//         return { score, max, pct };
//     };

//     const facTotals = getTotals(facBreakdown);
//     const assTotals = getTotals(assBreakdown);
//     const modTotals = getTotals(modBreakdown);

//     const autoSummedTaskMinutes = useMemo(() => {
//         let totalMs = 0;
//         Object.values(facBreakdown).forEach((grade: GradeData) => {
//             (grade.criteriaResults || []).forEach((crit: CriterionResult) => {
//                 if (crit.startTime && crit.endTime) {
//                     const st = new Date(crit.startTime).getTime();
//                     const et = new Date(crit.endTime).getTime();
//                     if (et > st) totalMs += (et - st);
//                 }
//             });
//         });
//         return Math.floor(totalMs / 60000);
//     }, [facBreakdown]);

//     const showAssessorPanel = true;
//     const showModeratorPanel = true;

//     let activeTotals = facTotals;
//     if (showAssessorPanel) activeTotals = assTotals;
//     if (showModeratorPanel) activeTotals = modTotals;

//     const resolveFacTime = () => {
//         if (facTimeOverride !== '') return Number(facTimeOverride) * 60;
//         if (autoSummedTaskMinutes > 0) return autoSummedTaskMinutes * 60;
//         return getFacTime();
//     };

//     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
//     let currentSectionId = '';
//     if (assessment?.blocks) {
//         assessment.blocks.forEach((block: any) => {
//             if (block.type === 'section') {
//                 currentSectionId = block.id;
//                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
//             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type) && currentSectionId) {
//                 const g = submission?.grading || {}; const m = submission?.moderation || {};
//                 const mLayer = m.breakdown?.[block.id] || {}; const aLayer = g.assessorBreakdown?.[block.id] || {}; const fLayer = g.facilitatorBreakdown?.[block.id] || {};
//                 const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };
//                 let activeLayer = legacyLayer;
//                 if (isFacDone) activeLayer = fLayer;
//                 if (isAssDone) activeLayer = aLayer;
//                 if (isModDone) activeLayer = mLayer;
//                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
//                 if (activeLayer.score !== undefined && activeLayer.score !== null) sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
//             }
//         });
//     }

//     const validateMentorVerification = (): string | null => {
//         if (!assessment?.blocks) return null;
//         for (const block of assessment.blocks) {
//             const grade = facBreakdown[block.id];
//             if (block.type === 'checklist') {
//                 const criteria = block.criteria || [];
//                 const results = grade?.criteriaResults || [];
//                 for (let i = 0; i < criteria.length; i++) {
//                     if (!results[i]?.status) {
//                         return `Please select "Observed ✓" or "Not Observed ✗" for every criterion in the checklist "${block.title}". Item ${i + 1} is still unverified.`;
//                     }
//                 }
//                 if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
//                     return `Please tick the verification declaration at the bottom of the checklist "${block.title}" before submitting.`;
//                 }
//             }
//             if (block.type === 'qcto_workplace') {
//                 const activities = block.workActivities || [];
//                 const results = grade?.activityResults || [];
//                 for (let i = 0; i < activities.length; i++) {
//                     if (!results[i]?.status) {
//                         return `Please select "Verified ✓" or "Not Verified ✗" for every Work Activity in "${block.weCode} – ${block.weTitle}". Activity ${i + 1} (${activities[i]?.code || `#${i + 1}`}) is still unverified.`;
//                     }
//                 }
//                 if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
//                     return `Please tick the workplace verification sign-off declaration at the bottom of "${block.weCode} – ${block.weTitle}" before submitting.`;
//                 }
//             }
//         }
//         return null;
//     };

//     const validateAllMarked = (breakdown: Record<string, GradeData>, isModerating: boolean = false) => {
//         if (!assessment?.blocks) return true;
//         const isAssessorGrading = canGrade;
//         const unmarkedCount = assessment.blocks.filter((block: any) => {
//             const grade = breakdown[block.id];

//             if (isWorkplaceModule && (isAdmin || isFacilitator) && !isModerating) {
//                 return false;
//             }

//             if (['mcq', 'text', 'task', 'code_sandbox'].includes(block.type)) {
//                 return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
//             }

//             if (block.type === 'checklist') {
//                 const declarationRequired = !isModerating && block.requireObservationDeclaration
//                     && !grade?.obsDeclaration
//                     && !(isAssessorGrading && savedFacRole === 'mentor');
//                 if (declarationRequired) return true;
//                 const crits = grade?.criteriaResults || [];
//                 const total = block.criteria?.length || 0;
//                 for (let i = 0; i < total; i++) {
//                     if (!crits[i] || !crits[i].status) return true;
//                 }
//                 const allHaveStatus = crits.slice(0, total).every((c: any) => c?.status);
//                 if (!allHaveStatus) return true;
//                 return false;
//             }

//             if (block.type === 'qcto_workplace') {
//                 const declarationRequired = !isModerating && block.requireObservationDeclaration
//                     && !grade?.obsDeclaration
//                     && !(isAssessorGrading && savedFacRole === 'mentor');
//                 if (declarationRequired) return true;

//                 if (isMentor) return false;

//                 const activities = grade?.activityResults || [];
//                 const total = block.workActivities?.length || 0;
//                 for (let i = 0; i < total; i++) {
//                     if (!activities[i] || !activities[i].status) return true;
//                 }
//                 const allHaveStatus = activities.slice(0, total).every((a: any) => a?.status);
//                 if (!allHaveStatus) return true;
//                 return false;
//             }

//             return false;
//         }).length;
//         return unmarkedCount === 0;
//     };

//     const triggerSubmitFacilitator = () => {
//         if (isMentor) {
//             const mentorValidationError = validateMentorVerification();
//             if (mentorValidationError) {
//                 return setModalConfig({
//                     isOpen: true, type: 'warning', title: 'Incomplete Verification',
//                     message: mentorValidationError,
//                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
//                 });
//             }
//             if (!facOverallFeedback.trim()) {
//                 return setModalConfig({
//                     isOpen: true, type: 'warning', title: 'Supervisor Comments Required',
//                     message: 'Please add your overall Supervisor Comments before verifying this logbook.',
//                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
//                 });
//             }
//         } else {
//             if (!validateAllMarked(facBreakdown, false)) {
//                 return setModalConfig({
//                     isOpen: true, type: 'warning', title: 'Incomplete Marking',
//                     message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.',
//                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
//                 });
//             }
//             if (!facOverallFeedback.trim()) {
//                 return setModalConfig({
//                     isOpen: true, type: 'warning', title: 'Missing Remarks',
//                     message: 'You must provide Overall Facilitator Remarks before sending this script forward.',
//                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
//                 });
//             }
//         }

//         let newStatus = 'facilitator_reviewed';
//         let confirmTitle = isWorkplaceModule ? 'Complete Mentor Verification?' : 'Complete Pre-Marking?';
//         let confirmMessage = isWorkplaceModule ? 'This will finalize your verification and send the logbook to the Assessor.' : 'This will finalize your feedback and send the workbook to the Assessor.';
//         let confirmBtnText = 'Send to Assessor';

//         if (['not_started', 'in_progress'].includes(currentStatus)) {
//             if (hasChecklists || hasWorkplace) {
//                 newStatus = 'awaiting_learner_signoff';
//                 confirmTitle = isWorkplaceModule ? 'Request Learner Sign-off?' : 'Request Learner Sign-off?';
//                 confirmMessage = isWorkplaceModule
//                     ? 'This will save your verification and prompt the learner to log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.'
//                     : 'This will save your practical observation and prompt the learner to log in, review your feedback, and officially sign off before it goes to the Assessor.';
//                 confirmBtnText = isWorkplaceModule ? 'Save & Request Learner Signature' : 'Save & Request Sign-off';
//             } else {
//                 confirmTitle = isWorkplaceModule ? 'Force Verify?' : 'Force Submission?';
//                 confirmMessage = isWorkplaceModule
//                     ? 'The learner has not formally submitted yet. Verifying now will lock the logbook for the learner and pass it directly to the Assessor. Proceed?'
//                     : 'The learner has not submitted this workbook yet. Finalising your marking now will lock the workbook and pass it to the Assessor. Proceed?';
//                 confirmBtnText = isWorkplaceModule ? 'Verify & Force Submit' : 'Force Submit & Send';
//             }
//         }

//         setModalConfig({
//             isOpen: true, type: 'info', title: confirmTitle, message: confirmMessage, confirmText: confirmBtnText,
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: newStatus,
//                         'grading.facilitatorBreakdown': facBreakdown,
//                         'grading.facilitatorOverallFeedback': facOverallFeedback,
//                         'grading.facilitatorId': user?.uid,
//                         'grading.facilitatorName': user?.fullName,
//                         'grading.facilitatorRole': user?.role,
//                         'grading.facilitatorSignatureUrl': user?.signatureUrl,
//                         'grading.facilitatorReviewedAt': new Date().toISOString(),
//                         'grading.facilitatorTimeSpent': resolveFacTime()
//                     });
//                     if (newStatus === 'awaiting_learner_signoff') {
//                         toast.success(isWorkplaceModule ? "Verification saved! Learner has been requested to sign the logbook." : "Observation saved! Learner has been requested to sign off.");
//                     } else {
//                         toast.success(isWorkplaceModule ? "Logbook verified and passed to Assessor!" : "Script marked and passed to Assessor!");
//                     }
//                     setTimeout(() => navigate(-1), 2000);
//                 } catch (error) { toast.error("Failed to save."); } finally { setSaving(false); }
//             }, onCancel: () => setModalConfig(null)
//         });
//     };

//     const triggerSubmitGrade = () => {
//         if (!validateAllMarked(assBreakdown, false)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
//         if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
//         if (!assOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

//         setModalConfig({
//             isOpen: true, type: 'warning', title: 'Finalise Grade?', message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.', confirmText: 'Apply Signature & Submit',
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     const fallbackAssessorReg =
//                         (user as any)?.assessorRegNumber ||
//                         (user as any)?.assessorRegistrationNumber ||
//                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: 'graded', marks: assTotals.score, competency,
//                         'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback,
//                         'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName,
//                         'grading.assessorSignatureUrl': user?.signatureUrl,
//                         'grading.assessorRegNumber': fallbackAssessorReg,
//                         'grading.gradedAt': new Date().toISOString(),
//                         'grading.assessorTimeSpent': resolveAssTime()
//                     });
//                     toast.success("Workbook graded and signed successfully!"); setTimeout(() => window.location.reload(), 500);
//                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
//             }, onCancel: () => setModalConfig(null)
//         });
//     };

//     const triggerSubmitModeration = () => {
//         if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Decision', message: 'You must select Endorse or Return to Assessor before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
//         if (modOutcome === 'Returned' && !modFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Green Pen Instructions Required', message: 'You must provide Green Pen instructions explaining what the Assessor needs to fix before this can be returned.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
//         if (!isWorkplaceModule && !validateAllMarked(modBreakdown, true)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question and fully check all blocks before endorsing.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

//         setModalConfig({
//             isOpen: true, type: 'info',
//             title: modOutcome === 'Returned' ? 'Return to Assessor?' : 'Endorse & Finalise?',
//             message: modOutcome === 'Returned'
//                 ? 'This will return the workbook to the Assessor with your Green Pen instructions. The Assessor must address your concerns before re-submitting.'
//                 : 'This will apply your Green Pen signature and endorse the Assessor\'s judgment. The learner\'s result will be locked in for the QCTO verifier.',
//             confirmText: modOutcome === 'Returned' ? 'Confirm Return' : 'Confirm Endorsement',
//             onConfirm: async () => {
//                 setModalConfig(null); setSaving(true);
//                 try {
//                     const fallbackModReg =
//                         (user as any)?.moderatorRegNumber ||
//                         (user as any)?.assessorRegNumber ||
//                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

//                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';

//                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
//                         status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome,
//                         'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid,
//                         'moderation.moderatorName': user?.fullName,
//                         'moderation.moderatorSignatureUrl': user?.signatureUrl,
//                         'moderation.moderatorRegNumber': fallbackModReg,
//                         'moderation.moderatedAt': new Date().toISOString(),
//                         'moderation.timeSpent': resolveModTime()
//                     });
//                     toast.success("Moderation saved successfully!"); setTimeout(() => navigate(-1), 1000);
//                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
//             }, onCancel: () => setModalConfig(null)
//         });
//     };

//     if (loading) return (
//         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
//             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
//                 <div className="ap-spinner" />
//                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}> Loading Record...</span>
//             </div>
//         </div>
//     );

//     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

//     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
//     const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');
//     const canPrint = !['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus);

//     const getFacilitatorStatus = () => {
//         if (isFacDone) return 'done';
//         if (canFacilitatorMark) return 'active';
//         if (isAwaitingSignoff) return 'awaiting';
//         if (['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus)) return 'locked';
//         return 'awaiting';
//     };

//     const getAssessorStatus = () => {
//         if (isAssDone) return 'done';
//         if (canGrade) return 'active';
//         if (['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff'].includes(currentStatus)) return 'locked';
//         return 'awaiting';
//     };

//     const getModeratorStatus = () => {
//         if (isModDone) return 'done';
//         if (canModerate) return 'active';
//         if (currentStatus !== 'graded') return 'locked';
//         return 'awaiting';
//     };

//     const facPanelStatus = getFacilitatorStatus();
//     const assPanelStatus = getAssessorStatus();
//     const modPanelStatus = getModeratorStatus();

//     const violationHistoryCount = proctorSession?.violationHistory?.length || submission?.violationHistory?.length || 0;

//     const isProctoredAssessment = Boolean(
//         assessment?.requiresInvigilation || assessment?.isProctored || assessment?.proctored || assessment?.isInvigilated || assessment?.proctoring
//     );
//     const showProctoringAuditCard = isViolation || isProctoredAssessment || violationHistoryCount > 0;

//     return (
//         <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {modalConfig && modalConfig.isOpen && createPortal(
//                 <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} onClose={modalConfig.onConfirm} onCancel={modalConfig.onCancel} />,
//                 document.body
//             )}

//             {showRemediationModal && createPortal(
//                 <RemediationModal submissionTitle={submission.title} attemptNumber={currentAttempt} onClose={() => setShowRemediationModal(false)} onSubmit={executeRemediation} />,
//                 document.body
//             )}

//             {showReturnToLearnerModal && createPortal(
//                 <ReturnToLearnerModal onClose={() => setShowReturnToLearnerModal(false)} onSubmit={executeReturnToLearner} />,
//                 document.body
//             )}

//             {showResolveAppealModal && createPortal(
//                 <ResolveAppealModal appealReason={submission.appeal?.reason || ''} onClose={() => setShowResolveAppealModal(false)} onSubmit={executeAppealResolution} />,
//                 document.body
//             )}

//             {showProctorEvidenceModal && (
//                 <SubmissionProctorEvidenceModal submission={submission} onClose={() => setShowProctorEvidenceModal(false)} />
//             )}

//             {showExcuseModal && createPortal(
//                 <ExcuseReopenModal
//                     learnerName={learner?.fullName || submission?.learnerDeclaration?.learnerName || 'Learner'}
//                     onClose={() => setShowExcuseModal(false)}
//                     onSubmit={executeExcuseAndReopen}
//                 />,
//                 document.body
//             )}

//             {showExtraTimeModal && (
//                 <ExtraTimeModal
//                     onClose={() => setShowExtraTimeModal(false)}
//                     onSubmit={grantExtraTime}
//                 />
//             )}

//             {showGroupMatrix && createPortal(
//                 <GroupObservationMatrix
//                     currentLearner={{ id: submission.id, name: learner?.fullName || 'Current Learner' }}
//                     availablePeers={availablePeers}
//                     criteria={groupCriteriaList}
//                     selectedGroup={selectedGroupPeers}
//                     setSelectedGroup={setSelectedGroupPeers}
//                     matrix={groupMatrixGrades}
//                     setMatrix={setGroupMatrixGrades}
//                     groupTimeMatrix={groupTimeMatrix}
//                     setGroupTimeMatrix={setGroupTimeMatrix}
//                     groupRemarks={groupRemarks}
//                     setGroupRemarks={setGroupRemarks}
//                     isGroupSessionActive={isGroupSessionActive}
//                     setIsGroupSessionActive={setIsGroupSessionActive}
//                     onCancel={() => setShowGroupMatrix(false)}
//                     onDisband={handleDisbandGroupSession}
//                     onSaveGroup={handleSaveGroupMatrix}
//                 />,
//                 document.body
//             )}

//             <div className="ap-player-topbar no-print">
//                 <div className="ap-player-topbar__left">
//                     <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
//                     <div className="ap-player-topbar__separator" />
//                     <h1 className="ap-player-topbar__title">
//                         {assessment.title}
//                         {submission?.attemptNumber > 1 && (
//                             <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
//                                 Attempt {submission.attemptNumber}
//                             </span>
//                         )}
//                         {isAppealUpheld && (
//                             <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                 <Scale size={12} /> Appeal Granted
//                             </span>
//                         )}
//                         {isMentor && (
//                             <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontFamily: 'var(--font-heading)' }}>
//                                 MENTOR VIEW
//                             </span>
//                         )}
//                     </h1>
//                 </div>
//                 <div className="ap-player-topbar__right">
//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
//                             <FileArchive size={13} /> View Manual
//                         </button>
//                     )}

//                     {isAdminOrFacilitator && assessment?.moduleInfo?.timeLimit > 0 && (
//                         <button
//                             type="button"
//                             className="ap-topbar-print-btn"
//                             onClick={() => !disableExtraTime && setShowExtraTimeModal(true)}
//                             disabled={disableExtraTime}
//                             title={disableExtraTime ? "Extra time cannot be granted after grading or 48 hours post-attempt." : "Grant extra time"}
//                             style={{
//                                 background: disableExtraTime ? '#f1f5f9' : '#e0f2fe',
//                                 color: disableExtraTime ? '#94a3b8' : '#0369a1',
//                                 borderColor: disableExtraTime ? '#e2e8f0' : '#bae6fd',
//                                 fontWeight: 'bold',
//                                 cursor: disableExtraTime ? 'not-allowed' : 'pointer',
//                                 opacity: disableExtraTime ? 0.7 : 1
//                             }}
//                         >
//                             <Timer size={14} style={{ marginRight: '4px' }} /> <span className="ap-hide-mobile">Add Time</span>
//                         </button>
//                     )}

//                     {canPrint && (
//                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
//                             <Printer size={13} /> Print Audit
//                         </button>
//                     )}
//                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
//                         {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
//                     </span>
//                 </div>
//             </div>

//             <div className="sr-print-wrap">
//                 <div className="print-only-cover">
//                     <div className="print-page">
//                         <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
//                             {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
//                         </h1>
//                         <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
//                             LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
//                         </h2>
//                         <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
//                             <tbody>
//                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
//                             </tbody>
//                         </table>
//                         <h3>CONTACT INFORMATION:</h3>
//                         <table className="print-table" style={{ width: '100%' }}>
//                             <tbody>
//                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
//                                 <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
//                             </tbody>
//                         </table>
//                     </div>

//                     <div className="print-page">
//                         <h3>Note to the learner</h3>
//                         <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
//                         <h3>Purpose</h3>
//                         <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
//                         <h3>Topic elements to be covered include</h3>
//                         <table className="print-table no-border" style={{ width: '100%' }}>
//                             <tbody>
//                                 {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
//                                     ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
//                                         <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td></tr>
//                                     ))
//                                     : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
//                                         const secTotal = sectionTotals[sec.id]?.total || 0;
//                                         const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
//                                         return <tr key={idx}><td><strong>Section {idx + 1}: </strong>{sec.title}</td><td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>;
//                                     })
//                                 }
//                             </tbody>
//                         </table>
//                     </div>

//                     <div className="print-page">
//                         <h3>Entry Requirements</h3>
//                         <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
//                         <h3>Provider Accreditation Requirements</h3>
//                         <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
//                         <h3>Human Resource Requirements</h3>
//                         <ul>
//                             <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
//                             <li>Assessors and moderators: accredited by the relevant SETA</li>
//                         </ul>
//                         <h3>Exemptions</h3>
//                         <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
//                         <h3>Venue, Date and Time</h3>
//                         <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
//                         <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
//                     </div>

//                     {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
//                         <div className="print-page">
//                             <h3>Record of Developmental Intervention (Remediation)</h3>
//                             <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>

//                             <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
//                                 <tbody>
//                                     <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
//                                     <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
//                                     <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
//                                     <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
//                                 </tbody>
//                             </table>

//                             <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
//                                 <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
//                                     <span style={{ color: 'blue' }}>Facilitator Declaration</span>
//                                     {(submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
//                                         <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
//                                     ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
//                                     <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
//                                     <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
//                                     <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
//                                 </div>
//                                 <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
//                                     <span style={{ color: 'black' }}>Learner Acknowledgement</span>
//                                     {submission.latestCoachingLog.acknowledged ? (
//                                         <>
//                                             {(submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl) ? (
//                                                 <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={filterBlack} />
//                                             ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
//                                             <strong style={{ color: 'black' }}>{learner?.fullName || learnerProfile?.fullName}</strong>
//                                             <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
//                                             <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
//                                         </>
//                                     ) : (
//                                         <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
//                                             <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
//                                             <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="sr-print-header">
//                     <div className="sr-print-header-info">
//                         <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
//                             <div>
//                                 <p><strong>Learner Name:</strong> {learner?.fullName}</p>
//                                 <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
//                                 <p><strong>Submitted:</strong> {isSubmitted ? new Date(submission.submittedAt).toLocaleDateString() : 'Pending Submission'}</p>
//                                 <p><strong>Duration:</strong> {computedLearnerDurationText}</p>
//                             </div>
//                             <div>
//                                 <p><strong>Module:</strong> {assessment?.moduleInfo?.moduleNumber}</p>
//                                 <p><strong>Score:</strong> <span style={{ color: isWorkplaceModule ? '#64748b' : (isFacDone ? printInkColor : '#94a3b8'), fontWeight: 'bold' }}>{isWorkplaceModule ? 'N/A (Competency Based)' : (isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review')}</span></p>
//                                 <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p>
//                             </div>
//                         </div>
//                     </div>
//                 </div>

//                 <div className="sr-blocks">
//                     <RenderBlocks
//                         assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
//                         activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={true}
//                         canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
//                         isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
//                         savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
//                         handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
//                         handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
//                         handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
//                         handleSetToNow={handleSetToNow}
//                     />
//                 </div>

//                 <div className="print-page" style={{ marginTop: '20px' }}>
//                     <h3 style={{ borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>Overall Assessment Feedback</h3>
//                     {facOverallFeedback && (
//                         <div style={{ borderLeft: '4px solid blue', padding: '15px', background: '#eff6ff', marginBottom: '15px', borderRadius: '4px' }}>
//                             <h4 style={{ color: 'blue', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>{displayFacRole === 'mentor' ? 'Mentor Supervisor Comments' : `Facilitator Pre-Marking Remarks`}</h4>
//                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e3a8a', fontStyle: 'italic', lineHeight: 1.5 }}>{facOverallFeedback}</p>
//                         </div>
//                     )}
//                     {assOverallFeedback && (
//                         <div style={{ borderLeft: '4px solid red', padding: '15px', background: '#fef2f2', marginBottom: '15px', borderRadius: '4px' }}>
//                             <h4 style={{ color: 'red', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Assessor Grading Remarks</h4>
//                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#7f1d1d', fontStyle: 'italic', lineHeight: 1.5 }}>{assOverallFeedback}</p>
//                         </div>
//                     )}
//                     {modFeedback && (
//                         <div style={{ borderLeft: '4px solid green', padding: '15px', background: '#f0fdf4', marginBottom: '15px', borderRadius: '4px' }}>
//                             <h4 style={{ color: 'green', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Moderator QA Notes</h4>
//                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#14532d', fontStyle: 'italic', lineHeight: 1.5 }}>{modFeedback}</p>
//                         </div>
//                     )}

//                     {submission?.appeal?.status && (
//                         <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                             <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                 Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
//                             </h4>
//                             <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
//                             {submission.appeal.status !== 'pending' && (
//                                 <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
//                                     <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
//                                 </p>
//                             )}
//                         </div>
//                     )}
//                 </div>

//                 <div className="sr-signature-block">
//                     <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
//                         <span style={{ color: 'black' }}>Learner Declaration</span>
//                         {isSubmitted ? (
//                             <>
//                                 {(submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl) ? (
//                                     <img src={submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl} alt="Learner signature" crossOrigin="anonymous" style={filterBlack} />
//                                 ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
//                                 <strong style={{ color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</strong>
//                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
//                             </>
//                         ) : <div className="sr-sig-no-image" style={{ color: 'black' }}>Awaiting Submission</div>}
//                     </div>
//                     <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue' }}>
//                         <span style={{ color: 'blue' }}>{displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
//                         {isFacDone ? (
//                             <>
//                                 {(submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
//                                     <img src={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
//                                 ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
//                                 <strong style={{ color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</strong>
//                                 <em style={{ color: 'blue' }}>Signed: {new Date(submission.grading?.facilitatorReviewedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>{displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}</div>
//                             </>
//                         ) : <div className="sr-sig-no-image" style={{ color: 'blue' }}>Awaiting Verification</div>}
//                     </div>
//                     <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
//                         <span style={{ color: 'red' }}>Assessor Sign-off</span>
//                         {isAssDone ? (
//                             <>
//                                 {(submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl) ? (
//                                     <img src={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl} alt="Assessor Signature" crossOrigin="anonymous" style={filterRed} />
//                                 ) : <div className="sr-sig-no-image" style={{ color: 'red', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
//                                 <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
//                                 <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
//                                 <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
//                             </>
//                         ) : <div className="sr-sig-no-image" style={{ color: 'red' }}>Awaiting Assessment</div>}
//                     </div>
//                     <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
//                         <span style={{ color: 'green' }}>Internal Moderation</span>
//                         {isModDone ? (
//                             <>
//                                 {(submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl) ? (
//                                     <img src={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl} alt="Moderator Signature" crossOrigin="anonymous" style={filterGreen} />
//                                 ) : <div className="sr-sig-no-image" style={{ color: 'green', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
//                                 <strong style={{ color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
//                                 <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
//                                 <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
//                                 <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
//                             </>
//                         ) : <div className="sr-sig-no-image" style={{ color: 'green' }}>Awaiting Moderation</div>}
//                     </div>
//                 </div>
//             </div>

//             {/* SCREEN LAYOUT */}
//             <div className="sr-layout no-print">
//                 <div className="sr-content-pane">
//                     {canFacilitatorMark && groupCriteriaList.length > 0 && (
//                         <div className="no-print" style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
//                             {isGroupSessionActive && (
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', background: '#fffbeb', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #fef3c7' }}>
//                                     <Timer size={14} className="animate-pulse" /> Active Group Session Running...
//                                 </div>
//                             )}
//                             <button className="mlab-btn mlab-btn--primary" onClick={handleOpenGroupMode} disabled={isFetchingPeers || saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 {isFetchingPeers ? <Loader2 size={16} className="lfm-spin" /> : <Users size={16} />}
//                                 {isGroupSessionActive ? 'Resume Group Session' : 'Grade as Group'}
//                             </button>
//                         </div>
//                     )}

//                     {submission?.latestCoachingLog && currentAttempt > 1 && (
//                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', marginBottom: '1.5rem' }}>
//                             <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase' }}><CheckCircle size={16} /> Remediation Coaching Logged</h4>
//                             <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}><strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</p>
//                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word' }}>"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
//                         </div>
//                     )}

//                     {/* 🚀 FLEXIBLE INVIGILATION & PROCTORING INTEGRITY AUDIT CARD */}
//                     {showProctoringAuditCard && (
//                         <div style={{
//                             background: isViolation ? '#fef2f2' : violationHistoryCount > 0 ? '#fffbeb' : '#f0fdf4',
//                             border: `2px solid ${isViolation ? '#ef4444' : violationHistoryCount > 0 ? '#fde68a' : '#bbf7d0'}`,
//                             padding: '1.25rem',
//                             borderRadius: '8px',
//                             marginBottom: '1.5rem',
//                             boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
//                         }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
//                                 <div style={{ flex: 1, minWidth: '280px' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
//                                         <ShieldAlert size={20} color={isViolation ? '#dc2626' : violationHistoryCount > 0 ? '#b45309' : '#15803d'} />
//                                         <h4 style={{ margin: 0, color: isViolation ? '#991b1b' : violationHistoryCount > 0 ? '#b45309' : '#14532d', textTransform: 'uppercase', fontSize: '0.95rem', fontWeight: 'bold' }}>
//                                             {isViolation ? 'Security Violation - Terminated' : violationHistoryCount > 0 ? 'Invigilation Audit: Warnings Logged' : 'Invigilation Audit: Clean Record'}
//                                         </h4>
//                                     </div>
//                                     <p style={{ margin: 0, fontSize: '0.85rem', color: isViolation ? '#b91c1c' : violationHistoryCount > 0 ? '#78350f' : '#166534', lineHeight: 1.4 }}>
//                                         {isViolation
//                                             ? 'This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured for staff inspection.'
//                                             : violationHistoryCount > 0
//                                                 ? `AI tracking & screen monitoring were active. A total of ${violationHistoryCount} security warning(s) were captured during this attempt.`
//                                                 : 'AI face tracking and screen monitoring remained active throughout this session. Zero security anomalies were recorded.'}
//                                     </p>
//                                     {submission?.systemNote && isViolation && (
//                                         <div style={{ background: '#ffffff', border: '1px solid #fecaca', padding: '8px 12px', marginTop: '10px', borderRadius: '4px' }}>
//                                             <strong style={{ fontSize: '0.75rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</strong>
//                                             <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#7f1d1d', fontStyle: 'italic' }}>
//                                                 "{submission.systemNote}"
//                                             </p>
//                                         </div>
//                                     )}
//                                 </div>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
//                                     <button
//                                         className="mlab-btn mlab-btn--sm"
//                                         style={{
//                                             background: isViolation ? '#2563eb' : violationHistoryCount > 0 ? '#d97706' : '#0284c7',
//                                             color: 'white',
//                                             border: 'none',
//                                             padding: '8px 12px',
//                                             display: 'flex',
//                                             alignItems: 'center',
//                                             justifyContent: 'center',
//                                             gap: '6px',
//                                             fontWeight: 'bold',
//                                             fontSize: '0.8rem'
//                                         }}
//                                         onClick={() => setShowProctorEvidenceModal(true)}
//                                     >
//                                         <Video size={14} /> View Proctoring Snapshots ({violationHistoryCount})
//                                     </button>

//                                     {isViolation && (isAdmin || isFacilitator) && (
//                                         <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 12px', fontWeight: 'bold' }} onClick={handleReopenMissedAssessment} disabled={saving}>
//                                             <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse & Reopen
//                                         </button>
//                                     )}
//                                     {isViolation && canGrade && (
//                                         <button className="mlab-btn mlab-btn--sm mlab-btn--error" style={{ padding: '8px 12px', fontWeight: 'bold' }} onClick={executeZeroGrade} disabled={saving}>
//                                             Assign Zero Grade
//                                         </button>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {isMissed && !isViolation && (
//                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
//                                 <div>
//                                     <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontSize: '0.95rem' }}>
//                                         <ShieldAlert size={18} /> Assessment Missed
//                                     </h4>
//                                     <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c', lineHeight: 1.5, maxWidth: '600px' }}>
//                                         This learner failed to attend the scheduled assessment window. Please determine if this is an <strong>Excused Absence</strong> (reopen for the learner) or an <strong>Unexcused Absence</strong> (assign a zero grade).
//                                     </p>
//                                 </div>
//                                 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
//                                     {(isAdmin || isFacilitator) && (
//                                         <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none' }} onClick={handleReopenMissedAssessment} disabled={saving}>
//                                             <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse Absence & Reopen
//                                         </button>
//                                     )}
//                                     {canGrade && (
//                                         <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={executeZeroGrade} disabled={saving}>
//                                             Assign Zero Grade (Unexcused)
//                                         </button>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     <div className="sr-blocks">
//                         <RenderBlocks
//                             assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
//                             activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={false}
//                             canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
//                             isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
//                             savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
//                             handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
//                             handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
//                             handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
//                             handleSetToNow={handleSetToNow}
//                         />
//                     </div>
//                 </div>

//                 <aside className="sr-sidebar no-print">
//                     <ReviewStageCard
//                         colorTheme="blue" title={facPanelTitle} status={facPanelStatus}
//                         lockedMessage="The learner has not submitted this assessment yet. Marking and feedback are locked until they complete their attempt."
//                         awaitingTitle={isAwaitingSignoff ? 'Awaiting Learner Signature' : 'Awaiting Facilitator Review'}
//                         awaitingMessage={isAwaitingSignoff ? 'You have saved your verification. The learner must now log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.' : 'The learner has submitted this assessment. Awaiting the Facilitator to complete their pre-marking.'}
//                         showScore={!isWorkplaceModule && displayFacRole !== 'mentor'}
//                         scoreAwarded={facTotals.score} scoreMax={facTotals.max} scorePct={facTotals.pct}
//                         feedbackLabel={facRemarksLabel} feedbackPlaceholder="Add overall coaching comments..."
//                         feedbackValue={facOverallFeedback} onFeedbackChange={handleFacOverallFeedbackChange}
//                         submitLabel={facSubmitLabel} onSubmit={triggerSubmitFacilitator} isSaving={saving}
//                         signatureLabel={displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}
//                         signatureName={submission.grading?.facilitatorName || 'Facilitator'}
//                         signatureUrl={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl}
//                         signatureDate={submission.grading?.facilitatorReviewedAt ? new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString() : undefined}
//                         signatureTagline={displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}
//                         timeOverrideValue={facTimeOverride} onTimeOverrideChange={setFacTimeOverride}
//                         autoTimeSeconds={getFacTime()} autoSummedMinutes={autoSummedTaskMinutes}
//                         activeControls={
//                             <>
//                                 {canReturnToLearner && (
//                                     <button className="mlab-btn mlab-btn--ghost" style={{ width: '100%', marginTop: '10px', borderColor: '#bfdbfe', color: '#1d4ed8' }} onClick={() => setShowReturnToLearnerModal(true)} disabled={saving}>
//                                         <Undo2 size={14} style={{ marginRight: '6px' }} /> Return to Learner for Corrections
//                                     </button>
//                                 )}

//                                 {(isFacilitator || isAdmin) && ((submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0) || ['not_started', 'submitted', 'facilitator_reviewed', 'awaiting_learner_signoff'].includes(submission.status)) && (
//                                     <div className="no-print" style={{ marginTop: '10px', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
//                                         <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <ShieldAlert size={14} /> Facilitator Overrides
//                                         </p>

//                                         {!isPureKnowledge && (
//                                             <>
//                                                 {submission.status !== 'not_started' && (
//                                                     <div style={{ marginBottom: '12px', borderBottom: '1px dashed #bfdbfe', paddingBottom: '10px' }}>
//                                                         <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e40af', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Learner Task Timer Override (Mins)</label>
//                                                         <input type="number" min="1" placeholder="Enter true duration in minutes..." style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} value={learnerTimeOverride} onChange={(e) => handleLearnerTimeOverrideChange(e.target.value)} disabled={saving} />
//                                                     </div>
//                                                 )}
//                                                 {submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0 && (
//                                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
//                                                         <button onClick={() => !disableExtraTime && grantExtraTime(15, 'Facilitator +15 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#cbd5e1' : '#3b82f6', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+15 Mins</button>
//                                                         <button onClick={() => !disableExtraTime && grantExtraTime(30, 'Facilitator +30 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#94a3b8' : '#2563eb', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+30 Mins</button>
//                                                         {submission.extraTimeGranted > 0 && <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold' }}>({submission.extraTimeGranted} min active)</span>}
//                                                     </div>
//                                                 )}
//                                             </>
//                                         )}

//                                         {(submission.status === 'not_started') && (
//                                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                 <button onClick={toggleDeferredAccess} className="mlab-btn mlab-btn--sm" style={{ background: submission.overrideUnlock ? '#ef4444' : '#10b981', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                     {submission.overrideUnlock ? <><Lock size={12} /> Revoke Access</> : <><Unlock size={12} /> Grant Deferred Access</>}
//                                                 </button>
//                                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{submission.overrideUnlock ? "Learner can bypass scheduling locks." : "Bound by global schedule."}</span>
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}
//                             </>
//                         }
//                     />

//                     <ReviewStageCard
//                         colorTheme="red" title="Official Assessor Grading" status={assPanelStatus}
//                         lockedMessage="Awaiting prior steps to be completed before grading can begin."
//                         awaitingTitle="Awaiting Assessor Grading"
//                         awaitingMessage="This submission is ready and waiting for the Assessor to assign final marks."
//                         showScore={!isWorkplaceModule}
//                         scoreAwarded={assTotals.score} scoreMax={assTotals.max} scorePct={assTotals.pct}
//                         feedbackLabel="Assessor Remarks" feedbackPlaceholder="Provide holistic feedback..."
//                         feedbackValue={assOverallFeedback} onFeedbackChange={handleAssOverallFeedbackChange}
//                         submitLabel="Apply Signature & Finalise" onSubmit={triggerSubmitGrade} isSaving={saving}
//                         signatureLabel="Assessor Signature" signatureName={submission.grading?.assessorName || 'Assessor'}
//                         signatureUrl={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl}
//                         signatureDate={submission.grading?.gradedAt ? new Date(submission.grading.gradedAt).toLocaleDateString() : undefined}
//                         signatureMeta={`Reg: ${assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}`}
//                         signatureTagline="Digital Signature Confirmed"
//                         timeOverrideValue={assTimeOverride} onTimeOverrideChange={setAssTimeOverride} autoTimeSeconds={getAssTime()}
//                         activeControls={
//                             canGrade && !isMissed && !isViolation && (
//                                 <div className="sr-competency-section">
//                                     <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
//                                     <label className="sr-sidebar-label" style={{ color: 'red', marginTop: '1rem' }}>Final Competency</label>
//                                     <div className="sr-comp-toggles">
//                                         <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
//                                         <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent</button>
//                                     </div>
//                                 </div>
//                             )
//                         }
//                     />

//                     <ReviewStageCard
//                         colorTheme="green" title="Internal Moderation (QA)" status={modPanelStatus}
//                         lockedMessage="Awaiting Assessor to complete official grading before moderation can occur."
//                         awaitingTitle="Awaiting Moderation"
//                         awaitingMessage="This submission is ready and waiting for QA review by the Moderator."
//                         showScore={true} scoreAwarded={modTotals.score} scoreMax={modTotals.max} scorePct={modTotals.pct}
//                         feedbackLabel="Moderator Feedback" feedbackPlaceholder="Moderation feedback..."
//                         feedbackValue={modFeedback} onFeedbackChange={handleModFeedbackChange}
//                         submitLabel="Finalise QA & Endorse" onSubmit={triggerSubmitModeration} isSaving={saving}
//                         signatureLabel="Moderator QA" signatureName={submission.moderation?.moderatorName || moderatorProfile?.fullName || 'Moderator'}
//                         signatureUrl={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl}
//                         signatureDate={submission.moderation?.moderatedAt ? new Date(submission.moderation.moderatedAt).toLocaleDateString() : undefined}
//                         signatureMeta={`Outcome: ${submission.moderation?.outcome || modOutcome}`} signatureTagline="QA Sign-off Confirmed"
//                         timeOverrideValue={modTimeOverride} onTimeOverrideChange={setModTimeOverride} autoTimeSeconds={getModTime()}
//                         activeControls={
//                             (canModerate || isModDone) && (
//                                 <>
//                                     <div className="sr-competency-section">
//                                         <label className="sr-sidebar-label" style={{ color: 'green' }}>Assessor's Declared Competency</label>
//                                         <div className="sr-comp-toggles">
//                                             <button className={`sr-comp-btn ${submission.competency === 'C' ? 'active-c-green' : ''}`} disabled style={{ opacity: submission.competency === 'C' ? 1 : 0.5, cursor: 'default' }}><Award size={16} /> Competent (C)</button>
//                                             <button className={`sr-comp-btn ${submission.competency === 'NYC' ? 'active-nyc-green' : ''}`} disabled style={{ opacity: submission.competency === 'NYC' ? 1 : 0.5, cursor: 'default' }}><AlertCircle size={16} /> Not Yet Competent</button>
//                                         </div>
//                                     </div>
//                                     {canModerate && (
//                                         <div className="sr-competency-section" style={{ marginTop: '1.5rem' }}>
//                                             <label className="sr-sidebar-label" style={{ color: 'green' }}>Your Moderation Decision</label>
//                                             <div className="sr-comp-toggles">
//                                                 <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')}><ShieldCheck size={16} /> Endorse Grade</button>
//                                                 <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')}><AlertCircle size={16} /> Return to Assessor</button>
//                                             </div>
//                                         </div>
//                                     )}
//                                 </>
//                             )
//                         }
//                     />
//                     <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />
//                 </aside>
//             </div>
//         </div>
//     );
// };

// export default SubmissionReview;


// // // src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx

// // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { doc, getDoc, updateDoc, collection, setDoc, deleteField, getDocs, query, where, onSnapshot, writeBatch, arrayUnion, getFirestore } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import {
// //     ArrowLeft, CheckCircle, AlertCircle, Clock, Award, ShieldCheck, Printer, Info, Lock, Loader2, Scale, Undo2, ShieldAlert, Unlock, Users, FileArchive, Timer, Video, Save, X, Check, Edit3, Globe, Github, Figma, Smartphone, ExternalLink, Link as LinkIcon, Layers, FileText, Mic, UploadCloud, Code, CalendarRange, Play, Square, Award as AwardIcon, BarChart, Sigma, ChevronDown, ChevronUp
// // } from 'lucide-react';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import './SubmissionReview.css';
// // import { PastAttemptsArchive } from '../../../components/dashboard/PastAttemptsArchive/PastAttemptsArchive';
// // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // import { createPortal } from 'react-dom';
// // import { RemediationModal, ResolveAppealModal, ReturnToLearnerModal } from './SubmissionReview/SubmissionReviewModals';
// // import { type CriterionResult, type GradeData } from './SubmissionReview/SubmissionReviewBlocks';
// // import moment from 'moment';
// // import { GroupObservationMatrix } from './SubmissionReview/GroupObservationMatrix';
// // import { HistoryModal, type ProctorSession } from '../../../components/views/InvigilatorDashboard/InvigilatorDashboard';
// // import { ExcuseReopenModal } from './SubmissionReview/ExcuseReopenModal';

// // // import { LogbookHoursTally } from './SubmissionReviewHelpers';
// // // import { FilePreview } from './SubmissionReviewPreviews';
// // // import { UrlPreview } from '../../../../components/common/UrlPreview';
// // // import { CodeSandboxPlayer } from '../../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// // import { getStorage, ref as fbStorageRef, getDownloadURL } from 'firebase/storage';

// // import { CartesianPlane } from '@zakq/axisjs';
// // import "mathlive";
// // import katex from "katex";
// // import "katex/dist/katex.min.css";
// // import { FilePreview, UrlPreview } from './SubmissionReview/SubmissionReviewPreviews';
// // import { LogbookHoursTally } from './SubmissionReview/SubmissionReviewHelpers';
// // import CodeSandboxPlayer from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// // (window as any).katex = katex;

// // const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];

// // // ─── HELPER FOR EXTERNAL RESOURCE LINKS ─────────────────────────────────────
// // const renderResourceLinks = (links: any[]) => {
// //     if (!links || links.length === 0) return null;

// //     const getCategoryIcon = (category: string) => {
// //         switch (category) {
// //             case 'live': return <Globe size={15} color="#10b981" />;
// //             case 'github': return <Github size={15} color="#6366f1" />;
// //             case 'apk': return <Smartphone size={15} color="#f59e0b" />;
// //             case 'figma': return <Figma size={15} color="#ec4899" />;
// //             case 'doc': return <FileText size={15} color="#06b6d4" />;
// //             default: return <LinkIcon size={15} color="#64748b" />;
// //         }
// //     };

// //     return (
// //         <div style={{ marginTop: '1rem', marginBottom: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1rem' }}>
// //             <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                 External Resources & Links
// //             </div>
// //             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                 {links.map((link: any, idx: number) => (
// //                     <div key={link.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', flexWrap: 'wrap' }}>
// //                         {getCategoryIcon(link.category)}
// //                         <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>{link.label}</span>
// //                         <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// //                             {link.url} <ExternalLink size={12} />
// //                         </a>
// //                     </div>
// //                 ))}
// //             </div>
// //         </div>
// //     );
// // };

// // // 🚀 HELPER FOR FULLSCREEN PORTAL MOUNTING
// // const getPortalTarget = (): HTMLElement => {
// //     const proctorRoot = document.getElementById('proctor-portal-root');
// //     if (proctorRoot) return proctorRoot;
// //     if (document.fullscreenElement) return document.fullscreenElement as HTMLElement;
// //     return document.body;
// // };

// // // ─── PROCTOR EVIDENCE INSPECTOR WRAPPER ─────────────────────────────────────
// // const SubmissionProctorEvidenceModal = ({ submission, onClose }: { submission: any; onClose: () => void }) => {
// //     const [session, setSession] = useState<ProctorSession | null>(null);

// //     useEffect(() => {
// //         const fetchSession = async () => {
// //             try {
// //                 const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
// //                 const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
// //                 const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

// //                 const sessionSnap = await getDoc(doc(db, 'live_proctor_sessions', sessionDocId));
// //                 if (sessionSnap.exists()) {
// //                     setSession({ id: sessionSnap.id, ...sessionSnap.data() } as ProctorSession);
// //                 } else {
// //                     setSession({
// //                         id: sessionDocId,
// //                         learnerId: targetLearnerUid,
// //                         learnerName: submission?.learnerDeclaration?.learnerName || 'Learner',
// //                         status: submission?.status === 'violation' ? 'violation' : 'offline',
// //                         latestWarning: submission?.systemNote || null,
// //                         lastHeartbeat: null,
// //                         violationHistory: submission?.violationHistory || []
// //                     });
// //                 }
// //             } catch (e) {
// //                 console.error("Failed to load proctoring session:", e);
// //             }
// //         };
// //         fetchSession();
// //     }, [submission]);

// //     if (!session) return null;

// //     return <HistoryModal session={session} onClose={onClose} />;
// // };

// // // ─── REVIEW STAGE CARD COMPONENT ─────────────────────────────────────────────
// // const ReviewStageCard = ({ colorTheme, title, status, lockedMessage, awaitingTitle, awaitingMessage, showScore, scoreAwarded, scoreMax, scorePct, activeControls, feedbackLabel, feedbackValue, onFeedbackChange, feedbackPlaceholder, signatureLabel, signatureUrl, signatureName, signatureDate, signatureMeta, signatureTagline, onSubmit, submitLabel, isSaving, timeOverrideValue, onTimeOverrideChange, autoTimeSeconds, autoSummedMinutes }: any) => {
// //     const colorHex = colorTheme === 'blue' ? 'blue' : colorTheme === 'red' ? 'red' : '#22c55e';
// //     const colorHexDark = colorTheme === 'blue' ? '#1e3a8a' : colorTheme === 'red' ? '#7f1d1d' : '#14532d';
// //     const bgLight = colorTheme === 'blue' ? '#eff6ff' : colorTheme === 'red' ? '#fef2f2' : '#f0fdf4';
// //     const themeVar = colorTheme === 'blue' ? 'blue' : `var(--mlab-${colorTheme})`;

// //     return (
// //         <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid ${themeVar}` }}>
// //             <h3 className="sr-summary-title" style={{ color: themeVar }}>{title}</h3>
// //             {status === 'locked' && (
// //                 <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
// //                     <Lock size={24} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
// //                     <strong style={{ color: '#334155', display: 'block', fontSize: '0.9rem' }}>Locked</strong>
// //                     <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{lockedMessage}</p>
// //                 </div>
// //             )}
// //             {status === 'awaiting' && (
// //                 <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
// //                     <Clock size={24} color={colorHex} style={{ margin: '0 auto 10px' }} />
// //                     <strong style={{ color: colorHexDark, display: 'block', fontSize: '0.9rem' }}>{awaitingTitle}</strong>
// //                     <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{awaitingMessage}</p>
// //                 </div>
// //             )}
// //             {(status === 'active' || status === 'done') && (
// //                 <>
// //                     {showScore && (
// //                         <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
// //                             <div className="sr-score-circle" style={{ borderColor: themeVar }}>
// //                                 <span className="sr-score-val" style={{ color: themeVar }}>{scoreAwarded}</span>
// //                                 <span className="sr-score-max" style={{ color: themeVar }}>/ {scoreMax}</span>
// //                             </div>
// //                             <div className="sr-score-percent" style={{ color: themeVar }}>{scorePct}%</div>
// //                         </div>
// //                     )}
// //                     {activeControls}
// //                     <div className="sr-overall-feedback" style={{ marginTop: showScore || activeControls ? '1.5rem' : '1rem' }}>
// //                         <label className="sr-sidebar-label" style={{ color: themeVar }}>{feedbackLabel}</label>
// //                         {status === 'active' ? (
// //                             <textarea className="sr-textarea" rows={3} style={{ color: themeVar, fontStyle: 'italic', borderColor: themeVar, background: 'whitesmoke', fontWeight: 500 }} placeholder={feedbackPlaceholder} value={feedbackValue} onChange={e => onFeedbackChange(e.target.value)} />
// //                         ) : (
// //                             <div style={{ background: bgLight, padding: '10px', borderRadius: '6px', color: colorHexDark, fontStyle: 'italic', fontSize: '0.85rem', borderLeft: `3px solid ${colorHex}`, whiteSpace: 'pre-wrap' }}>
// //                                 {feedbackValue || "No overall remarks provided."}
// //                             </div>
// //                         )}
// //                     </div>
// //                     {status === 'active' && (
// //                         <div style={{ marginTop: '1rem', background: bgLight, padding: '12px', borderRadius: '6px', border: `1px solid ${colorHex}40` }}>
// //                             <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: colorHexDark, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
// //                                 <Clock size={14} /> Logged Grading / Review Time (Minutes)
// //                             </label>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
// //                                 <input type="number" min="1" style={{ width: '90px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: autoSummedMinutes > 0 && timeOverrideValue === '' ? '#e0f2fe' : 'white' }} value={timeOverrideValue} onChange={(e) => onTimeOverrideChange(e.target.value)} placeholder={autoSummedMinutes > 0 ? autoSummedMinutes.toString() : Math.max(1, Math.floor(autoTimeSeconds / 60)).toString()} />
// //                             </div>
// //                         </div>
// //                     )}
// //                     {status === 'active' ? (
// //                         <div className="sr-action-area" style={{ marginTop: '1rem' }}>
// //                             <button className="sr-submit-btn" style={{ background: themeVar }} onClick={onSubmit} disabled={isSaving}>{submitLabel}</button>
// //                         </div>
// //                     ) : (
// //                         <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// //                             <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: themeVar, textTransform: 'uppercase' }}>{signatureLabel}</p>
// //                             {signatureUrl ? <img src={signatureUrl} alt="Signature" crossOrigin="anonymous" style={{ height: '40px', objectFit: 'contain', filter: `brightness(0) saturate(100%) ${colorTheme === 'blue' ? 'invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)' : colorTheme === 'red' ? 'invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)' : 'invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'}`, marginBottom: '8px' }} /> : <div style={{ height: '40px', color: themeVar, display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
// //                             <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: themeVar }}>{signatureName}</p>
// //                             {signatureMeta && <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: themeVar }}>{signatureMeta}</p>}
// //                             {signatureDate && <p style={{ margin: 0, fontSize: '0.75rem', color: themeVar }}><Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{signatureDate}</p>}
// //                             {signatureTagline && <div className="sr-sig-line" style={{ borderTop: `1px dashed ${themeVar}`, paddingTop: '6px', marginTop: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: themeVar }}>{signatureTagline}</div>}
// //                         </div>
// //                     )}
// //                 </>
// //             )}
// //         </div>
// //     );
// // };

// // // 🚀 PREDEFINED AUDIT REASONS FOR TIMED ASSESSMENTS
// // const PRESET_EXTRA_TIME_REASONS = [
// //     "Network / Internet Disconnection",
// //     "Power Outage / Loadshedding",
// //     "Browser / IDE Technical Crash",
// //     "Hardware / Device Failure",
// //     "Invigilator / Facilitator Discretion",
// //     "Medical / Personal Emergency",
// //     "Accommodation for Learning Disability",
// //     "Other (Details specified below)"
// // ];

// // // 🚀 EXTRA TIME MODAL WITH DROPDOWN + SUPPORTING EVIDENCE
// // const ExtraTimeModal: React.FC<{
// //     onClose: () => void;
// //     onSubmit: (minutes: number, reason: string) => void
// // }> = ({ onClose, onSubmit }) => {
// //     const [minutes, setMinutes] = useState<number>(15);
// //     const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_EXTRA_TIME_REASONS[0]);
// //     const [details, setDetails] = useState('');

// //     const handleSubmit = (e: React.FormEvent) => {
// //         e.preventDefault();

// //         const combinedReason = details.trim()
// //             ? `${selectedPreset} — ${details.trim()}`
// //             : selectedPreset;

// //         if (minutes > 0 && combinedReason) {
// //             onSubmit(minutes, combinedReason);
// //         }
// //     };

// //     return createPortal(
// //         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999999, pointerEvents: 'auto' }}>
// //             <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
// //                 <div className="lfm-header">
// //                     <h2 className="lfm-header__title">
// //                         <Timer size={16} /> Grant Extra Time
// //                     </h2>
// //                     <button className="lfm-close-btn" type="button" onClick={onClose}>
// //                         <X size={20} />
// //                     </button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
// //                     <div className="lfm-body">
// //                         <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
// //                             <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
// //                                 Add additional minutes to the learner's timer. If the assessment was locked due to time expiring or connection loss, <strong>this will automatically unlock it</strong> so they can continue.
// //                             </p>
// //                         </div>

// //                         <div className="lfm-fg">
// //                             <label>Minutes to Add *</label>
// //                             <input
// //                                 className="lfm-input"
// //                                 type="number"
// //                                 min="1"
// //                                 value={minutes}
// //                                 onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
// //                                 required
// //                             />
// //                         </div>

// //                         <div className="lfm-fg">
// //                             <label>Standard Audit Category *</label>
// //                             <select
// //                                 className="lfm-input lfm-select"
// //                                 value={selectedPreset}
// //                                 onChange={(e) => setSelectedPreset(e.target.value)}
// //                                 required
// //                             >
// //                                 {PRESET_EXTRA_TIME_REASONS.map((reason, idx) => (
// //                                     <option key={idx} value={reason}>
// //                                         {reason}
// //                                     </option>
// //                                 ))}
// //                             </select>
// //                         </div>

// //                         <div className="lfm-fg">
// //                             <label>Additional Notes / Supporting Evidence</label>
// //                             <textarea
// //                                 className="lfm-input"
// //                                 value={details}
// //                                 onChange={(e) => setDetails(e.target.value)}
// //                                 rows={3}
// //                                 placeholder="Optional details (e.g., ticket number, invigilator notes, specific error message...)"
// //                                 style={{ resize: 'vertical' }}
// //                             />
// //                         </div>
// //                     </div>

// //                     <div className="lfm-footer">
// //                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
// //                             Cancel
// //                         </button>
// //                         <button
// //                             type="submit"
// //                             className="lfm-btn lfm-btn--primary"
// //                             disabled={minutes < 1}
// //                         >
// //                             <Save size={13} /> Grant Time
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         getPortalTarget()
// //     );
// // };

// // const getAnswerString = (ans: any): string => {
// //     if (ans === null || ans === undefined) return '';
// //     if (typeof ans === 'string') return ans;
// //     if (typeof ans === 'number' || typeof ans === 'boolean') return String(ans);
// //     if (typeof ans === 'object') {
// //         return ans.text || ans.equation || ans.value || ans.content || ans.html || ans.url || ans.uploadUrl || ans.code || '';
// //     }
// //     return '';
// // };

// // const cleanRichText = (html?: any): string => {
// //     const str = getAnswerString(html);
// //     if (!str) return '';
// //     return str.replace(/&nbsp;/g, ' ');
// // };

// // const RichMathText: React.FC<{ html?: any; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => {
// //     const containerRef = useRef<HTMLDivElement>(null);
// //     const safeHtml = cleanRichText(html);

// //     useEffect(() => {
// //         if (!containerRef.current || !safeHtml) return;

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
// //     }, [safeHtml]);

// //     return (
// //         <div
// //             ref={containerRef}
// //             className={`quill-read-only-content ${className || ''}`}
// //             style={{ wordBreak: 'normal', overflowWrap: 'break-word', lineHeight: 1.6, ...style }}
// //             dangerouslySetInnerHTML={{ __html: safeHtml }}
// //         />
// //     );
// // };

// // const renderBlockImage = (block: any) => {
// //     if (!block.imageUrl) return null;
// //     return (
// //         <div className="no-print" style={{ margin: '1rem 0', textAlign: 'center' }}>
// //             <img
// //                 src={block.imageUrl}
// //                 alt={block.imageCaption || "Assessment attachment"}
// //                 style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
// //             />
// //             {block.imageCaption && (
// //                 <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
// //                     {block.imageCaption}
// //                 </p>
// //             )}
// //         </div>
// //     );
// // };

// // const renderBlockFile = (block: any) => {
// //     if (!block.fileUrl) return null;
// //     return (
// //         <div className="no-print" style={{ margin: '1rem 0', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
// //             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
// //                 <FileText size={20} color="#166534" />
// //                 <div style={{ overflow: 'hidden' }}>
// //                     <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#14532d', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
// //                         {block.fileName || "Download Starter File"}
// //                     </span>
// //                     <span style={{ fontSize: '0.75rem', color: '#15803d' }}>Resource / Template provided for this task</span>
// //                 </div>
// //             </div>
// //             <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0, fontWeight: 'bold' }}>
// //                 <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
// //             </a>
// //         </div>
// //     );
// // };

// // const ReviewAxisGraph: React.FC<{ block: any; learnerAns: any }> = ({ block, learnerAns }) => {
// //     const containerRef = useRef<HTMLDivElement>(null);
// //     const canvasRef = useRef<HTMLCanvasElement>(null);
// //     const planeRef = useRef<CartesianPlane | null>(null);

// //     useEffect(() => {
// //         if (!canvasRef.current) return;

// //         const plane = new CartesianPlane(canvasRef.current, {
// //             stepSequences: [1, 2, 5],
// //             autoFit: false,
// //         });
// //         planeRef.current = plane;

// //         const ro = new ResizeObserver(() => {
// //             plane.resize();
// //         });
// //         if (containerRef.current) {
// //             ro.observe(containerRef.current);
// //         }

// //         return () => {
// //             ro.disconnect();
// //             plane.destroy();
// //             planeRef.current = null;
// //         };
// //     }, []);

// //     useEffect(() => {
// //         const plane = planeRef.current;
// //         if (!plane) return;

// //         plane.clear();
// //         const allCoords: { x: number; y: number }[] = [];

// //         const pointsList = learnerAns?.points || [];
// //         const shapesList = learnerAns?.shapes || [];

// //         pointsList.forEach((p: any, i: number) => {
// //             const px = parseFloat(String(p.x));
// //             const py = parseFloat(String(p.y));
// //             if (!isNaN(px) && !isNaN(py)) {
// //                 allCoords.push({ x: px, y: py });
// //                 const color = POINT_COLORS[i % POINT_COLORS.length];
// //                 plane.addPoint(px, py, color, `(${px}, ${py})`, true, 5);
// //             }
// //         });

// //         shapesList.forEach((shape: any) => {
// //             const shapeCoords: { x: number; y: number }[] = [];
// //             shape.points?.forEach((p: any) => {
// //                 const px = parseFloat(String(p.x));
// //                 const py = parseFloat(String(p.y));
// //                 if (!isNaN(px) && !isNaN(py)) {
// //                     shapeCoords.push({ x: px, y: py });
// //                     allCoords.push({ x: px, y: py });
// //                 }
// //             });

// //             if (shapeCoords.length > 0) {
// //                 plane.addPolygon(shapeCoords, `${shape.color}1f`, shape.color, 2);
// //                 shapeCoords.forEach((coord) => {
// //                     plane.addPoint(coord.x, coord.y, shape.color, `(${coord.x}, ${coord.y})`, false, 5);
// //                 });
// //             }
// //         });

// //         if (allCoords.length > 0) {
// //             setTimeout(() => {
// //                 planeRef.current?.animateToFit(allCoords);
// //             }, 100);
// //         } else {
// //             setTimeout(() => {
// //                 planeRef.current?.animateToFit([{ x: -10, y: -10 }, { x: 10, y: 10 }], 0);
// //             }, 50);
// //         }
// //     }, [learnerAns]);

// //     return (
// //         <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '420px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
// //             <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
// //         </div>
// //     );
// // };

// // const ReviewCodeSandbox: React.FC<{ block: any, learnerAns: any, submissionId: string }> = ({ block, learnerAns, submissionId }) => {
// //     const [snapshot, setSnapshot] = useState<any>(null);
// //     const [isLoading, setIsLoading] = useState<boolean>(true);
// //     const [isBooted, setIsBooted] = useState<boolean>(false);

// //     const codePayload = useMemo(() => {
// //         if (!learnerAns) return null;
// //         if (typeof learnerAns === 'object' && learnerAns.codeData) return learnerAns.codeData;
// //         return learnerAns;
// //     }, [learnerAns]);

// //     const storagePath = codePayload?.storagePath;
// //     const inlineSnapshot = codePayload?.snapshot;
// //     const lastSavedAt = codePayload?.lastSavedAt;

// //     useEffect(() => {
// //         if (!isBooted) return;

// //         let isMounted = true;
// //         setIsLoading(true);

// //         const loadLearnerCode = async () => {
// //             if (storagePath) {
// //                 try {
// //                     const storage = getStorage();
// //                     const jsonRef = fbStorageRef(storage, storagePath);
// //                     const downloadUrl = await getDownloadURL(jsonRef);
// //                     const res = await fetch(downloadUrl);
// //                     if (res.ok) {
// //                         const files = await res.json();
// //                         if (isMounted) {
// //                             setSnapshot(files);
// //                         }
// //                     }
// //                 } catch (err) {
// //                     console.error(`Failed to download Storage snapshot for block [${block.id}]:`, err);
// //                 } finally {
// //                     if (isMounted) setIsLoading(false);
// //                 }
// //             } else if (inlineSnapshot) {
// //                 if (isMounted) {
// //                     const parsed = typeof inlineSnapshot === 'string' ? JSON.parse(inlineSnapshot) : inlineSnapshot;
// //                     setSnapshot(parsed);
// //                     setIsLoading(false);
// //                 }
// //             } else {
// //                 if (isMounted) {
// //                     setSnapshot(null);
// //                     setIsLoading(false);
// //                 }
// //             }
// //         };

// //         loadLearnerCode();

// //         return () => {
// //             isMounted = false;
// //         };
// //     }, [block.id, storagePath, inlineSnapshot, lastSavedAt, isBooted]);

// //     if (!isBooted) {
// //         return (
// //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', gap: '10px' }}>
// //                 <Code size={32} color="#94a3b8" />
// //                 <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: '#334155' }}>Facilitator Code Preview is Paused</p>
// //                 <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', textAlign: 'center', maxWidth: '400px' }}>This button boots the IDE on <strong>YOUR</strong> screen to inspect learner code. Use the Network Control switch above to unlock the Learner's screen in real-time.</p>
// //                 <button
// //                     onClick={() => setIsBooted(true)}
// //                     style={{ background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}
// //                 >
// //                     <Play size={14} /> Boot Facilitator Preview (Local)
// //                 </button>
// //             </div>
// //         );
// //     }

// //     if (isLoading) {
// //         return (
// //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', background: '#1e293b', borderRadius: '8px', color: '#94a3b8', gap: '10px' }}>
// //                 <Loader2 size={24} className="animate-spin" />
// //                 <p style={{ margin: 0, fontSize: '0.85rem' }}>Retrieving learner's code snapshot from cloud storage...</p>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div style={{ height: '600px', width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
// //             <CodeSandboxPlayer
// //                 block={block}
// //                 learnerAns={{ ...(codePayload || {}), snapshot }}
// //                 readOnly={true}
// //             />
// //         </div>
// //     );
// // };

// // export const RenderBlocks: React.FC<any> = (props) => {
// //     const {
// //         assessment, submission, facBreakdown, assBreakdown, modBreakdown,
// //         activeTabs, setActiveTabs, sectionTotals,
// //         isPrintMode, canFacilitatorMark, canGrade, canModerate,
// //         isFacDone, isAssDone, isModDone, isMentor, isWorkplaceModule,
// //         savedFacRole, facReadOnlyLabel,
// //         handleVisualMark, handleScoreChange, handleFeedbackChange,
// //         handleCriterionChange, handleActivityStatusChange, handleActivityCommentChange,
// //         handleGlobalChecklistChange, handleSetToNow
// //     } = props;

// //     const [expandedGraphMemos, setExpandedGraphMemos] = useState<Record<string, boolean>>({});
// //     const [togglingIDE, setTogglingIDE] = useState<string | null>(null);

// //     const toggleGraphMemo = (blockId: string) => {
// //         setExpandedGraphMemos(prev => ({ ...prev, [blockId]: !prev[blockId] }));
// //     };

// //     const handleNetworkIDEToggle = async (blockId: string, currentState: boolean) => {
// //         if (!submission?.id) return;
// //         setTogglingIDE(blockId);
// //         try {
// //             const dbInstance = getFirestore();
// //             const subRef = doc(dbInstance, 'learner_submissions', submission.id);
// //             const nextState = !currentState;

// //             await updateDoc(subRef, {
// //                 [`ideUnlocks.${blockId}`]: nextState,
// //                 lastStaffEditAt: new Date().toISOString()
// //             });
// //         } catch (err: any) {
// //             try {
// //                 const dbInstance = getFirestore();
// //                 const subRef = doc(dbInstance, 'learner_submissions', submission.id);
// //                 await setDoc(subRef, {
// //                     ideUnlocks: { [blockId]: !currentState },
// //                     lastStaffEditAt: new Date().toISOString()
// //                 }, { merge: true });
// //             } catch (e) {
// //                 console.error("Failed to toggle IDE network access:", e);
// //             }
// //         } finally {
// //             setTogglingIDE(null);
// //         }
// //     };

// //     const renderNetworkIDEToggleUI = (block: any) => {
// //         const hasIDE = block.type === 'code_sandbox' || (['task', 'checklist', 'qcto_workplace'].includes(block.type) && block.allowCode !== false);
// //         if (!hasIDE || isPrintMode) return null;

// //         const isUnlocked = submission?.ideUnlocks?.[block.id] === true;
// //         const isProcessing = togglingIDE === block.id;

// //         return (
// //             <div className="no-print" style={{ marginBottom: '1rem', background: isUnlocked ? '#eff6ff' : '#f8fafc', border: isUnlocked ? '1px solid #bfdbfe' : '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                     <div style={{ background: isUnlocked ? '#dbeafe' : '#e2e8f0', padding: '8px', borderRadius: '8px' }}>
// //                         <Code size={18} color={isUnlocked ? '#2563eb' : '#64748b'} />
// //                     </div>
// //                     <div>
// //                         <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isUnlocked ? '#1e3a8a' : '#334155' }}>Network IDE Access (Remote Control)</div>
// //                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Remotely unlock the Live IDE on the learner's screen in real-time.</div>
// //                     </div>
// //                 </div>
// //                 <button
// //                     type="button"
// //                     disabled={isProcessing}
// //                     onClick={() => handleNetworkIDEToggle(block.id, isUnlocked)}
// //                     style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isUnlocked ? '#2563eb' : 'white', color: isUnlocked ? 'white' : '#475569', padding: '6px 12px', borderRadius: '20px', border: isUnlocked ? '1px solid #2563eb' : '1px solid #cbd5e1', cursor: isProcessing ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '0.8rem', transition: 'all 0.2s ease' }}
// //                 >
// //                     {isProcessing ? <Loader2 size={14} className="animate-spin" /> : (isUnlocked ? <CheckCircle size={14} /> : <Lock size={14} />)}
// //                     {isUnlocked ? 'Unlocked for Learner' : 'Unlock for Learner'}
// //                 </button>
// //             </div>
// //         );
// //     };

// //     let qNum = 0;

// //     if (!assessment?.blocks || !Array.isArray(assessment.blocks)) return null;

// //     return (
// //         <>
// //             {assessment.blocks.map((block: any) => {
// //                 const maxM = block.marks || 0;
// //                 const fData = facBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
// //                 const aData = assBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };
// //                 const mData = modBreakdown[block.id] || { score: 0, feedback: '', isCorrect: null, criteriaResults: [], activityResults: [] };

// //                 let activeInkColor = 'blue';
// //                 let activeData = fData;
// //                 let isActiveRole = false;

// //                 if (canFacilitatorMark) { activeInkColor = 'blue'; activeData = fData; isActiveRole = true; }
// //                 else if (canGrade) { activeInkColor = 'red'; activeData = aData; isActiveRole = true; }
// //                 else if (canModerate) { activeInkColor = 'green'; activeData = mData; isActiveRole = true; }
// //                 else {
// //                     if (isModDone) { activeInkColor = 'green'; activeData = mData; }
// //                     else if (isAssDone) { activeInkColor = 'red'; activeData = aData; }
// //                     else { activeInkColor = 'blue'; activeData = fData; }
// //                 }

// //                 // Only show ReadOnly layers for stages that are completed or graded, and not editable by the current role
// //                 const renderFacReadOnly = (isFacDone || fData?.feedback || fData?.score > 0) && (!canFacilitatorMark || isPrintMode);
// //                 const renderAssReadOnly = (isAssDone || aData?.feedback || aData?.score > 0) && (!canGrade || isPrintMode);
// //                 const renderModReadOnly = (isModDone || mData?.feedback) && (!canModerate || isPrintMode);

// //                 const mentorActiveOnScorableBlock = isMentor && canFacilitatorMark && ['mcq', 'text', 'task', 'code_sandbox', 'mathpad', 'graph'].includes(block.type);

// //                 let decData = activeData;
// //                 let isDeclarationInteractive = isActiveRole;
// //                 if (canModerate) {
// //                     decData = isWorkplaceModule ? fData : aData;
// //                     isDeclarationInteractive = false;
// //                 } else if (canGrade && isWorkplaceModule) {
// //                     decData = fData;
// //                     isDeclarationInteractive = false;
// //                 }

// //                 const renderReadOnlyLayers = () => (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: (!isPrintMode && isActiveRole) ? '1rem' : '0' }}>
// //                         {renderFacReadOnly && (
// //                             <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
// //                                 <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                     <Info size={13} /> {facReadOnlyLabel}
// //                                 </div>
// //                                 {!isWorkplaceModule && savedFacRole !== 'mentor' && (
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
// //                                         <label style={{ color: '#0369a1', fontWeight: 'bold', fontSize: '0.85rem' }}>Facilitator Score:</label>
// //                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #7dd3fc`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#e0f2fe', color: '#0369a1', cursor: 'not-allowed' }}>
// //                                             {fData.score ?? 0}
// //                                         </span>
// //                                         <span style={{ color: '#0369a1', fontWeight: 'bold' }}>/ {maxM}</span>
// //                                     </div>
// //                                 )}
// //                                 <div style={{ color: '#0369a1', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
// //                                     {fData.feedback || <em style={{ opacity: 0.7 }}>No specific {savedFacRole === 'mentor' ? 'supervisor comments' : 'coaching'} provided.</em>}
// //                                 </div>
// //                             </div>
// //                         )}
// //                         {renderAssReadOnly && (
// //                             <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '4px', border: '1px solid #fecaca' }}>
// //                                 <div style={{ color: '#b91c1c', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                     <AwardIcon size={13} /> Assessor Grade
// //                                 </div>
// //                                 {!isWorkplaceModule && (
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
// //                                         <label style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '0.85rem' }}>Assessor Score:</label>
// //                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #fca5a5`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#fee2e2', color: '#991b1b', cursor: 'not-allowed' }}>
// //                                             {aData.score ?? 0}
// //                                         </span>
// //                                         <span style={{ color: '#991b1b', fontWeight: 'bold' }}>/ {maxM}</span>
// //                                     </div>
// //                                 )}
// //                                 <div style={{ color: '#991b1b', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
// //                                     {aData.feedback || <em style={{ opacity: 0.7 }}>No specific feedback provided.</em>}
// //                                 </div>
// //                             </div>
// //                         )}
// //                         {renderModReadOnly && (
// //                             <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
// //                                 <div style={{ color: '#15803d', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                     <ShieldCheck size={13} /> Moderator QA
// //                                 </div>
// //                                 {!isWorkplaceModule && (
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
// //                                         <label style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem' }}>Moderated Score:</label>
// //                                         <span style={{ display: 'inline-block', minWidth: '40px', padding: '2px 8px', border: `1px solid #86efac`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: '#dcfce7', color: '#16a34a', cursor: 'not-allowed' }}>
// //                                             {mData.score ?? 0}
// //                                         </span>
// //                                         <span style={{ color: '#16a34a', fontWeight: 'bold' }}>/ {maxM}</span>
// //                                     </div>
// //                                 )}
// //                                 <div style={{ color: '#16a34a', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
// //                                     {mData.feedback || <em style={{ opacity: 0.7 }}>No QA feedback provided.</em>}
// //                                 </div>
// //                             </div>
// //                         )}
// //                     </div>
// //                 );

// //                 const renderActiveGradeControls = (blockId: string) => {
// //                     if (canModerate && isWorkplaceModule) {
// //                         return (
// //                             <div>
// //                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#15803d', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
// //                                         <ShieldCheck size={14} /> Moderator QA Notes
// //                                     </div>
// //                                     <textarea
// //                                         className="sr-feedback-input"
// //                                         rows={2}
// //                                         style={{ width: '100%', color: 'green', fontStyle: 'italic', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '4px', resize: 'vertical', background: 'white' }}
// //                                         placeholder="Moderator Green Pen QA notes for this item (optional)..."
// //                                         value={activeData.feedback || ''}
// //                                         onChange={e => handleFeedbackChange(blockId, e.target.value)}
// //                                     />
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (mentorActiveOnScorableBlock) {
// //                         return (
// //                             <div>
// //                                 <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
// //                                         <ShieldCheck size={14} /> Supervisor Observation Comments
// //                                     </div>
// //                                     <textarea
// //                                         className="sr-feedback-input"
// //                                         rows={2}
// //                                         style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
// //                                         placeholder="Add any supervisor observation notes for this item (optional)..."
// //                                         value={activeData.feedback || ''}
// //                                         onChange={e => handleFeedbackChange(blockId, e.target.value)}
// //                                     />
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     return (
// //                         <div>
// //                             {!isWorkplaceModule && (
// //                                 <div className="sr-score-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
// //                                     <label style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '0.85rem' }}>Your Score Awarded:</label>
// //                                     <input
// //                                         type="number"
// //                                         className="sr-score-input"
// //                                         style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', background: 'white' }}
// //                                         value={activeData.score ?? 0}
// //                                         onChange={e => handleScoreChange(blockId, parseInt(e.target.value) || 0, maxM)}
// //                                     />
// //                                     <span style={{ color: '#0f172a', fontWeight: 'bold' }}>/ {maxM}</span>
// //                                 </div>
// //                             )}
// //                             <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
// //                                 <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
// //                                 <textarea
// //                                     className="sr-feedback-input"
// //                                     rows={2}
// //                                     style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
// //                                     placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
// //                                     value={activeData.feedback || ''}
// //                                     onChange={e => handleFeedbackChange(blockId, e.target.value)}
// //                                 />
// //                             </div>
// //                         </div>
// //                     );
// //                 };

// //                 if (block.type === 'section') {
// //                     const totals = sectionTotals[block.id];
// //                     return (
// //                         <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-section-title-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                 <h2 className="sr-section-title" style={{ color: '#073f4e', margin: 0, border: 'none', padding: 0 }}>{block.title}</h2>
// //                                 {isAssDone && totals && totals.total > 0 && (
// //                                     <span className="no-print" style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-heading)', letterSpacing: '0.06em', borderRadius: '4px', fontWeight: 'bold' }}>
// //                                         <BarChart size={14} /> {totals.awarded}/{totals.total}
// //                                     </span>
// //                                 )}
// //                             </div>
// //                             {block.content && (
// //                                 <RichMathText html={block.content} style={{ color: '#334155', fontSize: '0.95rem' }} />
// //                             )}
// //                             {renderBlockImage(block)}
// //                             {renderBlockFile(block)}
// //                         </div>
// //                     );
// //                 }

// //                 if (block.type === 'info') {
// //                     return (
// //                         <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderLeft: '4px solid #0ea5e9', background: '#f0f9ff', padding: '1.25rem', marginBottom: '1.5rem', borderRadius: '6px' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                 <Info size={16} /> {block.title || 'Reading Material'}
// //                             </div>
// //                             {block.content && (
// //                                 <RichMathText html={block.content} style={{ color: '#0c4a6e', fontSize: '0.92rem' }} />
// //                             )}
// //                             {renderBlockImage(block)}
// //                             {renderBlockFile(block)}
// //                         </div>
// //                     );
// //                 }

// //                 if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(block.type)) {
// //                     qNum++;
// //                     let learnerAns = submission.answers?.[block.id];

// //                     if (learnerAns === undefined && submission.answers && Object.keys(submission.answers).length > 0) {
// //                         const answerKeys = Object.keys(submission.answers);
// //                         const scorableBlocks = assessment.blocks.filter((b: any) =>
// //                             ['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'mathpad', 'graph'].includes(b.type)
// //                         );
// //                         const currentBlockIndex = scorableBlocks.findIndex((b: any) => b.id === block.id);
// //                         if (currentBlockIndex >= 0 && currentBlockIndex < answerKeys.length) {
// //                             const recoveredKey = answerKeys[currentBlockIndex];
// //                             learnerAns = submission.answers[recoveredKey];
// //                         }
// //                     }

// //                     if (block.type === 'graph') {
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0f766e', flexShrink: 0 }}>PLOT</span>
// //                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}

// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                             <BarChart size={14} /> Learner's Plotted Cartesian Graph:
// //                                         </div>
// //                                         <ReviewAxisGraph block={block} learnerAns={learnerAns} />
// //                                     </div>

// //                                     {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
// //                                         <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
// //                                                 <Lock size={14} /> Assessor Memorandum Graph (Hidden from Learner)
// //                                             </div>
// //                                             <ReviewAxisGraph block={block} learnerAns={block.memoGraph} />
// //                                         </div>
// //                                     )}

// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'mathpad') {
// //                         const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { equation: getAnswerString(learnerAns) };

// //                         const mathTabs = [
// //                             { id: 'equation', icon: <Sigma size={13} />, label: 'Equation Editor', val: safeLearnerAns.equation !== undefined ? safeLearnerAns.equation : null, theme: { text: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', activeBg: '#fce7f3' } },
// //                             { id: 'graph', icon: <BarChart size={13} />, label: 'Graphing Calculator', val: safeLearnerAns.graphState, theme: { text: '#166534', bg: '#f0fdf4', border: '#bbf7d0', activeBg: '#dcfce7' } }
// //                         ].filter(t => t.val !== null && t.val !== undefined);

// //                         const activeTabId = activeTabs[block.id] || (mathTabs.length > 0 ? mathTabs[0].id : 'equation');
// //                         const isGraphMemoExpanded = expandedGraphMemos[block.id] || false;

// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#fce7f3', color: '#db2777', flexShrink: 0 }}>MATH</span>
// //                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}

// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black', marginBottom: '8px' }}>
// //                                             <Layers size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} />Learner's Math Response:
// //                                         </div>

// //                                         {mathTabs.length === 0 ? (
// //                                             <span style={{ color: '#64748b', fontStyle: 'italic' }}>No answer provided.</span>
// //                                         ) : (
// //                                             <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
// //                                                 {mathTabs.length > 1 && (
// //                                                     <div className="no-print" style={{ paddingTop: 8, paddingLeft: 8, paddingRight: 8, display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', padding: '10px' }}>
// //                                                         {mathTabs.map(t => {
// //                                                             const isActive = activeTabId === t.id;
// //                                                             return (
// //                                                                 <button
// //                                                                     key={t.id}
// //                                                                     onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })}
// //                                                                     style={{
// //                                                                         display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
// //                                                                         background: isActive ? t.theme.activeBg : t.theme.bg,
// //                                                                         padding: '6px 14px', borderRadius: '20px', color: t.theme.text,
// //                                                                         border: `1px solid ${isActive ? t.theme.text : t.theme.border}`,
// //                                                                         cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
// //                                                                         boxShadow: isActive ? `0 2px 4px ${t.theme.border}` : 'none',
// //                                                                         transition: 'all 0.2s ease',
// //                                                                         opacity: isActive ? 1 : 0.7,
// //                                                                         whiteSpace: 'nowrap'
// //                                                                     }}
// //                                                                     onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
// //                                                                     onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7'; }}
// //                                                                 >
// //                                                                     {t.icon} {t.label}
// //                                                                 </button>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 <div style={{ padding: '15px' }}>
// //                                                     {activeTabId === 'equation' && (
// //                                                         <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                                             {React.createElement('math-field', {
// //                                                                 'read-only': 'true',
// //                                                                 style: { width: '100%', fontSize: '1.4rem', outline: 'none', background: 'transparent', border: 'none', color: '#0f172a' }
// //                                                             }, safeLearnerAns.equation || '')}
// //                                                         </div>
// //                                                     )}
// //                                                     {activeTabId === 'graph' && (
// //                                                         <ReviewAxisGraph block={block} learnerAns={safeLearnerAns.graphState} />
// //                                                     )}
// //                                                 </div>
// //                                             </div>
// //                                         )}

// //                                         {(block.correctAnswer || block.modelSolution || block.memoGraph) && (
// //                                             <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
// //                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
// //                                                     <Lock size={14} /> Assessor Memorandum (Hidden from Learner)
// //                                                 </div>

// //                                                 {block.correctAnswer && (
// //                                                     <div style={{ marginBottom: '12px' }}>
// //                                                         <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Final Answer</div>
// //                                                         {React.createElement('math-field', {
// //                                                             'read-only': 'true',
// //                                                             style: { width: '100%', fontSize: '1.2rem', padding: '8px', background: 'white', border: '1px solid #fbcfe8', borderRadius: '4px', color: '#0f172a' }
// //                                                         }, block.correctAnswer)}
// //                                                     </div>
// //                                                 )}

// //                                                 {block.modelSolution && (
// //                                                     <div style={{ marginBottom: '12px' }}>
// //                                                         <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Step-by-Step Solution</div>
// //                                                         <RichMathText html={block.modelSolution} style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px dashed #fbcfe8', fontSize: '0.9rem', color: '#334155' }} />
// //                                                     </div>
// //                                                 )}

// //                                                 {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
// //                                                     <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #fbcfe8' }}>
// //                                                         <div
// //                                                             style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#fce7f3', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}
// //                                                             onClick={(e) => { e.stopPropagation(); toggleGraphMemo(block.id); }}
// //                                                         >
// //                                                             <div>
// //                                                                 <label style={{ color: '#9d174d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
// //                                                                     <BarChart size={14} /> Expected Graph Solution
// //                                                                 </label>
// //                                                                 <p style={{ fontSize: '0.75rem', color: '#be185d', margin: '2px 0 0 0' }}>
// //                                                                     Click to {isGraphMemoExpanded ? 'collapse' : 'expand'} the expected visual solution graph.
// //                                                                 </p>
// //                                                             </div>
// //                                                             <div style={{ color: '#9d174d', padding: '4px', background: '#fdf2f8', borderRadius: '4px' }}>
// //                                                                 {isGraphMemoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
// //                                                             </div>
// //                                                         </div>

// //                                                         {isGraphMemoExpanded && (
// //                                                             <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease-out' }}>
// //                                                                 <ReviewAxisGraph block={block} learnerAns={block.memoGraph} />
// //                                                             </div>
// //                                                         )}
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'code_sandbox') {
// //                         const codePayload = typeof learnerAns === 'object' && learnerAns?.codeData ? learnerAns.codeData : learnerAns;
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#eff6ff', color: '#3b82f6', flexShrink: 0 }}>IDE</span>
// //                                         <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
// //                                             <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
// //                                                 {block.title && (
// //                                                     <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
// //                                                         {block.title}
// //                                                     </h3>
// //                                                 )}
// //                                                 {block.question && (
// //                                                     <RichMathText html={block.question} style={{ color: '#334155' }} />
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     </div>

// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>

// //                                 <div className="sr-q-body">
// //                                     {renderNetworkIDEToggleUI(block)}
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}

// //                                     <div className="sr-answer-box">
// //                                         {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
// //                                         {renderResourceLinks(codePayload?.resourceLinks || learnerAns?.resourceLinks)}

// //                                         <ReviewCodeSandbox
// //                                             block={block}
// //                                             learnerAns={learnerAns}
// //                                             submissionId={submission.id}
// //                                         />
// //                                     </div>

// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'mcq') {
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
// //                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// //                                         <div className={`sr-mcq-ans ${learnerAns === block.correctOption ? 'correct' : 'wrong'}`}>
// //                                             <span style={{ color: 'black', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{learnerAns !== undefined ? `${String.fromCharCode(65 + Number(learnerAns))}. ${block.options?.[learnerAns] || ''}` : 'No answer provided.'}</span>
// //                                             {learnerAns === block.correctOption && <CheckCircle size={14} color="black" />}
// //                                         </div>
// //                                         <div className="sr-mcq-correct-hint" style={{ color: 'black' }}>Correct Answer: <strong>{String.fromCharCode(65 + Number(block.correctOption))}. {block.options?.[block.correctOption]}</strong></div>
// //                                     </div>
// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'text') {
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
// //                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
// //                                         <div className="sr-text-ans">
// //                                             {learnerAns ? <RichMathText html={getAnswerString(learnerAns)} style={{ color: 'black' }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
// //                                         </div>
// //                                     </div>
// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'task') {
// //                         const safeLearnerAns = typeof learnerAns === 'object' && learnerAns !== null ? learnerAns : { text: getAnswerString(learnerAns) };

// //                         const taskTabs = [
// //                             { id: 'text', icon: <FileText size={14} />, label: 'Rich Text', val: safeLearnerAns.text },
// //                             { id: 'audio', icon: <Mic size={14} />, label: 'Audio', val: safeLearnerAns.audioUrl },
// //                             { id: 'url', icon: <LinkIcon size={14} />, label: 'Link', val: safeLearnerAns.url },
// //                             { id: 'upload', icon: <UploadCloud size={14} />, label: 'File Upload', val: safeLearnerAns.uploadUrl },
// //                             { id: 'code', icon: <Code size={14} />, label: 'Code IDE', val: safeLearnerAns.codeData || safeLearnerAns.code }
// //                         ].filter(t => !!t.val);

// //                         const activeTabId = activeTabs[block.id] || taskTabs[0]?.id;

// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#ede9fe', color: '#8b5cf6', flexShrink: 0 }}>Q{qNum}</span>
// //                                         <RichMathText html={block.question} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                     {!isPrintMode && isActiveRole && !isMentor && !(canModerate && isWorkplaceModule) && (
// //                                         <div className="sr-visual-mark" style={{ flexShrink: 0, marginLeft: '10px' }}>
// //                                             <button onClick={() => handleVisualMark(block.id, true, maxM)} className="sr-mark-btn" style={activeData.isCorrect === true ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Correct"><Check size={20} /></button>
// //                                             <button onClick={() => handleVisualMark(block.id, false, maxM)} className="sr-mark-btn" style={activeData.isCorrect === false ? { color: activeInkColor, border: `1px solid ${activeInkColor}`, background: 'white' } : {}} title="Mark Incorrect"><X size={20} /></button>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderNetworkIDEToggleUI(block)}
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Learner Evidence Submitted:</div>

// //                                         {(!safeLearnerAns || Object.keys(safeLearnerAns).length === 0 || (!safeLearnerAns.text && !safeLearnerAns.audioUrl && !safeLearnerAns.url && !safeLearnerAns.uploadUrl && !safeLearnerAns.code && !safeLearnerAns.codeData && !safeLearnerAns.resourceLinks)) ? (
// //                                             <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No evidence uploaded by learner.</span>
// //                                         ) : isPrintMode ? (
// //                                             <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: 'white' }}>
// //                                                 {safeLearnerAns.resourceLinks && safeLearnerAns.resourceLinks.length > 0 && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Attached Links:</strong><ul>{safeLearnerAns.resourceLinks.map((l: any, i: number) => <li key={i}><a href={l.url}>{l.label}</a></li>)}</ul></div>}
// //                                                 {safeLearnerAns.text && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Rich Text Response:</strong><RichMathText html={safeLearnerAns.text} /></div>}
// //                                                 {safeLearnerAns.audioUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Audio Recording:</strong><div>URL: {safeLearnerAns.audioUrl}</div></div>}
// //                                                 {safeLearnerAns.url && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Link:</strong><div><a href={safeLearnerAns.url} target="_blank" rel="noreferrer">{safeLearnerAns.url}</a></div></div>}
// //                                                 {safeLearnerAns.uploadUrl && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Uploaded File:</strong><FilePreview url={safeLearnerAns.uploadUrl} /></div>}
// //                                                 {(safeLearnerAns.codeData || safeLearnerAns.code) && <div><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Code:</strong><pre style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}>{typeof safeLearnerAns.code === 'string' ? safeLearnerAns.code : '[Interactive IDE Snapshot]'}</pre></div>}
// //                                             </div>
// //                                         ) : (
// //                                             <>
// //                                                 {renderResourceLinks(safeLearnerAns?.resourceLinks || safeLearnerAns?.codeData?.resourceLinks)}

// //                                                 {taskTabs.length === 0 ? null : (
// //                                                     <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
// //                                                         <div className="no-print" style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
// //                                                             {taskTabs.map(t => (
// //                                                                 <button key={t.id} onClick={() => setActiveTabs({ ...activeTabs, [block.id]: t.id })} style={{ padding: '10px 15px', border: 'none', borderBottom: activeTabId === t.id ? '2px solid var(--mlab-blue)' : '2px solid transparent', background: activeTabId === t.id ? 'white' : 'transparent', color: activeTabId === t.id ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTabId === t.id ? 'bold' : 'normal', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
// //                                                                     {t.icon} {t.label}
// //                                                                 </button>
// //                                                             ))}
// //                                                         </div>
// //                                                         <div style={{ padding: '15px' }}>
// //                                                             {activeTabId === 'text' && <RichMathText html={safeLearnerAns.text} />}
// //                                                             {activeTabId === 'audio' && <audio controls src={safeLearnerAns.audioUrl} style={{ width: '100%', height: '40px' }} />}
// //                                                             {activeTabId === 'url' && <UrlPreview url={safeLearnerAns.url} />}
// //                                                             {activeTabId === 'upload' && <FilePreview url={safeLearnerAns.uploadUrl} />}
// //                                                             {activeTabId === 'code' && (
// //                                                                 <ReviewCodeSandbox
// //                                                                     block={{ id: `${block.id}_task`, title: `Live IDE Evidence`, template: 'vanilla' }}
// //                                                                     learnerAns={safeLearnerAns.codeData || safeLearnerAns}
// //                                                                     submissionId={submission.id}
// //                                                                 />
// //                                                             )}
// //                                                         </div>
// //                                                     </div>
// //                                                 )}
// //                                             </>
// //                                         )}
// //                                     </div>
// //                                     <div className="sr-grade-box" style={{ borderLeft: `4px solid ${activeInkColor}`, marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '6px' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'logbook') {
// //                         const entries = Array.isArray(learnerAns) ? learnerAns : [];
// //                         const totalHours = entries.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0);

// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#ffedd5', color: '#ea580c', flexShrink: 0 }}>LOG</span>
// //                                         <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0 }} />
// //                                     </div>
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     <div className="sr-answer-box">
// //                                         <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarRange size={14} /> Workplace Hours Logged:</div>
// //                                         {entries.length === 0 ? (
// //                                             <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No entries logged by learner.</span>
// //                                         ) : (
// //                                             <div>
// //                                                 <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
// //                                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', background: 'white' }}>
// //                                                         <thead>
// //                                                             <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
// //                                                                 <th style={{ padding: '10px' }}>Date</th>
// //                                                                 <th style={{ padding: '10px' }}>Assignment Task & Evidence</th>
// //                                                                 <th style={{ padding: '10px' }}>Start Time</th>
// //                                                                 <th style={{ padding: '10px' }}>Finish Time</th>
// //                                                                 <th style={{ padding: '10px' }}>Total Hours</th>
// //                                                             </tr>
// //                                                         </thead>
// //                                                         <tbody>
// //                                                             {entries.map((entry: any, i: number) => (
// //                                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: 'white', verticalAlign: 'top' }}>
// //                                                                     <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.date}</td>
// //                                                                     <td style={{ padding: '10px', color: '#334155' }}>
// //                                                                         <RichMathText html={entry.task || '<em>No task description provided.</em>'} style={{ fontSize: '0.85rem' }} />
// //                                                                         {entry.uploadUrl && <div style={{ marginTop: '10px' }}><FilePreview url={entry.uploadUrl} /></div>}
// //                                                                         {entry.url && <div style={{ marginTop: '10px' }}><UrlPreview url={entry.url} /></div>}
// //                                                                     </td>
// //                                                                     <td style={{ padding: '10px', color: '#475569' }}>{entry.startTime}</td>
// //                                                                     <td style={{ padding: '10px', color: '#475569' }}>{entry.endTime}</td>
// //                                                                     <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>{entry.hours}</td>
// //                                                                 </tr>
// //                                                             ))}
// //                                                             <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
// //                                                                 <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.8rem', color: '#475569' }}>Total Logged Hours:</td>
// //                                                                 <td style={{ padding: '10px', color: '#ea580c', fontSize: '1.1rem' }}>{totalHours}</td>
// //                                                             </tr>
// //                                                         </tbody>
// //                                                     </table>
// //                                                 </div>

// //                                                 <LogbookHoursTally entries={entries} requiredHours={block.requiredHours} />

// //                                                 {isMentor && canFacilitatorMark && (
// //                                                     <div style={{ marginTop: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem' }}>
// //                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1d4ed8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
// //                                                             <ShieldCheck size={14} /> Supervisor Comments on Logbook
// //                                                         </div>
// //                                                         <textarea
// //                                                             className="sr-feedback-input"
// //                                                             rows={3}
// //                                                             style={{ width: '100%', color: 'blue', fontStyle: 'italic', padding: '8px', border: '1px solid #bfdbfe', borderRadius: '4px', resize: 'vertical', background: 'white' }}
// //                                                             placeholder="Comment on the accuracy and completeness of hours logged..."
// //                                                             value={activeData.feedback || ''}
// //                                                             onChange={e => handleFeedbackChange(block.id, e.target.value)}
// //                                                         />
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'checklist') {
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0d9488', flexShrink: 0 }}>CHK</span>
// //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
// //                                             <RichMathText html={block.title} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
// //                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
// //                                                 {isMentor ? 'Workplace observation checklist — verify each criterion.' : 'Assessor observation checklist.'}
// //                                             </span>
// //                                         </div>
// //                                     </div>
// //                                 </div>
// //                                 <div className="sr-q-body">
// //                                     {renderNetworkIDEToggleUI(block)}
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     <div style={{ marginTop: '1rem' }}>
// //                                         {block.criteria?.map((crit: string, i: number) => {
// //                                             const mentorResult = fData.criteriaResults?.[i] || { status: null, comment: '' };
// //                                             const assessorResult = aData.criteriaResults?.[i] || { status: null, comment: '' };
// //                                             const modResult = mData.criteriaResults?.[i] || { status: null, comment: '' };
// //                                             const myResult = activeData.criteriaResults?.[i] || { status: null, comment: '', startTime: '', endTime: '' };

// //                                             let durationStr = '0m 0s';
// //                                             if (myResult.startTime && myResult.endTime) {
// //                                                 const diffMs = new Date(myResult.endTime).getTime() - new Date(myResult.startTime).getTime();
// //                                                 if (diffMs > 0) {
// //                                                     const m = Math.floor(diffMs / 60000);
// //                                                     const s = Math.floor((diffMs % 60000) / 1000);
// //                                                     durationStr = `${m}m ${s}s`;
// //                                                 }
// //                                             }

// //                                             return (
// //                                                 <div key={i} style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
// //                                                     <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '0.95rem' }}>{i + 1}. {crit}</p>

// //                                                     {block.requireEvidencePerCriterion !== false && (() => {
// //                                                         const rawEv = learnerAns?.[`evidence_${i}`];
// //                                                         const critEvidence = typeof rawEv === 'string' ? { text: rawEv } : (rawEv || {});
// //                                                         const safeText = getAnswerString(critEvidence.text);
// //                                                         const cleanTextCheck = safeText ? safeText.replace(/<[^>]*>/g, '').trim() : '';
// //                                                         const isTextTrulyEmpty = cleanTextCheck.length === 0;

// //                                                         const allTabs = [
// //                                                             { id: 'upload', icon: <UploadCloud size={13} />, label: 'File Artifact', val: critEvidence.uploadUrl, render: () => <FilePreview url={critEvidence.uploadUrl} /> },
// //                                                             { id: 'url', icon: <LinkIcon size={13} />, label: 'Web Link', val: critEvidence.url, render: () => <UrlPreview url={critEvidence.url} /> },
// //                                                             { id: 'code', icon: <Code size={13} />, label: 'Source Code', val: critEvidence.codeData || critEvidence.code, render: () => <ReviewCodeSandbox block={{ id: `${block.id}_ev_${i}`, title: `Criterion ${i + 1} Code Evidence`, template: 'vanilla' }} learnerAns={critEvidence.codeData || critEvidence} submissionId={submission.id} /> },
// //                                                             { id: 'text', icon: <FileText size={13} />, label: 'Learner Notes', val: isTextTrulyEmpty ? null : critEvidence.text, render: () => <RichMathText html={critEvidence.text} /> }
// //                                                         ];

// //                                                         const activeEvidenceTabs = allTabs.filter(t => !!t.val);
// //                                                         const hasUploadedEvidence = activeEvidenceTabs.length > 0;
// //                                                         const isObservedOrTimed = !!(myResult.startTime || myResult.status || mentorResult.status || assessorResult.status);

// //                                                         if (!hasUploadedEvidence) {
// //                                                             if (isObservedOrTimed) {
// //                                                                 return (
// //                                                                     <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 15px', borderRadius: '6px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
// //                                                                         <AlertCircle size={18} className="animate-pulse" style={{ color: '#d97706', flexShrink: 0 }} />
// //                                                                         <div>
// //                                                                             <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Evidence Pending</span>
// //                                                                             <span style={{ fontSize: '0.75rem', color: '#78350f' }}>Observation logged, but waiting for the learner to upload their supporting files.</span>
// //                                                                         </div>
// //                                                                     </div>
// //                                                                 );
// //                                                             }
// //                                                             return <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>Awaiting learner evidence upload.</p>;
// //                                                         }

// //                                                         const isDraft = ['not_started', 'in_progress'].includes(String(submission?.status || '').toLowerCase());
// //                                                         const subTabKey = `${block.id}_ev_${i}`;
// //                                                         const activeSubTab = activeTabs[subTabKey] || activeEvidenceTabs[0]?.id;
// //                                                         const selectedTabConfig = activeEvidenceTabs.find(t => t.id === activeSubTab) || activeEvidenceTabs[0];
// //                                                         const expandKey = `${subTabKey}_expanded`;
// //                                                         const isTabExpanded = activeTabs[expandKey] === 'true';

// //                                                         return (
// //                                                             <div style={{ background: isDraft ? '#fffdf5' : '#f5f3ff', border: isDraft ? '1px solid #fef08a' : '1px solid #c4b5fd', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
// //                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 'bold', color: isDraft ? '#b45309' : '#6d28d9', textTransform: 'uppercase' }}>
// //                                                                         <Layers size={16} /> {isDraft ? 'Learner Evidence (Live Draft Preview)' : 'Learner Evidence Submitted'}
// //                                                                     </label>
// //                                                                     {isDraft && (
// //                                                                         <span style={{ fontSize: '0.68rem', background: '#d97706', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                                                             Learner Modifying · Not Yet Submitted
// //                                                                         </span>
// //                                                                     )}
// //                                                                 </div>

// //                                                                 {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
// //                                                                 {renderResourceLinks(critEvidence.resourceLinks || critEvidence.codeData?.resourceLinks)}

// //                                                                 <div className="no-print" style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
// //                                                                     {activeEvidenceTabs.map(tab => (
// //                                                                         <button key={tab.id} type="button" onClick={() => setActiveTabs({ ...activeTabs, [subTabKey]: tab.id })} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '0.75rem', border: 'none', borderBottom: activeSubTab === tab.id ? (isDraft ? '2px solid #b45309' : '2px solid #6d28d9') : '2px solid transparent', background: activeSubTab === tab.id ? 'white' : 'transparent', color: activeSubTab === tab.id ? (isDraft ? '#b45309' : '#6d28d9') : '#64748b', fontWeight: activeSubTab === tab.id ? 'bold' : 'normal', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: '4px 4px 0 0' }}>
// //                                                                             {tab.icon} {tab.label}
// //                                                                         </button>
// //                                                                     ))}
// //                                                                 </div>

// //                                                                 <div style={{ position: 'relative' }}>
// //                                                                     <div style={{ maxHeight: isTabExpanded ? 'none' : '150px', overflow: 'hidden', transition: 'max-height 0.2s ease-out', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px', background: 'white' }}>
// //                                                                         {selectedTabConfig?.render()}
// //                                                                         {!isTabExpanded && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(to top, white, transparent)', pointerEvents: 'none' }} />}
// //                                                                     </div>
// //                                                                     <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-start' }}>
// //                                                                         <button type="button" onClick={() => setActiveTabs({ ...activeTabs, [expandKey]: isTabExpanded ? 'false' : 'true' })} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 'bold', color: '#475569', borderRadius: '4px', cursor: 'pointer' }}>
// //                                                                             {isTabExpanded ? 'Collapse Evidence View ↑' : 'Expand Evidence View ↓'}
// //                                                                         </button>
// //                                                                     </div>
// //                                                                 </div>
// //                                                             </div>
// //                                                         );
// //                                                     })()}

// //                                                     {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
// //                                                         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                 <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Observation' : 'Facilitator Pre-Mark'}
// //                                                             </span>
// //                                                             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                 {mentorResult.status === 'C' ? (savedFacRole === 'mentor' ? 'Observed ✓' : 'Competent (C)') : mentorResult.status === 'NYC' ? (savedFacRole === 'mentor' ? 'Not Observed ✗' : 'NYC') : 'Not Reviewed'}
// //                                                             </span>
// //                                                             {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
// //                                                         </div>
// //                                                     )}

// //                                                     {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
// //                                                         <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                 <AwardIcon size={12} /> Assessor Grade
// //                                                             </span>
// //                                                             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                 {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
// //                                                             </span>
// //                                                             {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
// //                                                         </div>
// //                                                     )}

// //                                                     {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
// //                                                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                             <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                 <ShieldCheck size={12} /> Moderator QA
// //                                                             </span>
// //                                                             {modResult.status && (
// //                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                     {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
// //                                                                 </span>
// //                                                             )}
// //                                                             {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
// //                                                         </div>
// //                                                     )}

// //                                                     {(!isPrintMode && isActiveRole) && (
// //                                                         <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
// //                                                             {block.requirePerCriterionTiming !== false && !canModerate && (
// //                                                                 <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
// //                                                                     <Timer size={16} color="#64748b" style={{ flexShrink: 0 }} />
// //                                                                     <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', minWidth: '80px' }}>Task Timer:</span>

// //                                                                     {!myResult.startTime ? (
// //                                                                         <button onClick={() => handleCriterionChange(block.id, i, 'startTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Play size={12} /> Start</button>
// //                                                                     ) : (
// //                                                                         <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
// //                                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
// //                                                                                 <strong>Start:</strong>
// //                                                                                 <input type="datetime-local" className="datetime-input" value={myResult.startTime ? moment(myResult.startTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'startTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
// //                                                                             </div>

// //                                                                             {!myResult.endTime ? (
// //                                                                                 <button onClick={() => handleCriterionChange(block.id, i, 'endTime', new Date().toISOString())} className="ab-btn sm" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Square size={12} /> Stop</button>
// //                                                                             ) : (
// //                                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#334155' }}>
// //                                                                                         <strong>End:</strong>
// //                                                                                         <input type="datetime-local" className="datetime-input" value={myResult.endTime ? moment(myResult.endTime).format('YYYY-MM-DDTHH:mm') : ''} onChange={(e) => handleCriterionChange(block.id, i, 'endTime', e.target.value ? new Date(e.target.value).toISOString() : '')} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', color: 'black' }} />
// //                                                                                     </div>
// //                                                                                     <span style={{ color: '#0ea5e9', fontWeight: 'bold', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Duration: {durationStr}</span>
// //                                                                                 </div>
// //                                                                             )}
// //                                                                         </div>
// //                                                                     )}
// //                                                                 </div>
// //                                                             )}
// //                                                             <div style={{ display: 'flex', gap: '10px' }}>
// //                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
// //                                                                     <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleCriterionChange(block.id, i, 'status', 'C')} style={{ accentColor: '#22c55e' }} />
// //                                                                     {isMentor ? 'Observed ✓' : 'Competent (C)'}
// //                                                                 </label>
// //                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
// //                                                                     <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleCriterionChange(block.id, i, 'status', 'NYC')} style={{ accentColor: '#ef4444' }} />
// //                                                                     {isMentor ? 'Not Observed ✗' : 'NYC'}
// //                                                                 </label>
// //                                                             </div>
// //                                                             <div style={{ flex: 1, minWidth: '250px' }}>
// //                                                                 <textarea className="ab-input" disabled={canModerate && !isWorkplaceModule && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor observation notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleCriterionChange(block.id, i, 'comment', e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
// //                                                             </div>
// //                                                         </div>
// //                                                     )}
// //                                                 </div>
// //                                             );
// //                                         })}

// //                                         <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
// //                                             {renderReadOnlyLayers()}
// //                                             {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                         </div>

// //                                         {block.requireObservationDeclaration !== false && !canModerate && (
// //                                             <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
// //                                                 <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                     <ShieldCheck size={16} color={activeInkColor} />
// //                                                     {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
// //                                                 </h4>

// //                                                 {block.requireTimeTracking !== false && (
// //                                                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
// //                                                         {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
// //                                                             const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
// //                                                             const types = ['date', 'time', 'time'];
// //                                                             const val = decData[field];
// //                                                             return (
// //                                                                 <div key={field}>
// //                                                                     <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                                                         {labels[fi]}
// //                                                                         {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
// //                                                                     </label>
// //                                                                     {(!isDeclarationInteractive || isPrintMode)
// //                                                                         ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
// //                                                                         : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
// //                                                                     }
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}

// //                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
// //                                                     <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
// //                                                     {isWorkplaceModule
// //                                                         ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
// //                                                         : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
// //                                                 </label>
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         );
// //                     }

// //                     if (block.type === 'qcto_workplace') {
// //                         return (
// //                             <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
// //                                 <div className="sr-q-header">
// //                                     <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
// //                                         <span className="sr-q-num" style={{ background: '#ffe4e6', color: '#e11d48', flexShrink: 0 }}>QCTO</span>
// //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
// //                                             <RichMathText html={`${block.weCode} – ${block.weTitle}`} style={{ color: '#073f4e', fontWeight: 'bold', margin: 0 }} />
// //                                             <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
// //                                                 {isMentor ? 'Workplace Experience — Mentor Verification' : 'Workplace Experience Checkpoint'}
// //                                             </span>
// //                                         </div>
// //                                     </div>
// //                                 </div>

// //                                 <div className="sr-q-body">
// //                                     {renderNetworkIDEToggleUI(block)}
// //                                     {renderBlockImage(block)}
// //                                     {renderBlockFile(block)}
// //                                     {block.workActivities?.map((wa: any, actIdx: number) => {
// //                                         const taskKey = `wa_${wa.id}_task`;
// //                                         const dateKey = `wa_${wa.id}_date`;
// //                                         const task = learnerAns?.[taskKey] || '';
// //                                         const date = learnerAns?.[dateKey] || '';

// //                                         const mentorResult = fData.activityResults?.[actIdx] || { status: null, comment: '' };
// //                                         const assessorResult = aData.activityResults?.[actIdx] || { status: null, comment: '' };
// //                                         const modResult = mData.activityResults?.[actIdx] || { status: null, comment: '' };
// //                                         const myResult = activeData.activityResults?.[actIdx] || { status: null, comment: '' };

// //                                         return (
// //                                             <div key={wa.id} style={{ marginBottom: '2rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
// //                                                 <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
// //                                                     <h4 style={{ margin: 0, color: '#073f4e' }}>{wa.code}: {wa.description}</h4>
// //                                                 </div>
// //                                                 <div style={{ padding: '1rem' }}>
// //                                                     <div style={{ marginBottom: '1.5rem' }}>
// //                                                         <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
// //                                                             {task && <div style={{ flex: 1, minWidth: '250px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Task Performed:</strong><RichMathText html={task} style={{ marginTop: '6px' }} /></div>}
// //                                                             {date && <div style={{ minWidth: '120px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Date:</strong><div style={{ marginTop: '6px' }}>{new Date(date).toLocaleDateString()}</div></div>}
// //                                                         </div>

// //                                                         {wa.evidenceItems?.map((evItem: any) => {
// //                                                             const seKey = `se_${evItem.id}`;
// //                                                             const rawSe = learnerAns?.[seKey];
// //                                                             const seData = typeof rawSe === 'string' ? { text: rawSe } : (rawSe || {});

// //                                                             return (
// //                                                                 <div key={evItem.id} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// //                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e11d48', display: 'block', marginBottom: '8px' }}>
// //                                                                         Evidence: {evItem.code} - {evItem.description}
// //                                                                     </span>
// //                                                                     {seData.uploadUrl && <div style={{ marginBottom: '10px' }}><FilePreview url={seData.uploadUrl} /></div>}
// //                                                                     {seData.url && <div style={{ marginBottom: '10px' }}><UrlPreview url={seData.url} /></div>}
// //                                                                     {(seData.codeData || seData.code) && (
// //                                                                         <div style={{ marginBottom: '10px' }}>
// //                                                                             {/* 🚀 EXTERNAL PROJECT LINKS RENDERER */}
// //                                                                             {renderResourceLinks(seData.codeData?.resourceLinks || seData.resourceLinks)}
// //                                                                             <ReviewCodeSandbox
// //                                                                                 block={{ id: `${block.id}_se_${evItem.id}`, title: `Evidence: ${evItem.code}`, template: 'vanilla' }}
// //                                                                                 learnerAns={seData.codeData || seData}
// //                                                                                 submissionId={submission.id}
// //                                                                             />
// //                                                                         </div>
// //                                                                     )}
// //                                                                     {seData.text && <RichMathText html={seData.text} />}
// //                                                                     {(!seData.uploadUrl && !seData.url && !seData.code && !seData.codeData && !seData.text) && <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No evidence attached for this item.</span>}
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>

// //                                                     <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
// //                                                         {(isFacDone || mentorResult.status) && (!canFacilitatorMark || isPrintMode) && (
// //                                                             <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                     <ShieldCheck size={12} /> {savedFacRole === 'mentor' ? 'Workplace Mentor Observation' : 'Facilitator Pre-Mark'}
// //                                                                 </span>
// //                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: mentorResult.status === 'C' ? '#166534' : mentorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                     {mentorResult.status === 'C' ? (savedFacRole === 'mentor' ? 'Observed ✓' : 'Competent (C)') : mentorResult.status === 'NYC' ? (savedFacRole === 'mentor' ? 'Not Observed ✗' : 'NYC') : 'Not Reviewed'}
// //                                                                 </span>
// //                                                                 {mentorResult.comment && <div style={{ fontSize: '0.82rem', color: '#1e40af', fontStyle: 'italic', marginTop: '4px' }}>{mentorResult.comment}</div>}
// //                                                             </div>
// //                                                         )}

// //                                                         {(isAssDone || assessorResult.status) && (!canGrade || isPrintMode) && (
// //                                                             <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                     <AwardIcon size={12} /> Assessor Grade
// //                                                                 </span>
// //                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: assessorResult.status === 'C' ? '#166534' : assessorResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                     {assessorResult.status === 'C' ? 'Competent (C)' : assessorResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
// //                                                                 </span>
// //                                                                 {assessorResult.comment && <div style={{ fontSize: '0.82rem', color: '#991b1b', fontStyle: 'italic', marginTop: '4px' }}>{assessorResult.comment}</div>}
// //                                                             </div>
// //                                                         )}

// //                                                         {(isModDone || modResult.status || modResult.comment) && (!canModerate || isPrintMode) && (
// //                                                             <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
// //                                                                 <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase', display: 'flex', gap: '5px' }}>
// //                                                                     <ShieldCheck size={12} /> Moderator QA
// //                                                                 </span>
// //                                                                 {modResult.status && (
// //                                                                     <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: modResult.status === 'C' ? '#166534' : modResult.status === 'NYC' ? '#991b1b' : '#64748b' }}>
// //                                                                         {modResult.status === 'C' ? 'Competent (C)' : modResult.status === 'NYC' ? 'NYC' : 'Not Graded'}
// //                                                                     </span>
// //                                                                 )}
// //                                                                 {modResult.comment && <div style={{ fontSize: '0.82rem', color: '#15803d', fontStyle: 'italic', marginTop: '4px' }}>{modResult.comment}</div>}
// //                                                             </div>
// //                                                         )}

// //                                                         {(!isPrintMode && isActiveRole) && (
// //                                                             <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
// //                                                                 <div style={{ display: 'flex', gap: '10px' }}>
// //                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'C' ? '#dcfce7' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'C' ? '2px solid #22c55e' : '1px solid #cbd5e1', color: myResult.status === 'C' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
// //                                                                         <input type="radio" disabled={canModerate} checked={myResult.status === 'C'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'C')} style={{ accentColor: '#22c55e' }} />
// //                                                                         {isMentor ? 'Verified ✓' : 'Competent (C)'}
// //                                                                     </label>
// //                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', background: myResult.status === 'NYC' ? '#fee2e2' : '#f8fafc', padding: '8px 12px', borderRadius: '4px', border: myResult.status === 'NYC' ? '2px solid #ef4444' : '1px solid #cbd5e1', color: myResult.status === 'NYC' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: canModerate ? 'not-allowed' : 'pointer' }}>
// //                                                                         <input type="radio" disabled={canModerate} checked={myResult.status === 'NYC'} onChange={() => handleActivityStatusChange(block.id, actIdx, 'NYC')} style={{ accentColor: '#ef4444' }} />
// //                                                                         {isMentor ? 'Not Verified ✗' : 'NYC'}
// //                                                                     </label>
// //                                                                 </div>
// //                                                                 <div style={{ flex: 1, minWidth: '250px' }}>
// //                                                                     <textarea className="ab-input" disabled={canModerate && !myResult.comment} rows={2} placeholder={isMentor ? "Supervisor verification notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."} value={myResult.comment} onChange={e => handleActivityCommentChange(block.id, actIdx, e.target.value)} style={{ fontSize: '0.85rem', width: '100%', border: '1px solid #e2e8f0', resize: 'vertical', background: 'white' }} />
// //                                                                 </div>
// //                                                             </div>
// //                                                         )}
// //                                                     </div>
// //                                                 </div>
// //                                             </div>
// //                                         );
// //                                     })}
// //                                     <div className="ap-workplace__toggles" style={{ marginTop: '1rem' }}>
// //                                         {block.requireSelfAssessment !== false && (
// //                                             <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}>
// //                                                 <CheckCircle size={16} color={learnerAns?.selfAssessmentDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
// //                                                 <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.selfAssessmentDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner completed self-assessment.</span>
// //                                             </label>
// //                                         )}
// //                                         {block.requireGoalPlanning !== false && (
// //                                             <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}>
// //                                                 <CheckCircle size={16} color={learnerAns?.goalPlanningDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} />
// //                                                 <span className="ap-workplace__toggle-label" style={{ color: learnerAns?.goalPlanningDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner updated goal planning document.</span>
// //                                             </label>
// //                                         )}
// //                                     </div>

// //                                     <div className="sr-grade-box" style={{ borderTop: `1px dashed #cbd5e1`, marginTop: '1rem', paddingTop: '1rem' }}>
// //                                         {renderReadOnlyLayers()}
// //                                         {(!isPrintMode && isActiveRole) && renderActiveGradeControls(block.id)}
// //                                     </div>

// //                                     {block.requireObservationDeclaration !== false && !canModerate && (
// //                                         <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', borderLeft: `4px solid ${activeInkColor}` }}>
// //                                             <h4 style={{ fontSize: '0.9rem', color: '#0f172a', margin: '0 0 15px 0', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                 <ShieldCheck size={16} color={activeInkColor} />
// //                                                 {isWorkplaceModule ? 'Mentor Verification Declaration' : 'Observation Declaration'}
// //                                             </h4>

// //                                             {block.requireTimeTracking !== false && (
// //                                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
// //                                                     {(['obsDate', 'obsStartTime', 'obsEndTime'] as const).map((field, fi) => {
// //                                                         const labels = ['Date of Observation', 'Session Start Time', 'Session End Time'];
// //                                                         const types = ['date', 'time', 'time'];
// //                                                         const val = decData[field];
// //                                                         return (
// //                                                             <div key={field}>
// //                                                                 <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                                                     {labels[fi]}
// //                                                                     {isDeclarationInteractive && !isPrintMode && <button className="ab-text-btn" style={{ fontSize: '0.65rem', padding: 0 }} onClick={() => handleSetToNow(block.id, field)}>Set Now</button>}
// //                                                                 </label>
// //                                                                 {(!isDeclarationInteractive || isPrintMode)
// //                                                                     ? <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0f172a' }}>{field === 'obsDate' ? (val ? moment(val).format('DD/MM/YYYY') : '—') : (val || '—')}</div>
// //                                                                     : <input type={types[fi]} className="ab-input" value={val || ''} onChange={e => handleGlobalChecklistChange(block.id, field, e.target.value)} />
// //                                                                 }
// //                                                             </div>
// //                                                         );
// //                                                     })}
// //                                                 </div>
// //                                             )}

// //                                             <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold', background: decData.obsDeclaration ? '#eff6ff' : 'white', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', cursor: isDeclarationInteractive && !isPrintMode ? 'pointer' : 'default' }}>
// //                                                 <input type="checkbox" disabled={!isDeclarationInteractive || isPrintMode} checked={decData.obsDeclaration || false} onChange={e => handleGlobalChecklistChange(block.id, 'obsDeclaration', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: isDeclarationInteractive ? activeInkColor : '#64748b' }} />
// //                                                 {isWorkplaceModule
// //                                                     ? 'I confirm that I have directly observed this learner performing the above workplace activities in a real work environment, and that the evidence submitted is authentic.'
// //                                                     : 'I officially declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.'}
// //                                             </label>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         );
// //                     }
// //                 }
// //                 return null;
// //             })}
// //         </>
// //     );
// // };

// // export const SubmissionReview: React.FC = () => {
// //     const { submissionId } = useParams<{ submissionId: string }>();
// //     const navigate = useNavigate();
// //     const { user } = useStore();
// //     const toast = useToast();

// //     const filterBlack = { height: '50px', objectFit: 'contain' as const, filter: 'brightness(0)', marginBottom: '8px' };
// //     const filterBlue = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)', marginBottom: '8px' };
// //     const filterRed = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)', marginBottom: '8px' };
// //     const filterGreen = { height: '40px', objectFit: 'contain' as const, filter: 'brightness(0) saturate(100%) invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)', marginBottom: '8px' };

// //     const [loading, setLoading] = useState(true);
// //     const [saving, setSaving] = useState(false);

// //     const [submission, setSubmission] = useState<any>(null);
// //     const [assessment, setAssessment] = useState<any>(null);
// //     const [learner, setLearner] = useState<any>(null);

// //     const [proctorSession, setProctorSession] = useState<any>(null);

// //     const [learnerProfile, setLearnerProfile] = useState<any>(null);
// //     const [assessorProfile, setAssessorProfile] = useState<any>(null);
// //     const [moderatorProfile, setModeratorProfile] = useState<any>(null);
// //     const [facilitatorProfile, setFacilitatorProfile] = useState<any>(null);

// //     const [facBreakdown, setFacBreakdown] = useState<Record<string, GradeData>>({});
// //     const [assBreakdown, setAssBreakdown] = useState<Record<string, GradeData>>({});
// //     const [modBreakdown, setModBreakdown] = useState<Record<string, GradeData>>({});

// //     const [facOverallFeedback, setFacOverallFeedback] = useState('');
// //     const [assOverallFeedback, setAssOverallFeedback] = useState('');
// //     const [competency, setCompetency] = useState<'C' | 'NYC' | null>(null);

// //     const [modFeedback, setModFeedback] = useState('');
// //     const [modOutcome, setModOutcome] = useState<'Endorsed' | 'Returned' | null>(null);

// //     const [facTimeOverride, setFacTimeOverride] = useState<number | ''>('');
// //     const [assTimeOverride, setAssTimeOverride] = useState<number | ''>('');
// //     const [modTimeOverride, setModTimeOverride] = useState<number | ''>('');
// //     const [learnerTimeOverride, setLearnerTimeOverride] = useState<number | ''>('');

// //     const [liveTick, setLiveTick] = useState(0);

// //     useEffect(() => {
// //         const interval = setInterval(() => setLiveTick(p => p + 1), 30000);
// //         return () => clearInterval(interval);
// //     }, []);

// //     const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);

// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; onConfirm: () => void; onCancel?: () => void; confirmText?: string; } | null>(null);
// //     const [showRemediationModal, setShowRemediationModal] = useState(false);
// //     const [showReturnToLearnerModal, setShowReturnToLearnerModal] = useState(false);
// //     const [showResolveAppealModal, setShowResolveAppealModal] = useState(false);
// //     const [showProctorEvidenceModal, setShowProctorEvidenceModal] = useState(false);
// //     const [showExcuseModal, setShowExcuseModal] = useState(false);
// //     const [showExtraTimeModal, setShowExtraTimeModal] = useState(false);

// //     const [showGroupMatrix, setShowGroupMatrix] = useState(false);
// //     const [availablePeers, setAvailablePeers] = useState<any[]>([]);
// //     const [isFetchingPeers, setIsFetchingPeers] = useState(false);

// //     const [selectedGroupPeers, setSelectedGroupPeers] = useState<any[]>([]);
// //     const [groupMatrixGrades, setGroupMatrixGrades] = useState<Record<string, Record<string, boolean>>>({});
// //     const [groupTimeMatrix, setGroupTimeMatrix] = useState<Record<string, Record<string, { startTime?: string; endTime?: string }>>>({});
// //     const [groupRemarks, setGroupRemarks] = useState('');
// //     const [isGroupSessionActive, setIsGroupSessionActive] = useState(false);

// //     const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

// //     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// //     const sessionStartRef = useRef<number>(performance.now());
// //     const initialFacTimeRef = useRef<number>(0);
// //     const initialAssTimeRef = useRef<number>(0);
// //     const initialModTimeRef = useRef<number>(0);

// //     const currentStatus = String(submission?.status || '').toLowerCase();
// //     const currentAttempt = submission?.attemptNumber || 1;

// //     const hasChecklists = assessment?.blocks?.some((b: any) => b.type === 'checklist');
// //     const hasWorkplace = assessment?.blocks?.some((b: any) => b.type === 'qcto_workplace');
// //     const hasLogbook = assessment?.blocks?.some((b: any) => b.type === 'logbook');
// //     const hasKnowledgeBlocks = assessment?.blocks?.some((b: any) => ['mcq', 'text', 'task', 'code_sandbox'].includes(b.type));
// //     const isWorkplaceModule = (hasWorkplace || hasLogbook) && !hasKnowledgeBlocks;

// //     const isPureKnowledge = hasKnowledgeBlocks && !hasChecklists && !hasWorkplace && !hasLogbook;
// //     const isAppealUpheld = submission?.appeal?.status === 'upheld';

// //     const isMissed = currentStatus === 'missed';
// //     const isViolation = currentStatus === 'violation';
// //     const isAwaitingSignoff = currentStatus === 'awaiting_learner_signoff';
// //     const isSubmitted = ['submitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// //     const isFacDone = ['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(currentStatus);
// //     const isAssDone = ['graded', 'moderated', 'returned', 'appealed'].includes(currentStatus);
// //     const isModDone = ['moderated', 'appealed'].includes(currentStatus);

// //     // 🚀 FLEXIBLE PRACTITIONER ROLE IDENTIFICATION
// //     const isMentor = user?.role === 'mentor';
// //     const isFacilitator = user?.role === 'facilitator' || user?.role === 'assistant_facilitator';
// //     const isAssessor = user?.role === 'assessor';
// //     const isModerator = user?.role === 'moderator';
// //     const isAdmin = user?.role === 'admin' || user?.role === 'assistant_admin';
// //     const isSuperAdmin = Boolean((user as any)?.isSuperAdmin);

// //     const secondaryRoles = Array.isArray((user as any)?.secondaryRoles) ? (user as any).secondaryRoles : [];

// //     const hasAssessorRights = isSuperAdmin || Boolean((user as any)?.canMarkAssessments) || secondaryRoles.includes('assessor') || isAssessor || isAdmin;
// //     const hasFacilitatorRights = isSuperAdmin || Boolean((user as any)?.canFacilitateCohorts) || secondaryRoles.includes('facilitator') || isFacilitator || isMentor || isAdmin;
// //     const hasModeratorRights = isSuperAdmin || secondaryRoles.includes('moderator') || isModerator || isAdmin;

// //     const isAdminOrFacilitator = isAdmin || isFacilitator || hasFacilitatorRights;

// //     const savedFacRole = submission?.grading?.facilitatorRole;
// //     const displayFacRole = isFacDone ? savedFacRole : user?.role;

// //     const facPanelTitle = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : `Facilitator Pre-Marking`;
// //     const facRemarksLabel = displayFacRole === 'mentor' ? 'Supervisor Comments' : `Facilitator Remarks`;
// //     const facSubmitLabel = displayFacRole === 'mentor' ? 'Verify & Send to Assessor' : 'Send to Assessor';
// //     const facReadOnlyLabel = displayFacRole === 'mentor' ? 'Workplace Mentor Verification' : 'Facilitator Pre-Mark';

// //     const canFacilitatorMark = hasFacilitatorRights && (
// //         currentStatus === 'submitted' ||
// //         (!isPureKnowledge && ['not_started', 'in_progress'].includes(currentStatus))
// //     );

// //     const canGrade = hasAssessorRights && (currentStatus === 'facilitator_reviewed' || currentStatus === 'returned' || currentStatus === 'missed' || currentStatus === 'violation');
// //     const canModerate = hasModeratorRights && currentStatus === 'graded';
// //     const canReturnToLearner = isMentor && ['submitted', 'in_progress'].includes(currentStatus);

// //     const isPast48Hours = useMemo(() => {
// //         const refDate = submission?.submittedAt || submission?.startedAt;
// //         if (!refDate) return false;
// //         const diffHours = (new Date().getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60);
// //         return diffHours >= 48;
// //     }, [submission?.submittedAt, submission?.startedAt]);

// //     const disableExtraTime = isAssDone || isPast48Hours;

// //     // 🚀 PROCTOR SNAPSHOT LISTENER WITH ERROR HANDLER
// //     useEffect(() => {
// //         if (!submission) return;
// //         const targetLearnerUid = submission?.learnerDeclaration?.learnerAuthUid || submission?.authUid || submission?.learnerId;
// //         const activeAssessmentId = submission?.assessmentId || 'unassigned_assessment';
// //         const sessionDocId = `${activeAssessmentId}_${targetLearnerUid}`;

// //         const unsubscribe = onSnapshot(
// //             doc(db, 'live_proctor_sessions', sessionDocId),
// //             (snap) => {
// //                 if (snap.exists()) {
// //                     setProctorSession(snap.data());
// //                 }
// //             },
// //             (err) => {
// //                 console.warn("Live proctor session snapshot error caught:", err.message);
// //             }
// //         );
// //         return () => unsubscribe();
// //     }, [submission?.assessmentId, submission?.authUid, submission?.learnerId, submission?.learnerDeclaration]);

// //     // 🚀 MAIN SUBMISSION SNAPSHOT LISTENER WITH ERROR HANDLER
// //     useEffect(() => {
// //         if (!submissionId) return;

// //         let isInitialLoad = true;

// //         const unsubscribe = onSnapshot(
// //             doc(db, 'learner_submissions', submissionId),
// //             async (subSnap) => {
// //                 try {
// //                     if (!subSnap.exists()) throw new Error("Submission not found");
// //                     const subData = subSnap.data();

// //                     setSubmission({ id: subSnap.id, ...subData });

// //                     if (isInitialLoad) {
// //                         const assRef = doc(db, 'assessments', subData.assessmentId);
// //                         const assSnap = await getDoc(assRef);
// //                         if (!assSnap.exists()) throw new Error("Assessment template missing");
// //                         const assData = assSnap.data();
// //                         setAssessment(assData);

// //                         const targetLearnerUid = subData.learnerDeclaration?.learnerAuthUid || subData.authUid || subData.learnerId;
// //                         const learnerRef = doc(db, 'learners', subData.learnerId || targetLearnerUid);
// //                         const learnerSnap = await getDoc(learnerRef);

// //                         let lData = null;
// //                         if (learnerSnap.exists()) {
// //                             lData = learnerSnap.data();
// //                         } else {
// //                             const fallbackQ = query(collection(db, 'learners'), where('authUid', '==', targetLearnerUid));
// //                             const fallbackSnap = await getDocs(fallbackQ);
// //                             if (!fallbackSnap.empty) {
// //                                 lData = fallbackSnap.docs[0].data();
// //                             } else {
// //                                 const fallbackQ2 = query(collection(db, 'learners'), where('idNumber', '==', subData.learnerId));
// //                                 const fallbackSnap2 = await getDocs(fallbackQ2);
// //                                 if (!fallbackSnap2.empty) lData = fallbackSnap2.docs[0].data();
// //                             }
// //                         }

// //                         if (lData) {
// //                             setLearner(lData);
// //                             setLearnerProfile(lData);
// //                         }

// //                         if (subData.grading?.gradedBy) {
// //                             const assProfSnap = await getDoc(doc(db, 'users', subData.grading.gradedBy));
// //                             if (assProfSnap.exists()) setAssessorProfile(assProfSnap.data());
// //                         }

// //                         if (subData.moderation?.moderatedBy) {
// //                             const modProfSnap = await getDoc(doc(db, 'users', subData.moderation.moderatedBy));
// //                             if (modProfSnap.exists()) setModeratorProfile(modProfSnap.data());
// //                         }

// //                         const facId = subData.latestCoachingLog?.facilitatorId || subData.grading?.facilitatorId;
// //                         if (facId) {
// //                             const facProfSnap = await getDoc(doc(db, 'users', facId));
// //                             if (facProfSnap.exists()) setFacilitatorProfile(facProfSnap.data());
// //                         }

// //                         const historyRef = collection(db, 'learner_submissions', submissionId, 'history');
// //                         const historySnapshotsRes = await getDocs(query(historyRef));
// //                         const hData = historySnapshotsRes.docs.map(d => ({ id: d.id, ...d.data() } as any));
// //                         hData.sort((a: any, b: any) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
// //                         setHistorySnapshots(hData);

// //                         initialFacTimeRef.current = subData.grading?.facilitatorTimeSpent || 0;
// //                         initialAssTimeRef.current = subData.grading?.assessorTimeSpent || 0;
// //                         initialModTimeRef.current = subData.moderation?.timeSpent || 0;
// //                         sessionStartRef.current = performance.now();

// //                         let fBreakdown = subData.grading?.facilitatorBreakdown;
// //                         let aBreakdown = subData.grading?.assessorBreakdown;
// //                         let mBreakdown = subData.moderation?.breakdown;

// //                         const dbStatus = String(subData.status || '').toLowerCase();

// //                         const generateFreshBreakdown = (includeFeedback: boolean) => {
// //                             const fresh: Record<string, GradeData> = {};
// //                             assData.blocks?.forEach((block: any) => {
// //                                 if (block.type === 'mcq') {
// //                                     const isCorrect = subData.answers?.[block.id] === block.correctOption;
// //                                     fresh[block.id] = { score: isCorrect ? (block.marks || 0) : 0, feedback: includeFeedback ? (isCorrect ? 'Auto-graded: Correct' : 'Auto-graded: Incorrect') : '', isCorrect };
// //                                 } else if (block.type === 'text' || block.type === 'task' || block.type === 'code_sandbox') {
// //                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
// //                                 } else if (block.type === 'checklist') {
// //                                     const critInit = block.criteria?.map(() => ({ status: null, comment: '', startTime: '', endTime: '' })) || [];
// //                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null, criteriaResults: critInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
// //                                 } else if (block.type === 'logbook') {
// //                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null };
// //                                 } else if (block.type === 'qcto_workplace') {
// //                                     const actInit = block.workActivities?.map(() => ({ status: null, comment: '' })) || [];
// //                                     fresh[block.id] = { score: 0, feedback: '', isCorrect: null, activityResults: actInit, obsDate: '', obsStartTime: '', obsEndTime: '', obsDeclaration: false };
// //                                 }
// //                             });
// //                             return fresh;
// //                         };

// //                         if (!fBreakdown || Object.keys(fBreakdown).length === 0) {
// //                             if (subData.grading?.breakdown && Object.keys(subData.grading.breakdown).length > 0) fBreakdown = subData.grading.breakdown;
// //                             else fBreakdown = generateFreshBreakdown(true);
// //                         }
// //                         setFacBreakdown(fBreakdown);

// //                         if (!aBreakdown || Object.keys(aBreakdown).length === 0) {
// //                             if (['facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(dbStatus)) {
// //                                 aBreakdown = generateFreshBreakdown(false);
// //                                 assData.blocks?.forEach((b: any) => {
// //                                     if ((b.type === 'checklist' || b.type === 'qcto_workplace') && fBreakdown[b.id]) {
// //                                         aBreakdown[b.id] = { ...JSON.parse(JSON.stringify(fBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
// //                                     }
// //                                 });
// //                             } else {
// //                                 aBreakdown = {};
// //                             }
// //                         }
// //                         setAssBreakdown(aBreakdown);

// //                         if (!mBreakdown || Object.keys(mBreakdown).length === 0) {
// //                             if (['graded', 'moderated', 'returned', 'appealed'].includes(dbStatus)) {
// //                                 mBreakdown = generateFreshBreakdown(false);
// //                                 assData.blocks?.forEach((b: any) => {
// //                                     if ((b.type === 'checklist' || b.type === 'qcto_workplace') && aBreakdown[b.id]) {
// //                                         mBreakdown[b.id] = { ...JSON.parse(JSON.stringify(aBreakdown[b.id])), score: 0, feedback: '', isCorrect: null };
// //                                     }
// //                                 });
// //                             } else {
// //                                 mBreakdown = {};
// //                             }
// //                         }
// //                         setModBreakdown(mBreakdown);

// //                         setFacOverallFeedback(subData.grading?.facilitatorOverallFeedback || '');
// //                         setAssOverallFeedback(subData.grading?.assessorOverallFeedback || subData.grading?.overallFeedback || '');
// //                         setCompetency(subData.competency || null);
// //                         setModFeedback(subData.moderation?.feedback || '');
// //                         setModOutcome(subData.moderation?.outcome || null);
// //                         setLearnerTimeOverride(subData.learnerDurationOverride || '');

// //                         isInitialLoad = false;
// //                     }
// //                 } catch (err: any) {
// //                     toast.error(err.message || "Failed to load data.");
// //                 } finally {
// //                     setLoading(false);
// //                 }
// //             },
// //             (err) => {
// //                 console.warn("Submission review snapshot error caught:", err.message);
// //                 setLoading(false);
// //             }
// //         );

// //         return () => unsubscribe();
// //     }, [submissionId]);

// //     const groupSessionKey = useMemo(() => `group_obs_${assessment?.id}_${submission?.cohortId}_${user?.uid}`, [assessment?.id, submission?.cohortId, user?.uid]);

// //     useEffect(() => {
// //         if (!groupSessionKey) return;
// //         const saved = localStorage.getItem(groupSessionKey);
// //         if (saved) {
// //             try {
// //                 const parsed = JSON.parse(saved);
// //                 if (parsed.isGroupSessionActive) {
// //                     setSelectedGroupPeers(parsed.selectedGroupPeers || []);
// //                     setGroupMatrixGrades(parsed.groupMatrixGrades || {});
// //                     setGroupTimeMatrix(parsed.groupTimeMatrix || {});
// //                     setGroupRemarks(parsed.groupRemarks || '');
// //                     setIsGroupSessionActive(true);
// //                 }
// //             } catch (e) {
// //                 console.error("Failed to parse local group session cache", e);
// //             }
// //         }
// //     }, [groupSessionKey]);

// //     useEffect(() => {
// //         if (!groupSessionKey) return;
// //         if (isGroupSessionActive || selectedGroupPeers.length > 0) {
// //             localStorage.setItem(groupSessionKey, JSON.stringify({
// //                 selectedGroupPeers,
// //                 groupMatrixGrades,
// //                 groupTimeMatrix,
// //                 groupRemarks,
// //                 isGroupSessionActive
// //             }));
// //         }
// //     }, [selectedGroupPeers, groupMatrixGrades, groupTimeMatrix, groupRemarks, isGroupSessionActive, groupSessionKey]);

// //     const getFacTime = () => initialFacTimeRef.current + (canFacilitatorMark ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
// //     const getAssTime = () => initialAssTimeRef.current + (canGrade ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);
// //     const getModTime = () => initialModTimeRef.current + (canModerate ? Math.floor((performance.now() - sessionStartRef.current) / 1000) : 0);

// //     const resolveAssTime = () => assTimeOverride !== '' ? Number(assTimeOverride) * 60 : getAssTime();
// //     const resolveModTime = () => modTimeOverride !== '' ? Number(modTimeOverride) * 60 : getModTime();

// //     const groupCriteriaList = useMemo(() => {
// //         const list: any[] = [];
// //         if (!assessment?.blocks) return list;
// //         assessment.blocks.forEach((b: any) => {
// //             if (b.type === 'checklist') {
// //                 b.criteria?.forEach((crit: string, i: number) => {
// //                     list.push({ id: `${b.id}_${i}`, description: `[${b.title}] ${crit}`, blockId: b.id, index: i, type: 'checklist' });
// //                 });
// //             } else if (b.type === 'qcto_workplace') {
// //                 b.workActivities?.forEach((wa: any, i: number) => {
// //                     list.push({ id: `${b.id}_${i}`, description: `[${b.weCode}] ${wa.code}: ${wa.description}`, blockId: b.id, index: i, type: 'workplace' });
// //                 });
// //             }
// //         });
// //         return list;
// //     }, [assessment]);

// //     const handleOpenGroupMode = async () => {
// //         setIsFetchingPeers(true);
// //         try {
// //             const q = query(
// //                 collection(db, 'learner_submissions'),
// //                 where('assessmentId', '==', assessment.id),
// //                 where('cohortId', '==', submission.cohortId)
// //             );
// //             const snap = await getDocs(q);

// //             const peers: any[] = [];
// //             for (const docSnap of snap.docs) {
// //                 if (docSnap.id === submission.id) continue;
// //                 const subData = docSnap.data();

// //                 const st = subData.status?.toLowerCase();
// //                 if (['graded', 'moderated', 'appealed'].includes(st)) continue;

// //                 let peerName = subData.learnerDeclaration?.learnerName || 'Unknown Learner';
// //                 if (peerName === 'Unknown Learner' && subData.authUid) {
// //                     const uSnap = await getDoc(doc(db, 'users', subData.authUid));
// //                     if (uSnap.exists()) peerName = uSnap.data().fullName || peerName;
// //                 }

// //                 peers.push({ id: docSnap.id, name: peerName });
// //             }
// //             setAvailablePeers(peers);

// //             if (selectedGroupPeers.length === 0) {
// //                 setSelectedGroupPeers([{ id: submission.id, name: learner?.fullName || 'Current Learner' }]);
// //             }

// //             setShowGroupMatrix(true);
// //         } catch (e) {
// //             toast.error("Failed to fetch available peers for group observation.");
// //         } finally {
// //             setIsFetchingPeers(false);
// //         }
// //     };

// //     const handleDisbandGroupSession = () => {
// //         setModalConfig({
// //             isOpen: true,
// //             type: 'warning',
// //             title: 'Disband Group Session?',
// //             message: "Are you sure you want to disband this group session? Ongoing timers and unsaved grades will be cleared.",
// //             confirmText: 'Yes, Disband',
// //             onConfirm: () => {
// //                 setModalConfig(null);
// //                 setSelectedGroupPeers([]);
// //                 setGroupMatrixGrades({});
// //                 setGroupTimeMatrix({});
// //                 setGroupRemarks('');
// //                 setIsGroupSessionActive(false);
// //                 localStorage.removeItem(groupSessionKey);
// //                 setShowGroupMatrix(false);
// //                 toast.info("Group session disbanded.");
// //             },
// //             onCancel: () => setModalConfig(null)
// //         });
// //     };

// //     const handleSaveGroupMatrix = async () => {
// //         setSaving(true);
// //         try {
// //             const nowIso = new Date().toISOString();
// //             const batch = writeBatch(db);

// //             const allSubIds = new Set<string>();
// //             Object.values(groupMatrixGrades).forEach(critMap => {
// //                 Object.keys(critMap).forEach(subId => allSubIds.add(subId));
// //             });
// //             allSubIds.add(submission.id);

// //             for (const subId of Array.from(allSubIds)) {
// //                 const subRef = doc(db, 'learner_submissions', subId);

// //                 const individualSubSnap = await getDoc(subRef);
// //                 if (!individualSubSnap.exists()) continue;
// //                 const individualSubData = individualSubSnap.data();

// //                 const patchPayload: Record<string, any> = {
// //                     'grading.facilitatorOverallFeedback': groupRemarks,
// //                     'grading.facilitatorId': user?.uid,
// //                     'grading.facilitatorName': user?.fullName,
// //                     'grading.facilitatorRole': user?.role,
// //                     'grading.facilitatorSignatureUrl': user?.signatureUrl,
// //                     'grading.facilitatorReviewedAt': nowIso,
// //                     lastStaffEditAt: nowIso
// //                 };

// //                 let individualTaskMinutes = 0;

// //                 groupCriteriaList.forEach(crit => {
// //                     const isChecked = groupMatrixGrades[crit.id]?.[subId] || false;
// //                     const cellTime = groupTimeMatrix?.[crit.id]?.[subId] || {};
// //                     const baseBlockPath = `grading.facilitatorBreakdown.${crit.blockId}`;

// //                     if (crit.type === 'checklist') {
// //                         patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.status`] = isChecked ? 'C' : null;
// //                         if (cellTime.startTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.startTime`] = cellTime.startTime;
// //                         if (cellTime.endTime) patchPayload[`${baseBlockPath}.criteriaResults.${crit.index}.endTime`] = cellTime.endTime;
// //                     } else if (crit.type === 'workplace') {
// //                         patchPayload[`${baseBlockPath}.activityResults.${crit.index}.status`] = isChecked ? 'C' : null;
// //                     }

// //                     if (isChecked) {
// //                         patchPayload[`${baseBlockPath}.obsDeclaration`] = true;
// //                     }

// //                     if (cellTime.startTime && cellTime.endTime) {
// //                         const diffMs = new Date(cellTime.endTime).getTime() - new Date(cellTime.startTime).getTime();
// //                         if (diffMs > 0) individualTaskMinutes += Math.floor(diffMs / 60000);
// //                     }
// //                 });

// //                 if (individualTaskMinutes > 0) {
// //                     patchPayload['grading.facilitatorTimeSpent'] = individualTaskMinutes * 60;
// //                 } else if (subId === submission.id) {
// //                     patchPayload['grading.facilitatorTimeSpent'] = resolveFacTime();
// //                 }

// //                 if (!individualSubData.grading?.facilitatorStartedAt) {
// //                     patchPayload['grading.facilitatorStartedAt'] = nowIso;
// //                 }

// //                 const individualCurrentStatus = String(individualSubData.status || '').toLowerCase();
// //                 const newStatus = ['not_started', 'in_progress'].includes(individualCurrentStatus)
// //                     ? 'awaiting_learner_signoff'
// //                     : individualSubData.status;

// //                 patchPayload.status = newStatus;

// //                 batch.update(subRef, patchPayload);
// //             }

// //             await batch.commit();

// //             let activeFacBreakdown = { ...facBreakdown };

// //             groupCriteriaList.forEach(crit => {
// //                 if (!activeFacBreakdown[crit.blockId]) {
// //                     activeFacBreakdown[crit.blockId] = { score: 0, feedback: '', criteriaResults: [], activityResults: [] };
// //                 }

// //                 const isChecked = groupMatrixGrades[crit.id]?.[submission.id] || false;
// //                 const cellTime = groupTimeMatrix?.[crit.id]?.[submission.id] || {};

// //                 const targetBlock = activeFacBreakdown[crit.blockId];

// //                 if (crit.type === 'checklist') {
// //                     if (!targetBlock.criteriaResults) {
// //                         targetBlock.criteriaResults = [];
// //                     }

// //                     const critResults = targetBlock.criteriaResults;

// //                     while (critResults.length <= crit.index) {
// //                         critResults.push({ status: null, comment: '', startTime: '', endTime: '' });
// //                     }

// //                     const currentItem = critResults[crit.index];
// //                     if (currentItem) {
// //                         currentItem.status = isChecked ? 'C' : null;
// //                         if (cellTime.startTime) currentItem.startTime = cellTime.startTime;
// //                         if (cellTime.endTime) currentItem.endTime = cellTime.endTime;
// //                     }
// //                 }

// //                 if (isChecked) targetBlock.obsDeclaration = true;
// //             });

// //             setFacBreakdown(activeFacBreakdown);
// //             setFacOverallFeedback(groupRemarks);
// //             toast.success("Group metrics and individual task timers synchronized successfully!");

// //             setSelectedGroupPeers([]);
// //             setGroupMatrixGrades({});
// //             setGroupTimeMatrix({});
// //             setGroupRemarks('');
// //             setIsGroupSessionActive(false);
// //             localStorage.removeItem(groupSessionKey);
// //             setShowGroupMatrix(false);

// //         } catch (e) {
// //             console.error(e);
// //             toast.error("Failed to commit group matrix update configurations.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const handleFacOverallFeedbackChange = (val: string) => {
// //         if (!canFacilitatorMark) return;
// //         setFacOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, val, assOverallFeedback, modFeedback, competency, modOutcome);
// //     };

// //     const handleAssOverallFeedbackChange = (val: string) => {
// //         if (!canGrade) return;
// //         setAssOverallFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, val, modFeedback, competency, modOutcome);
// //     };

// //     const handleModFeedbackChange = (val: string) => {
// //         if (!canModerate) return;
// //         setModFeedback(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, val, competency, modOutcome);
// //     };

// //     const handleCompetencySelect = (val: 'C' | 'NYC') => {
// //         if (!canGrade) return;
// //         setCompetency(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, val, modOutcome);
// //     };

// //     const handleModOutcomeSelect = (val: 'Endorsed' | 'Returned') => {
// //         if (!canModerate) return;
// //         setModOutcome(val);
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, val);
// //     };

// //     const handleLearnerTimeOverrideChange = (val: string) => {
// //         const parsedVal = val === '' ? '' : Math.max(1, parseInt(val) || 0);
// //         setLearnerTimeOverride(parsedVal);
// //         setSubmission((prev: any) => ({ ...prev, learnerDurationOverride: parsedVal }));
// //         triggerAutoSave(facBreakdown, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //     };

// //     const triggerAutoSave = (fBreak: any, aBreak: any, mBreak: any, fOverall: string, aOverall: string, updatedModFeedback: string, updatedCompetency: string | null, updatedModOutcome: string | null) => {
// //         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
// //         setSaving(true);
// //         saveTimeoutRef.current = setTimeout(async () => {
// //             if (!submission?.id) return;
// //             try {
// //                 const updatePayload: any = {
// //                     'grading.facilitatorBreakdown': fBreak,
// //                     'grading.assessorBreakdown': aBreak,
// //                     'moderation.breakdown': mBreak,
// //                     'grading.facilitatorOverallFeedback': fOverall,
// //                     'grading.assessorOverallFeedback': aOverall,
// //                     'moderation.feedback': updatedModFeedback,
// //                     learnerDurationOverride: learnerTimeOverride === '' ? deleteField() : Number(learnerTimeOverride),
// //                     lastStaffEditAt: new Date().toISOString()
// //                 };
// //                 if (canGrade && updatedCompetency !== null) updatePayload.competency = updatedCompetency;
// //                 if (canModerate && updatedModOutcome !== null) updatePayload['moderation.outcome'] = updatedModOutcome;

// //                 if (canFacilitatorMark) updatePayload['grading.facilitatorTimeSpent'] = resolveFacTime();
// //                 if (canGrade) updatePayload['grading.assessorTimeSpent'] = resolveAssTime();
// //                 if (canModerate) updatePayload['moderation.timeSpent'] = resolveModTime();

// //                 const nowIso = new Date().toISOString();
// //                 if (canFacilitatorMark && !submission.grading?.facilitatorStartedAt) {
// //                     updatePayload['grading.facilitatorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, facilitatorStartedAt: nowIso } }));
// //                 }
// //                 if (canGrade && !submission.grading?.assessorStartedAt) {
// //                     updatePayload['grading.assessorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, grading: { ...prev.grading, assessorStartedAt: nowIso } }));
// //                 }
// //                 if (canModerate && !submission.moderation?.moderatorStartedAt) {
// //                     updatePayload['moderation.moderatorStartedAt'] = nowIso;
// //                     setSubmission((prev: any) => ({ ...prev, moderation: { ...prev.moderation, moderatorStartedAt: nowIso } }));
// //                 }
// //                 await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// //             } catch (error) { console.error("Auto-save failed:", error); } finally { setSaving(false); }
// //         }, 1500);
// //     };

// //     const computedLearnerDurationText = useMemo(() => {
// //         if (submission?.learnerDurationOverride) {
// //             return `${submission.learnerDurationOverride}m 0s (Manually Adjusted)`;
// //         }
// //         if (submission?.startedAt && submission?.submittedAt) {
// //             const diffSecs = Math.floor((new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime()) / 1000);
// //             const h = Math.floor(diffSecs / 3600), m = Math.floor((diffSecs % 3600) / 60), s = diffSecs % 60;
// //             return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
// //         }
// //         return 'N/A';
// //     }, [submission?.startedAt, submission?.submittedAt, submission?.learnerDurationOverride]);

// //     const executeZeroGrade = () => {
// //         setModalConfig({
// //             isOpen: true,
// //             type: 'warning',
// //             title: 'Assign Zero-Grade?',
// //             message: "Are you sure you want to assign a Zero-Grade for this submission? This action cannot be undone.",
// //             confirmText: 'Yes, Assign Zero',
// //             onConfirm: async () => {
// //                 setModalConfig(null);
// //                 setSaving(true);
// //                 try {
// //                     const fallbackAssessorReg =
// //                         (user as any)?.assessorRegNumber ||
// //                         (user as any)?.assessorRegistrationNumber ||
// //                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'graded',
// //                         marks: 0,
// //                         competency: 'NYC',
// //                         'grading.assessorOverallFeedback': submission?.systemNote || 'Unexcused Absence / Security Violation: Learner failed to complete the assessment successfully.',
// //                         'grading.gradedBy': user?.uid,
// //                         'grading.assessorName': user?.fullName,
// //                         'grading.assessorSignatureUrl': user?.signatureUrl,
// //                         'grading.assessorRegNumber': fallbackAssessorReg,
// //                         'grading.gradedAt': new Date().toISOString(),
// //                         lastStaffEditAt: new Date().toISOString()
// //                     });
// //                     toast.success("Zero-Grade officially assigned.");
// //                     setTimeout(() => window.location.reload(), 1000);
// //                 } catch (e) {
// //                     toast.error("Failed to apply zero grade.");
// //                 } finally {
// //                     setSaving(false);
// //                 }
// //             },
// //             onCancel: () => setModalConfig(null)
// //         });
// //     };

// //     const handleReopenMissedAssessment = () => {
// //         setShowExcuseModal(true);
// //     };

// //     const executeExcuseAndReopen = async (excuseReason: string) => {
// //         setShowExcuseModal(false);
// //         setSaving(true);

// //         try {
// //             const timestampIso = new Date().toISOString();

// //             const excuseLogEntry = {
// //                 excusedAt: timestampIso,
// //                 excusedBy: user?.uid,
// //                 excusedByName: user?.fullName || 'Staff Member',
// //                 excusedByRole: user?.role || 'facilitator',
// //                 reason: excuseReason,
// //                 previousStatus: currentStatus,
// //                 previousSystemNote: submission?.systemNote || null
// //             };

// //             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
// //             await setDoc(historyRef, {
// //                 ...submission,
// //                 archivedAt: timestampIso,
// //                 snapshotReason: `Attempt Restarted - Internet/Tech Failure Excused`
// //             });

// //             const subRef = doc(db, 'learner_submissions', submission.id);
// //             await updateDoc(subRef, {
// //                 status: 'not_started',
// //                 overrideUnlock: true,
// //                 startedAt: deleteField(),
// //                 submittedAt: deleteField(),
// //                 attemptNumber: (submission.attemptNumber || 1) + 1,
// //                 systemNote: `Excused & Restarted by ${user?.fullName || 'Staff'}: "${excuseReason}"`,
// //                 excusedLogs: arrayUnion(excuseLogEntry),
// //                 lastStaffEditAt: timestampIso
// //             });

// //             setSubmission((prev: any) => ({
// //                 ...prev,
// //                 status: 'not_started',
// //                 overrideUnlock: true,
// //                 attemptNumber: (prev.attemptNumber || 1) + 1,
// //                 systemNote: `Excused: ${excuseReason}`
// //             }));

// //             toast.success("Assessment excused and reopened for learner. Timer reset.");
// //         } catch (e) {
// //             console.error("Failed to excuse and reopen assessment:", e);
// //             toast.error("Failed to update submission record.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const grantExtraTime = async (minutes: number, reason: string = 'Staff granted extra time') => {
// //         setSaving(true);
// //         const targetSubId = submissionId || submission?.id;

// //         try {
// //             const subRef = doc(db, 'learner_submissions', targetSubId);
// //             const timestampIso = new Date().toISOString();
// //             const nowMs = Date.now();

// //             const extraTimeLog = {
// //                 grantedAt: timestampIso,
// //                 grantedBy: user?.uid,
// //                 grantedByName: user?.fullName || 'Staff',
// //                 minutesAdded: minutes,
// //                 reason: reason
// //             };

// //             const baseLimitMins = assessment?.moduleInfo?.timeLimit || 60;

// //             let usedBaseMins = baseLimitMins;
// //             if (submission?.startedAt) {
// //                 const startMs = new Date(submission.startedAt).getTime();
// //                 const endMs = submission?.submittedAt ? new Date(submission.submittedAt).getTime() : nowMs;
// //                 const diffMins = Math.floor((endMs - startMs) / 60000);
// //                 usedBaseMins = Math.min(baseLimitMins, Math.max(0, diffMins));
// //             }

// //             const newStartIso = new Date(nowMs - (usedBaseMins * 60 * 1000)).toISOString();

// //             const payload: any = {
// //                 status: 'in_progress',
// //                 extraTimeGranted: (submission?.extraTimeGranted || 0) + minutes,
// //                 extraTimeLogs: arrayUnion(extraTimeLog),
// //                 startedAt: newStartIso,
// //                 lastStaffEditAt: timestampIso
// //             };

// //             if (submission?.submittedAt || submission?.autoSubmitted) {
// //                 payload.previousSubmissionAudit = {
// //                     submittedAt: submission.submittedAt || null,
// //                     autoSubmitted: submission.autoSubmitted || false,
// //                     unlockedAt: timestampIso,
// //                     unlockedBy: user?.uid,
// //                     unlockedByName: user?.fullName || 'Staff'
// //                 };
// //                 payload.submittedAt = deleteField();
// //                 payload.autoSubmitted = deleteField();
// //             }

// //             await updateDoc(subRef, payload);

// //             setSubmission((prev: any) => {
// //                 const next = {
// //                     ...prev,
// //                     status: 'in_progress',
// //                     startedAt: newStartIso,
// //                     extraTimeGranted: (prev?.extraTimeGranted || 0) + minutes,
// //                     previousSubmissionAudit: payload.previousSubmissionAudit || prev?.previousSubmissionAudit
// //                 };
// //                 if (payload.submittedAt) delete next.submittedAt;
// //                 if (payload.autoSubmitted) delete next.autoSubmitted;
// //                 return next;
// //             });

// //             toast.success(`Granted ${minutes} extra minutes! Assessment unlocked and resumed.`);
// //             setShowExtraTimeModal(false);
// //         } catch (error: any) {
// //             console.error("❌ Extra time update failed:", error);
// //             toast.error(`Failed to grant extra time: ${error.message}`);
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const toggleDeferredAccess = async () => {
// //         setSaving(true);
// //         const newState = !submission.overrideUnlock;
// //         try {
// //             const subRef = doc(db, 'learner_submissions', submissionId!);
// //             const payload: any = {
// //                 overrideUnlock: newState,
// //                 lastStaffEditAt: new Date().toISOString()
// //             };

// //             await updateDoc(subRef, payload);
// //             setSubmission((prev: any) => ({
// //                 ...prev,
// //                 overrideUnlock: newState
// //             }));
// //             toast.success(newState ? "Deferred access granted. Assessment unlocked!" : "Deferred access revoked. Assessment locked.");
// //         } catch (error) {
// //             toast.error("Failed to update access settings.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const getActiveBreakdownData = (blockId: string) => {
// //         if (canFacilitatorMark) return { ...facBreakdown[blockId] };
// //         if (canGrade) return { ...assBreakdown[blockId] };
// //         if (canModerate) return { ...modBreakdown[blockId] };
// //         return null;
// //     };

// //     const setActiveBreakdownData = (blockId: string, newData: GradeData) => {
// //         if (canFacilitatorMark) {
// //             const next = { ...facBreakdown, [blockId]: newData };
// //             setFacBreakdown(next); triggerAutoSave(next, assBreakdown, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canGrade) {
// //             const next = { ...assBreakdown, [blockId]: newData };
// //             setAssBreakdown(next); triggerAutoSave(facBreakdown, next, modBreakdown, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         } else if (canModerate) {
// //             const next = { ...modBreakdown, [blockId]: newData };
// //             setModBreakdown(next); triggerAutoSave(facBreakdown, assBreakdown, next, facOverallFeedback, assOverallFeedback, modFeedback, competency, modOutcome);
// //         }
// //     };

// //     const handleVisualMark = (blockId: string, isCorrect: boolean, maxMarks: number) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         active.isCorrect = isCorrect;
// //         active.score = isCorrect ? maxMarks : 0;
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleScoreChange = (blockId: string, score: number, max: number) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         active.score = Math.min(Math.max(0, score), max);
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleFeedbackChange = (blockId: string, feedback: string) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         active.feedback = feedback;
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleCriterionChange = (blockId: string, index: number, field: keyof CriterionResult, value: any) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         const crits = [...(active.criteriaResults || [])];
// //         if (!crits[index]) crits[index] = { status: null, comment: '', startTime: '', endTime: '' };
// //         crits[index] = { ...crits[index], [field]: value };
// //         active.criteriaResults = crits;
// //         const block = assessment?.blocks?.find((b: any) => b.id === blockId);
// //         const total = block?.criteria?.length || 0;
// //         if (total > 0 && crits.length >= total && crits.slice(0, total).every((c: any) => c?.status)) {
// //             active.isCorrect = crits.slice(0, total).every((c: any) => c?.status === 'C');
// //         }
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleActivityStatusChange = (blockId: string, index: number, status: 'C' | 'NYC') => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         const activities = [...(active.activityResults || [])];
// //         if (!activities[index]) activities[index] = { status: null, comment: '' };
// //         activities[index].status = status;
// //         active.activityResults = activities;
// //         const block = assessment?.blocks?.find((b: any) => b.id === blockId);
// //         const total = block?.workActivities?.length || 0;
// //         if (total > 0 && activities.length >= total && activities.slice(0, total).every((a: any) => a?.status)) {
// //             active.isCorrect = activities.slice(0, total).every((a: any) => a?.status === 'C');
// //         }
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleActivityCommentChange = (blockId: string, index: number, comment: string) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         const activities = [...(active.activityResults || [])];
// //         if (!activities[index]) activities[index] = { status: null, comment: '' };
// //         activities[index].comment = comment;
// //         active.activityResults = activities;
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleGlobalChecklistChange = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime' | 'obsDeclaration', value: any) => {
// //         const active = getActiveBreakdownData(blockId);
// //         if (!active) return;
// //         (active as any)[field] = value;
// //         setActiveBreakdownData(blockId, active);
// //     };

// //     const handleSetToNow = (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime') => {
// //         if (field === 'obsDate') handleGlobalChecklistChange(blockId, field, moment().format('YYYY-MM-DD'));
// //         else handleGlobalChecklistChange(blockId, field, moment().format('HH:mm'));
// //     };

// //     const executeReturnToLearner = async (reason: string) => {
// //         setShowReturnToLearnerModal(false);
// //         setSaving(true);
// //         try {
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                 status: 'in_progress',
// //                 mentorReturnReason: reason,
// //                 mentorReturnedAt: new Date().toISOString(),
// //                 mentorReturnedBy: user?.uid,
// //                 mentorReturnedByName: user?.fullName,
// //                 lastStaffEditAt: new Date().toISOString(),
// //             });
// //             toast.success("Logbook returned to learner for correction.");
// //             setTimeout(() => navigate(-1), 1500);
// //         } catch (err) {
// //             toast.error("Failed to return logbook to learner.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
// //         setShowRemediationModal(false);
// //         setSaving(true);
// //         try {
// //             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
// //             await setDoc(historyRef, {
// //                 ...submission, archivedAt: new Date().toISOString(), snapshotReason: 'Remediation requested after NYC outcome',
// //                 coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
// //             });
// //             await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                 status: 'not_started',
// //                 startedAt: deleteField(),
// //                 competency: deleteField(),
// //                 grading: deleteField(),
// //                 moderation: deleteField(),
// //                 submittedAt: deleteField(),
// //                 learnerDeclaration: deleteField(),
// //                 attemptNumber: (submission.attemptNumber || 1) + 1,
// //                 lastStaffEditAt: new Date().toISOString(),
// //                 latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName, acknowledged: false }
// //             });
// //             toast.success("Workbook grading cleared and unlocked for learner!");
// //             setTimeout(() => navigate(-1), 1500);
// //         } catch (err) { toast.error("Failed to unlock for remediation."); } finally { setSaving(false); }
// //     };

// //     const executeAppealResolution = async (decision: 'overturn' | 'new_attempt' | 'reject', notes: string) => {
// //         setShowResolveAppealModal(false);
// //         setSaving(true);
// //         try {
// //             const historyRef = doc(collection(db, 'learner_submissions', submission.id, 'history'));
// //             await setDoc(historyRef, {
// //                 ...submission, archivedAt: new Date().toISOString(), snapshotReason: `Appeal Resolution: ${decision}`
// //             });

// //             const updatePayload: any = {
// //                 'appeal.status': decision === 'overturn' || decision === 'new_attempt' ? 'upheld' : 'rejected',
// //                 'appeal.resolutionNotes': notes,
// //                 'appeal.resolvedBy': user?.uid,
// //                 'appeal.resolvedByName': user?.fullName,
// //                 'appeal.resolvedAt': new Date().toISOString(),
// //                 lastStaffEditAt: new Date().toISOString()
// //             };

// //             if (decision === 'overturn') {
// //                 updatePayload.status = 'moderated';
// //                 updatePayload.competency = 'C';
// //                 updatePayload['moderation.outcome'] = 'Endorsed';
// //                 updatePayload['moderation.feedback'] = `APPEAL UPHELD: ${notes}`;
// //             } else if (decision === 'new_attempt') {
// //                 updatePayload.status = 'not_started';
// //                 updatePayload.startedAt = deleteField();
// //                 updatePayload.competency = deleteField();
// //                 updatePayload.grading = deleteField();
// //                 updatePayload.moderation = deleteField();
// //                 updatePayload.submittedAt = deleteField();
// //                 updatePayload.learnerDeclaration = deleteField();
// //                 updatePayload.attemptNumber = (submission.attemptNumber || 1) + 1;
// //             } else if (decision === 'reject') {
// //                 updatePayload.status = 'moderated';
// //             }

// //             await updateDoc(doc(db, 'learner_submissions', submission.id), updatePayload);
// //             toast.success("Appeal resolved successfully!");
// //             setTimeout(() => window.location.reload(), 1500);
// //         } catch (err) {
// //             toast.error("Failed to resolve appeal.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const getTotals = (breakdown: Record<string, GradeData>) => {
// //         const score = Object.values(breakdown).reduce((sum, g) => sum + (Number(g.score) || 0), 0);
// //         const max = assessment?.totalMarks || 0;
// //         const pct = max > 0 ? Math.round((score / max) * 100) : 0;
// //         return { score, max, pct };
// //     };

// //     const facTotals = getTotals(facBreakdown);
// //     const assTotals = getTotals(assBreakdown);
// //     const modTotals = getTotals(modBreakdown);

// //     const autoSummedTaskMinutes = useMemo(() => {
// //         let totalMs = 0;
// //         Object.values(facBreakdown).forEach((grade: GradeData) => {
// //             (grade.criteriaResults || []).forEach((crit: CriterionResult) => {
// //                 if (crit.startTime && crit.endTime) {
// //                     const st = new Date(crit.startTime).getTime();
// //                     const et = new Date(crit.endTime).getTime();
// //                     if (et > st) totalMs += (et - st);
// //                 }
// //             });
// //         });
// //         return Math.floor(totalMs / 60000);
// //     }, [facBreakdown]);

// //     const showAssessorPanel = true;
// //     const showModeratorPanel = true;

// //     let activeTotals = facTotals;
// //     if (showAssessorPanel) activeTotals = assTotals;
// //     if (showModeratorPanel) activeTotals = modTotals;

// //     const resolveFacTime = () => {
// //         if (facTimeOverride !== '') return Number(facTimeOverride) * 60;
// //         if (autoSummedTaskMinutes > 0) return autoSummedTaskMinutes * 60;
// //         return getFacTime();
// //     };

// //     const sectionTotals: Record<string, { total: number, awarded: number }> = {};
// //     let currentSectionId = '';
// //     if (assessment?.blocks) {
// //         assessment.blocks.forEach((block: any) => {
// //             if (block.type === 'section') {
// //                 currentSectionId = block.id;
// //                 sectionTotals[currentSectionId] = { total: 0, awarded: 0 };
// //             } else if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox'].includes(block.type) && currentSectionId) {
// //                 const g = submission?.grading || {}; const m = submission?.moderation || {};
// //                 const mLayer = m.breakdown?.[block.id] || {}; const aLayer = g.assessorBreakdown?.[block.id] || {}; const fLayer = g.facilitatorBreakdown?.[block.id] || {};
// //                 const legacyLayer = g.breakdown?.[block.id] || { score: 0, isCorrect: null };
// //                 let activeLayer = legacyLayer;
// //                 if (isFacDone) activeLayer = fLayer;
// //                 if (isAssDone) activeLayer = aLayer;
// //                 if (isModDone) activeLayer = mLayer;
// //                 sectionTotals[currentSectionId].total += (Number(block.marks) || 0);
// //                 if (activeLayer.score !== undefined && activeLayer.score !== null) sectionTotals[currentSectionId].awarded += Number(activeLayer.score);
// //             }
// //         });
// //     }

// //     const validateMentorVerification = (): string | null => {
// //         if (!assessment?.blocks) return null;
// //         for (const block of assessment.blocks) {
// //             const grade = facBreakdown[block.id];
// //             if (block.type === 'checklist') {
// //                 const criteria = block.criteria || [];
// //                 const results = grade?.criteriaResults || [];
// //                 for (let i = 0; i < criteria.length; i++) {
// //                     if (!results[i]?.status) {
// //                         return `Please select "Observed ✓" or "Not Observed ✗" for every criterion in the checklist "${block.title}". Item ${i + 1} is still unverified.`;
// //                     }
// //                 }
// //                 if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
// //                     return `Please tick the verification declaration at the bottom of the checklist "${block.title}" before submitting.`;
// //                 }
// //             }
// //             if (block.type === 'qcto_workplace') {
// //                 const activities = block.workActivities || [];
// //                 const results = grade?.activityResults || [];
// //                 for (let i = 0; i < activities.length; i++) {
// //                     if (!results[i]?.status) {
// //                         return `Please select "Verified ✓" or "Not Verified ✗" for every Work Activity in "${block.weCode} – ${block.weTitle}". Activity ${i + 1} (${activities[i]?.code || `#${i + 1}`}) is still unverified.`;
// //                     }
// //                 }
// //                 if (block.requireObservationDeclaration !== false && !grade?.obsDeclaration) {
// //                     return `Please tick the workplace verification sign-off declaration at the bottom of "${block.weCode} – ${block.weTitle}" before submitting.`;
// //                 }
// //             }
// //         }
// //         return null;
// //     };

// //     const validateAllMarked = (breakdown: Record<string, GradeData>, isModerating: boolean = false) => {
// //         if (!assessment?.blocks) return true;
// //         const isAssessorGrading = canGrade;
// //         const unmarkedCount = assessment.blocks.filter((block: any) => {
// //             const grade = breakdown[block.id];

// //             if (isWorkplaceModule && (isAdmin || isFacilitator) && !isModerating) {
// //                 return false;
// //             }

// //             if (['mcq', 'text', 'task', 'code_sandbox'].includes(block.type)) {
// //                 return !grade || grade.isCorrect === null || grade.isCorrect === undefined;
// //             }

// //             if (block.type === 'checklist') {
// //                 const declarationRequired = !isModerating && block.requireObservationDeclaration
// //                     && !grade?.obsDeclaration
// //                     && !(isAssessorGrading && savedFacRole === 'mentor');
// //                 if (declarationRequired) return true;
// //                 const crits = grade?.criteriaResults || [];
// //                 const total = block.criteria?.length || 0;
// //                 for (let i = 0; i < total; i++) {
// //                     if (!crits[i] || !crits[i].status) return true;
// //                 }
// //                 const allHaveStatus = crits.slice(0, total).every((c: any) => c?.status);
// //                 if (!allHaveStatus) return true;
// //                 return false;
// //             }

// //             if (block.type === 'qcto_workplace') {
// //                 const declarationRequired = !isModerating && block.requireObservationDeclaration
// //                     && !grade?.obsDeclaration
// //                     && !(isAssessorGrading && savedFacRole === 'mentor');
// //                 if (declarationRequired) return true;

// //                 if (isMentor) return false;

// //                 const activities = grade?.activityResults || [];
// //                 const total = block.workActivities?.length || 0;
// //                 for (let i = 0; i < total; i++) {
// //                     if (!activities[i] || !activities[i].status) return true;
// //                 }
// //                 const allHaveStatus = activities.slice(0, total).every((a: any) => a?.status);
// //                 if (!allHaveStatus) return true;
// //                 return false;
// //             }

// //             return false;
// //         }).length;
// //         return unmarkedCount === 0;
// //     };

// //     const triggerSubmitFacilitator = () => {
// //         if (isMentor) {
// //             const mentorValidationError = validateMentorVerification();
// //             if (mentorValidationError) {
// //                 return setModalConfig({
// //                     isOpen: true, type: 'warning', title: 'Incomplete Verification',
// //                     message: mentorValidationError,
// //                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
// //                 });
// //             }
// //             if (!facOverallFeedback.trim()) {
// //                 return setModalConfig({
// //                     isOpen: true, type: 'warning', title: 'Supervisor Comments Required',
// //                     message: 'Please add your overall Supervisor Comments before verifying this logbook.',
// //                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
// //                 });
// //             }
// //         } else {
// //             if (!validateAllMarked(facBreakdown, false)) {
// //                 return setModalConfig({
// //                     isOpen: true, type: 'warning', title: 'Incomplete Marking',
// //                     message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.',
// //                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
// //                 });
// //             }
// //             if (!facOverallFeedback.trim()) {
// //                 return setModalConfig({
// //                     isOpen: true, type: 'warning', title: 'Missing Remarks',
// //                     message: 'You must provide Overall Facilitator Remarks before sending this script forward.',
// //                     confirmText: 'Got it', onConfirm: () => setModalConfig(null)
// //                 });
// //             }
// //         }

// //         let newStatus = 'facilitator_reviewed';
// //         let confirmTitle = isWorkplaceModule ? 'Complete Mentor Verification?' : 'Complete Pre-Marking?';
// //         let confirmMessage = isWorkplaceModule ? 'This will finalize your verification and send the logbook to the Assessor.' : 'This will finalize your feedback and send the workbook to the Assessor.';
// //         let confirmBtnText = 'Send to Assessor';

// //         if (['not_started', 'in_progress'].includes(currentStatus)) {
// //             if (hasChecklists || hasWorkplace) {
// //                 newStatus = 'awaiting_learner_signoff';
// //                 confirmTitle = isWorkplaceModule ? 'Request Learner Sign-off?' : 'Request Learner Sign-off?';
// //                 confirmMessage = isWorkplaceModule
// //                     ? 'This will save your verification and prompt the learner to log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.'
// //                     : 'This will save your practical observation and prompt the learner to log in, review your feedback, and officially sign off before it goes to the Assessor.';
// //                 confirmBtnText = isWorkplaceModule ? 'Save & Request Learner Signature' : 'Save & Request Sign-off';
// //             } else {
// //                 confirmTitle = isWorkplaceModule ? 'Force Verify?' : 'Force Submission?';
// //                 confirmMessage = isWorkplaceModule
// //                     ? 'The learner has not formally submitted yet. Verifying now will lock the logbook for the learner and pass it directly to the Assessor. Proceed?'
// //                     : 'The learner has not submitted this workbook yet. Finalising your marking now will lock the workbook and pass it to the Assessor. Proceed?';
// //                 confirmBtnText = isWorkplaceModule ? 'Verify & Force Submit' : 'Force Submit & Send';
// //             }
// //         }

// //         setModalConfig({
// //             isOpen: true, type: 'info', title: confirmTitle, message: confirmMessage, confirmText: confirmBtnText,
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: newStatus,
// //                         'grading.facilitatorBreakdown': facBreakdown,
// //                         'grading.facilitatorOverallFeedback': facOverallFeedback,
// //                         'grading.facilitatorId': user?.uid,
// //                         'grading.facilitatorName': user?.fullName,
// //                         'grading.facilitatorRole': user?.role,
// //                         'grading.facilitatorSignatureUrl': user?.signatureUrl,
// //                         'grading.facilitatorReviewedAt': new Date().toISOString(),
// //                         'grading.facilitatorTimeSpent': resolveFacTime()
// //                     });
// //                     if (newStatus === 'awaiting_learner_signoff') {
// //                         toast.success(isWorkplaceModule ? "Verification saved! Learner has been requested to sign the logbook." : "Observation saved! Learner has been requested to sign off.");
// //                     } else {
// //                         toast.success(isWorkplaceModule ? "Logbook verified and passed to Assessor!" : "Script marked and passed to Assessor!");
// //                     }
// //                     setTimeout(() => navigate(-1), 2000);
// //                 } catch (error) { toast.error("Failed to save."); } finally { setSaving(false); }
// //             }, onCancel: () => setModalConfig(null)
// //         });
// //     };

// //     const triggerSubmitGrade = () => {
// //         if (!validateAllMarked(assBreakdown, false)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete Grading', message: 'You must evaluate every question and fully complete all checklists and workplace checkpoints (including declarations) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
// //         if (!competency) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Competency', message: 'You must select a Final Competency (C or NYC) before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
// //         if (!assOverallFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Remarks', message: 'You must provide Assessor Remarks justifying your final outcome before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

// //         setModalConfig({
// //             isOpen: true, type: 'warning', title: 'Finalise Grade?', message: 'This will apply your digital Red Pen signature and notify Internal Moderation. This action cannot be undone.', confirmText: 'Apply Signature & Submit',
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     const fallbackAssessorReg =
// //                         (user as any)?.assessorRegNumber ||
// //                         (user as any)?.assessorRegistrationNumber ||
// //                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: 'graded', marks: assTotals.score, competency,
// //                         'grading.assessorBreakdown': assBreakdown, 'grading.assessorOverallFeedback': assOverallFeedback,
// //                         'grading.gradedBy': user?.uid, 'grading.assessorName': user?.fullName,
// //                         'grading.assessorSignatureUrl': user?.signatureUrl,
// //                         'grading.assessorRegNumber': fallbackAssessorReg,
// //                         'grading.gradedAt': new Date().toISOString(),
// //                         'grading.assessorTimeSpent': resolveAssTime()
// //                     });
// //                     toast.success("Workbook graded and signed successfully!"); setTimeout(() => window.location.reload(), 500);
// //                 } catch (error) { toast.error("Failed to save grades."); } finally { setSaving(false); }
// //             }, onCancel: () => setModalConfig(null)
// //         });
// //     };

// //     const triggerSubmitModeration = () => {
// //         if (!modOutcome) return setModalConfig({ isOpen: true, type: 'warning', title: 'Missing Decision', message: 'You must select Endorse or Return to Assessor before submitting.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
// //         if (modOutcome === 'Returned' && !modFeedback.trim()) return setModalConfig({ isOpen: true, type: 'warning', title: 'Green Pen Instructions Required', message: 'You must provide Green Pen instructions explaining what the Assessor needs to fix before this can be returned.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });
// //         if (!isWorkplaceModule && !validateAllMarked(modBreakdown, true)) return setModalConfig({ isOpen: true, type: 'warning', title: 'Incomplete QA', message: 'You must verify every question and fully check all blocks before endorsing.', confirmText: 'Got it', onConfirm: () => setModalConfig(null) });

// //         setModalConfig({
// //             isOpen: true, type: 'info',
// //             title: modOutcome === 'Returned' ? 'Return to Assessor?' : 'Endorse & Finalise?',
// //             message: modOutcome === 'Returned'
// //                 ? 'This will return the workbook to the Assessor with your Green Pen instructions. The Assessor must address your concerns before re-submitting.'
// //                 : 'This will apply your Green Pen signature and endorse the Assessor\'s judgment. The learner\'s result will be locked in for the QCTO verifier.',
// //             confirmText: modOutcome === 'Returned' ? 'Confirm Return' : 'Confirm Endorsement',
// //             onConfirm: async () => {
// //                 setModalConfig(null); setSaving(true);
// //                 try {
// //                     const fallbackModReg =
// //                         (user as any)?.moderatorRegNumber ||
// //                         (user as any)?.assessorRegNumber ||
// //                         ((user as any)?.idNumber ? `ID: ${(user as any).idNumber}` : `ADMIN-OVERRIDE (${user?.fullName})`);

// //                     const newStatus = modOutcome === 'Returned' ? 'returned' : 'moderated';

// //                     await updateDoc(doc(db, 'learner_submissions', submission.id), {
// //                         status: newStatus, 'moderation.breakdown': modBreakdown, 'moderation.outcome': modOutcome,
// //                         'moderation.feedback': modFeedback, 'moderation.moderatedBy': user?.uid,
// //                         'moderation.moderatorName': user?.fullName,
// //                         'moderation.moderatorSignatureUrl': user?.signatureUrl,
// //                         'moderation.moderatorRegNumber': fallbackModReg,
// //                         'moderation.moderatedAt': new Date().toISOString(),
// //                         'moderation.timeSpent': resolveModTime()
// //                     });
// //                     toast.success("Moderation saved successfully!"); setTimeout(() => navigate(-1), 1000);
// //                 } catch (error) { toast.error("Failed to save moderation."); } finally { setSaving(false); }
// //             }, onCancel: () => setModalConfig(null)
// //         });
// //     };

// //     if (loading) return (
// //         <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
// //             <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
// //                 <div className="ap-spinner" />
// //                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}> Loading Record...</span>
// //             </div>
// //         </div>
// //     );

// //     if (!submission || !assessment) return <div className="sr-loading">Data unavailable.</div>;

// //     const printOutcomeColor = submission.competency === 'C' ? 'green' : (submission.competency === 'NYC' ? 'red' : 'black');
// //     const printInkColor = isModDone ? 'green' : (isAssDone ? 'red' : 'blue');
// //     const canPrint = !['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus);

// //     const getFacilitatorStatus = () => {
// //         if (isFacDone) return 'done';
// //         if (canFacilitatorMark) return 'active';
// //         if (isAwaitingSignoff) return 'awaiting';
// //         if (['not_started', 'in_progress', 'missed', 'violation'].includes(currentStatus)) return 'locked';
// //         return 'awaiting';
// //     };

// //     const getAssessorStatus = () => {
// //         if (isAssDone) return 'done';
// //         if (canGrade) return 'active';
// //         if (['not_started', 'in_progress', 'submitted', 'awaiting_learner_signoff'].includes(currentStatus)) return 'locked';
// //         return 'awaiting';
// //     };

// //     const getModeratorStatus = () => {
// //         if (isModDone) return 'done';
// //         if (canModerate) return 'active';
// //         if (currentStatus !== 'graded') return 'locked';
// //         return 'awaiting';
// //     };

// //     const facPanelStatus = getFacilitatorStatus();
// //     const assPanelStatus = getAssessorStatus();
// //     const modPanelStatus = getModeratorStatus();

// //     const violationHistoryCount = proctorSession?.violationHistory?.length || submission?.violationHistory?.length || 0;

// //     const isProctoredAssessment = Boolean(
// //         assessment?.requiresInvigilation || assessment?.isProctored || assessment?.proctored || assessment?.isInvigilated || assessment?.proctoring
// //     );
// //     const showProctoringAuditCard = isViolation || isProctoredAssessment || violationHistoryCount > 0;

// //     return (
// //         <div className="sr-root animate-fade-in" style={{ width: '100%', position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {modalConfig && modalConfig.isOpen && createPortal(
// //                 <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} onClose={modalConfig.onConfirm} onCancel={modalConfig.onCancel} />,
// //                 document.body
// //             )}

// //             {showRemediationModal && createPortal(
// //                 <RemediationModal submissionTitle={submission.title} attemptNumber={currentAttempt} onClose={() => setShowRemediationModal(false)} onSubmit={executeRemediation} />,
// //                 document.body
// //             )}

// //             {showReturnToLearnerModal && createPortal(
// //                 <ReturnToLearnerModal onClose={() => setShowReturnToLearnerModal(false)} onSubmit={executeReturnToLearner} />,
// //                 document.body
// //             )}

// //             {showResolveAppealModal && createPortal(
// //                 <ResolveAppealModal appealReason={submission.appeal?.reason || ''} onClose={() => setShowResolveAppealModal(false)} onSubmit={executeAppealResolution} />,
// //                 document.body
// //             )}

// //             {showProctorEvidenceModal && (
// //                 <SubmissionProctorEvidenceModal submission={submission} onClose={() => setShowProctorEvidenceModal(false)} />
// //             )}

// //             {showExcuseModal && createPortal(
// //                 <ExcuseReopenModal
// //                     learnerName={learner?.fullName || submission?.learnerDeclaration?.learnerName || 'Learner'}
// //                     onClose={() => setShowExcuseModal(false)}
// //                     onSubmit={executeExcuseAndReopen}
// //                 />,
// //                 document.body
// //             )}

// //             {showExtraTimeModal && (
// //                 <ExtraTimeModal
// //                     onClose={() => setShowExtraTimeModal(false)}
// //                     onSubmit={grantExtraTime}
// //                 />
// //             )}

// //             {showGroupMatrix && createPortal(
// //                 <GroupObservationMatrix
// //                     currentLearner={{ id: submission.id, name: learner?.fullName || 'Current Learner' }}
// //                     availablePeers={availablePeers}
// //                     criteria={groupCriteriaList}
// //                     selectedGroup={selectedGroupPeers}
// //                     setSelectedGroup={setSelectedGroupPeers}
// //                     matrix={groupMatrixGrades}
// //                     setMatrix={setGroupMatrixGrades}
// //                     groupTimeMatrix={groupTimeMatrix}
// //                     setGroupTimeMatrix={setGroupTimeMatrix}
// //                     groupRemarks={groupRemarks}
// //                     setGroupRemarks={setGroupRemarks}
// //                     isGroupSessionActive={isGroupSessionActive}
// //                     setIsGroupSessionActive={setIsGroupSessionActive}
// //                     onCancel={() => setShowGroupMatrix(false)}
// //                     onDisband={handleDisbandGroupSession}
// //                     onSaveGroup={handleSaveGroupMatrix}
// //                 />,
// //                 document.body
// //             )}

// //             <div className="ap-player-topbar no-print">
// //                 <div className="ap-player-topbar__left">
// //                     <button className="sr-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Portfolio</button>
// //                     <div className="ap-player-topbar__separator" />
// //                     <h1 className="ap-player-topbar__title">
// //                         {assessment.title}
// //                         {submission?.attemptNumber > 1 && (
// //                             <span style={{ marginLeft: '10px', fontSize: '0.75rem', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle' }}>
// //                                 Attempt {submission.attemptNumber}
// //                             </span>
// //                         )}
// //                         {isAppealUpheld && (
// //                             <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                 <Scale size={12} /> Appeal Granted
// //                             </span>
// //                         )}
// //                         {isMentor && (
// //                             <span style={{ marginLeft: '8px', fontSize: '0.72rem', background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '12px', verticalAlign: 'middle', fontFamily: 'var(--font-heading)' }}>
// //                                 MENTOR VIEW
// //                             </span>
// //                         )}
// //                     </h1>
// //                 </div>
// //                 <div className="ap-player-topbar__right">
// //                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
// //                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
// //                             <FileArchive size={13} /> View Manual
// //                         </button>
// //                     )}

// //                     {isAdminOrFacilitator && assessment?.moduleInfo?.timeLimit > 0 && (
// //                         <button
// //                             type="button"
// //                             className="ap-topbar-print-btn"
// //                             onClick={() => !disableExtraTime && setShowExtraTimeModal(true)}
// //                             disabled={disableExtraTime}
// //                             title={disableExtraTime ? "Extra time cannot be granted after grading or 48 hours post-attempt." : "Grant extra time"}
// //                             style={{
// //                                 background: disableExtraTime ? '#f1f5f9' : '#e0f2fe',
// //                                 color: disableExtraTime ? '#94a3b8' : '#0369a1',
// //                                 borderColor: disableExtraTime ? '#e2e8f0' : '#bae6fd',
// //                                 fontWeight: 'bold',
// //                                 cursor: disableExtraTime ? 'not-allowed' : 'pointer',
// //                                 opacity: disableExtraTime ? 0.7 : 1
// //                             }}
// //                         >
// //                             <Timer size={14} style={{ marginRight: '4px' }} /> <span className="ap-hide-mobile">Add Time</span>
// //                         </button>
// //                     )}

// //                     {canPrint && (
// //                         <button className="ap-topbar-print-btn sr-print-btn" onClick={() => window.print()}>
// //                             <Printer size={13} /> Print Audit
// //                         </button>
// //                     )}
// //                     <span className={`ap-save-indicator${saving ? ' ap-save-indicator--saving' : ''}`}>
// //                         {saving ? <><Loader2 className="ap-spinner-icon animate-spin" size={12} /> Saving…</> : <><CheckCircle size={12} /> Auto-saved</>}
// //                     </span>
// //                 </div>
// //             </div>

// //             <div className="sr-print-wrap">
// //                 <div className="print-only-cover">
// //                     <div className="print-page">
// //                         <h1 style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '10px' }}>
// //                             {assessment?.moduleInfo?.moduleName || assessment?.title || 'MODULE ASSESSMENT'}, NQF LEVEL {assessment?.moduleInfo?.nqfLevel || 'N/A'}, CREDITS {assessment?.moduleInfo?.credits || 'N/A'}
// //                         </h1>
// //                         <h2 style={{ textAlign: 'center', marginBottom: '8mm', textDecoration: 'underline' }}>
// //                             LEARNER WORKBOOK {submission?.attemptNumber > 1 ? `- ATTEMPT #${submission.attemptNumber}` : ''}
// //                         </h2>
// //                         <table className="print-table" style={{ width: '100%', marginBottom: '8mm' }}>
// //                             <tbody>
// //                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Module #</td><td>{assessment?.moduleInfo?.moduleNumber || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>NQF Level</td><td>Level {assessment?.moduleInfo?.nqfLevel || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Notional hours</td><td>{assessment?.moduleInfo?.notionalHours || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Credit(s)</td><td>Cr {assessment?.moduleInfo?.credits || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Occupational Code</td><td>{assessment?.moduleInfo?.occupationalCode || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>SAQA QUAL ID</td><td>{assessment?.moduleInfo?.saqaId || 'N/A'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Qualification Title</td><td>{assessment?.moduleInfo?.qualificationTitle || 'N/A'}</td></tr>
// //                             </tbody>
// //                         </table>
// //                         <h3>CONTACT INFORMATION:</h3>
// //                         <table className="print-table" style={{ width: '100%' }}>
// //                             <tbody>
// //                                 <tr><td style={{ width: '40%', fontWeight: 'bold' }}>Name</td><td>{submission?.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Email Address</td><td>{learnerProfile?.email || learner?.email || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Contact Address</td><td>{learnerProfile?.address || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (H)</td><td>{learnerProfile?.telephoneHome || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Telephone (W)</td><td>{learnerProfile?.telephoneWork || '________________________'}</td></tr>
// //                                 <tr><td style={{ fontWeight: 'bold' }}>Cellular</td><td>{learnerProfile?.phone || learnerProfile?.cellular || '________________________'}</td></tr>
// //                             </tbody>
// //                         </table>
// //                     </div>

// //                     <div className="print-page">
// //                         <h3>Note to the learner</h3>
// //                         <p>{assessment?.instructions || 'This Learner Guide provides a comprehensive overview of the module.'}</p>
// //                         <h3>Purpose</h3>
// //                         <p>{assessment?.purpose || 'The main focus of the learning in this knowledge module is to build an understanding of the concepts related to this subject matter.'}</p>
// //                         <h3>Topic elements to be covered include</h3>
// //                         <table className="print-table no-border" style={{ width: '100%' }}>
// //                             <tbody>
// //                                 {assessment?.moduleInfo?.topics && assessment.moduleInfo.topics.length > 0
// //                                     ? assessment.moduleInfo.topics.map((topic: any, idx: number) => (
// //                                         <tr key={idx}><td>{topic.code ? <strong>{topic.code}: </strong> : ''}{topic.title || topic.name}</td><td style={{ width: '15%' }}>{topic.weight || topic.percentage}%</td></tr>
// //                                     ))
// //                                     : assessment?.blocks?.filter((b: any) => b.type === 'section').map((sec: any, idx: number) => {
// //                                         const secTotal = sectionTotals[sec.id]?.total || 0;
// //                                         const pct = assessment.totalMarks ? Math.round((secTotal / assessment.totalMarks) * 100) : 0;
// //                                         return <tr key={idx}><td><strong>Section {idx + 1}: </strong>{sec.title}</td><td style={{ width: '15%' }}>{secTotal > 0 ? `${pct}%` : '—'}</td></tr>;
// //                                     })
// //                                 }
// //                             </tbody>
// //                         </table>
// //                     </div>

// //                     <div className="print-page">
// //                         <h3>Entry Requirements</h3>
// //                         <p>{assessment?.moduleInfo?.entryRequirements || `NQF Level ${assessment?.moduleInfo?.nqfLevel || 'N/A'}`}</p>
// //                         <h3>Provider Accreditation Requirements</h3>
// //                         <p><strong>Physical Requirements:</strong><br />{assessment?.moduleInfo?.physicalRequirements || 'The provider must have structured learning material.'}</p>
// //                         <h3>Human Resource Requirements</h3>
// //                         <ul>
// //                             <li>Lecturer/learner ratio of {assessment?.moduleInfo?.lecturerRatio || '1:20'} (Maximum)</li>
// //                             <li>Assessors and moderators: accredited by the relevant SETA</li>
// //                         </ul>
// //                         <h3>Exemptions</h3>
// //                         <p>{assessment?.moduleInfo?.exemptions || 'No exemptions, but the module can be achieved in full through a normal RPL process.'}</p>
// //                         <h3>Venue, Date and Time</h3>
// //                         <p><strong>Venue:</strong> {assessment?.moduleInfo?.venue || 'mLab Online Assessment Platform'}</p>
// //                         <p><strong>Date Commenced:</strong> {submission?.startedAt ? new Date(submission.startedAt).toLocaleDateString() : 'N/A'}</p>
// //                     </div>

// //                     {submission?.attemptNumber > 1 && submission?.latestCoachingLog && (
// //                         <div className="print-page">
// //                             <h3>Record of Developmental Intervention (Remediation)</h3>
// //                             <p style={{ marginBottom: '15px' }}>This section serves as official evidence that a developmental intervention was conducted prior to the learner's Attempt #{submission.attemptNumber}, in compliance with QCTO and SETA remediation policies.</p>

// //                             <table className="print-table" style={{ width: '100%', marginBottom: '30px' }}>
// //                                 <tbody>
// //                                     <tr><td style={{ width: '30%', fontWeight: 'bold' }}>Attempt Number</td><td>Attempt #{submission.attemptNumber}</td></tr>
// //                                     <tr><td style={{ fontWeight: 'bold' }}>Date of Coaching</td><td>{new Date(submission.latestCoachingLog.date).toLocaleDateString()}</td></tr>
// //                                     <tr><td style={{ fontWeight: 'bold' }}>Facilitator</td><td>{submission.latestCoachingLog.facilitatorName}</td></tr>
// //                                     <tr><td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>Coaching Notes</td><td style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{submission.latestCoachingLog.notes}</td></tr>
// //                                 </tbody>
// //                             </table>

// //                             <div className="sr-signature-block" style={{ marginTop: '40px', justifyContent: 'flex-start', gap: '2rem' }}>
// //                                 <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue', flex: '0 1 300px' }}>
// //                                     <span style={{ color: 'blue' }}>Facilitator Declaration</span>
// //                                     {(submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
// //                                         <img src={submission.latestCoachingLog.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
// //                                     ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
// //                                     <strong style={{ color: 'blue' }}>{submission.latestCoachingLog.facilitatorName}</strong>
// //                                     <em style={{ color: 'blue' }}>Logged: {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</em>
// //                                     <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>Coaching Conducted</div>
// //                                 </div>
// //                                 <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black', flex: '0 1 300px' }}>
// //                                     <span style={{ color: 'black' }}>Learner Acknowledgement</span>
// //                                     {submission.latestCoachingLog.acknowledged ? (
// //                                         <>
// //                                             {(submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl) ? (
// //                                                 <img src={submission.latestCoachingLog.learnerSignatureUrl || learnerProfile?.signatureUrl} alt="Learner Signature" crossOrigin="anonymous" style={filterBlack} />
// //                                             ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
// //                                             <strong style={{ color: 'black' }}>{learner?.fullName || learnerProfile?.fullName}</strong>
// //                                             <em style={{ color: 'black' }}>Acknowledged: {new Date(submission.latestCoachingLog.acknowledgedAt).toLocaleDateString()}</em>
// //                                             <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Intervention Received</div>
// //                                         </>
// //                                     ) : (
// //                                         <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
// //                                             <div className="sr-sig-no-image" style={{ color: 'black', border: 'none' }}>Pending Signature</div>
// //                                             <div className="sr-sig-line" style={{ borderTopColor: 'black', width: '80%', marginTop: '10px' }}>Awaiting Learner</div>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>

// //                 <div className="sr-print-header">
// //                     <div className="sr-print-header-info">
// //                         <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
// //                             <div>
// //                                 <p><strong>Learner Name:</strong> {learner?.fullName}</p>
// //                                 <p><strong>ID Number:</strong> {submission.learnerDeclaration?.learnerIdNumber || learner?.idNumber}</p>
// //                                 <p><strong>Submitted:</strong> {isSubmitted ? new Date(submission.submittedAt).toLocaleDateString() : 'Pending Submission'}</p>
// //                             </div>
// //                             <div>
// //                                 <p><strong>Module:</strong> {assessment?.moduleInfo?.moduleNumber}</p>
// //                                 <p><strong>Score:</strong> <span style={{ color: isWorkplaceModule ? '#64748b' : (isFacDone ? printInkColor : '#94a3b8'), fontWeight: 'bold' }}>{isWorkplaceModule ? 'N/A (Competency Based)' : (isFacDone ? `${activeTotals.score} / ${activeTotals.max} (${activeTotals.pct}%)` : 'Pending Review')}</span></p>
// //                                 <p><strong>Outcome:</strong> <span style={{ color: isAssDone ? printOutcomeColor : '#94a3b8', fontWeight: 'bold' }}>{isAssDone ? (submission.competency === 'C' ? 'Competent (C)' : submission.competency === 'NYC' ? 'Not Yet Competent (NYC)' : 'Pending') : 'Pending Assessment'}</span></p>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>

// //                 <div className="sr-blocks">
// //                     <RenderBlocks
// //                         assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
// //                         activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={true}
// //                         canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
// //                         isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
// //                         savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
// //                         handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
// //                         handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
// //                         handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
// //                         handleSetToNow={handleSetToNow}
// //                     />
// //                 </div>

// //                 <div className="print-page" style={{ marginTop: '20px' }}>
// //                     <h3 style={{ borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>Overall Assessment Feedback</h3>
// //                     {facOverallFeedback && (
// //                         <div style={{ borderLeft: '4px solid blue', padding: '15px', background: '#eff6ff', marginBottom: '15px', borderRadius: '4px' }}>
// //                             <h4 style={{ color: 'blue', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>{displayFacRole === 'mentor' ? 'Mentor Supervisor Comments' : `Facilitator Pre-Marking Remarks`}</h4>
// //                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e3a8a', fontStyle: 'italic', lineHeight: 1.5 }}>{facOverallFeedback}</p>
// //                         </div>
// //                     )}
// //                     {assOverallFeedback && (
// //                         <div style={{ borderLeft: '4px solid red', padding: '15px', background: '#fef2f2', marginBottom: '15px', borderRadius: '4px' }}>
// //                             <h4 style={{ color: 'red', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Assessor Grading Remarks</h4>
// //                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#7f1d1d', fontStyle: 'italic', lineHeight: 1.5 }}>{assOverallFeedback}</p>
// //                         </div>
// //                     )}
// //                     {modFeedback && (
// //                         <div style={{ borderLeft: '4px solid green', padding: '15px', background: '#f0fdf4', marginBottom: '15px', borderRadius: '4px' }}>
// //                             <h4 style={{ color: 'green', margin: '0 0 8px 0', textTransform: 'uppercase', fontSize: '0.85rem' }}>Moderator QA Notes</h4>
// //                             <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#14532d', fontStyle: 'italic', lineHeight: 1.5 }}>{modFeedback}</p>
// //                         </div>
// //                     )}

// //                     {submission?.appeal?.status && (
// //                         <div className={`print-fb print-fb--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                             <h4 className={`print-fb__title print-fb__title--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                 Formal Appeal Record — {submission.appeal.status === 'upheld' ? 'Appeal Granted' : submission.appeal.status === 'pending' ? 'Appeal Pending' : 'Appeal Rejected'}
// //                             </h4>
// //                             <p className="print-fb__appeal-reason"><strong>Learner's Reason:</strong> "{submission.appeal.reason}"</p>
// //                             {submission.appeal.status !== 'pending' && (
// //                                 <p className={`print-fb__body print-fb__body--appeal-${submission.appeal.status === 'upheld' ? 'upheld' : 'rejected'}`}>
// //                                     <strong>Board Resolution:</strong> "{submission.appeal.resolutionNotes}"
// //                                 </p>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>

// //                 <div className="sr-signature-block">
// //                     <div className="sr-sig-box" style={{ borderColor: 'black', color: 'black' }}>
// //                         <span style={{ color: 'black' }}>Learner Declaration</span>
// //                         {isSubmitted ? (
// //                             <>
// //                                 {(submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl) ? (
// //                                     <img src={submission.learnerDeclaration?.signatureUrl || learnerProfile?.signatureUrl} alt="Learner signature" crossOrigin="anonymous" style={filterBlack} />
// //                                 ) : <div className="sr-sig-no-image" style={{ color: 'black', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>Digitally Authenticated</div>}
// //                                 <strong style={{ color: 'black' }}>{submission.learnerDeclaration?.learnerName || learnerProfile?.fullName || learner?.fullName}</strong>
// //                                 <em style={{ color: 'black' }}>Signed: {new Date(submission.learnerDeclaration?.timestamp || submission.submittedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'black' }}>Digital Timestamp Authenticated</div>
// //                             </>
// //                         ) : <div className="sr-sig-no-image" style={{ color: 'black' }}>Awaiting Submission</div>}
// //                     </div>
// //                     <div className="sr-sig-box" style={{ borderColor: 'blue', color: 'blue' }}>
// //                         <span style={{ color: 'blue' }}>{displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}</span>
// //                         {isFacDone ? (
// //                             <>
// //                                 {(submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl) ? (
// //                                     <img src={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl} alt="Facilitator Signature" crossOrigin="anonymous" style={filterBlue} />
// //                                 ) : <div className="sr-sig-no-image" style={{ color: 'blue', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
// //                                 <strong style={{ color: 'blue' }}>{submission.grading?.facilitatorName || 'Facilitator'}</strong>
// //                                 <em style={{ color: 'blue' }}>Signed: {new Date(submission.grading?.facilitatorReviewedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'blue' }}>{displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}</div>
// //                             </>
// //                         ) : <div className="sr-sig-no-image" style={{ color: 'blue' }}>Awaiting Verification</div>}
// //                     </div>
// //                     <div className="sr-sig-box" style={{ borderColor: 'red', color: 'red' }}>
// //                         <span style={{ color: 'red' }}>Assessor Sign-off</span>
// //                         {isAssDone ? (
// //                             <>
// //                                 {(submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl) ? (
// //                                     <img src={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl} alt="Assessor Signature" crossOrigin="anonymous" style={filterRed} />
// //                                 ) : <div className="sr-sig-no-image" style={{ color: 'red', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
// //                                 <strong style={{ color: 'red' }}>{submission.grading?.assessorName || 'N/A'}</strong>
// //                                 <em style={{ color: 'red' }}>Reg: {assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}</em>
// //                                 <em style={{ color: 'red' }}>Signed: {new Date(submission.grading.gradedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'red' }}>Digital Signature Confirmed</div>
// //                             </>
// //                         ) : <div className="sr-sig-no-image" style={{ color: 'red' }}>Awaiting Assessment</div>}
// //                     </div>
// //                     <div className="sr-sig-box" style={{ borderColor: 'green', color: 'green' }}>
// //                         <span style={{ color: 'green' }}>Internal Moderation</span>
// //                         {isModDone ? (
// //                             <>
// //                                 {(submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl) ? (
// //                                     <img src={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl} alt="Moderator Signature" crossOrigin="anonymous" style={filterGreen} />
// //                                 ) : <div className="sr-sig-no-image" style={{ color: 'green', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>}
// //                                 <strong style={{ color: 'green' }}>{moderatorProfile?.fullName || submission.moderation?.moderatorName || '—'}</strong>
// //                                 <em style={{ color: 'green' }}>Outcome: {submission.moderation?.outcome}</em>
// //                                 <em style={{ color: 'green' }}>Signed: {new Date(submission.moderation.moderatedAt).toLocaleDateString()}</em>
// //                                 <div className="sr-sig-line" style={{ borderTopColor: 'green' }}>QA Sign-off Confirmed</div>
// //                             </>
// //                         ) : <div className="sr-sig-no-image" style={{ color: 'green' }}>Awaiting Moderation</div>}
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* SCREEN LAYOUT */}
// //             <div className="sr-layout no-print">
// //                 <div className="sr-content-pane">
// //                     {canFacilitatorMark && groupCriteriaList.length > 0 && (
// //                         <div className="no-print" style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
// //                             {isGroupSessionActive && (
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', background: '#fffbeb', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #fef3c7' }}>
// //                                     <Timer size={14} className="animate-pulse" /> Active Group Session Running...
// //                                 </div>
// //                             )}
// //                             <button className="mlab-btn mlab-btn--primary" onClick={handleOpenGroupMode} disabled={isFetchingPeers || saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                 {isFetchingPeers ? <Loader2 size={16} className="lfm-spin" /> : <Users size={16} />}
// //                                 {isGroupSessionActive ? 'Resume Group Session' : 'Grade as Group'}
// //                             </button>
// //                         </div>
// //                     )}

// //                     {submission?.latestCoachingLog && currentAttempt > 1 && (
// //                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', marginBottom: '1.5rem' }}>
// //                             <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.9rem', textTransform: 'uppercase' }}><CheckCircle size={16} /> Remediation Coaching Logged</h4>
// //                             <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#15803d' }}><strong>Date:</strong> {new Date(submission.latestCoachingLog.date).toLocaleDateString()}</p>
// //                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d', fontStyle: 'italic', wordBreak: 'break-word' }}>"{submission.latestCoachingLog.notes}" — {submission.latestCoachingLog.facilitatorName}</p>
// //                         </div>
// //                     )}

// //                     {/* 🚀 FLEXIBLE INVIGILATION & PROCTORING INTEGRITY AUDIT CARD */}
// //                     {showProctoringAuditCard && (
// //                         <div style={{
// //                             background: isViolation ? '#fef2f2' : violationHistoryCount > 0 ? '#fffbeb' : '#f0fdf4',
// //                             border: `2px solid ${isViolation ? '#ef4444' : violationHistoryCount > 0 ? '#fde68a' : '#bbf7d0'}`,
// //                             padding: '1.25rem',
// //                             borderRadius: '8px',
// //                             marginBottom: '1.5rem',
// //                             boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
// //                         }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// //                                 <div style={{ flex: 1, minWidth: '280px' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
// //                                         <ShieldAlert size={20} color={isViolation ? '#dc2626' : violationHistoryCount > 0 ? '#b45309' : '#15803d'} />
// //                                         <h4 style={{ margin: 0, color: isViolation ? '#991b1b' : violationHistoryCount > 0 ? '#b45309' : '#14532d', textTransform: 'uppercase', fontSize: '0.95rem', fontWeight: 'bold' }}>
// //                                             {isViolation ? 'Security Violation - Terminated' : violationHistoryCount > 0 ? 'Invigilation Audit: Warnings Logged' : 'Invigilation Audit: Clean Record'}
// //                                         </h4>
// //                                     </div>
// //                                     <p style={{ margin: 0, fontSize: '0.85rem', color: isViolation ? '#b91c1c' : violationHistoryCount > 0 ? '#78350f' : '#166534', lineHeight: 1.4 }}>
// //                                         {isViolation
// //                                             ? 'This assessment was automatically terminated due to a proctoring security breach. Webcam and screen snapshots have been captured for staff inspection.'
// //                                             : violationHistoryCount > 0
// //                                                 ? `AI tracking & screen monitoring were active. A total of ${violationHistoryCount} security warning(s) were captured during this attempt.`
// //                                                 : 'AI face tracking and screen monitoring remained active throughout this session. Zero security anomalies were recorded.'}
// //                                     </p>
// //                                     {submission?.systemNote && isViolation && (
// //                                         <div style={{ background: '#ffffff', border: '1px solid #fecaca', padding: '8px 12px', marginTop: '10px', borderRadius: '4px' }}>
// //                                             <strong style={{ fontSize: '0.75rem', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Log:</strong>
// //                                             <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#7f1d1d', fontStyle: 'italic' }}>
// //                                                 "{submission.systemNote}"
// //                                             </p>
// //                                         </div>
// //                                     )}
// //                                 </div>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
// //                                     <button
// //                                         className="mlab-btn mlab-btn--sm"
// //                                         style={{
// //                                             background: isViolation ? '#2563eb' : violationHistoryCount > 0 ? '#d97706' : '#0284c7',
// //                                             color: 'white',
// //                                             border: 'none',
// //                                             padding: '8px 12px',
// //                                             display: 'flex',
// //                                             alignItems: 'center',
// //                                             justifyContent: 'center',
// //                                             gap: '6px',
// //                                             fontWeight: 'bold',
// //                                             fontSize: '0.8rem'
// //                                         }}
// //                                         onClick={() => setShowProctorEvidenceModal(true)}
// //                                     >
// //                                         <Video size={14} /> View Proctoring Snapshots ({violationHistoryCount})
// //                                     </button>

// //                                     {isViolation && (isAdmin || isFacilitator) && (
// //                                         <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 12px', fontWeight: 'bold' }} onClick={handleReopenMissedAssessment} disabled={saving}>
// //                                             <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse & Reopen
// //                                         </button>
// //                                     )}
// //                                     {isViolation && canGrade && (
// //                                         <button className="mlab-btn mlab-btn--sm mlab-btn--error" style={{ padding: '8px 12px', fontWeight: 'bold' }} onClick={executeZeroGrade} disabled={saving}>
// //                                             Assign Zero Grade
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {isMissed && !isViolation && (
// //                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// //                                 <div>
// //                                     <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', fontSize: '0.95rem' }}>
// //                                         <ShieldAlert size={18} /> Assessment Missed
// //                                     </h4>
// //                                     <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c', lineHeight: 1.5, maxWidth: '600px' }}>
// //                                         This learner failed to attend the scheduled assessment window. Please determine if this is an <strong>Excused Absence</strong> (reopen for the learner) or an <strong>Unexcused Absence</strong> (assign a zero grade).
// //                                     </p>
// //                                 </div>
// //                                 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
// //                                     {(isAdmin || isFacilitator) && (
// //                                         <button className="mlab-btn mlab-btn--sm" style={{ background: '#10b981', color: 'white', border: 'none' }} onClick={handleReopenMissedAssessment} disabled={saving}>
// //                                             <Unlock size={14} style={{ marginRight: '4px' }} /> Excuse Absence & Reopen
// //                                         </button>
// //                                     )}
// //                                     {canGrade && (
// //                                         <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={executeZeroGrade} disabled={saving}>
// //                                             Assign Zero Grade (Unexcused)
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div className="sr-blocks">
// //                         <RenderBlocks
// //                             assessment={assessment} submission={submission} facBreakdown={facBreakdown} assBreakdown={assBreakdown} modBreakdown={modBreakdown}
// //                             activeTabs={activeTabs} setActiveTabs={setActiveTabs} sectionTotals={sectionTotals} isPrintMode={false}
// //                             canFacilitatorMark={canFacilitatorMark} canGrade={canGrade} canModerate={canModerate}
// //                             isFacDone={isFacDone} isAssDone={isAssDone} isModDone={isModDone} isMentor={isMentor} isWorkplaceModule={isWorkplaceModule}
// //                             savedFacRole={savedFacRole} facReadOnlyLabel={facReadOnlyLabel}
// //                             handleVisualMark={handleVisualMark} handleScoreChange={handleScoreChange} handleFeedbackChange={handleFeedbackChange}
// //                             handleCriterionChange={handleCriterionChange} handleActivityStatusChange={handleActivityStatusChange}
// //                             handleActivityCommentChange={handleActivityCommentChange} handleGlobalChecklistChange={handleGlobalChecklistChange}
// //                             handleSetToNow={handleSetToNow}
// //                         />
// //                     </div>
// //                 </div>

// //                 <aside className="sr-sidebar no-print">
// //                     <ReviewStageCard
// //                         colorTheme="blue" title={facPanelTitle} status={facPanelStatus}
// //                         lockedMessage="The learner has not submitted this assessment yet. Marking and feedback are locked until they complete their attempt."
// //                         awaitingTitle={isAwaitingSignoff ? 'Awaiting Learner Signature' : 'Awaiting Facilitator Review'}
// //                         awaitingMessage={isAwaitingSignoff ? 'You have saved your verification. The learner must now log in, review your supervisor comments, and apply their signature before the logbook goes to the Assessor.' : 'The learner has submitted this assessment. Awaiting the Facilitator to complete their pre-marking.'}
// //                         showScore={!isWorkplaceModule && displayFacRole !== 'mentor'}
// //                         scoreAwarded={facTotals.score} scoreMax={facTotals.max} scorePct={facTotals.pct}
// //                         feedbackLabel={facRemarksLabel} feedbackPlaceholder="Add overall coaching comments..."
// //                         feedbackValue={facOverallFeedback} onFeedbackChange={handleFacOverallFeedbackChange}
// //                         submitLabel={facSubmitLabel} onSubmit={triggerSubmitFacilitator} isSaving={saving}
// //                         signatureLabel={displayFacRole === 'mentor' ? 'Mentor Verification' : 'Facilitator Pre-Marking'}
// //                         signatureName={submission.grading?.facilitatorName || 'Facilitator'}
// //                         signatureUrl={submission.grading?.facilitatorSignatureUrl || facilitatorProfile?.signatureUrl}
// //                         signatureDate={submission.grading?.facilitatorReviewedAt ? new Date(submission.grading.facilitatorReviewedAt).toLocaleDateString() : undefined}
// //                         signatureTagline={displayFacRole === 'mentor' ? 'Verification Confirmed' : 'Pre-Marking Completed'}
// //                         timeOverrideValue={facTimeOverride} onTimeOverrideChange={setFacTimeOverride}
// //                         autoTimeSeconds={getFacTime()} autoSummedMinutes={autoSummedTaskMinutes}
// //                         activeControls={
// //                             <>
// //                                 {canReturnToLearner && (
// //                                     <button className="mlab-btn mlab-btn--ghost" style={{ width: '100%', marginTop: '10px', borderColor: '#bfdbfe', color: '#1d4ed8' }} onClick={() => setShowReturnToLearnerModal(true)} disabled={saving}>
// //                                         <Undo2 size={14} style={{ marginRight: '6px' }} /> Return to Learner for Corrections
// //                                     </button>
// //                                 )}

// //                                 {(isFacilitator || isAdmin) && ((submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0) || ['not_started', 'submitted', 'facilitator_reviewed', 'awaiting_learner_signoff'].includes(submission.status)) && (
// //                                     <div className="no-print" style={{ marginTop: '10px', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
// //                                         <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                             <ShieldAlert size={14} /> Facilitator Overrides
// //                                         </p>

// //                                         {!isPureKnowledge && (
// //                                             <>
// //                                                 {submission.status !== 'not_started' && (
// //                                                     <div style={{ marginBottom: '12px', borderBottom: '1px dashed #bfdbfe', paddingBottom: '10px' }}>
// //                                                         <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e40af', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Learner Task Timer Override (Mins)</label>
// //                                                         <input type="number" min="1" placeholder="Enter true duration in minutes..." style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} value={learnerTimeOverride} onChange={(e) => handleLearnerTimeOverrideChange(e.target.value)} disabled={saving} />
// //                                                     </div>
// //                                                 )}
// //                                                 {submission.status === 'in_progress' && assessment?.moduleInfo?.timeLimit > 0 && (
// //                                                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
// //                                                         <button onClick={() => !disableExtraTime && grantExtraTime(15, 'Facilitator +15 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#cbd5e1' : '#3b82f6', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+15 Mins</button>
// //                                                         <button onClick={() => !disableExtraTime && grantExtraTime(30, 'Facilitator +30 min override')} disabled={disableExtraTime || saving} className="mlab-btn mlab-btn--sm" style={{ background: disableExtraTime ? '#94a3b8' : '#2563eb', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', cursor: disableExtraTime ? 'not-allowed' : 'pointer' }}>+30 Mins</button>
// //                                                         {submission.extraTimeGranted > 0 && <span style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 'bold' }}>({submission.extraTimeGranted} min active)</span>}
// //                                                     </div>
// //                                                 )}
// //                                             </>
// //                                         )}

// //                                         {(submission.status === 'not_started') && (
// //                                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                                 <button onClick={toggleDeferredAccess} className="mlab-btn mlab-btn--sm" style={{ background: submission.overrideUnlock ? '#ef4444' : '#10b981', color: 'white', padding: '6px 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                     {submission.overrideUnlock ? <><Lock size={12} /> Revoke Access</> : <><Unlock size={12} /> Grant Deferred Access</>}
// //                                                 </button>
// //                                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{submission.overrideUnlock ? "Learner can bypass scheduling locks." : "Bound by global schedule."}</span>
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 )}
// //                             </>
// //                         }
// //                     />

// //                     <ReviewStageCard
// //                         colorTheme="red" title="Official Assessor Grading" status={assPanelStatus}
// //                         lockedMessage="Awaiting prior steps to be completed before grading can begin."
// //                         awaitingTitle="Awaiting Assessor Grading"
// //                         awaitingMessage="This submission is ready and waiting for the Assessor to assign final marks."
// //                         showScore={!isWorkplaceModule}
// //                         scoreAwarded={assTotals.score} scoreMax={assTotals.max} scorePct={assTotals.pct}
// //                         feedbackLabel="Assessor Remarks" feedbackPlaceholder="Provide holistic feedback..."
// //                         feedbackValue={assOverallFeedback} onFeedbackChange={handleAssOverallFeedbackChange}
// //                         submitLabel="Apply Signature & Finalise" onSubmit={triggerSubmitGrade} isSaving={saving}
// //                         signatureLabel="Assessor Signature" signatureName={submission.grading?.assessorName || 'Assessor'}
// //                         signatureUrl={submission.grading?.assessorSignatureUrl || assessorProfile?.signatureUrl}
// //                         signatureDate={submission.grading?.gradedAt ? new Date(submission.grading.gradedAt).toLocaleDateString() : undefined}
// //                         signatureMeta={`Reg: ${assessorProfile?.assessorRegNumber || submission.grading?.assessorRegNumber || 'N/A'}`}
// //                         signatureTagline="Digital Signature Confirmed"
// //                         timeOverrideValue={assTimeOverride} onTimeOverrideChange={setAssTimeOverride} autoTimeSeconds={getAssTime()}
// //                         activeControls={
// //                             canGrade && !isMissed && !isViolation && (
// //                                 <div className="sr-competency-section">
// //                                     <div className="sr-role-guide red"><Info size={16} /><div><strong>Summative Judgment</strong><br />Declare Competency. You must justify your marks.</div></div>
// //                                     <label className="sr-sidebar-label" style={{ color: 'red', marginTop: '1rem' }}>Final Competency</label>
// //                                     <div className="sr-comp-toggles">
// //                                         <button className={`sr-comp-btn ${competency === 'C' ? 'active-c-red' : ''}`} onClick={() => handleCompetencySelect('C')}><Award size={16} /> Competent (C)</button>
// //                                         <button className={`sr-comp-btn ${competency === 'NYC' ? 'active-nyc-red' : ''}`} onClick={() => handleCompetencySelect('NYC')}><AlertCircle size={16} /> Not Yet Competent</button>
// //                                     </div>
// //                                 </div>
// //                             )
// //                         }
// //                     />

// //                     <ReviewStageCard
// //                         colorTheme="green" title="Internal Moderation (QA)" status={modPanelStatus}
// //                         lockedMessage="Awaiting Assessor to complete official grading before moderation can occur."
// //                         awaitingTitle="Awaiting Moderation"
// //                         awaitingMessage="This submission is ready and waiting for QA review by the Moderator."
// //                         showScore={true} scoreAwarded={modTotals.score} scoreMax={modTotals.max} scorePct={modTotals.pct}
// //                         feedbackLabel="Moderator Feedback" feedbackPlaceholder="Moderation feedback..."
// //                         feedbackValue={modFeedback} onFeedbackChange={handleModFeedbackChange}
// //                         submitLabel="Finalise QA & Endorse" onSubmit={triggerSubmitModeration} isSaving={saving}
// //                         signatureLabel="Moderator QA" signatureName={submission.moderation?.moderatorName || moderatorProfile?.fullName || 'Moderator'}
// //                         signatureUrl={submission.moderation?.moderatorSignatureUrl || moderatorProfile?.signatureUrl}
// //                         signatureDate={submission.moderation?.moderatedAt ? new Date(submission.moderation.moderatedAt).toLocaleDateString() : undefined}
// //                         signatureMeta={`Outcome: ${submission.moderation?.outcome || modOutcome}`} signatureTagline="QA Sign-off Confirmed"
// //                         timeOverrideValue={modTimeOverride} onTimeOverrideChange={setModTimeOverride} autoTimeSeconds={getModTime()}
// //                         activeControls={
// //                             (canModerate || isModDone) && (
// //                                 <>
// //                                     <div className="sr-competency-section">
// //                                         <label className="sr-sidebar-label" style={{ color: 'green' }}>Assessor's Declared Competency</label>
// //                                         <div className="sr-comp-toggles">
// //                                             <button className={`sr-comp-btn ${submission.competency === 'C' ? 'active-c-green' : ''}`} disabled style={{ opacity: submission.competency === 'C' ? 1 : 0.5, cursor: 'default' }}><Award size={16} /> Competent (C)</button>
// //                                             <button className={`sr-comp-btn ${submission.competency === 'NYC' ? 'active-nyc-green' : ''}`} disabled style={{ opacity: submission.competency === 'NYC' ? 1 : 0.5, cursor: 'default' }}><AlertCircle size={16} /> Not Yet Competent</button>
// //                                         </div>
// //                                     </div>
// //                                     {canModerate && (
// //                                         <div className="sr-competency-section" style={{ marginTop: '1.5rem' }}>
// //                                             <label className="sr-sidebar-label" style={{ color: 'green' }}>Your Moderation Decision</label>
// //                                             <div className="sr-comp-toggles">
// //                                                 <button className={`sr-comp-btn mod ${modOutcome === 'Endorsed' ? 'active-c-green' : ''}`} onClick={() => handleModOutcomeSelect('Endorsed')}><ShieldCheck size={16} /> Endorse Grade</button>
// //                                                 <button className={`sr-comp-btn mod ${modOutcome === 'Returned' ? 'active-nyc-green' : ''}`} onClick={() => handleModOutcomeSelect('Returned')}><AlertCircle size={16} /> Return to Assessor</button>
// //                                             </div>
// //                                         </div>
// //                                     )}
// //                                 </>
// //                             )
// //                         }
// //                     />
// //                     <PastAttemptsArchive historySnapshots={historySnapshots} assessment={assessment} />
// //                 </aside>
// //             </div>
// //         </div>
// //     );
// // };

// // export default SubmissionReview;
