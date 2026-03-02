// src/pages/FacilitatorDashboard/AssessmentPreview.tsx


// src/pages/FacilitatorDashboard/AssessmentPreview/AssessmentPreview.tsx
// mLab CI v2.1 — Official QCTO workbook preview aesthetic

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Info, Clock, FileText, CheckSquare } from 'lucide-react';
import { db } from '../../../lib/firebase';
import './AssessmentPreview.css';

export const AssessmentPreview: React.FC = () => {
    const { assessmentId } = useParams<{ assessmentId: string }>();
    const navigate = useNavigate();
    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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
    const qBlocks = blocks.filter((b: any) => b.type === 'text' || b.type === 'mcq');
    const qCount = qBlocks.length;
    const totalMarks = assessment.totalMarks ?? qBlocks.reduce((s: number, b: any) => s + (b.marks || 0), 0);
    const timeLimit = assessment.moduleInfo?.timeLimit;

    // Running question number across all blocks
    let qNum = 0;

    return (
        <div className="mlab-preview">

            {/* ── Admin warning banner ── */}
            <div className="mlab-preview-banner">
                <span className="mlab-preview-banner__title">Admin Preview Mode</span>
                <span className="mlab-preview-banner__body">
                    You are viewing the assessment template. Learner answers cannot be saved here.
                </span>
            </div>

            {/* ── Back nav ── */}
            <div className="mlab-preview-nav">
                <button className="mlab-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeft size={14} /> Back to Builder
                </button>
            </div>

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
                        <span className="mlab-meta-chip mlab-meta-chip--default">
                            <FileText size={11} /> {qCount} Questions
                        </span>
                        {timeLimit ? (
                            <span className="mlab-meta-chip mlab-meta-chip--time">
                                <Clock size={11} /> {timeLimit} Min Limit
                            </span>
                        ) : null}
                    </div>
                </header>

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
                            <div key={block.id} className="mlab-block-section">
                                {block.title}
                            </div>
                        );

                        /* Reading / info block */
                        if (block.type === 'info') return (
                            <div key={block.id} className="mlab-block-info">
                                <div className="mlab-block-info__label">
                                    <Info size={13} /> Reading Material
                                </div>
                                <p className="mlab-block-info__content">{block.content}</p>
                            </div>
                        );

                        /* Text question */
                        if (block.type === 'text') {
                            qNum++;
                            return (
                                <div key={block.id} className="mlab-block-question">
                                    <div className="mlab-block-question__header">
                                        <span className="mlab-block-question__num">Q{qNum}</span>
                                        <span className="mlab-block-question__text">{block.question}</span>
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
                                <div key={block.id} className="mlab-block-question">
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

                        return null;
                    })}
                </div>

                {/* ── Footer summary ── */}
                {blocks.length > 0 && (
                    <div className="mlab-preview-footer">
                        <span className="mlab-preview-footer__label">Assessment Summary</span>

                        <div className="mlab-preview-footer__stat">
                            <span className="mlab-preview-footer__num">{qCount}</span>
                            <span className="mlab-preview-footer__unit">Questions</span>
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
    );
};


// import React, { useState, useEffect } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, getDoc } from 'firebase/firestore';
// import { ArrowLeft, Info } from 'lucide-react';
// import { db } from '../../../lib/firebase';
// import './AssessmentPreview.css';

// export const AssessmentPreview: React.FC = () => {
//     const { assessmentId } = useParams<{ assessmentId: string }>();
//     const navigate = useNavigate();
//     const [assessment, setAssessment] = useState<any>(null);
//     const [loading, setLoading] = useState(true);

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

//     return (
//         <div className="mlab-preview">

//             {/* ── Admin Warning Banner ──────────────────────────────────── */}
//             <div className="mlab-preview-banner">
//                 <span className="mlab-preview-banner__title">Admin Preview Mode</span>
//                 <span className="mlab-preview-banner__body">
//                     You are viewing the assessment template. Answers cannot be saved here.
//                 </span>
//             </div>

//             {/* ── Back Button ───────────────────────────────────────────── */}
//             <button className="mlab-back-btn" onClick={() => navigate(-1)}>
//                 <ArrowLeft size={15} /> Go Back
//             </button>

//             {/* ── Assessment Header ─────────────────────────────────────── */}
//             <header className="mlab-preview-header">
//                 <h1 className="mlab-preview-header__title">{assessment.title}</h1>
//                 <div className="mlab-preview-header__meta">
//                     <span>
//                         Type: <strong>{assessment.type}</strong>
//                     </span>
//                     <span className="mlab-preview-header__meta-sep">•</span>
//                     <span>
//                         Total Marks:&nbsp;
//                         <span className="mlab-meta-chip">{assessment.totalMarks} Marks</span>
//                     </span>
//                 </div>
//             </header>

//             {/* ── Assessment Blocks ─────────────────────────────────────── */}
//             <div className="mlab-blocks">
//                 {assessment.blocks?.map((block: any) => {

//                     /* ── Section Header ──────────────────────────────────── */
//                     if (block.type === 'section') {
//                         return (
//                             <div key={block.id} className="mlab-block-section">
//                                 {block.title}
//                             </div>
//                         );
//                     }

//                     /* ── Info / Reading Block ─────────────────────────────── */
//                     if (block.type === 'info') {
//                         return (
//                             <div key={block.id} className="mlab-block-info">
//                                 <div className="mlab-block-info__label">
//                                     <Info size={15} /> Reading Material
//                                 </div>
//                                 <p className="mlab-block-info__content">{block.content}</p>
//                             </div>
//                         );
//                     }

//                     /* ── Text Question ────────────────────────────────────── */
//                     if (block.type === 'text') {
//                         return (
//                             <div key={block.id} className="mlab-block-question">
//                                 <div className="mlab-block-question__header">
//                                     <span className="mlab-block-question__text">{block.question}</span>
//                                     <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                 </div>
//                                 <div className="mlab-block-question__body">
//                                     <textarea
//                                         className="mlab-answer-textarea"
//                                         disabled
//                                         placeholder="Learner will type their answer here…"
//                                         rows={4}
//                                     />
//                                 </div>
//                             </div>
//                         );
//                     }

//                     /* ── MCQ Question ─────────────────────────────────────── */
//                     if (block.type === 'mcq') {
//                         return (
//                             <div key={block.id} className="mlab-block-question">
//                                 <div className="mlab-block-question__header">
//                                     <span className="mlab-block-question__text">{block.question}</span>
//                                     <span className="mlab-block-question__marks">{block.marks} Marks</span>
//                                 </div>
//                                 <div className="mlab-block-question__body">
//                                     <div className="mlab-mcq-options">
//                                         {block.options.map((opt: string, i: number) => {
//                                             const isCorrect = block.correctOption === i;
//                                             return (
//                                                 <div
//                                                     key={i}
//                                                     className={`mlab-mcq-option${isCorrect ? ' mlab-mcq-option--correct' : ''}`}
//                                                 >
//                                                     <input type="radio" disabled checked={isCorrect} readOnly />
//                                                     <span className="mlab-mcq-option__letter">
//                                                         {String.fromCharCode(65 + i)}.
//                                                     </span>
//                                                     <span className="mlab-mcq-option__text">{opt}</span>
//                                                     {isCorrect && (
//                                                         <span className="mlab-mcq-option__correct-tag">
//                                                             Correct Answer
//                                                         </span>
//                                                     )}
//                                                 </div>
//                                             );
//                                         })}
//                                     </div>
//                                 </div>
//                             </div>
//                         );
//                     }

//                     return null;
//                 })}
//             </div>
//         </div>
//     );
// };