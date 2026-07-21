// src/components/views/CoachingScheduleView/CoachingScheduleView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    Calendar, Video, MessageSquare, CheckCircle,
    Clock, X, FileText, Search,
    Trash2, UserX, Loader2, Info, ArrowRight
} from 'lucide-react';
import { useToast } from '../../common/Toast/Toast';
import { createPortal } from 'react-dom';
import moment from 'moment';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

// 🚀 IMPORTING THE GLOBALLY REQUESTED STYLES
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import '../CohortsView/CohortsView.css';

// --- Interfaces ---
interface CoachingSession {
    id: string;
    assessorId: string;
    assessorName: string;
    learnerId: string;
    learnerName: string;
    assessmentId: string | null;
    sessionCategory: string;
    topic: string;
    dateTime: string;
    meetLink: string;
    status: 'requested' | 'pending_notes' | 'completed' | 'cancelled';
    initiatedBy: string;
    createdAt: any;
    notes?: string;
    completedAt?: string;
}

// --- Coaching Notes Modal (Matches LearnerFormModal styling) ---
const CoachingNotesModal: React.FC<{
    session: CoachingSession;
    onClose: () => void;
}> = ({ session, onClose }) => {
    const [notes, setNotes] = useState(session.notes || '');
    const [isSaving, setIsSaving] = useState(false);
    const toast = useToast();

    const handleComplete = async () => {
        if (!notes.trim()) {
            toast.error("Please enter your coaching notes before completing the session.");
            return;
        }

        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'coaching_sessions', session.id), {
                status: 'completed',
                notes: notes.trim(),
                completedAt: new Date().toISOString()
            });
            toast.success("Session completed and notes saved successfully!");
            onClose();
        } catch (err: any) {
            toast.error("Failed to save notes: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title"><MessageSquare size={16} /> Session Notes</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <div className="lfm-body">
                    <div className="lfm-section-hdr"><Info size={13} /> Session Details</div>
                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Learner</label>
                            <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-blue)', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
                                {session.learnerName}
                            </div>
                        </div>
                        <div className="lfm-fg lfm-fg--full">
                            <label>Topic</label>
                            <div className="lfm-input" style={{ background: '#f1f5f9', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', cursor: 'not-allowed' }}>
                                {session.topic}
                            </div>
                        </div>
                    </div>

                    <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><FileText size={13} /> Coaching Documentation</div>
                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Post-Session Coaching Notes *</label>
                            <textarea
                                className="lfm-input"
                                rows={6}
                                placeholder="Detail what was discussed, what the learner struggled with, and any agreed upon next steps..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>
                </div>

                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleComplete} disabled={isSaving}>
                        {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><CheckCircle size={13} /> Mark as Completed</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- Main View Component ---
export const CoachingScheduleView: React.FC = () => {
    const { user } = useStore() as any;
    const toast = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'upcoming' | 'pending_notes' | 'completed' | 'cancelled' | 'all'>('upcoming');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    useEffect(() => {
        if (!user?.uid) return;

        let q;
        const sessionsRef = collection(db, 'coaching_sessions');

        if (user.role === 'admin' || user.isSuperAdmin) {
            q = query(sessionsRef);
        } else if (user.role === 'learner') {
            q = query(sessionsRef, where('learnerId', '==', user.uid));
        } else {
            q = query(sessionsRef, where('assessorId', '==', user.uid));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched: CoachingSession[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as CoachingSession));
            setSessions(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching coaching sessions:", err);
            toast.error("Failed to load schedule.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, toast]);

    const handleCancelClick = (session: CoachingSession, isPast: boolean) => {
        const confirmMsg = isPast
            ? "Are you sure you want to mark this session as a No-Show / Missed?"
            : "Are you sure you want to cancel this upcoming session?";

        setStatusModal({
            type: 'warning',
            title: isPast ? 'Mark as Missed' : 'Cancel Session',
            message: confirmMsg,
            confirmText: 'Yes, proceed',
            onCancel: () => setStatusModal(null),
            onClose: () => executeCancellation(session, isPast)
        });
    };

    const executeCancellation = async (session: CoachingSession, isPast: boolean) => {
        setStatusModal(null);
        try {
            await updateDoc(doc(db, 'coaching_sessions', session.id), {
                status: 'cancelled'
            });
            toast.success(isPast ? "Session marked as missed." : "Session cancelled.");

            setTimeout(() => {
                setStatusModal({
                    type: 'info',
                    title: 'Reschedule Session',
                    message: `Would you like to duplicate this session to reschedule it with ${session.learnerName}?`,
                    confirmText: 'Yes, Reschedule',
                    onCancel: () => setStatusModal(null),
                    onClose: () => executeReschedule(session)
                });
            }, 300);

        } catch (err: any) {
            toast.error("Failed to update session.");
        }
    };

    const executeReschedule = async (session: CoachingSession) => {
        setStatusModal(null);
        try {
            const newSessionRef = doc(collection(db, 'coaching_sessions'));
            await setDoc(newSessionRef, {
                assessorId: session.assessorId,
                assessorName: session.assessorName,
                learnerId: session.learnerId,
                learnerName: session.learnerName,
                assessmentId: session.assessmentId,
                sessionCategory: session.sessionCategory,
                topic: `${session.topic} (Rescheduled)`,
                dateTime: moment().add(1, 'days').toISOString(),
                meetLink: session.meetLink,
                status: 'requested',
                initiatedBy: user.uid,
                createdAt: new Date().toISOString()
            });
            toast.success("New session request created! You can now adjust the date in the Upcoming tab.");
        } catch (err: any) {
            toast.error("Failed to reschedule session.");
        }
    };

    const testGoogleAuth = async () => {
        const functions = getFunctions();
        const verifyCreds = httpsCallable(functions, 'verifyCalendarCredentials');

        toast.info("Testing Google Calendar File...");
        try {
            const result: any = await verifyCreds();
            setStatusModal({
                type: result.data.success ? 'success' : 'error',
                title: 'Google Calendar Test',
                message: result.data.message,
                onClose: () => setStatusModal(null)
            });
        } catch (error: any) {
            setStatusModal({
                type: 'error',
                title: 'Connection Error',
                message: "Error reaching backend: " + error.message,
                onClose: () => setStatusModal(null)
            });
        }
    };

    const filteredSessions = useMemo(() => {
        const now = new Date().getTime();
        return sessions.filter(s => {
            if (filter === 'upcoming') {
                if (s.status !== 'requested' && s.status !== 'pending_notes') return false;
                return new Date(s.dateTime).getTime() > now - (60 * 60000);
            }
            if (filter === 'pending_notes') {
                if (s.status === 'completed' || s.status === 'cancelled') return false;
                return s.status === 'pending_notes' || new Date(s.dateTime).getTime() <= now - (60 * 60000);
            }
            if (filter === 'completed') return s.status === 'completed';
            if (filter === 'cancelled') return s.status === 'cancelled';

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (
                    s.learnerName.toLowerCase().includes(term) ||
                    s.topic.toLowerCase().includes(term) ||
                    s.sessionCategory.toLowerCase().includes(term) ||
                    s.assessorName.toLowerCase().includes(term)
                );
            }
            return true;
        }).sort((a, b) => {
            if (filter === 'upcoming') {
                return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
            }
            return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
        });
    }, [sessions, filter, searchTerm]);

    const stats = useMemo(() => {
        const now = new Date().getTime();
        return {
            upcoming: sessions.filter(s => (s.status === 'requested' || s.status === 'pending_notes') && new Date(s.dateTime).getTime() > now - (60 * 60000)).length,
            pending: sessions.filter(s => s.status !== 'completed' && s.status !== 'cancelled' && new Date(s.dateTime).getTime() <= now - (60 * 60000)).length,
            completed: sessions.filter(s => s.status === 'completed').length,
            cancelled: sessions.filter(s => s.status === 'cancelled').length,
        };
    }, [sessions]);

    return (
        <div className="wm-root animate-fade-in">
            {/* 🚀 UPGRADED: Platform Consistent Status Modal rendering via createPortal */}
            {statusModal && createPortal(
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={statusModal.onClose}
                    onCancel={statusModal.onCancel}
                    confirmText={statusModal.confirmText}
                />,
                document.body
            )}

            {selectedSession && (
                <CoachingNotesModal session={selectedSession} onClose={() => setSelectedSession(null)} />
            )}

            {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Video size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Coaching Schedule</h1>
                        <p className="wm-page-header__desc">Manage 1-on-1 sessions, notes, and upcoming meetings.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="wm-btn wm-btn--ghost" onClick={testGoogleAuth} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
                        <Calendar size={14} /> Test Calendar Sync
                    </button>
                </div>
            </div>

            {/* ── TOP STATS ROW ── */}
            <div style={{ padding: '0 1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div className="mlab-cohort-card" style={{ padding: '1.25rem', borderTopColor: '#0ea5e9', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0 }}>
                        <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '8px', color: '#0ea5e9' }}><Calendar size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upcoming</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.upcoming}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" style={{ padding: '1.25rem', borderTopColor: '#ea580c', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0 }}>
                        <div style={{ background: '#ffedd5', padding: '12px', borderRadius: '8px', color: '#ea580c' }}><Clock size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Notes</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.pending}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" style={{ padding: '1.25rem', borderTopColor: '#16a34a', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0 }}>
                        <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', color: '#16a34a' }}><CheckCircle size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.completed}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" style={{ padding: '1.25rem', borderTopColor: '#e11d48', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0 }}>
                        <div style={{ background: '#ffe4e6', padding: '12px', borderRadius: '8px', color: '#e11d48' }}><UserX size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missed / Cancelled</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.cancelled}</h3>
                        </div>
                    </div>
                </div>

                {/* ── TOOLBAR ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-white)', padding: '1rem', border: '1px solid var(--mlab-border)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {['upcoming', 'pending_notes', 'completed', 'cancelled', 'all'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as any)}
                                className={`wm-btn ${filter === f ? 'wm-btn--primary' : 'wm-btn--ghost'}`}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    fontSize: '0.75rem',
                                    background: filter === f ? 'var(--mlab-blue)' : 'transparent',
                                    color: filter === f ? 'white' : 'var(--mlab-grey)',
                                    borderColor: filter === f ? 'var(--mlab-blue)' : 'var(--mlab-border)'
                                }}
                            >
                                {f.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </button>
                        ))}
                    </div>

                    <div style={{ height: '36px', border: '1px solid var(--mlab-border)', borderRadius: 'var(--radius-sm)', background: 'white', display: 'flex', alignItems: 'center', minWidth: '250px', overflow: 'hidden' }}>
                        <Search size={14} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search by name or topic..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 10px', color: 'var(--mlab-blue)', width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
                        />
                    </div>
                </div>
            </div>

            {/* ── CARD GRID ── */}
            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                    <Loader2 size={32} className="lfm-spin" style={{ margin: '0 auto 10px' }} /> Loading schedule...
                </div>
            ) : filteredSessions.length === 0 ? (
                <div className="mlab-cohort-empty" style={{ margin: '0 1.5rem' }}>
                    <Calendar size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                    <p className="mlab-cohort-empty__title">No Sessions Found</p>
                    <p className="mlab-cohort-empty__desc">There are no sessions matching your current filters.</p>
                </div>
            ) : (
                <div className="mlab-cohort-grid" style={{ padding: '0 1.5rem', paddingBottom: '2rem' }}>
                    {filteredSessions.map(session => {
                        const isPast = new Date(session.dateTime).getTime() <= new Date().getTime();
                        const isCompleted = session.status === 'completed';
                        const isCancelled = session.status === 'cancelled';
                        const isPending = session.status === 'pending_notes' || (session.status === 'requested' && isPast);

                        return (
                            <div key={session.id} className="mlab-cohort-card animate-fade-in">
                                <div className="mlab-cohort-card__header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <h3 className="mlab-cohort-card__name" title={session.learnerName}>{session.learnerName}</h3>
                                        {isPending && !isCompleted && !isCancelled && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ffedd5', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fed7aa', flexShrink: 0 }}>
                                                <Clock size={10} /> Pending
                                            </span>
                                        )}
                                    </div>
                                    <div className="mlab-cohort-card__actions">
                                        {!isCompleted && !isCancelled && (
                                            <button
                                                className="mlab-icon-btn"
                                                style={{ color: 'var(--mlab-red)', borderColor: 'var(--mlab-red)' }}
                                                onClick={() => handleCancelClick(session, isPast)}
                                                title={isPast ? "Mark as No-Show / Missed" : "Cancel Session"}
                                            >
                                                <X size={15} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mlab-cohort-card__dates">
                                    <Clock size={14} />
                                    <span>{moment(session.dateTime).format('DD MMM YYYY, HH:mm')}</span>
                                </div>

                                <div className="mlab-role-row-stack">
                                    <div className="mlab-role-row">
                                        <div className="mlab-role-dot mlab-role-dot--blue" />
                                        <span className="mlab-role-label">Category:</span>
                                        <span className="mlab-role-name">{session.sessionCategory}</span>
                                    </div>
                                    <div className="mlab-role-row">
                                        <div className="mlab-role-dot mlab-role-dot--red" />
                                        <span className="mlab-role-label">Topic:</span>
                                        <span className="mlab-role-name" title={session.topic}>{session.topic}</span>
                                    </div>
                                    {(user.role === 'admin' || user.isSuperAdmin) && (
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot mlab-role-dot--green" />
                                            <span className="mlab-role-label">Staff:</span>
                                            <span className="mlab-role-name">{session.assessorName}</span>
                                        </div>
                                    )}
                                    {session.assessmentId && (
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
                                            <span className="mlab-role-label">Assessment:</span>
                                            <span className="mlab-role-name">Linked</span>
                                        </div>
                                    )}
                                </div>

                                {isCompleted && session.notes && (
                                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                        <strong style={{ color: 'var(--mlab-blue)', display: 'block', marginBottom: '4px' }}>Coach Notes:</strong>
                                        <div style={{ whiteSpace: 'pre-wrap', maxHeight: '60px', overflowY: 'auto' }}>{session.notes}</div>
                                    </div>
                                )}

                                <div className="mlab-cohort-card__footer" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                                    <div className="mlab-cohort-card__learner-count">
                                        {isCompleted ? (
                                            <span style={{ color: 'var(--mlab-green)' }}><CheckCircle size={14} /> <strong>Completed</strong></span>
                                        ) : isCancelled ? (
                                            <span style={{ color: 'var(--mlab-red)' }}><Trash2 size={14} /> <strong>{isPast ? 'Missed' : 'Cancelled'}</strong></span>
                                        ) : isPending ? (
                                            <span style={{ color: '#ea580c' }}><Clock size={14} /> <strong>Pending Notes</strong></span>
                                        ) : (
                                            <span style={{ color: 'var(--mlab-blue)' }}><Calendar size={14} /> <strong>Upcoming</strong></span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {!isCompleted && !isCancelled && (
                                            <a href={session.meetLink} target="_blank" rel="noreferrer" className="wm-btn wm-btn--ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', borderColor: 'var(--mlab-border)', color: 'var(--mlab-blue)' }}>
                                                <Video size={13} /> Join
                                            </a>
                                        )}
                                        {!isCompleted && !isCancelled && isPast && (
                                            <button className="mlab-cohort-card__manage" onClick={() => setSelectedSession(session)}>
                                                Notes <ArrowRight size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};