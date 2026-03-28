// src/pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
    ArrowLeft, Info, Clock, FileText, CheckSquare,
    Layers, UploadCloud, Mic, Link as LinkIcon, Code, Timer, ListChecks, CalendarRange, Briefcase, FileArchive, Menu, X, BarChart,
    BookOpen,
    Scale,
    Award,
    ShieldAlert,
    Video
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import './AssessmentPreview.css';

export const AssessmentPreview: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    const qBlocks = blocks.filter((b: any) => ['text', 'mcq', 'task', 'checklist', 'qcto_workplace'].includes(b.type));
    const qCount = qBlocks.length;
    const totalMarks = assessment.totalMarks ?? blocks.reduce((s: number, b: any) => s + (Number(b.marks) || 0), 0);
    const timeLimit = assessment.moduleInfo?.timeLimit;

    // Running question number across all blocks
    let qNum = 0;

    return (
        <div className="mlab-preview">

            {/* OVERLAY FOR MOBILE SIDEBAR */}
            {isMobileMenuOpen && (
                <div
                    className="mlab-sidebar-overlay no-print"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* ── Admin warning banner ── */}
            <div className="mlab-preview-banner no-print">
                <span className="mlab-preview-banner__title">Admin Preview Mode</span>
                <span className="mlab-preview-banner__body">
                    You are viewing the assessment template. Learner answers cannot be saved here.
                </span>
            </div>

            {/* ── TOP BAR (Matching Player) ── */}
            <div className="mlab-preview-topbar no-print">
                <div className="mlab-preview-topbar__left">
                    {/* MOBILE HAMBURGER MENU */}
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
                    {/* OPEN BOOK PDF BUTTON IN PREVIEW TOPBAR */}
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

            {/* ── BODY WRAPPER FOR DRAWER ── */}
            <div className="mlab-preview-body">

                {/* ── LEFT SIDEBAR (Mobile Drawer) ── */}
                <nav className={`mlab-sidebar no-print ${isMobileMenuOpen ? 'open' : ''}`}>
                    {/* CLOSE BUTTON FOR MOBILE SIDEBAR */}
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
                            if (block.type === 'section') acc.push({ type: 'section', label: block.title, id: block.id });
                            else if (['text', 'mcq', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type))
                                acc.push({ type: 'q', label: block.question || block.title || 'Workplace Checkpoint', id: block.id });
                            return acc;
                        }, []).map((item: any) =>
                            item.type === 'section'
                                ? <span key={item.id} className="mlab-sidebar__nav-item mlab-sidebar__nav-item--section">{item.label}</span>
                                : <a key={item.id} href={`#block-${item.id}`} className="mlab-sidebar__nav-item" onClick={() => setIsMobileMenuOpen(false)}>{item.label?.length > 36 ? item.label.slice(0, 36) + '…' : item.label}</a>
                        )}
                    </div>
                </nav>

                {/* ── CONTENT ── */}
                <div className="mlab-preview-doc">
                    {/* ── Assessment Header ── */}
                    <header className="mlab-preview-header">
                        <span className="mlab-preview-header__eyebrow">
                            {assessment.moduleType?.toUpperCase() || 'Assessment'} · {assessment.moduleInfo?.moduleNumber || ''}
                        </span>
                        <h1 className="mlab-preview-header__title">{assessment.title}</h1>
                        <div className="mlab-preview-header__meta">
                            <span className={`mlab-meta-chip mlab-meta-chip--type-${assessment.type}`}>
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

                            {/* PROCTORING BADGE ON PREVIEW */}
                            {assessment?.requiresInvigilation && (
                                <span className="mlab-meta-chip" style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}>
                                    <Video size={11} /> Live Proctoring Enabled
                                </span>
                            )}
                        </div>
                    </header>

                    {/* PROCTORING WARNING BANNER (Only on Knowledge Exams) */}
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

                    {/* ── Open Book Banner ── */}
                    {assessment?.isOpenBook && assessment?.referenceManualUrl && (
                        <div className="mlab-openbook-banner" style={{ marginTop: '1.5rem' }}>
                            <strong className="mlab-openbook-banner__title"><FileArchive size={16} /> Open Book Assessment</strong>
                            <p className="mlab-openbook-banner__text">
                                This is an open-book assessment. An official Reference Manual has been provided by your facilitator.
                                You will be able to access and read this manual inside the assessment player at any time.
                            </p>
                        </div>
                    )}

                    {/* ── Instructions ── */}
                    {assessment.instructions && (
                        <div className="mlab-preview-instructions">
                            <span className="mlab-preview-instructions__label">Learner Instructions</span>
                            <p className="mlab-preview-instructions__text">{assessment.instructions}</p>
                        </div>
                    )}

                    {/* ── Blocks ── */}
                    <div className="mlab-blocks">
                        {blocks.map((block: any) => {

                            /* Section header */
                            if (block.type === 'section') return (
                                <div key={block.id} id={`block-${block.id}`} className="mlab-block-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, }}>{block.title}</div>
                                    {block.content && (
                                        <div className="quill-read-only-content" style={{ fontSize: '0.95rem', color: '#334155' }} dangerouslySetInnerHTML={{ __html: block.content }} />
                                    )}
                                </div>
                            );

                            /* Reading / info block */
                            if (block.type === 'info') return (
                                <div key={block.id} id={`block-${block.id}`} className="mlab-block-info">
                                    <div className="mlab-block-info__label">
                                        <Info size={13} /> Reading Material
                                    </div>
                                    <p className="mlab-block-info__content" style={{ whiteSpace: 'pre-wrap', color: 'whi' }}>{block.content}</p>
                                </div>
                            );

                            /* Text question */
                            if (block.type === 'text') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header" style={{ color: 'white' }}>
                                            <span className="mlab-block-question__num">Q{qNum}</span>
                                            <span className="mlab-block-question__text" >{block.question}</span>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
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
                                            <span className="mlab-block-question__text">{block.question}</span>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
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
                                            <span className="mlab-block-question__text">{block.question}</span>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
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

                            /* Practical Checklist */
                            if (block.type === 'checklist') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="mlab-block-question__text">{block.title}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>This section is completed by the Assessor/Mentor during observation.</span>
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body">
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
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>{block.content}</p>
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

                            /* 🚀 UPDATED: QCTO Workplace Checkpoint (Matches new schema) */
                            if (block.type === 'qcto_workplace') {
                                qNum++;
                                return (
                                    <div key={block.id} id={`block-${block.id}`} className="mlab-block-question">
                                        <div className="mlab-block-question__header">
                                            <span className="mlab-block-question__num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="mlab-block-question__text">{block.title || 'Workplace Experience Checkpoint'}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>SETA Compliant Workplace Reflection & Evidence.</span>
                                            </div>
                                            <span className="mlab-block-question__marks">{block.marks} Marks</span>
                                        </div>
                                        <div className="mlab-block-question__body" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }}>

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