// src/components/views/AssessmentPlayer/AssessmentLockedScreen.tsx

import React from 'react';
import {
    ArrowLeft, CalendarDays, Clock, Lock, ShieldAlert, AlertCircle,
    AlertTriangle, BookOpen, Info, ShieldCheck
} from 'lucide-react';
import moment from 'moment';

const formatCountdown = (ms: number) => {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    if (days > 0) {
        return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

interface AssessmentLockedScreenProps {
    type: 'scheduled' | 'missed' | 'upcoming' | 'admin' | 'unavailable';
    assessment?: any;
    submission?: any;
    assessmentId?: string;
    timeToStart?: number | null;
    getSecureNow?: () => number;
    generateCalendarLink?: () => string;
    onBack: () => void;
    navigate?: (path: string) => void;
}

export const AssessmentLockedScreen: React.FC<AssessmentLockedScreenProps> = ({
    type,
    assessment,
    submission,
    assessmentId,
    timeToStart,
    getSecureNow,
    generateCalendarLink,
    onBack,
    navigate,
}) => {
    if (type === 'admin') {
        return (
            <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
                <div className="ap-state-card">
                    <div className="ap-state-card__icon-wrap"><ShieldAlert size={32} color="var(--mlab-blue)" /></div>
                    <h1 className="ap-state-card__title">Staff Access Detected</h1>
                    <p className="ap-state-card__desc">This area is restricted to learners only.<br />Use Preview mode to view assessments without affecting learner data.</p>
                    <div className="ap-state-card__actions">
                        <button style={{ borderRadius: 0 }} className="ap-btn ap-btn--outline" onClick={onBack}><ArrowLeft size={14} /> Go Back</button>
                        <button style={{ borderRadius: 0 }} className="ap-btn ap-btn--primary" onClick={() => navigate?.(`/admin/assessment/preview/${assessmentId}`)}>Open Preview Mode</button>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'unavailable') {
        return (
            <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0 }}>
                <div className="ap-state-card">
                    <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim"><AlertCircle size={32} color="var(--mlab-grey)" /></div>
                    <h2 className="ap-state-card__title">Assessment Unavailable</h2>
                    <p className="ap-state-card__desc">We couldn't find a workbook assigned to your profile for this module.<br />Contact your facilitator if you believe this is an error.</p>
                    <div className="ap-state-card__actions">
                        <button className="ap-btn ap-btn--outline" onClick={onBack}>
                            <ArrowLeft size={14} /> Return to Portfolio
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'upcoming') {
        return (
            <div className="ap-fullscreen" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0, backgroundColor: '#f8fafc' }}>
                <div className="ap-state-card" style={{ borderTop: '4px solid var(--mlab-blue)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <div className="ap-state-card__icon-wrap ap-state-card__icon-wrap--dim" style={{ background: '#e0f2fe' }}>
                        <Lock size={32} color="#0284c7" />
                    </div>
                    <h2 className="ap-state-card__title" style={{ color: '#0f172a' }}>Module Coming Soon</h2>
                    <p className="ap-state-card__desc">This workbook is currently locked by your facilitator. It will automatically unlock as you progress through the curriculum.</p>
                    <div className="ap-state-card__actions">
                        <button className="ap-btn ap-btn--primary" onClick={onBack}>
                            <ArrowLeft size={14} /> Return to Portfolio
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'missed') {
        return (
            <div className="lfm-overlay">
                <div className="lfm-modal" style={{ width: '95%', maxWidth: '600px', margin: '20px auto', border: '2px solid var(--mlab-red)' }}>
                    <div className="lfm-header" style={{ borderBottom: '3px solid var(--mlab-red)', background: 'var(--mlab-red)' }}>
                        <h2 className="lfm-header__title">
                            <ShieldAlert size={20} color="var(--mlab-white)" />
                            Assessment Locked / Terminated
                        </h2>
                    </div>
                    <div className="lfm-body">
                        <div className="lfm-error-banner">
                            <AlertTriangle size={20} />
                            <span>This assessment is currently unavailable. This occurs if the scheduled start window elapsed without commencing, or if a critical invigilation breach (such as clicking "Stop sharing", revoking camera/mic access, or exiting invigilation) terminated your session.</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                            <button className="lfm-btn lfm-btn--primary" onClick={onBack} style={{ background: 'var(--mlab-red)' }}>
                                <ArrowLeft size={16} /> Return to Portfolio
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const now = getSecureNow?.() || Date.now();
    const scheduledTime = assessment?.scheduledDate ? moment(assessment.scheduledDate).valueOf() : 0;
    const remaining = (timeToStart !== null && timeToStart !== undefined && timeToStart > 0)
        ? timeToStart
        : Math.max(0, scheduledTime - now);

    const startDate = moment(assessment?.scheduledDate);
    const remainingMinutes = Math.floor(remaining / 60000);
    let timerColor = 'var(--mlab-blue)';
    let timerBorderColor = 'var(--mlab-blue)';
    let timerAnimation = '';
    if (remainingMinutes <= 2) {
        timerColor = '#dc2626';
        timerBorderColor = '#dc2626';
        timerAnimation = 'pulse 1s infinite';
    } else if (remainingMinutes <= 10) {
        timerColor = '#f97316';
        timerBorderColor = '#f97316';
    }

    return (
        <div className="lfm-overlay">
            <div className="lfm-modal" style={{
                width: '95%',
                maxWidth: '900px',
                animation: 'lfm-fadeIn 0.3s ease both',
                margin: '20px auto',
                background: 'white',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <div className="lfm-header" style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '5px solid var(--mlab-green)'
                }}>
                    <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldCheck size={24} color="var(--mlab-green)" />
                        Assessment Locked &amp; Scheduled
                    </h2>
                </div>

                <div className="lfm-body" style={{ padding: '0' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '0'
                    }}>
                        <div style={{
                            padding: '2rem',
                            textAlign: 'left',
                            borderRight: '1px solid var(--mlab-border)',
                            background: '#fcfcfc'
                        }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h1 style={{ fontSize: '1.5rem', color: 'var(--mlab-midnight)', margin: '0 0 8px 0', fontWeight: 800 }}>
                                    {assessment?.title}
                                </h1>
                                <div style={{ display: 'flex', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <BookOpen size={14} />
                                    <span>Module {assessment?.moduleInfo?.moduleNumber || '—'}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <section>
                                    <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--mlab-blue)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                        About this Assessment
                                    </h4>
                                    <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                        This assessment is strictly scheduled and currently secured. Access is restricted until the official commencement time.
                                    </p>
                                </section>

                                <section style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid var(--mlab-green)', borderRadius: '4px' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <Info size={20} color="var(--mlab-green)" style={{ flexShrink: 0 }} />
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '0.85rem', color: '#166534', marginBottom: '4px' }}>Learner Flexibility</strong>
                                            <p style={{ fontSize: '0.85rem', color: '#166534', lineHeight: 1.5, margin: 0 }}>
                                                You are <strong>not required</strong> to keep this tab open. You may return at the start time. This page unlocks automatically once the countdown reaches zero.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                                    <strong>Note:</strong> Invigilation rules apply immediately upon unlocking. You will be required to grant Webcam, Microphone, and Entire Screen Sharing. Stopping screen sharing or switching tabs will immediately terminate your assessment.
                                </p>
                            </div>
                        </div>

                        <div style={{
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '1.5rem',
                            background: 'white'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--mlab-grey)', letterSpacing: '0.1em' }}>Commencement Time</span>
                                <div style={{
                                    marginTop: '8px',
                                    padding: '8px 16px',
                                    background: 'var(--mlab-blue)',
                                    color: 'white',
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    fontSize: '1rem'
                                }}>
                                    {startDate.format("dddd, D MMMM YYYY [at] HH:mm")}
                                </div>
                            </div>

                            <div style={{
                                background: 'var(--mlab-bg)',
                                border: `2px solid ${timerBorderColor}`,
                                borderLeft: `5px solid ${timerColor}`,
                                width: '100%',
                                padding: '1.5rem',
                                borderRadius: '4px',
                                textAlign: 'center',
                                transition: 'border-color 0.3s ease'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <Clock size={18} color={timerColor} />
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                                        System Unlocks In
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
                                    fontWeight: '900',
                                    fontFamily: 'monospace',
                                    color: timerColor,
                                    letterSpacing: '2px',
                                    lineHeight: 1,
                                    animation: timerAnimation
                                }}>
                                    {formatCountdown(remaining)}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px',
                                    background: '#fffbeb',
                                    border: '1px solid #fef3c7',
                                    borderRadius: '4px',
                                    textAlign: 'left'
                                }}>
                                    <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
                                        You must be signed into <strong>Google/Gmail</strong> to receive a calendar reminder.
                                    </span>
                                </div>

                                {generateCalendarLink && (
                                    <a
                                        href={generateCalendarLink()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ap-btn ap-btn--primary"
                                        style={{
                                            justifyContent: 'center',
                                            gap: '8px',
                                            width: '100%',
                                            textDecoration: 'none',
                                            background: '#4285F4',
                                            borderColor: '#4285F4',
                                            borderRadius: '4px',
                                            padding: '14px',
                                            fontWeight: 600
                                        }}
                                    >
                                        <CalendarDays size={18} /> Sync to Google Calendar
                                    </a>
                                )}

                                <button
                                    onClick={onBack}
                                    className="ap-btn ap-btn--outline"
                                    style={{
                                        justifyContent: 'center',
                                        gap: '8px',
                                        width: '100%',
                                        color: 'var(--mlab-grey)',
                                        borderRadius: '4px',
                                        padding: '14px'
                                    }}
                                >
                                    <ArrowLeft size={16} /> Return to Dashboard
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};