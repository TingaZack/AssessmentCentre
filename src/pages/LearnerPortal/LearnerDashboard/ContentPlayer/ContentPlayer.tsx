// src/pages/LearnerDashboard/ContentPlayer/ContentPlayer.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ChevronLeft, PlayCircle, FileText, Code, CheckCircle,
    Lock, Menu, X, Timer, BookOpen, Bot, Send, ShieldAlert,
    CheckCircle2, Sparkles, AudioLines,
    Loader2
} from 'lucide-react';
import './ContentPlayer.css';

// ─── MOCK SCHEMA DEFINITION (Matches our new Architecture) ───
type CheckType = 'none' | 'spot_the_bug' | 'unit_test' | 'socratic_dialogue' | 'oral_defense';

interface MockLearningUnit {
    id: string;
    title: string;
    unitType: 'video' | 'reading' | 'interactive_code';
    durationMin: number;
    isCompleted: boolean;
    isLocked: boolean;
    moduleName: string;
    contentHtml?: string;
    interactiveCheck: {
        checkType: CheckType;
        personaName?: string;
        prompt?: string;
    }
}

const MOCK_SYLLABUS: MockLearningUnit[] = [
    {
        id: 'u1', moduleName: 'Sprint 1: React Fundamentals', title: 'JSX & Component Trees', unitType: 'video',
        durationMin: 12, isCompleted: true, isLocked: false,
        interactiveCheck: { checkType: 'none' }
    },
    {
        id: 'u2', moduleName: 'Sprint 1: React Fundamentals', title: 'State & The useState Hook', unitType: 'reading',
        durationMin: 15, isCompleted: false, isLocked: false,
        contentHtml: '<p>State represents the parts of an app that can change. Each component can maintain its own state...</p>',
        interactiveCheck: {
            checkType: 'socratic_dialogue',
            personaName: 'Junior Dev 🤖',
            prompt: 'Hey! I wrote a counter component but the number does not update on the screen when I click the button. I used a normal variable `let count = 0;`. Why is this failing in React?'
        }
    },
    {
        id: 'u3', moduleName: 'Sprint 1: React Fundamentals', title: 'useEffect Lifecycle', unitType: 'interactive_code',
        durationMin: 20, isCompleted: false, isLocked: true,
        interactiveCheck: { checkType: 'spot_the_bug' }
    },
    {
        id: 'u4', moduleName: 'Sprint 2: Global State', title: 'Context API Setup', unitType: 'video',
        durationMin: 18, isCompleted: false, isLocked: true,
        interactiveCheck: { checkType: 'oral_defense', prompt: 'Explain the prop drilling problem and how Context API solves it.' }
    }
];

export const ContentPlayer: React.FC = () => {
    const navigate = useNavigate();
    const { unitId } = useParams();

    // UI State
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeUnitId, setActiveUnitId] = useState('u2'); // Default to second item for demo

    // Engine State
    const [dialogueInput, setDialogueInput] = useState('');
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [passState, setPassState] = useState<'locked' | 'ready' | 'completed'>('locked');

    // Load active unit
    const activeUnit = MOCK_SYLLABUS.find(u => u.id === activeUnitId) || MOCK_SYLLABUS[0];

    // Reset state when unit changes
    useEffect(() => {
        setDialogueInput('');
        setPassState(activeUnit.isCompleted ? 'completed' : (activeUnit.interactiveCheck.checkType === 'none' ? 'ready' : 'locked'));
    }, [activeUnitId]);

    const handleEvaluationSubmit = () => {
        if (!dialogueInput.trim()) return;
        setIsEvaluating(true);

        // 🚀 Simulate AI Call to Evaluate Rubric
        setTimeout(() => {
            setIsEvaluating(false);
            setPassState('ready');
            // Normally: write to learner_content_progress collection here
        }, 1500);
    };

    const handleCompleteLesson = () => {
        setPassState('completed');
        // Progress to next logic here
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'video': return <PlayCircle size={16} />;
            case 'reading': return <FileText size={16} />;
            case 'interactive_code': return <Code size={16} />;
            default: return <BookOpen size={16} />;
        }
    };

    return (
        <div className="cp-layout">

            {/* ─── SIDEBAR SYLLABUS ─── */}
            <aside className={`cp-sidebar ${!sidebarOpen ? 'cp-sidebar--closed' : ''}`}>
                <div className="cp-sidebar-header">
                    <button className="cp-back-btn" onClick={() => navigate('/learner/portfolio')}>
                        <ChevronLeft size={14} /> Back to Dashboard
                    </button>
                    <h2 className="cp-course-title">Frontend Engineering Bootcamp</h2>
                    <div className="cp-progress-wrap">
                        <div className="cp-progress-meta">
                            <span>Sprint Progress</span>
                            <span>25%</span>
                        </div>
                        <div className="cp-progress-bar">
                            <div className="cp-progress-fill" style={{ width: '25%' }} />
                        </div>
                    </div>
                </div>

                <div className="cp-sidebar-nav">
                    <div className="cp-module-group">
                        <div className="cp-module-title">Sprint 1: React Fundamentals</div>
                        {MOCK_SYLLABUS.filter(u => u.moduleName.includes('Sprint 1')).map(unit => (
                            <div
                                key={unit.id}
                                onClick={() => !unit.isLocked && setActiveUnitId(unit.id)}
                                className={`cp-unit-item ${activeUnitId === unit.id ? 'cp-unit-item--active' : ''} ${unit.isLocked ? 'cp-unit-item--locked' : ''}`}
                            >
                                <div className="cp-unit-icon">
                                    {unit.isCompleted ? <CheckCircle2 size={16} color="#94c73d" /> : unit.isLocked ? <Lock size={16} color="#475569" /> : getIconForType(unit.unitType)}
                                </div>
                                <div className="cp-unit-details">
                                    <span className="cp-unit-name">{unit.title}</span>
                                    <span className="cp-unit-meta">
                                        <Timer size={10} /> {unit.durationMin} min
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="cp-module-group">
                        <div className="cp-module-title">Sprint 2: Global State</div>
                        {MOCK_SYLLABUS.filter(u => u.moduleName.includes('Sprint 2')).map(unit => (
                            <div
                                key={unit.id}
                                className="cp-unit-item cp-unit-item--locked"
                            >
                                <div className="cp-unit-icon"><Lock size={16} color="#475569" /></div>
                                <div className="cp-unit-details">
                                    <span className="cp-unit-name">{unit.title}</span>
                                    <span className="cp-unit-meta">Prerequisites required</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {/* ─── MAIN CONTENT STAGE ─── */}
            <main className="cp-main">
                <header className="cp-topbar">
                    <button className="cp-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        <Menu size={18} />
                    </button>
                    <div className="cp-topbar-meta">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldAlert size={14} color="#f59e0b" /> SECAM Verified Session
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Timer size={14} /> Active Time: 04:12
                        </span>
                    </div>
                </header>

                <div className="cp-content-stage">
                    <div className="cp-content-container animate-fade-in">

                        {/* MOCK VIDEO PLAYER OR COVER */}
                        {activeUnit.unitType === 'video' && (
                            <div className="cp-video-wrapper">
                                <PlayCircle size={64} opacity={0.5} />
                                <span style={{ position: 'absolute', bottom: 20, right: 20, background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>12:45</span>
                            </div>
                        )}

                        <div className="cp-lesson-body">
                            <h1 className="cp-lesson-title">{activeUnit.title}</h1>
                            <div className="cp-lesson-desc" dangerouslySetInnerHTML={{ __html: activeUnit.contentHtml || 'This lesson covers core concepts required for your upcoming assessment. Watch the video above carefully.' }} />

                            {/* ─── DYNAMIC POST-LESSON VERIFICATION ENGINE ─── */}
                            {activeUnit.interactiveCheck.checkType !== 'none' && (
                                <div className="cp-verification-block">
                                    <div className="cp-engine-header">
                                        <span className="cp-engine-badge">
                                            <Sparkles size={12} /> Knowledge Verification
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                                            {activeUnit.interactiveCheck.checkType === 'socratic_dialogue' && 'Socratic Peer Review'}
                                            {activeUnit.interactiveCheck.checkType === 'oral_defense' && 'AI Oral Defense'}
                                            {activeUnit.interactiveCheck.checkType === 'spot_the_bug' && 'Spot-the-Bug Diagnostics'}
                                        </span>
                                    </div>

                                    {/* MODE: Socratic Dialogue */}
                                    {activeUnit.interactiveCheck.checkType === 'socratic_dialogue' && (
                                        <div className="cp-socratic-chat">
                                            <div className="cp-chat-bubble">
                                                <div className="cp-chat-avatar"><Bot size={20} /></div>
                                                <div className="cp-chat-msg">
                                                    <strong>{activeUnit.interactiveCheck.personaName}</strong><br />
                                                    {activeUnit.interactiveCheck.prompt}
                                                </div>
                                            </div>

                                            {passState === 'locked' && !isEvaluating && (
                                                <div className="cp-chat-input-area animate-fade-in">
                                                    <textarea
                                                        className="cp-chat-textarea"
                                                        placeholder="Explain the concept to the Junior Dev to pass this check..."
                                                        value={dialogueInput}
                                                        onChange={e => setDialogueInput(e.target.value)}
                                                    />
                                                    <button
                                                        className="mlab-btn mlab-btn--primary"
                                                        onClick={handleEvaluationSubmit}
                                                        disabled={dialogueInput.trim().length < 10}
                                                    >
                                                        <Send size={14} /> Submit Explanation
                                                    </button>
                                                </div>
                                            )}

                                            {isEvaluating && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--mlab-blue)', fontWeight: 600, padding: '20px', background: '#e0f2fe', borderRadius: '8px' }}>
                                                    <Loader2 size={16} className="spin" /> AI Evaluator analyzing response...
                                                </div>
                                            )}

                                            {passState === 'ready' && (
                                                <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '8px', color: '#166534' }} className="animate-fade-in">
                                                    <strong><CheckCircle2 size={16} style={{ display: 'inline', marginBottom: '-3px' }} /> Concept Mastery Verified!</strong>
                                                    <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem' }}>Your explanation correctly identified the need for React State to trigger re-renders. You may now proceed.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* MODE: Oral Defense Placeholder */}
                                    {activeUnit.interactiveCheck.checkType === 'oral_defense' && (
                                        <div className="cp-socratic-chat" style={{ textAlign: 'center', padding: '40px 20px' }}>
                                            <AudioLines size={32} color="#94a3b8" style={{ marginBottom: '10px' }} />
                                            <h4 style={{ margin: '0 0 10px 0' }}>{activeUnit.interactiveCheck.prompt}</h4>
                                            <button className="mlab-btn mlab-btn--outline">🎤 Start Recording Defense</button>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* MAIN ACTION BUTTON */}
                            <div style={{ marginTop: '30px' }}>
                                <button
                                    className={`cp-complete-btn ${passState === 'locked' ? 'cp-complete-btn--locked' : passState === 'ready' ? 'cp-complete-btn--ready' : 'cp-complete-btn--done'}`}
                                    disabled={passState === 'locked' || passState === 'completed'}
                                    onClick={handleCompleteLesson}
                                >
                                    {passState === 'locked' && <><Lock size={16} /> Complete Verification to Unlock</>}
                                    {passState === 'ready' && <><CheckCircle size={16} /> Mark Lesson as Complete</>}
                                    {passState === 'completed' && <><CheckCircle2 size={16} /> Lesson Completed</>}
                                </button>
                            </div>

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};