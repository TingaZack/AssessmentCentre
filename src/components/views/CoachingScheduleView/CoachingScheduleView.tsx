// src/components/views/CoachingScheduleView/CoachingScheduleView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    Calendar, Video, MessageSquare, CheckCircle,
    Clock, X, FileText, Search, User, Briefcase,
    Trash2
} from 'lucide-react';
import { useToast } from '../../common/Toast/Toast';
import { createPortal } from 'react-dom';
import moment from 'moment';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

// --- Coaching Notes Modal ---
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
        <div className="mlab-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="mlab-modal-window mlab-modal-window--md" onClick={e => e.stopPropagation()}>
                <div className="mlab-modal-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#f0fdf4', padding: '8px', borderRadius: '50%', color: '#166534' }}>
                            <MessageSquare size={20} />
                        </div>
                        <div>
                            <h2 className="mlab-modal-title" style={{ margin: 0 }}>Session Notes</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                1-on-1 with <strong>{session.learnerName}</strong>
                            </p>
                        </div>
                    </div>
                    <button className="mlab-modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="mlab-modal-body" style={{ paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#334155' }}>
                        <strong>Topic:</strong> {session.topic}
                    </div>

                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Post-Session Coaching Notes *
                        </label>
                        <textarea
                            className="lfm-input"
                            rows={6}
                            placeholder="Detail what was discussed, what the learner struggled with, and any agreed upon next steps..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            style={{ width: '100%', padding: '12px', fontSize: '0.9rem', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div className="mlab-modal-footer">
                    <button onClick={onClose} className="mlab-btn mlab-btn--ghost">Cancel</button>
                    <button onClick={handleComplete} disabled={isSaving} className="mlab-btn mlab-btn--primary" style={{ background: 'var(--mlab-green)', color: '#fff' }}>
                        <CheckCircle size={16} /> Mark as Completed
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
    const [filter, setFilter] = useState<'upcoming' | 'pending_notes' | 'completed' | 'all'>('upcoming');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);

    useEffect(() => {
        if (!user?.uid) return;

        let q;
        const sessionsRef = collection(db, 'coaching_sessions');

        // Admins see all, Learners see their own, Staff see their assigned sessions
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

    const handleCancelSession = async (sessionId: string) => {
        if (!window.confirm("Are you sure you want to cancel this session?")) return;
        try {
            await updateDoc(doc(db, 'coaching_sessions', sessionId), {
                status: 'cancelled'
            });
            toast.success("Session cancelled.");
        } catch (err: any) {
            toast.error("Failed to cancel session.");
        }
    };

    const testGoogleAuth = async () => {
        const functions = getFunctions();
        const verifyCreds = httpsCallable(functions, 'verifyCalendarCredentials');

        toast.info("Testing Google Calendar File...");
        try {
            const result: any = await verifyCreds();
            if (result.data.success) {
                toast.success(result.data.message);
                alert(result.data.message); // Pops up a big alert so you can read the whole message
            } else {
                toast.error(result.data.message);
                alert(result.data.message);
            }
        } catch (error: any) {
            alert("Error reaching backend: " + error.message);
        }
    };

    const filteredSessions = useMemo(() => {
        const now = new Date().getTime();

        return sessions.filter(s => {
            // Apply Status Filter
            if (filter === 'upcoming') {
                if (s.status !== 'requested' && s.status !== 'pending_notes') return false;
                // Only truly upcoming if dateTime is in the future
                return new Date(s.dateTime).getTime() > now - (60 * 60000); // give 1 hour grace period
            }
            if (filter === 'pending_notes') {
                if (s.status === 'completed' || s.status === 'cancelled') return false;
                // Show if status is specifically pending_notes, OR if the meeting time has passed
                return s.status === 'pending_notes' || new Date(s.dateTime).getTime() <= now - (60 * 60000);
            }
            if (filter === 'completed') return s.status === 'completed';

            // Apply Text Search
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
            // Sort Upcoming ascending (soonest first), others descending (most recent first)
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
        };
    }, [sessions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Notes Modal */}
            {selectedSession && (
                <CoachingNotesModal session={selectedSession} onClose={() => setSelectedSession(null)} />
            )}

            {/* Top Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '8px', color: '#0ea5e9' }}>
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Upcoming Sessions</p>
                        <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.upcoming}</h3>
                    </div>
                </div>
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: '#ffedd5', padding: '12px', borderRadius: '8px', color: '#ea580c' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Pending Notes</p>
                        <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.pending}</h3>
                    </div>
                </div>
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', color: '#16a34a' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, textTransform: 'uppercase' }}>Completed</p>
                        <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.completed}</h3>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>

                {/* Toolbar */}
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', background: '#e2e8f0', padding: '4px', borderRadius: '6px' }}>
                        <button
                            onClick={() => setFilter('upcoming')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'upcoming' ? 'white' : 'transparent', color: filter === 'upcoming' ? 'var(--mlab-blue)' : 'var(--mlab-grey)', boxShadow: filter === 'upcoming' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                        >
                            Upcoming
                        </button>
                        <button
                            onClick={() => setFilter('pending_notes')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'pending_notes' ? 'white' : 'transparent', color: filter === 'pending_notes' ? 'var(--mlab-blue)' : 'var(--mlab-grey)', boxShadow: filter === 'pending_notes' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                        >
                            Pending Notes
                        </button>
                        <button
                            onClick={() => setFilter('completed')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'completed' ? 'white' : 'transparent', color: filter === 'completed' ? 'var(--mlab-blue)' : 'var(--mlab-grey)', boxShadow: filter === 'completed' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                        >
                            Completed
                        </button>
                        <button
                            onClick={() => setFilter('all')}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'all' ? 'white' : 'transparent', color: filter === 'all' ? 'var(--mlab-blue)' : 'var(--mlab-grey)', boxShadow: filter === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                        >
                            All
                        </button>
                    </div>

                    <button
                        onClick={testGoogleAuth}
                        style={{ background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                    >
                        Test Google Calendar File
                    </button>

                    <div style={{ height: '36px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', flex: '1', minWidth: '220px', maxWidth: '350px', overflow: 'hidden' }}>
                        <Search size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search by name, topic, or category..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 12px', color: 'var(--mlab-blue)', width: '100%', fontSize: '0.85rem' }}
                        />
                    </div>
                </div>

                {/* Data List */}
                <div style={{ padding: '1.25rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>Loading schedule...</div>
                    ) : filteredSessions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                            <Calendar size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
                            <h3 style={{ color: '#334155', margin: '0 0 0.5rem 0' }}>No Sessions Found</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>There are no sessions matching your current filters.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {filteredSessions.map(session => {
                                const isPast = new Date(session.dateTime).getTime() <= new Date().getTime();
                                const isCompleted = session.status === 'completed';
                                const isCancelled = session.status === 'cancelled';

                                return (
                                    <div key={session.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: isCompleted ? '#f0fdf4' : isCancelled ? '#fef2f2' : 'white', transition: 'box-shadow 0.2s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>

                                            {/* Left Info */}
                                            <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
                                                <div style={{ background: isCompleted ? '#dcfce7' : isCancelled ? '#fee2e2' : '#f1f5f9', padding: '12px', borderRadius: '8px', height: 'fit-content', color: isCompleted ? '#166534' : isCancelled ? '#991b1b' : '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>{moment(session.dateTime).format('MMM')}</span>
                                                    <span style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{moment(session.dateTime).format('DD')}</span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>{moment(session.dateTime).format('HH:mm')}</span>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, border: '1px solid #c7d2fe' }}>
                                                            {session.sessionCategory}
                                                        </span>
                                                        {(user.role === 'admin' || user.isSuperAdmin) && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b' }}>
                                                                <Briefcase size={12} /> Staff: {session.assessorName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <User size={16} color="var(--mlab-grey)" /> {session.learnerName}
                                                    </h3>

                                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', maxWidth: '600px', lineHeight: 1.4 }}>
                                                        <strong>Topic:</strong> {session.topic}
                                                    </p>

                                                    {session.assessmentId && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>
                                                            <CheckCircle size={12} /> Linked to Official Assessment
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Actions */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                                {!isCompleted && !isCancelled && (
                                                    <a
                                                        href={session.meetLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mlab-btn mlab-btn--primary mlab-btn--sm"
                                                        style={{ background: '#4285F4', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                                                    >
                                                        <Video size={14} /> Join Google Meet
                                                    </a>
                                                )}

                                                {!isCompleted && !isCancelled && isPast && (
                                                    <button
                                                        onClick={() => setSelectedSession(session)}
                                                        className="mlab-btn mlab-btn--sm"
                                                        style={{ background: 'var(--mlab-green)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <FileText size={14} /> Add Notes & Complete
                                                    </button>
                                                )}

                                                {!isCompleted && !isCancelled && (
                                                    <button
                                                        onClick={() => handleCancelSession(session.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px', textDecoration: 'underline' }}
                                                    >
                                                        Cancel Session
                                                    </button>
                                                )}

                                                {isCompleted && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        <CheckCircle size={16} /> Session Completed
                                                    </span>
                                                )}
                                                {isCancelled && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        <Trash2 size={16} /> Session Cancelled
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {isCompleted && session.notes && (
                                            <div style={{ background: 'white', padding: '12px', borderRadius: '6px', border: '1px dashed #cbd5e1', marginTop: '8px' }}>
                                                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Coach's Notes:</h4>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap' }}>{session.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};