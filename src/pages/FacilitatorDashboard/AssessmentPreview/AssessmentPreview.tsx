// src/pages/FacilitatorDashboard/AssessmentPreview.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Info } from 'lucide-react';
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

    return (
        <div className="mlab-preview">

            {/* ── Admin Warning Banner ──────────────────────────────────── */}
            <div className="mlab-preview-banner">
                <span className="mlab-preview-banner__title">Admin Preview Mode</span>
                <span className="mlab-preview-banner__body">
                    You are viewing the assessment template. Answers cannot be saved here.
                </span>
            </div>

            {/* ── Back Button ───────────────────────────────────────────── */}
            <button className="mlab-back-btn" onClick={() => navigate(-1)}>
                <ArrowLeft size={15} /> Go Back
            </button>

            {/* ── Assessment Header ─────────────────────────────────────── */}
            <header className="mlab-preview-header">
                <h1 className="mlab-preview-header__title">{assessment.title}</h1>
                <div className="mlab-preview-header__meta">
                    <span>
                        Type: <strong>{assessment.type}</strong>
                    </span>
                    <span className="mlab-preview-header__meta-sep">•</span>
                    <span>
                        Total Marks:&nbsp;
                        <span className="mlab-meta-chip">{assessment.totalMarks} Marks</span>
                    </span>
                </div>
            </header>

            {/* ── Assessment Blocks ─────────────────────────────────────── */}
            <div className="mlab-blocks">
                {assessment.blocks?.map((block: any) => {

                    /* ── Section Header ──────────────────────────────────── */
                    if (block.type === 'section') {
                        return (
                            <div key={block.id} className="mlab-block-section">
                                {block.title}
                            </div>
                        );
                    }

                    /* ── Info / Reading Block ─────────────────────────────── */
                    if (block.type === 'info') {
                        return (
                            <div key={block.id} className="mlab-block-info">
                                <div className="mlab-block-info__label">
                                    <Info size={15} /> Reading Material
                                </div>
                                <p className="mlab-block-info__content">{block.content}</p>
                            </div>
                        );
                    }

                    /* ── Text Question ────────────────────────────────────── */
                    if (block.type === 'text') {
                        return (
                            <div key={block.id} className="mlab-block-question">
                                <div className="mlab-block-question__header">
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

                    /* ── MCQ Question ─────────────────────────────────────── */
                    if (block.type === 'mcq') {
                        return (
                            <div key={block.id} className="mlab-block-question">
                                <div className="mlab-block-question__header">
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
        </div>
    );
};