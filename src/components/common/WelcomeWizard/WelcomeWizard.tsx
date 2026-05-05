// src/components/common/WelcomeWizard/WelcomeWizard.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronRight, ChevronLeft, X, ShieldCheck, GraduationCap,
    FileText, CheckCircle2, Users, Database, Compass,
    Loader2, BookOpen, Award, BarChart2, Upload,
    Lock, Eye, Zap, Layers, PenTool, Bell
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { UserProfile } from '../../../types/auth.types';
import './WelcomeWizard.css';

interface Slide {
    icon: React.ReactNode;
    accent: string;
    tag: string;
    title: string;
    desc: string;
    bullets: string[];
}

const SLIDES: Record<string, Slide[]> = {
    learner: [
        {
            icon: <GraduationCap size={36} />,
            accent: 'green',
            tag: '01 · Get Oriented',
            title: 'Welcome to Your Learning Hub',
            desc: 'This is your personal command centre for tracking every module, assessment, and qualification milestone throughout your programme.',
            bullets: [
                'View all your assigned assessments in one place',
                'Track competency status across knowledge, practical, and workplace modules',
                'Download your official Statement of Results once certified',
            ],
        },
        {
            icon: <FileText size={36} />,
            accent: 'blue',
            tag: '02 · Your Evidence Vault',
            title: 'Secure Digital Portfolio',
            desc: 'Your Portfolio of Evidence (PoE) is your official record of learning. Every submission, feedback note, and document is stored here and linked to your qualification.',
            bullets: [
                'Upload your ID, CV, and highest qualifications securely',
                'All submissions are time-stamped and tamper-proof',
                'Your facilitator and assessor review evidence directly in the system',
            ],
        },
        {
            icon: <PenTool size={36} />,
            accent: 'amber',
            tag: '03 · Assessments',
            title: 'How Assessments Work',
            desc: 'Each module goes through a structured grading pipeline — from submission, through facilitator pre-marking, to final assessor endorsement and moderator sign-off.',
            bullets: [
                'Submit written, practical, and workplace assessments online',
                'Receive structured feedback at each stage of the pipeline',
                'If marked Not Yet Competent, your facilitator logs a coaching session and unlocks a new attempt',
            ],
        },
        {
            icon: <ShieldCheck size={36} />,
            accent: 'green',
            tag: '04 · Your Credential',
            title: 'Blockchain-Verified Certificate',
            desc: 'Once all modules are signed off by your moderator, your final certificate is cryptographically anchored on the blockchain — making it permanently verifiable by any employer, anywhere in the world.',
            bullets: [
                'QR code on every certificate links directly to a live verification page',
                'Employers can verify authenticity in seconds — no phone calls needed',
                'Certificates cannot be forged, altered, or revoked without a full audit trail',
            ],
        },
    ],

    admin: [
        {
            icon: <Database size={36} />,
            accent: 'green',
            tag: '01 · Command Centre',
            title: 'Admin Overview',
            desc: 'You have full institutional access. From here, you manage learners, staff, cohorts, assessments, compliance documents, and system-wide settings.',
            bullets: [
                'Manage multiple cohorts across different programmes and intakes',
                'Assign facilitators, assessors, and moderators to specific cohorts',
                'Generate QCTO-compliant reports and PoE packages for audits',
            ],
        },
        {
            icon: <Users size={36} />,
            accent: 'blue',
            tag: '02 · Learner Management',
            title: 'Smart Staging Area',
            desc: 'When importing learners via CSV, they first enter a Staging Area where the system validates data, detects duplicates, and prevents corruption before live enrolment.',
            bullets: [
                'Bulk import via CSV with automatic field mapping',
                'Duplicate detection prevents double-enrolling learners',
                'Review and correct flagged records before activating them',
            ],
        },
        {
            icon: <BarChart2 size={36} />,
            accent: 'amber',
            tag: '03 · Assessment Oversight',
            title: 'Full Marking Pipeline Visibility',
            desc: 'Track every submission in real time — from learner submission through facilitator review, assessor grading, and final moderation.',
            bullets: [
                'Dashboard shows the pipeline status for every active learner',
                'Flag and manage appeals or moderation returns centrally',
                'Unlock remediation attempts with a full audit log',
            ],
        },
        {
            icon: <ShieldCheck size={36} />,
            accent: 'green',
            tag: '04 · Compliance & Export',
            title: 'Compliance & PoE Generation',
            desc: 'Generate full Master Portfolios of Evidence (Master PoE) as professionally formatted PDF exports — structured to QCTO standards and ready for external moderator review.',
            bullets: [
                'One-click Master PoE generation per learner',
                'Includes all transcripts, evidence links, signatures, and annexures',
                'Blockchain credentials issued directly from the Settings panel',
            ],
        },
    ],

    facilitator: [
        {
            icon: <Users size={36} />,
            accent: 'green',
            tag: '01 · Your Dashboard',
            title: 'Facilitator Overview',
            desc: 'Your dashboard shows your active cohorts, pending submissions waiting for your pre-marking, and a real-time view of how your learners are progressing.',
            bullets: [
                'See which learners have submitted and which are still in progress',
                'Pre-mark submissions before they go to the assessor',
                'Track time spent per submission for compliance logging',
            ],
        },
        {
            icon: <PenTool size={36} />,
            accent: 'blue',
            tag: '02 · Pre-Marking',
            title: 'Review & Annotate',
            desc: 'When a learner submits an assessment, it lands in your queue first. You review each question, add structured feedback, and pass it to the assessor with your overall recommendation.',
            bullets: [
                'Leave line-by-line feedback per question — visible to learner and assessor',
                'Mark criteria as Met or Not Met for each evidence item',
                'Overall facilitation note is captured with your digital signature',
            ],
        },
        {
            icon: <Bell size={36} />,
            accent: 'amber',
            tag: '03 · Remediation',
            title: 'Coaching & Unlocking',
            desc: 'If a learner is marked Not Yet Competent by the assessor, you facilitate a coaching session. You then log the intervention and unlock the module for a new attempt.',
            bullets: [
                'Log coaching date, notes, and confirm learner readiness',
                'System enforces a maximum of 3 attempts per module',
                'Complete coaching history is preserved in the PoE audit trail',
            ],
        },
    ],

    assessor: [
        {
            icon: <Award size={36} />,
            accent: 'green',
            tag: '01 · Marking Centre',
            title: 'Your Assessor Role',
            desc: 'Your role begins after the facilitator has pre-marked a submission. You make the official Competent / Not Yet Competent determination — your decision is legally binding.',
            bullets: [
                'Review both the learner\'s evidence and the facilitator\'s notes',
                'Override or confirm facilitator marks per question',
                'Your registered assessor number is embedded in every signed document',
            ],
        },
        {
            icon: <Eye size={36} />,
            accent: 'blue',
            tag: '02 · Evidence Review',
            title: 'Examining Evidence',
            desc: 'Each assessment block shows the original question, the learner\'s uploaded answer (text, file, or link), and the facilitator\'s line-by-line comments for your review.',
            bullets: [
                'View uploaded files, external links, and written responses side by side',
                'Add your own per-question assessor notes in red ink (QCTO standard)',
                'Score visible in real time as you work through each criterion',
            ],
        },
        {
            icon: <Lock size={36} />,
            accent: 'amber',
            tag: '03 · Sign & Submit',
            title: 'Digital Endorsement',
            desc: 'Once your grading is complete, your digital signature and registration number are locked into the submission record. This data flows into the final PoE export.',
            bullets: [
                'Your signature is captured once during profile setup — stored securely',
                'Grading decisions create an immutable time-stamped record',
                'Bulk-grade multiple submissions from your marking queue',
            ],
        },
    ],
};

interface WelcomeWizardProps {
    user: UserProfile;
    onClose: () => void;
}

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ user, onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [animating, setAnimating] = useState(false);
    const [direction, setDirection] = useState<'forward' | 'back'>('forward');

    const activeSlides = SLIDES[user.role as keyof typeof SLIDES] || SLIDES.learner;
    const isLastStep = currentStep === activeSlides.length - 1;
    const slide = activeSlides[currentStep];

    const goTo = (next: number, dir: 'forward' | 'back') => {
        if (animating) return;
        setDirection(dir);
        setAnimating(true);
        setTimeout(() => {
            setCurrentStep(next);
            setAnimating(false);
        }, 220);
    };

    const handleDismiss = async () => {
        if (dontShowAgain) {
            setIsSaving(true);
            try { await updateDoc(doc(db, 'users', user.uid), { hasSeenOnboarding: true }); }
            catch (e) { console.error('Failed to save onboarding preference:', e); }
        }
        onClose();
    };

    const roleLabel: Record<string, string> = {
        learner: 'Learner Portal',
        admin: 'Admin Portal',
        facilitator: 'Facilitator Portal',
        assessor: 'Assessor Portal',
    };

    return createPortal(
        <div className="ww-overlay">
            <div className="ww-modal" onClick={e => e.stopPropagation()}>

                {/* ── TOP ACCENT ── */}
                <div className={`ww-accent-bar ww-accent-bar--${slide.accent}`} aria-hidden="true" />

                {/* ── HEADER ── */}
                <div className="ww-header">
                    <div className="ww-header__brand">
                        <Compass size={14} className="ww-header__compass" />
                        <span className="ww-header__portal">{roleLabel[user.role] || 'Platform Guide'}</span>
                    </div>
                    <button className="ww-header__close" onClick={handleDismiss} disabled={isSaving} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                {/* ── SLIDE BODY ── */}
                <div className={`ww-slide${animating ? ` ww-slide--exit-${direction}` : ''}`}>

                    {/* Icon + tag */}
                    <div className={`ww-slide__icon-wrap ww-slide__icon-wrap--${slide.accent}`}>
                        {slide.icon}
                    </div>
                    <div className={`ww-slide__tag ww-slide__tag--${slide.accent}`}>{slide.tag}</div>

                    {/* Title + desc */}
                    <h2 className="ww-slide__title">{slide.title}</h2>
                    <p className="ww-slide__desc">{slide.desc}</p>

                    {/* Bullets */}
                    <ul className="ww-slide__bullets">
                        {slide.bullets.map((b, i) => (
                            <li key={i} className={`ww-slide__bullet ww-slide__bullet--${slide.accent}`}>
                                <span className="ww-slide__bullet-dot" aria-hidden="true" />
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* ── FOOTER ── */}
                <div className="ww-footer">
                    {/* Progress pills */}
                    <div className="ww-progress" role="tablist" aria-label="Slide progress">
                        {activeSlides.map((_, idx) => (
                            <button
                                key={idx}
                                role="tab"
                                aria-selected={currentStep === idx}
                                className={`ww-progress__pip${currentStep === idx ? ' ww-progress__pip--active' : ''}${currentStep > idx ? ' ww-progress__pip--done' : ''}`}
                                onClick={() => idx !== currentStep && goTo(idx, idx > currentStep ? 'forward' : 'back')}
                                aria-label={`Go to step ${idx + 1}`}
                            />
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="ww-footer__controls">
                        <label className="ww-dont-show">
                            <input
                                type="checkbox"
                                className="ww-dont-show__check"
                                checked={dontShowAgain}
                                onChange={e => setDontShowAgain(e.target.checked)}
                            />
                            <span className="ww-dont-show__label">Don't show again</span>
                        </label>

                        <div className="ww-nav">
                            {currentStep > 0 && (
                                <button className="ww-btn ww-btn--ghost" onClick={() => goTo(currentStep - 1, 'back')} disabled={isSaving}>
                                    <ChevronLeft size={14} /> Back
                                </button>
                            )}
                            {isLastStep ? (
                                <button className="ww-btn ww-btn--primary" onClick={handleDismiss} disabled={isSaving}>
                                    {isSaving ? <Loader2 size={14} className="ww-spin" /> : <Zap size={14} />}
                                    Get Started
                                </button>
                            ) : (
                                <button className="ww-btn ww-btn--primary" onClick={() => goTo(currentStep + 1, 'forward')}>
                                    Next <ChevronRight size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Step counter */}
                <div className="ww-step-counter" aria-live="polite">
                    {currentStep + 1} / {activeSlides.length}
                </div>
            </div>
        </div>,
        document.body
    );
};