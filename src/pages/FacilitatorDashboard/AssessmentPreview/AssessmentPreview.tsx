// src/pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
    ArrowLeft, Info, Clock, FileText,
    Layers, UploadCloud, Mic, Link as LinkIcon, Code, Timer, FileArchive, Menu, X,
    BookOpen,
    Scale,
    Award,
    ShieldAlert,
    Video,
    BarChart,
    Sigma,
    Pencil,
    Lock,
    ChevronUp,
    ChevronDown
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import 'react-quill-new/dist/quill.snow.css';
import './AssessmentPreview.css';

import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// 🚀 Core Charting Engine Registration
import { CartesianPlane } from '@zakq/axisjs';

// 🚀 Math Support Configuration
import katex from "katex";
import "katex/dist/katex.min.css";
import "mathlive";

(window as any).katex = katex;

/* ─── HELPER: CLEAN RICH TEXT (FIXES WORD-BREAK BUG) ─────────────────────── */
const cleanRichText = (html?: any): string => {
    if (typeof html !== 'string' || !html) return '';
    return html.replace(/&nbsp;/g, ' ');
};

/* ─── HELPER: EXTRACT PLAIN TEXT FROM HTML FOR SIDEBAR LABELS ────────────── */
const extractPlainText = (htmlString?: any): string => {
    if (typeof htmlString !== 'string' || !htmlString) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString;
    return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
};

const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];

/* ─── AXISJS GRAPH PLOT TEMPLATE PREVIEW CONTAINER ────────────────────────── */
const PreviewAxisGraph: React.FC<{ block: any, showMemo?: boolean }> = ({ block, showMemo }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const planeRef = useRef<CartesianPlane | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        // Establish the layout-defensive instance configuration
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

        // If we are showing the memorandum, plot the expected nodes and vectors
        if (showMemo && block.memoGraph) {
            const pointsList = block.memoGraph.points || [];
            const shapesList = block.memoGraph.shapes || [];

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
        }

        // Auto-focus the viewport map
        if (allCoords.length > 0) {
            setTimeout(() => {
                plane.animateToFit(allCoords);
            }, 100);
        } else {
            setTimeout(() => {
                plane.animateToFit([{ x: -10, y: -10 }, { x: 10, y: 10 }], 0);
            }, 50);
        }

    }, [block, showMemo]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '420px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    );
};

export const AssessmentPreview: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // 🚀 Accordion State for Graph Memos
    const [expandedGraphMemos, setExpandedGraphMemos] = useState<Record<string, boolean>>({});

    const toggleGraphMemo = (blockId: string) => {
        setExpandedGraphMemos(prev => ({ ...prev, [blockId]: !prev[blockId] }));
    };

    useEffect(() => {
        const fetchAssessment = async () => {
            if (!assessmentId) return;
            try {
                const snap = await getDoc(doc(db, 'assessments', assessmentId));
                if (snap.exists()) setAssessment(snap.data());
            } catch (err) {
                console.error('Error loading preview:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAssessment();
    }, [assessmentId]);

    if (loading) return <div className="mlab-preview-state">Loading Preview…</div>;
    if (!assessment) return <div className="mlab-preview-state">Assessment not found.</div>;

    // Derived stats
    const blocks = assessment.blocks || [];

    const qBlocks = blocks.filter((b: any) => ['text', 'mcq', 'task', 'checklist', 'qcto_workplace', 'code_sandbox', 'graph', 'mathpad'].includes(b.type));
    const qCount = qBlocks.length;
    const totalMarks = assessment.totalMarks ?? blocks.reduce((s: number, b: any) => s + (Number(b.marks) || 0), 0);
    const timeLimit = assessment.moduleInfo?.timeLimit;

    let qNum = 0;

    const renderBlockImage = (block: any) => {
        if (!block.imageUrl) return null;
        return (
            <div style={{ margin: '1rem 0', textAlign: 'center' }}>
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
                <a href={block.fileUrl} download target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px', background: '#166534', color: 'white', borderRadius: '4px', flexShrink: 0, fontWeight: 'bold' }}>
                    <UploadCloud size={14} style={{ transform: 'rotate(180deg)' }} /> Download File
                </a>
            </div>
        );
    };

    return (
        <div className="mlab-preview">

            {isMobileMenuOpen && (
                <div
                    className="mlab-sidebar-overlay no-print"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            <div className="mlab-preview-banner no-print">
                <span className="mlab-preview-banner__title">Admin Preview Mode</span>
                <span className="mlab-preview-banner__body">
                    You are viewing the assessment template. Learner answers cannot be saved here.
                </span>
            </div>

            <div className="mlab-preview-topbar no-print">
                <div className="mlab-preview-topbar__left">
                    <button
                        className="mlab-hamburger-btn no-print"
                        onClick={() => setIsMobileMenuOpen(true)}
                    >
                        <Menu size={20} />
                    </button>

                    <button className="mlab-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> <span className="mlab-hide-mobile">Back to Builder</span>
                    </button>
                    <div className="mlab-preview-topbar__separator mlab-hide-mobile" />
                    <h1 className="mlab-preview-topbar__title">
                        {assessment.title}
                    </h1>
                </div>

                <div className="mlab-preview-topbar__right">
                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <button className="mlab-topbar-manual-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
                            <FileArchive size={16} /> <span className="mlab-hide-mobile">View Manual</span>
                        </button>
                    )}

                    {timeLimit ? (
                        <div className={`mlab-timer`}>
                            <Timer size={14} /> {timeLimit}m Limit
                        </div>
                    ) : null}

                    <span className="mlab-status-badge mlab-status-badge--locked">
                        PREVIEW MODE
                    </span>
                </div>
            </div>

            <div className="mlab-preview-body">

                <nav className={`mlab-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                    <button
                        className="mlab-close-btn"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X size={24} />
                    </button>

                    <div className="mlab-sidebar__meta-block">
                        <div className="mlab-sidebar__meta-title">{assessment.title}</div>
                        <div className="mlab-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
                        <div className="mlab-sidebar__detail"><Scale size={11} /> {totalMarks} Total Marks</div>
                        <div className="mlab-sidebar__chip"><Award size={11} /> Pass: 60%</div>
                    </div>

                    <div className="mlab-sidebar__label">Workbook Contents</div>
                    <div className="mlab-sidebar__nav">
                        {blocks.reduce((acc: any[], block: any) => {
                            if (block.type === 'section') {
                                acc.push({ type: 'section', label: extractPlainText(block.title) || 'Section', id: block.id });
                            } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'graph', 'mathpad'].includes(block.type)) {
                                const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
                                acc.push({ type: 'q', label: cleanLabel, id: block.id });
                            }
                            return acc;
                        }, []).map((item: any) =>
                            item.type === 'section'
                                ? <span key={item.id} className="mlab-sidebar__nav-item mlab-sidebar__nav-item--section">{item.label}</span>
                                : <a key={item.id} href={`#block-${item.id}`} className="mlab-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                        )}
                    </div>
                </nav>

                <div className="mlab-preview-doc">
                    <header className="mlab-preview-header">
                        <span className="mlab-preview-header__eyebrow">
                            {assessment.moduleType?.toUpperCase() || 'Assessment'} · {assessment.moduleInfo?.moduleNumber || ''}
                        </span>
                        <h1 className="mlab-preview-header__title">{assessment.title}</h1>
                        <div className="mlab-preview-header__meta">
                            <span style={{ color: 'orange', background: '#ffa60025' }}
                                className={`mlab-meta-chip mlab-meta-chip--type-${assessment.type.replace(/\s+/g, '-').toLowerCase()}`}>
                                {assessment.type}
                            </span>
                            <span className="mlab-meta-chip mlab-meta-chip--marks">
                                {totalMarks} Marks
                            </span>
                            <span className="mlab-meta-chip mlab-meta-chip--default" >
                                <FileText size={11} /> {qCount} Questions/Tasks
                            </span>
                            {timeLimit ? (
                                <span className="mlab-meta-chip mlab-meta-chip--time">
                                    <Clock size={11} /> {timeLimit} Min Limit
                                </span>
                            ) : null}

                            {assessment?.requiresInvigilation && (
                                <span className="mlab-meta-chip" style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}>
                                    <Video size={11} /> Live Proctoring Enabled
                                </span>
                            )}
                        </div>
                    </header>

                    {assessment?.requiresInvigilation && (
                        <div className="mlab-openbook-banner" style={{ background: '#fff1f2', borderColor: '#fecdd3', borderLeftColor: '#e11d48', marginTop: '1.5rem' }}>
                            <strong className="mlab-openbook-banner__title" style={{ color: '#be123c' }}>
                                <ShieldAlert size={16} /> Secure Proctored Environment
                            </strong>
                            <p className="mlab-openbook-banner__text" style={{ color: '#881337' }}>
                                This is a strictly invigilated assessment. Learners will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to the Assessor.
                            </p>
                        </div>
                    )}

                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <div className="mlab-openbook-banner" style={{ marginTop: '1.5rem' }}>
                            <strong className="mlab-openbook-banner__title"><FileArchive size={16} /> Open Book Assessment</strong>
                            <p className="mlab-openbook-banner__text">
                                This is an open-book assessment. An official Reference Manual has been provided by your facilitator.
                                You will be able to access and read this manual inside the assessment player at any time.
                            </p>
                        </div>
                    )}

                    {assessment.instructions && (
                        <div className="mlab-preview-instructions">
                            <span className="mlab-preview-instructions__label">Learner Instructions</span>
                            <div className="quill-read-only-content mlab-preview-instructions__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions) }} />
                        </div>
                    )}

                    {assessment.purpose && (
                        <div className="mlab-preview-instructions" style={{ marginTop: '1rem' }}>
                            <span className="mlab-preview-instructions__label">Module Purpose</span>
                            <div className="quill-read-only-content mlab-preview-instructions__text" style={{ wordBreak: 'normal', color: 'white', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
                        </div>
                    )}

                    <div className="mlab-blocks">
                        {blocks.map((block: any) => {

                            /* Section header */
                            if (block.type === 'section') return (
                                <div key={block.id} id={`block-${block.id}`} className="mlab-block-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--mlab-white)' }}>{block.title}</div>
                                    {block.content && (
                                        <div className="quill-read-only-content" style={{ fontSize: '0.95rem', color: 'white', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                                    )}
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                </div>
                            );

                            /* Reading / info block */
                            if (block.type === 'info') return (
                                <div key={block.id} id={`block-${block.id}`} className="mlab-block-info">
                                    <div className="mlab-block-info__label">
                                        <Info size={13} /> {block.title || 'Reading Material'}
                                    </div>
                                    <div className="quill-read-only-content mlab-block-info__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#475569' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                                    {renderBlockImage(block)}
                                    {renderBlockFile(block)}
                                </div>
                            );

                            /* Text question */
                            if (block.type === 'text') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num">Q{qNum}</span>
                                            <div className="mlab-block-question__text">
                                                {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                            <textarea
                                                className="mlab-answer-textarea"
                                                disabled
                                                placeholder="Learner will type their answer here…"
                                                rows={4}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            /* MCQ question */
                            if (block.type === 'mcq') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num">Q{qNum}</span>
                                            <div className="mlab-block-question__text">
                                                {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                            <div className="mlab-mcq-options">
                                                {block.options.map((opt: string, i: number) => {
                                                    const isCorrect = block.correctOption === i;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`mlab-mcq-option${isCorrect ? ' mlab-mcq-option--correct' : ''}`}
                                                        >
                                                            <input type="radio" disabled checked={isCorrect} readOnly />
                                                            <span className="mlab-mcq-option__letter">
                                                                {String.fromCharCode(65 + i)}.
                                                            </span>
                                                            <span className="mlab-mcq-option__text">{opt}</span>
                                                            {isCorrect && (
                                                                <span className="mlab-mcq-option__correct-tag">
                                                                    Correct Answer
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            /* Multi-Modal Task */
                            if (block.type === 'task') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ede9fe', color: '#8b5cf6' }}>Q{qNum}</span>
                                            <div className="mlab-block-question__text">
                                                {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                <Layers size={16} color="#8b5cf6" />
                                                <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Multi-Modal Task (Learner Evidence Options):</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                {block.allowText && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#e2e8f0', padding: '4px 10px', borderRadius: '20px', color: '#475569' }}><FileText size={12} /> Rich Text</span>}
                                                {block.allowAudio && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf4ff', padding: '4px 10px', borderRadius: '20px', color: '#d946ef', border: '1px solid #fbcfe8' }}><Mic size={12} /> Audio Recording</span>}
                                                {block.allowUrl && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', color: '#3b82f6', border: '1px solid #bfdbfe' }}><LinkIcon size={12} /> External URL</span>}
                                                {block.allowUpload && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#f5f3ff', padding: '4px 10px', borderRadius: '20px', color: '#8b5cf6', border: '1px solid #ddd6fe' }}><UploadCloud size={12} /> File Upload ({block.allowedFileTypes})</span>}
                                                {block.allowCode && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf2f8', padding: '4px 10px', borderRadius: '20px', color: '#ec4899', border: '1px solid #fbcfe8' }}><Code size={12} /> IDE / Code ({block.codeLanguage})</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            /* LIVE IDE / CODE SANDBOX PREVIEW */
                            if (block.type === 'code_sandbox') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#eff6ff', color: '#3b82f6' }}>IDE</span>
                                            <div className="mlab-block-question__text">
                                                <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
                                                    {block.title && (
                                                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                            {block.title}
                                                        </h3>
                                                    )}
                                                    {block.question && (
                                                        <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
                                                    )}
                                                </div>
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}

                                            <CodeSandboxPlayer
                                                block={block}
                                                learnerAns={undefined}
                                                onChange={() => { }}
                                                readOnly={false}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            /* 🚀 CARTEESIAN ENGINE WORKSPACE PLOT PREVIEW 🚀 */
                            if (block.type === 'graph') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ccfbf1', color: '#0f766e' }}>PLOT</span>
                                            <div className="mlab-block-question__text">
                                                {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Graphing Task'}
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                            <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: '#334155', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <BarChart size={14} /> Blank Cartesian Graph Grid Workspace Preview:
                                            </div>
                                            <PreviewAxisGraph block={block} />
                                        </div>
                                    </div>
                                );
                            }

                            /* 🚀 MATHPAD */
                            if (block.type === 'mathpad') {
                                qNum++;
                                const isGraphMemoExpanded = expandedGraphMemos[block.id] || false;

                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#fce7f3', color: '#db2777' }}>MATH</span>
                                            <div className="mlab-block-question__text">
                                                {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}

                                            <div className="mlab-answer-box" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                    <Sigma size={16} color="#db2777" />
                                                    <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Mathematical Workspace (Learner View):</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf2f8', padding: '4px 10px', borderRadius: '20px', color: '#be185d', border: '1px solid #fbcfe8' }}><Sigma size={12} /> Equation Editor</span>
                                                    {block.allowGraphing !== false && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#f0fdf4', padding: '4px 10px', borderRadius: '20px', color: '#166534', border: '1px solid #bbf7d0' }}><BarChart size={12} /> Graphing Calculator</span>}
                                                    {block.allowDrawing !== false && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Pencil size={12} /> Whiteboard Canvas</span>}
                                                </div>
                                            </div>

                                            {(block.correctAnswer || block.modelSolution || (block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0)) && (
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
                                                            <div className="quill-read-only-content" style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px dashed #fbcfe8', fontSize: '0.9rem', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.modelSolution) }} />
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
                                                                    <PreviewAxisGraph block={block} showMemo={true} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

                            /* Practical Checklist */
                            if (block.type === 'checklist') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div className="quill-read-only-content mlab-block-question__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>This section is completed by the Assessor/Mentor during observation.</span>
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}
                                            {block.criteria?.map((crit: string, i: number) => (
                                                <div key={i} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc' }}>
                                                    <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#334155' }}>{i + 1}. {crit}</p>

                                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', opacity: 0.7 }}>
                                                        {block.requireEvidencePerCriterion !== false && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', background: '#e0e7ff', padding: '4px 8px', borderRadius: '4px', color: '#1d4ed8' }}>
                                                                <UploadCloud size={14} /> Evidence Req.
                                                            </div>
                                                        )}
                                                        {block.requirePerCriterionTiming !== false && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', color: '#475569' }}>
                                                                <Timer size={14} /> Task Timer
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '5px' }}>
                                                            <span style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}>○ Competent (C)</span>
                                                            <span style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid #fecaca', borderRadius: '4px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold' }}>○ NYC</span>
                                                        </div>
                                                        <input type="text" disabled placeholder="Assessor comments..." style={{ flex: 1, minWidth: '200px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }} />
                                                    </div>
                                                </div>
                                            ))}

                                            {block.requireObservationDeclaration !== false && (
                                                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1', opacity: 0.8 }}>
                                                    <h4 style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '10px', textTransform: 'uppercase' }}>Global Assessor / Mentor Sign-off</h4>
                                                    {block.requireTimeTracking !== false && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                                                            <input type="text" className="ab-input" disabled placeholder="Date..." style={{ padding: '6px' }} />
                                                            <input type="text" className="ab-input" disabled placeholder="Time Started..." style={{ padding: '6px' }} />
                                                            <input type="text" className="ab-input" disabled placeholder="Time Completed..." style={{ padding: '6px' }} />
                                                        </div>
                                                    )}
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.8rem', color: '#334155', fontWeight: 'bold' }}>
                                                        <input type="checkbox" disabled checked />
                                                        I declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

                            /* Workplace Logbook */
                            if (block.type === 'logbook') {
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ffedd5', color: '#ea580c' }}>LOG</span>
                                            <span className="mlab-block-question__text">{block.title}</span>
                                        </div>
                                        <div className="mlab-block-question__body">
                                            <div className="quill-read-only-content" style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}

                                            <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                                                            <th style={{ padding: '10px' }}>Date</th>
                                                            <th style={{ padding: '10px' }}>Assignment Task</th>
                                                            <th style={{ padding: '10px' }}>Start Time</th>
                                                            <th style={{ padding: '10px' }}>Finish Time</th>
                                                            <th style={{ padding: '10px' }}>Total Hours</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr style={{ background: 'white' }}>
                                                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                                Learner will be able to dynamically add and fill rows here.
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            /* QCTO Workplace Checkpoint */
                            if (block.type === 'qcto_workplace') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div className="quill-read-only-content mlab-block-question__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title || 'Workplace Experience Checkpoint') }} />
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>SETA Compliant Workplace Reflection & Evidence.</span>
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }}>
                                            {renderBlockImage(block)}
                                            {renderBlockFile(block)}

                                            {block.weCode && (
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <strong style={{ color: '#9f1239', display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Work Experience Module (WE Code):</strong>
                                                    <span style={{ color: '#be123c', fontSize: '0.9rem' }}>{block.weCode} — {block.weTitle}</span>
                                                </div>
                                            )}

                                            {block.workActivities && block.workActivities.length > 0 && (
                                                <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fecdd3', marginBottom: '1rem' }}>
                                                    <strong style={{ color: '#be123c', display: 'block', marginBottom: '10px', fontSize: '0.85rem' }}>Workplace Activities (WA) & Evidence Links:</strong>
                                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#4c0519', fontSize: '0.85rem' }}>
                                                        {block.workActivities.map((wa: any, i: number) => (
                                                            <li key={i} style={{ marginBottom: '10px' }}>
                                                                <strong>{wa.code}:</strong> {wa.description}
                                                                {wa.evidenceItems && wa.evidenceItems.length > 0 && (
                                                                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '1rem', listStyleType: 'circle', color: '#881337', fontSize: '0.8rem' }}>
                                                                        {wa.evidenceItems.map((se: any, j: number) => (
                                                                            <li key={j}><em>Evidence: {se.code} - {se.description}</em></li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', borderTop: '1px dashed #fda4af', paddingTop: '15px', opacity: 0.8 }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#9f1239', fontWeight: 'bold' }}>
                                                    <input type="checkbox" disabled checked={block.requireSelfAssessment !== false} /> Requires Learner Self-Assessment
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#9f1239', fontWeight: 'bold' }}>
                                                    <input type="checkbox" disabled checked={block.requireGoalPlanning !== false} /> Requires Goal Planning
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return null;
                        })}
                    </div>

                    {/* ── Footer summary ── */}
                    {blocks.length > 0 && (
                        <div className="mlab-preview-footer">
                            <span className="mlab-preview-footer__label">Assessment Summary</span>

                            <div className="mlab-preview-footer__stat">
                                <span className="mlab-preview-footer__num">{qCount}</span>
                                <span className="mlab-preview-footer__unit">Questions / Tasks</span>
                            </div>

                            <div className="mlab-preview-footer__divider" />

                            <div className="mlab-preview-footer__stat">
                                <span className="mlab-preview-footer__num">{totalMarks}</span>
                                <span className="mlab-preview-footer__unit">Total Marks</span>
                            </div>

                            {timeLimit ? (
                                <>
                                    <div className="mlab-preview-footer__divider" />
                                    <div className="mlab-preview-footer__stat">
                                        <span className="mlab-preview-footer__num">{timeLimit}</span>
                                        <span className="mlab-preview-footer__unit">Minutes</span>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};





// // src/pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview.tsx

// import React, { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc } from 'firebase/firestore';
// import {
//     ArrowLeft, Info, Clock, FileText,
//     Layers, UploadCloud, Mic, Link as LinkIcon, Code, Timer, FileArchive, Menu, X,
//     BookOpen,
//     Scale,
//     Award,
//     ShieldAlert,
//     Video,
//     BarChart,
//     Sigma,
//     Pencil,
//     Lock,
//     ChevronUp,
//     ChevronDown
// } from 'lucide-react';
// import { db } from '../../../lib/firebase';
// import 'react-quill-new/dist/quill.snow.css';
// import './AssessmentPreview.css';

// import { CodeSandboxPlayer } from '../../../components/common/CodeSandboxPlayer/CodeSandboxPlayer';

// // 🚀 Core Charting Engine Registration
// import { CartesianPlane } from '@zakq/axisjs';

// // 🚀 Math Support Configuration
// import katex from "katex";
// import "katex/dist/katex.min.css";
// import "mathlive";

// (window as any).katex = katex;

// /* ─── HELPER: CLEAN RICH TEXT (FIXES WORD-BREAK BUG) ─────────────────────── */
// const cleanRichText = (html?: string) => {
//     if (!html) return '';
//     return html.replace(/&nbsp;/g, ' ');
// };

// /* ─── HELPER: EXTRACT PLAIN TEXT FROM HTML FOR SIDEBAR LABELS ────────────── */
// const extractPlainText = (htmlString?: string) => {
//     if (!htmlString) return '';
//     const tmp = document.createElement("DIV");
//     tmp.innerHTML = htmlString;
//     return (tmp.textContent || tmp.innerText || "").trim().replace(/\s+/g, ' ');
// };

// const POINT_COLORS = ["#ef4444", "#2563eb", "#94c73d", "#f59e0b", "#a855f7", "#0891b2"];

// /* ─── AXISJS GRAPH PLOT TEMPLATE PREVIEW CONTAINER ────────────────────────── */
// const PreviewAxisGraph: React.FC<{ block: any, showMemo?: boolean }> = ({ block, showMemo }) => {
//     const containerRef = useRef<HTMLDivElement>(null);
//     const canvasRef = useRef<HTMLCanvasElement>(null);
//     const planeRef = useRef<CartesianPlane | null>(null);

//     useEffect(() => {
//         if (!canvasRef.current) return;

//         // Establish the layout-defensive instance configuration
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

//         // If we are showing the memorandum, plot the expected nodes and vectors
//         if (showMemo && block.memoGraph) {
//             const pointsList = block.memoGraph.points || [];
//             const shapesList = block.memoGraph.shapes || [];

//             pointsList.forEach((p: any, i: number) => {
//                 const px = parseFloat(String(p.x));
//                 const py = parseFloat(String(p.y));
//                 if (!isNaN(px) && !isNaN(py)) {
//                     allCoords.push({ x: px, y: py });
//                     const color = POINT_COLORS[i % POINT_COLORS.length];
//                     plane.addPoint(px, py, color, `(${px}, ${py})`, true, 5);
//                 }
//             });

//             shapesList.forEach((shape: any) => {
//                 const shapeCoords: { x: number; y: number }[] = [];
//                 shape.points?.forEach((p: any) => {
//                     const px = parseFloat(String(p.x));
//                     const py = parseFloat(String(p.y));
//                     if (!isNaN(px) && !isNaN(py)) {
//                         shapeCoords.push({ x: px, y: py });
//                         allCoords.push({ x: px, y: py });
//                     }
//                 });

//                 if (shapeCoords.length > 0) {
//                     plane.addPolygon(shapeCoords, `${shape.color}1f`, shape.color, 2);
//                     shapeCoords.forEach((coord) => {
//                         plane.addPoint(coord.x, coord.y, shape.color, `(${coord.x}, ${coord.y})`, false, 5);
//                     });
//                 }
//             });
//         }

//         // Auto-focus the viewport map
//         if (allCoords.length > 0) {
//             setTimeout(() => {
//                 plane.animateToFit(allCoords);
//             }, 100);
//         } else {
//             setTimeout(() => {
//                 plane.animateToFit([{ x: -10, y: -10 }, { x: 10, y: 10 }], 0);
//             }, 50);
//         }

//     }, [block, showMemo]);

//     return (
//         <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '420px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
//             <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
//         </div>
//     );
// };

// export const AssessmentPreview: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const [assessment, setAssessment] = useState<any>(null);
//     const [loading, setLoading] = useState(true);

//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//     // 🚀 Accordion State for Graph Memos
//     const [expandedGraphMemos, setExpandedGraphMemos] = useState<Record<string, boolean>>({});

//     const toggleGraphMemo = (blockId: string) => {
//         setExpandedGraphMemos(prev => ({ ...prev, [blockId]: !prev[blockId] }));
//     };

//     useEffect(() => {
//         const fetchAssessment = async () => {
//             if (!assessmentId) return;
//             try {
//                 const snap = await getDoc(doc(db, 'assessments', assessmentId));
//                 if (snap.exists()) setAssessment(snap.data());
//             } catch (err) {
//                 console.error('Error loading preview:', err);
//             } finally {
//                 setLoading(false);
//             }
//         };
//         fetchAssessment();
//     }, [assessmentId]);

//     if (loading) return <div className="mlab-preview-state">Loading Preview…</div>;
//     if (!assessment) return <div className="mlab-preview-state">Assessment not found.</div>;

//     // Derived stats
//     const blocks = assessment.blocks || [];

//     const qBlocks = blocks.filter((b: any) => ['text', 'mcq', 'task', 'checklist', 'qcto_workplace', 'code_sandbox', 'graph', 'mathpad'].includes(b.type));
//     const qCount = qBlocks.length;
//     const totalMarks = assessment.totalMarks ?? blocks.reduce((s: number, b: any) => s + (Number(b.marks) || 0), 0);
//     const timeLimit = assessment.moduleInfo?.timeLimit;

//     let qNum = 0;

//     const renderBlockImage = (block: any) => {
//         if (!block.imageUrl) return null;
//         return (
//             <div style={{ margin: '1rem 0', textAlign: 'center' }}>
//                 <img
//                     src={block.imageUrl}
//                     alt={block.imageCaption || "Assessment attachment"}
//                     style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
//                 />
//                 {block.imageCaption && (
//                     <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
//                         {block.imageCaption}
//                     </p>
//                 )}
//             </div>
//         );
//     };

//     return (
//         <div className="mlab-preview">

//             {isMobileMenuOpen && (
//                 <div
//                     className="mlab-sidebar-overlay no-print"
//                     onClick={() => setIsMobileMenuOpen(false)}
//                 />
//             )}

//             <div className="mlab-preview-banner no-print">
//                 <span className="mlab-preview-banner__title">Admin Preview Mode</span>
//                 <span className="mlab-preview-banner__body">
//                     You are viewing the assessment template. Learner answers cannot be saved here.
//                 </span>
//             </div>

//             <div className="mlab-preview-topbar no-print">
//                 <div className="mlab-preview-topbar__left">
//                     <button
//                         className="mlab-hamburger-btn no-print"
//                         onClick={() => setIsMobileMenuOpen(true)}
//                     >
//                         <Menu size={20} />
//                     </button>

//                     <button className="mlab-back-btn" onClick={() => navigate(-1)}>
//                         <ArrowLeft size={16} /> <span className="mlab-hide-mobile">Back to Builder</span>
//                     </button>
//                     <div className="mlab-preview-topbar__separator mlab-hide-mobile" />
//                     <h1 className="mlab-preview-topbar__title">
//                         {assessment.title}
//                     </h1>
//                 </div>

//                 <div className="mlab-preview-topbar__right">
//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <button className="mlab-topbar-manual-btn" onClick={() => window.open(assessment.referenceManualUrl, '_blank', 'noopener,noreferrer')} title="Open Reference Manual">
//                             <FileArchive size={16} /> <span className="mlab-hide-mobile">View Manual</span>
//                         </button>
//                     )}

//                     {timeLimit ? (
//                         <div className={`mlab-timer`}>
//                             <Timer size={14} /> {timeLimit}m Limit
//                         </div>
//                     ) : null}

//                     <span className="mlab-status-badge mlab-status-badge--locked">
//                         PREVIEW MODE
//                     </span>
//                 </div>
//             </div>

//             <div className="mlab-preview-body">

//                 <nav className={`mlab-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
//                     <button
//                         className="mlab-close-btn"
//                         onClick={() => setIsMobileMenuOpen(false)}
//                     >
//                         <X size={24} />
//                     </button>

//                     <div className="mlab-sidebar__meta-block">
//                         <div className="mlab-sidebar__meta-title">{assessment.title}</div>
//                         <div className="mlab-sidebar__detail"><BookOpen size={11} /> Module {assessment.moduleInfo?.moduleNumber || '—'}</div>
//                         <div className="mlab-sidebar__detail"><Scale size={11} /> {totalMarks} Total Marks</div>
//                         <div className="mlab-sidebar__chip"><Award size={11} /> Pass: 60%</div>
//                     </div>

//                     <div className="mlab-sidebar__label">Workbook Contents</div>
//                     <div className="mlab-sidebar__nav">
//                         {blocks.reduce((acc: any[], block: any) => {
//                             if (block.type === 'section') {
//                                 acc.push({ type: 'section', label: extractPlainText(block.title) || 'Section', id: block.id });
//                             } else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace', 'code_sandbox', 'graph', 'mathpad'].includes(block.type)) {
//                                 const cleanLabel = extractPlainText(block.question) || extractPlainText(block.title) || 'Workplace Checkpoint';
//                                 acc.push({ type: 'q', label: cleanLabel, id: block.id });
//                             }
//                             return acc;
//                         }, []).map((item: any) =>
//                             item.type === 'section'
//                                 ? <span key={item.id} className="mlab-sidebar__nav-item mlab-sidebar__nav-item--section">{item.label}</span>
//                                 : <a key={item.id} href={`#block-${item.id}`} className="mlab-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
//                         )}
//                     </div>
//                 </nav>

//                 <div className="mlab-preview-doc">
//                     <header className="mlab-preview-header">
//                         <span className="mlab-preview-header__eyebrow">
//                             {assessment.moduleType?.toUpperCase() || 'Assessment'} · {assessment.moduleInfo?.moduleNumber || ''}
//                         </span>
//                         <h1 className="mlab-preview-header__title">{assessment.title}</h1>
//                         <div className="mlab-preview-header__meta">
//                             <span style={{ color: 'orange', background: '#ffa60025' }}
//                                 className={`mlab-meta-chip mlab-meta-chip--type-${assessment.type.replace(/\s+/g, '-').toLowerCase()}`}>
//                                 {assessment.type}
//                             </span>
//                             <span className="mlab-meta-chip mlab-meta-chip--marks">
//                                 {totalMarks} Marks
//                             </span>
//                             <span className="mlab-meta-chip mlab-meta-chip--default" >
//                                 <FileText size={11} /> {qCount} Questions/Tasks
//                             </span>
//                             {timeLimit ? (
//                                 <span className="mlab-meta-chip mlab-meta-chip--time">
//                                     <Clock size={11} /> {timeLimit} Min Limit
//                                 </span>
//                             ) : null}

//                             {assessment?.requiresInvigilation && (
//                                 <span className="mlab-meta-chip" style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}>
//                                     <Video size={11} /> Live Proctoring Enabled
//                                 </span>
//                             )}
//                         </div>
//                     </header>

//                     {assessment?.requiresInvigilation && (
//                         <div className="mlab-openbook-banner" style={{ background: '#fff1f2', borderColor: '#fecdd3', borderLeftColor: '#e11d48', marginTop: '1.5rem' }}>
//                             <strong className="mlab-openbook-banner__title" style={{ color: '#be123c' }}>
//                                 <ShieldAlert size={16} /> Secure Proctored Environment
//                             </strong>
//                             <p className="mlab-openbook-banner__text" style={{ color: '#881337' }}>
//                                 This is a strictly invigilated assessment. Learners will be required to grant <strong>Camera and Microphone</strong> permissions and complete the test in <strong>Fullscreen Mode</strong>. Exiting fullscreen or switching browser tabs will immediately log a security violation to the Assessor.
//                             </p>
//                         </div>
//                     )}

//                     {assessment?.isOpenBook && assessment?.referenceManualUrl && (
//                         <div className="mlab-openbook-banner" style={{ marginTop: '1.5rem' }}>
//                             <strong className="mlab-openbook-banner__title"><FileArchive size={16} /> Open Book Assessment</strong>
//                             <p className="mlab-openbook-banner__text">
//                                 This is an open-book assessment. An official Reference Manual has been provided by your facilitator.
//                                 You will be able to access and read this manual inside the assessment player at any time.
//                             </p>
//                         </div>
//                     )}

//                     {assessment.instructions && (
//                         <div className="mlab-preview-instructions">
//                             <span className="mlab-preview-instructions__label">Learner Instructions</span>
//                             <div className="quill-read-only-content mlab-preview-instructions__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.instructions) }} />
//                         </div>
//                     )}

//                     {assessment.purpose && (
//                         <div className="mlab-preview-instructions" style={{ marginTop: '1rem' }}>
//                             <span className="mlab-preview-instructions__label">Module Purpose</span>
//                             <div className="quill-read-only-content mlab-preview-instructions__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(assessment.purpose) }} />
//                         </div>
//                     )}

//                     <div className="mlab-blocks">
//                         {blocks.map((block: any) => {

//                             /* Section header */
//                             if (block.type === 'section') return (
//                                 <div key={block.id} id={`block-${block.id}`} className="mlab-block-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                                     <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{block.title}</div>
//                                     {block.content && (
//                                         <div className="quill-read-only-content" style={{ fontSize: '0.95rem', color: '#475569', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                     )}
//                                     {renderBlockImage(block)}
//                                 </div>
//                             );

//                             /* Reading / info block */
//                             if (block.type === 'info') return (
//                                 <div key={block.id} id={`block-${block.id}`} className="mlab-block-info">
//                                     <div className="mlab-block-info__label">
//                                         <Info size={13} /> Reading Material
//                                     </div>
//                                     <div className="quill-read-only-content mlab-block-info__content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#475569' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
//                                     {renderBlockImage(block)}
//                                 </div>
//                             );

//                             /* Text question */
//                             if (block.type === 'text') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num">Q{qNum}</span>
//                                             <div className="mlab-block-question__text">
//                                                 {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {renderBlockImage(block)}
//                                             <textarea
//                                                 className="mlab-answer-textarea"
//                                                 disabled
//                                                 placeholder="Learner will type their answer here…"
//                                                 rows={4}
//                                             />
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* MCQ question */
//                             if (block.type === 'mcq') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num">Q{qNum}</span>
//                                             <div className="mlab-block-question__text">
//                                                 {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {renderBlockImage(block)}
//                                             <div className="mlab-mcq-options">
//                                                 {block.options.map((opt: string, i: number) => {
//                                                     const isCorrect = block.correctOption === i;
//                                                     return (
//                                                         <div
//                                                             key={i}
//                                                             className={`mlab-mcq-option${isCorrect ? ' mlab-mcq-option--correct' : ''}`}
//                                                         >
//                                                             <input type="radio" disabled checked={isCorrect} readOnly />
//                                                             <span className="mlab-mcq-option__letter">
//                                                                 {String.fromCharCode(65 + i)}.
//                                                             </span>
//                                                             <span className="mlab-mcq-option__text">{opt}</span>
//                                                             {isCorrect && (
//                                                                 <span className="mlab-mcq-option__correct-tag">
//                                                                     Correct Answer
//                                                                 </span>
//                                                             )}
//                                                         </div>
//                                                     );
//                                                 })}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* Multi-Modal Task */
//                             if (block.type === 'task') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#ede9fe', color: '#8b5cf6' }}>Q{qNum}</span>
//                                             <div className="mlab-block-question__text">
//                                                 {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
//                                             {renderBlockImage(block)}
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                                 <Layers size={16} color="#8b5cf6" />
//                                                 <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Multi-Modal Task (Learner Evidence Options):</span>
//                                             </div>
//                                             <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
//                                                 {block.allowText && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#e2e8f0', padding: '4px 10px', borderRadius: '20px', color: '#475569' }}><FileText size={12} /> Rich Text</span>}
//                                                 {block.allowAudio && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf4ff', padding: '4px 10px', borderRadius: '20px', color: '#d946ef', border: '1px solid #fbcfe8' }}><Mic size={12} /> Audio Recording</span>}
//                                                 {block.allowUrl && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', color: '#3b82f6', border: '1px solid #bfdbfe' }}><LinkIcon size={12} /> External URL</span>}
//                                                 {block.allowUpload && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#f5f3ff', padding: '4px 10px', borderRadius: '20px', color: '#8b5cf6', border: '1px solid #ddd6fe' }}><UploadCloud size={12} /> File Upload ({block.allowedFileTypes})</span>}
//                                                 {block.allowCode && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf2f8', padding: '4px 10px', borderRadius: '20px', color: '#ec4899', border: '1px solid #fbcfe8' }}><Code size={12} /> IDE / Code ({block.codeLanguage})</span>}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* LIVE IDE / CODE SANDBOX PREVIEW */
//                             if (block.type === 'code_sandbox') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#eff6ff', color: '#3b82f6' }}>IDE</span>
//                                             <div className="mlab-block-question__text">
//                                                 <div className="ap-code-sandbox-instructions" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', width: '100%' }}>
//                                                     {block.title && (
//                                                         <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
//                                                             {block.title}
//                                                         </h3>
//                                                     )}
//                                                     {block.question && (
//                                                         <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
//                                                     )}
//                                                 </div>
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {renderBlockImage(block)}

//                                             <CodeSandboxPlayer
//                                                 block={block}
//                                                 learnerAns={undefined}
//                                                 onChange={() => { }}
//                                                 readOnly={false}
//                                             />
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* 🚀 CARTEESIAN ENGINE WORKSPACE PLOT PREVIEW 🚀 */
//                             if (block.type === 'graph') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#ccfbf1', color: '#0f766e' }}>PLOT</span>
//                                             <div className="mlab-block-question__text">
//                                                 {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Graphing Task'}
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {renderBlockImage(block)}
//                                             <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: '#334155', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <BarChart size={14} /> Blank Cartesian Graph Grid Workspace Preview:
//                                             </div>
//                                             <PreviewAxisGraph block={block} />
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* 🚀 MATHPAD */
//                             if (block.type === 'mathpad') {
//                                 qNum++;
//                                 const isGraphMemoExpanded = expandedGraphMemos[block.id] || false;

//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#fce7f3', color: '#db2777' }}>MATH</span>
//                                             <div className="mlab-block-question__text">
//                                                 {block.question ? <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} /> : 'Untitled Question'}
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {renderBlockImage(block)}

//                                             <div className="mlab-answer-box" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
//                                                     <Sigma size={16} color="#db2777" />
//                                                     <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold' }}>Mathematical Workspace (Learner View):</span>
//                                                 </div>
//                                                 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
//                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#fdf2f8', padding: '4px 10px', borderRadius: '20px', color: '#be185d', border: '1px solid #fbcfe8' }}><Sigma size={12} /> Equation Editor</span>
//                                                     {block.allowGraphing !== false && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#f0fdf4', padding: '4px 10px', borderRadius: '20px', color: '#166534', border: '1px solid #bbf7d0' }}><BarChart size={12} /> Graphing Calculator</span>}
//                                                     {block.allowDrawing !== false && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Pencil size={12} /> Whiteboard Canvas</span>}
//                                                 </div>
//                                             </div>

//                                             {(block.correctAnswer || block.modelSolution || (block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0)) && (
//                                                 <div style={{ marginTop: '1rem', padding: '1rem', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '6px' }}>
//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#be185d', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 'bold' }}>
//                                                         <Lock size={14} /> Assessor Memorandum (Hidden from Learner)
//                                                     </div>

//                                                     {block.correctAnswer && (
//                                                         <div style={{ marginBottom: '12px' }}>
//                                                             <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Final Answer</div>
//                                                             {React.createElement('math-field', {
//                                                                 'read-only': 'true',
//                                                                 style: { width: '100%', fontSize: '1.2rem', padding: '8px', background: 'white', border: '1px solid #fbcfe8', borderRadius: '4px', color: '#0f172a' }
//                                                             }, block.correctAnswer)}
//                                                         </div>
//                                                     )}

//                                                     {block.modelSolution && (
//                                                         <div style={{ marginBottom: '12px' }}>
//                                                             <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#9d174d', marginBottom: '4px', textTransform: 'uppercase' }}>Step-by-Step Solution</div>
//                                                             <div className="quill-read-only-content" style={{ background: 'white', padding: '10px', borderRadius: '4px', border: '1px dashed #fbcfe8', fontSize: '0.9rem', color: '#334155' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.modelSolution) }} />
//                                                         </div>
//                                                     )}

//                                                     {(block.memoGraph?.points?.length > 0 || block.memoGraph?.shapes?.length > 0) && (
//                                                         <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #fbcfe8' }}>
//                                                             <div
//                                                                 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#fce7f3', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fbcfe8' }}
//                                                                 onClick={(e) => { e.stopPropagation(); toggleGraphMemo(block.id); }}
//                                                             >
//                                                                 <div>
//                                                                     <label style={{ color: '#9d174d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
//                                                                         <BarChart size={14} /> Expected Graph Solution
//                                                                     </label>
//                                                                     <p style={{ fontSize: '0.75rem', color: '#be185d', margin: '2px 0 0 0' }}>
//                                                                         Click to {isGraphMemoExpanded ? 'collapse' : 'expand'} the expected visual solution graph.
//                                                                     </p>
//                                                                 </div>
//                                                                 <div style={{ color: '#9d174d', padding: '4px', background: '#fdf2f8', borderRadius: '4px' }}>
//                                                                     {isGraphMemoExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
//                                                                 </div>
//                                                             </div>

//                                                             {isGraphMemoExpanded && (
//                                                                 <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease-out' }}>
//                                                                     <PreviewAxisGraph block={block} showMemo={true} />
//                                                                 </div>
//                                                             )}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* Practical Checklist */
//                             if (block.type === 'checklist') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>
//                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                 <div className="quill-read-only-content mlab-block-question__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
//                                                 <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>This section is completed by the Assessor/Mentor during observation.</span>
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             {block.criteria?.map((crit: string, i: number) => (
//                                                 <div key={i} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc' }}>
//                                                     <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#334155' }}>{i + 1}. {crit}</p>

//                                                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', opacity: 0.7 }}>
//                                                         {block.requireEvidencePerCriterion !== false && (
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', background: '#e0e7ff', padding: '4px 8px', borderRadius: '4px', color: '#1d4ed8' }}>
//                                                                 <UploadCloud size={14} /> Evidence Req.
//                                                             </div>
//                                                         )}
//                                                         {block.requirePerCriterionTiming !== false && (
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', color: '#475569' }}>
//                                                                 <Timer size={14} /> Task Timer
//                                                             </div>
//                                                         )}
//                                                         <div style={{ display: 'flex', gap: '5px' }}>
//                                                             <span style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}>○ Competent (C)</span>
//                                                             <span style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid #fecaca', borderRadius: '4px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold' }}>○ NYC</span>
//                                                         </div>
//                                                         <input type="text" disabled placeholder="Assessor comments..." style={{ flex: 1, minWidth: '200px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }} />
//                                                     </div>
//                                                 </div>
//                                             ))}

//                                             {block.requireObservationDeclaration !== false && (
//                                                 <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1', opacity: 0.8 }}>
//                                                     <h4 style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '10px', textTransform: 'uppercase' }}>Global Assessor / Mentor Sign-off</h4>
//                                                     {block.requireTimeTracking !== false && (
//                                                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
//                                                             <input type="text" className="ab-input" disabled placeholder="Date..." style={{ padding: '6px' }} />
//                                                             <input type="text" className="ab-input" disabled placeholder="Time Started..." style={{ padding: '6px' }} />
//                                                             <input type="text" className="ab-input" disabled placeholder="Time Completed..." style={{ padding: '6px' }} />
//                                                         </div>
//                                                     )}
//                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.8rem', color: '#334155', fontWeight: 'bold' }}>
//                                                         <input type="checkbox" disabled checked />
//                                                         I declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.
//                                                     </label>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* Workplace Logbook */
//                             if (block.type === 'logbook') {
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#ffedd5', color: '#ea580c' }}>LOG</span>
//                                             <span className="mlab-block-question__text">{block.title}</span>
//                                         </div>
//                                         <div className="mlab-block-question__body">
//                                             <div className="quill-read-only-content" style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />

//                                             <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
//                                                 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
//                                                     <thead>
//                                                         <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
//                                                             <th style={{ padding: '10px' }}>Date</th>
//                                                             <th style={{ padding: '10px' }}>Assignment Task</th>
//                                                             <th style={{ padding: '10px' }}>Start Time</th>
//                                                             <th style={{ padding: '10px' }}>Finish Time</th>
//                                                             <th style={{ padding: '10px' }}>Total Hours</th>
//                                                         </tr>
//                                                     </thead>
//                                                     <tbody>
//                                                         <tr style={{ background: 'white' }}>
//                                                             <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
//                                                                 Learner will be able to dynamically add and fill rows here.
//                                                             </td>
//                                                         </tr>
//                                                     </tbody>
//                                                 </table>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             /* QCTO Workplace Checkpoint */
//                             if (block.type === 'qcto_workplace') {
//                                 qNum++;
//                                 return (
//                                     <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
//                                         <div className="mlab-block-question__header">
//                                             <span className="mlab-block-question__num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>
//                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                 <div className="quill-read-only-content mlab-block-question__text" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title || 'Workplace Experience Checkpoint') }} />
//                                                 <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>SETA Compliant Workplace Reflection & Evidence.</span>
//                                             </div>
//                                             <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                         </div>
//                                         <div className="mlab-block-question__body" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }}>

//                                             {block.weCode && (
//                                                 <div style={{ marginBottom: '1rem' }}>
//                                                     <strong style={{ color: '#9f1239', display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Work Experience Module (WE Code):</strong>
//                                                     <span style={{ color: '#be123c', fontSize: '0.9rem' }}>{block.weCode} — {block.weTitle}</span>
//                                                 </div>
//                                             )}

//                                             {block.workActivities && block.workActivities.length > 0 && (
//                                                 <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fecdd3', marginBottom: '1rem' }}>
//                                                     <strong style={{ color: '#be123c', display: 'block', marginBottom: '10px', fontSize: '0.85rem' }}>Workplace Activities (WA) & Evidence Links:</strong>
//                                                     <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#4c0519', fontSize: '0.85rem' }}>
//                                                         {block.workActivities.map((wa: any, i: number) => (
//                                                             <li key={i} style={{ marginBottom: '10px' }}>
//                                                                 <strong>{wa.code}:</strong> {wa.description}
//                                                                 {wa.evidenceItems && wa.evidenceItems.length > 0 && (
//                                                                     <ul style={{ margin: '4px 0 0 0', paddingLeft: '1rem', listStyleType: 'circle', color: '#881337', fontSize: '0.8rem' }}>
//                                                                         {wa.evidenceItems.map((se: any, j: number) => (
//                                                                             <li key={j}><em>Evidence: {se.code} - {se.description}</em></li>
//                                                                         ))}
//                                                                     </ul>
//                                                                 )}
//                                                             </li>
//                                                         ))}
//                                                     </ul>
//                                                 </div>
//                                             )}

//                                             <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', borderTop: '1px dashed #fda4af', paddingTop: '15px', opacity: 0.8 }}>
//                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#9f1239', fontWeight: 'bold' }}>
//                                                     <input type="checkbox" disabled checked={block.requireSelfAssessment !== false} /> Requires Learner Self-Assessment
//                                                 </label>
//                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#9f1239', fontWeight: 'bold' }}>
//                                                     <input type="checkbox" disabled checked={block.requireGoalPlanning !== false} /> Requires Goal Planning
//                                                 </label>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 );
//                             }

//                             return null;
//                         })}
//                     </div>

//                     {/* ── Footer summary ── */}
//                     {blocks.length > 0 && (
//                         <div className="mlab-preview-footer">
//                             <span className="mlab-preview-footer__label">Assessment Summary</span>

//                             <div className="mlab-preview-footer__stat">
//                                 <span className="mlab-preview-footer__num">{qCount}</span>
//                                 <span className="mlab-preview-footer__unit">Questions / Tasks</span>
//                             </div>

//                             <div className="mlab-preview-footer__divider" />

//                             <div className="mlab-preview-footer__stat">
//                                 <span className="mlab-preview-footer__num">{totalMarks}</span>
//                                 <span className="mlab-preview-footer__unit">Total Marks</span>
//                             </div>

//                             {timeLimit ? (
//                                 <>
//                                     <div className="mlab-preview-footer__divider" />
//                                     <div className="mlab-preview-footer__stat">
//                                         <span className="mlab-preview-footer__num">{timeLimit}</span>
//                                         <span className="mlab-preview-footer__unit">Minutes</span>
//                                     </div>
//                                 </>
//                             ) : null}
//                         </div>
//                     )}

//                 </div>
//             </div>
//         </div>
//     );
// };