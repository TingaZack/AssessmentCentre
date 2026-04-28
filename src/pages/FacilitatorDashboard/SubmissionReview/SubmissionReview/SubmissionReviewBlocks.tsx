// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewBlocks.tsx
import React from 'react';
import {
    Award, Check, CheckCircle, X, Edit3, Info, Layers, FileText, Mic,
    UploadCloud, Code, Link as LinkIcon, CalendarRange, Timer, Play, Square,
    ShieldCheck, BarChart, AlertCircle
} from 'lucide-react';
import moment from 'moment';
import { LogbookHoursTally } from './SubmissionReviewHelpers';
import { FilePreview } from './SubmissionReviewPreviews';
import { UrlPreview } from '../../../../components/common/UrlPreview';

// ─── TYPES (mirror the original) ─────────────────────────────────────────────
export interface CriterionResult {
    status: 'C' | 'NYC' | null;
    comment: string;
    startTime: string;
    endTime: string;
}

export interface WorkplaceActivityResult {
    status: 'C' | 'NYC' | null;
    comment: string;
}

export interface GradeData {
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

// ─── PROPS INTERFACE ─────────────────────────────────────────────────────────
interface RenderBlocksProps {
    assessment: any;
    submission: any;
    facBreakdown: Record<string, GradeData>;
    assBreakdown: Record<string, GradeData>;
    modBreakdown: Record<string, GradeData>;
    activeTabs: Record<string, string>;
    setActiveTabs: (tabs: Record<string, string>) => void;
    sectionTotals: Record<string, { total: number; awarded: number }>;

    // Flags
    isPrintMode: boolean;
    canFacilitatorMark: boolean;
    canGrade: boolean;
    canModerate: boolean;
    isFacDone: boolean;
    isAssDone: boolean;
    isModDone: boolean;
    isMentor: boolean;
    isWorkplaceModule: boolean;
    savedFacRole: string;
    facReadOnlyLabel: string;

    // Handlers
    handleVisualMark: (blockId: string, isCorrect: boolean, maxMarks: number) => void;
    handleScoreChange: (blockId: string, score: number, max: number) => void;
    handleFeedbackChange: (blockId: string, feedback: string) => void;
    handleCriterionChange: (blockId: string, index: number, field: keyof CriterionResult, value: any) => void;
    handleActivityStatusChange: (blockId: string, index: number, status: 'C' | 'NYC') => void;
    handleActivityCommentChange: (blockId: string, index: number, comment: string) => void;
    handleGlobalChecklistChange: (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime' | 'obsDeclaration', value: any) => void;
    handleSetToNow: (blockId: string, field: 'obsDate' | 'obsStartTime' | 'obsEndTime') => void;
}

// ─── HELPER: CLEAN RICH TEXT (FIXES THE WORD-BREAK BUG) ──────────────────────
const cleanRichText = (html?: string) => {
    if (!html) return '';
    // Replaces Non-Breaking Spaces (&nbsp;) with standard spaces so the browser can wrap words normally!
    return html.replace(/&nbsp;/g, ' ');
};

// ─── HELPER: RENDER ATTACHED IMAGES ──────────────────────────────────────────
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

// ─── MAIN RENDER COMPONENT ───────────────────────────────────────────────────
export const RenderBlocks: React.FC<RenderBlocksProps> = (props) => {
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

    let qNum = 0;

    return assessment.blocks?.map((block: any) => {
        // ── SECTION ──────────────────────────────────────────────────────────────
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
                        <div className="quill-read-only-content" style={{ color: '#334155', fontSize: '0.95rem', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                    )}
                    {renderBlockImage(block)}
                </div>
            );
        }

        // ── INFO BLOCK ──────────────────────────────────────────────────────────
        if (block.type === 'info') {
            return (
                <div key={(isPrintMode ? 'print-' : '') + block.id} className="sr-q-card" style={{ borderLeft: '4px solid #0ea5e9', background: '#f0f9ff', padding: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 'bold', marginBottom: '8px' }}><Info size={16} /> Reading Material</div>
                    <div className="quill-read-only-content" style={{ margin: 0, color: '#0c4a6e', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.content) }} />
                    {renderBlockImage(block)}
                </div>
            );
        }

        // ── QUESTION / TASK / CHECKLIST / LOGBOOK / WORKPLACE ───────────────────
        if (['mcq', 'text', 'task', 'checklist', 'logbook', 'qcto_workplace'].includes(block.type)) {
            qNum++;
            const learnerAns = submission.answers?.[block.id];
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

            const renderFacReadOnly = (isFacDone || fData?.feedback || fData?.score > 0) && (!canFacilitatorMark || isPrintMode);
            const renderAssReadOnly = (isAssDone || aData?.feedback || aData?.score > 0) && (!canGrade || isPrintMode);
            const renderModReadOnly = (isModDone || mData?.feedback) && (!canModerate || isPrintMode);

            const mentorActiveOnScorableBlock = isMentor && canFacilitatorMark && ['mcq', 'text', 'task'].includes(block.type);

            let decData = activeData;
            let isDeclarationInteractive = isActiveRole;
            if (canModerate) {
                decData = isWorkplaceModule ? fData : aData;
                isDeclarationInteractive = false;
            } else if (canGrade && isWorkplaceModule) {
                decData = fData;
                isDeclarationInteractive = false;
            }

            // ── READ ONLY LAYERS (reused inside each block) ──────────────────────────
            const renderReadOnlyLayers = () => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: (!isPrintMode && isActiveRole) ? '1rem' : '0' }}>
                    {renderFacReadOnly && (
                        <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '4px' }}>
                            <div style={{ color: '#0284c7', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>
                                <Info size={13} /> {facReadOnlyLabel}
                            </div>
                            <div style={{ color: '#0369a1', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                {savedFacRole !== 'mentor' && !isWorkplaceModule && (
                                    <span style={{ fontWeight: 'bold', marginRight: '6px' }}>[{fData.score ?? 0}/{maxM}]</span>
                                )}
                                {fData.feedback || <em style={{ opacity: 0.7 }}>No specific {savedFacRole === 'mentor' ? 'supervisor comments' : 'coaching'} provided.</em>}
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
                if (canModerate && isWorkplaceModule) {
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
                            <input
                                type="number"
                                className="sr-score-input"
                                style={{ color: activeInkColor, width: '60px', padding: '4px 8px', border: `1px solid ${activeInkColor}`, borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}
                                value={activeData.score ?? 0}
                                onChange={e => handleScoreChange(blockId, parseInt(e.target.value) || 0, maxM)}
                            />
                            <span style={{ color: activeInkColor, fontWeight: 'bold' }}>/ {maxM}</span>
                        </div>
                        <div className="sr-feedback-wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <Edit3 size={16} color={activeInkColor} style={{ marginTop: '6px' }} />
                            <textarea
                                className="sr-feedback-input"
                                rows={2}
                                style={{ width: '100%', color: activeInkColor, fontStyle: 'italic', fontWeight: 500, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
                                placeholder={canModerate ? "Moderator Green Pen QA Notes..." : canGrade ? "Assessor Red Pen feedback..." : "Facilitator Blue Pen feedback..."}
                                value={activeData.feedback || ''}
                                onChange={e => handleFeedbackChange(blockId, e.target.value)}
                            />
                        </div>
                    </>
                );
            };

            // ── MCQ ────────────────────────────────────────────────────────────────
            if (block.type === 'mcq') {
                return (
                    <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
                                <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
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

            // ── TEXT ───────────────────────────────────────────────────────────────
            if (block.type === 'text') {
                return (
                    <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#f1f5f9', color: '#073f4e', flexShrink: 0 }}>Q{qNum}</span>
                                <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
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
                            <div className="sr-answer-box">
                                <div className="sr-answer-label" style={{ color: 'black' }}>Learner's Response:</div>
                                <div className="sr-text-ans">
                                    {learnerAns ? <div className="quill-read-only-content" style={{ color: 'black', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(learnerAns) }} /> : <span style={{ color: 'black', fontStyle: 'italic' }}>No answer provided.</span>}
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

            // ── TASK ──────────────────────────────────────────────────────────────
            if (block.type === 'task') {
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
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#ede9fe', color: '#8b5cf6', flexShrink: 0 }}>Q{qNum}</span>
                                <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.question) }} />
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
                            <div className="sr-answer-box">
                                <div className="sr-answer-label" style={{ color: 'black', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Learner Evidence Submitted:</div>
                                {(!learnerAns || Object.keys(learnerAns).length === 0) ? (
                                    <span style={{ color: '#64748b', fontStyle: 'italic', display: 'block', padding: '10px' }}>No evidence uploaded by learner.</span>
                                ) : isPrintMode ? (
                                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: 'white' }}>
                                        {safeLearnerAns.text && <div style={{ marginBottom: '10px' }}><strong style={{ fontSize: '0.75rem', color: '#475569' }}>Rich Text Response:</strong><div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(safeLearnerAns.text) }} /></div>}
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
                                            {activeTabId === 'text' && <div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(safeLearnerAns.text) }} />}
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

            // ── LOGBOOK ───────────────────────────────────────────────────────────
            if (block.type === 'logbook') {
                const entries = Array.isArray(learnerAns) ? learnerAns : [];
                const totalHours = entries.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0);

                return (
                    <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#ffedd5', color: '#ea580c', flexShrink: 0 }}>LOG</span>
                                <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, flex: 1, minWidth: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
                            </div>
                        </div>
                        <div className="sr-q-body">
                            {renderBlockImage(block)}
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
                                                                <div className="quill-read-only-content" style={{ fontSize: '0.85rem', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(entry.task) || '<em>No task description provided.</em>' }} />
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

            // ── CHECKLIST ─────────────────────────────────────────────────────────
            if (block.type === 'checklist') {
                return (
                    <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#ccfbf1', color: '#0d9488', flexShrink: 0 }}>CHK</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                    <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(block.title) }} />
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {isMentor ? 'Workplace observation checklist — verify each criterion.' : 'Assessor observation checklist.'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="sr-q-body">
                            {renderBlockImage(block)}
                            <div style={{ marginTop: '1rem' }}>
                                {block.criteria?.map((crit: string, i: number) => {
                                    const mentorResult = fData.criteriaResults?.[i] || { status: null, comment: '' };
                                    const assessorResult = aData.criteriaResults?.[i] || { status: null, comment: '' };
                                    const modResult = mData.criteriaResults?.[i] || { status: null, comment: '' };
                                    const myResult = activeData.criteriaResults?.[i] || { status: null, comment: '', startTime: '', endTime: '' };

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
                                                        {critEvidence.text && <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(critEvidence.text) }} />}
                                                    </div>
                                                );
                                            })()}

                                            {/* READ ONLY LAYERS */}
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
                                                    {block.requirePerCriterionTiming !== false && !canModerate && (
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
                                                        <textarea
                                                            className="ab-input"
                                                            disabled={canModerate && !isWorkplaceModule && !myResult.comment}
                                                            rows={2}
                                                            placeholder={isMentor ? "Supervisor observation notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."}
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

            // ── QCTO WORKPLACE ───────────────────────────────────────────────
            if (block.type === 'qcto_workplace') {
                return (
                    <div key={block.id} className="sr-q-card" style={{ borderTop: '4px solid black', marginBottom: '2rem' }}>
                        <div className="sr-q-header">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                                <span className="sr-q-num" style={{ background: '#ffe4e6', color: '#e11d48', flexShrink: 0 }}>QCTO</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                    <div className="sr-q-text quill-read-only-content" style={{ color: '#073f4e', fontWeight: 'bold', margin: 0, wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanRichText(`${block.weCode} – ${block.weTitle}`) }} />
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {isMentor ? 'Workplace Experience — Mentor Verification' : 'Workplace Experience Checkpoint'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="sr-q-body">
                            {renderBlockImage(block)}
                            {block.workActivities?.map((wa: any, actIdx: number) => {
                                const taskKey = `wa_${wa.id}_task`;
                                const dateKey = `wa_${wa.id}_date`;
                                const task = learnerAns?.[taskKey] || '';
                                const date = learnerAns?.[dateKey] || '';

                                const mentorResult = fData.activityResults?.[actIdx] || { status: null, comment: '' };
                                const assessorResult = aData.activityResults?.[actIdx] || { status: null, comment: '' };
                                const modResult = mData.activityResults?.[actIdx] || { status: null, comment: '' };
                                const myResult = activeData.activityResults?.[actIdx] || { status: null, comment: '' };

                                const displayResult = canModerate ? assessorResult : myResult;

                                return (
                                    <div key={wa.id} style={{ marginBottom: '2rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: isActiveRole ? 'white' : '#f8fafc' }}>
                                        <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <h4 style={{ margin: 0, color: '#073f4e' }}>{wa.code}: {wa.description}</h4>
                                        </div>
                                        <div style={{ padding: '1rem' }}>
                                            {/* Learner Evidence */}
                                            <div style={{ marginBottom: '1.5rem' }}>
                                                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
                                                    {task && <div style={{ flex: 1, minWidth: '250px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Task Performed:</strong><div className="quill-read-only-content" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', marginTop: '6px' }} dangerouslySetInnerHTML={{ __html: cleanRichText(task) }} /></div>}
                                                    {date && <div style={{ minWidth: '120px' }}><strong style={{ fontSize: '0.75rem', color: '#64748b' }}>Date:</strong><div style={{ marginTop: '6px' }}>{new Date(date).toLocaleDateString()}</div></div>}
                                                </div>

                                                {wa.evidenceItems?.map((evItem: any) => {
                                                    const seKey = `se_${evItem.id}`;
                                                    const seData = learnerAns?.[seKey] || {};
                                                    return (
                                                        <div key={evItem.id} style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#e11d48', display: 'block', marginBottom: '8px' }}>
                                                                Evidence: {evItem.code} - {evItem.description}
                                                            </span>
                                                            {seData.uploadUrl && <div style={{ marginBottom: '10px' }}><FilePreview url={seData.uploadUrl} /></div>}
                                                            {seData.url && <div style={{ marginBottom: '10px' }}><UrlPreview url={seData.url} /></div>}
                                                            {seData.code && <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', marginBottom: '10px' }}><code>{seData.code}</code></pre>}
                                                            {seData.text && <div className="quill-read-only-content" dangerouslySetInnerHTML={{ __html: cleanRichText(seData.text) }} />}
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
                                                            <textarea
                                                                className="ab-input"
                                                                disabled={canModerate && !myResult.comment}
                                                                rows={2}
                                                                placeholder={isMentor ? "Supervisor verification notes..." : canModerate ? "Assessor's comments" : "Assessor comments / reasoning..."}
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
                            <div className="ap-workplace__toggles" style={{ marginTop: '1rem' }}>
                                {block.requireSelfAssessment !== false && <label className={`ap-workplace__toggle${learnerAns?.selfAssessmentDone ? ' ap-workplace__toggle--checked' : ''}`}><CheckCircle size={16} color={learnerAns?.selfAssessmentDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} /><span className="ap-workplace__toggle-label" style={{ color: learnerAns?.selfAssessmentDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner completed self-assessment.</span></label>}
                                {block.requireGoalPlanning !== false && <label className={`ap-workplace__toggle${learnerAns?.goalPlanningDone ? ' ap-workplace__toggle--checked' : ''}`}><CheckCircle size={16} color={learnerAns?.goalPlanningDone ? 'var(--mlab-green)' : 'var(--mlab-grey-light)'} /><span className="ap-workplace__toggle-label" style={{ color: learnerAns?.goalPlanningDone ? 'black' : 'var(--mlab-grey-light)' }}>Learner updated goal planning document.</span></label>}
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
    });
};