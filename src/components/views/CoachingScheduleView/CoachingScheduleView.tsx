// src/components/views/CoachingScheduleView/CoachingScheduleView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteField, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    Calendar, Video, MessageSquare, CheckCircle,
    Clock, X, FileText, Search,
    Trash2, UserX, Loader2, Info, ArrowRight,
    Plus, Link, Edit3, ShieldAlert,
    Save
} from 'lucide-react';
import { useToast, ToastContainer } from '../../common/Toast/Toast';
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
    requiresManualLink?: boolean;
    systemNote?: string;
}

// ─── MANAGE SESSION MODAL (Notes & Link Editor) ───
const ManageSessionModal: React.FC<{
    session: CoachingSession;
    onClose: () => void;
    toast: any;
}> = ({ session, onClose, toast }) => {
    const [notes, setNotes] = useState(session.notes || '');
    const [meetLink, setMeetLink] = useState(session.meetLink || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveUpdates = async (markComplete: boolean) => {
        if (markComplete && !notes.trim()) {
            toast.error("Please enter your coaching notes before marking the session as completed.");
            return;
        }

        setIsSaving(true);
        try {
            const timestampIso = new Date().toISOString();
            const payload: any = {
                notes: notes.trim(),
                meetLink: meetLink.trim(),
                requiresManualLink: !meetLink.trim()
            };

            if (markComplete) {
                payload.status = 'completed';
                payload.completedAt = timestampIso;
            } else if (session.status === 'requested' && meetLink.trim()) {
                payload.status = 'requested';
            }

            await updateDoc(doc(db, 'coaching_sessions', session.id), payload);

            // AUTO-UNLOCK THE LINKED ASSESSMENT
            if (markComplete && session.assessmentId) {
                try {
                    const subQ = query(
                        collection(db, 'learner_submissions'),
                        where('learnerId', '==', session.learnerId),
                        where('assessmentId', '==', session.assessmentId)
                    );
                    const subSnap = await getDocs(subQ);

                    if (!subSnap.empty) {
                        const submissionDoc = subSnap.docs[0];
                        const subData = submissionDoc.data();

                        // Only run the unlock if the workbook actually needs it
                        if (['graded', 'moderated', 'returned'].includes(subData.status) && ['NYC', 'DEV', '1', '2'].includes(String(subData.competency || '').toUpperCase())) {

                            const historyRef = doc(collection(db, 'learner_submissions', submissionDoc.id, 'history'));
                            await setDoc(historyRef, {
                                ...subData,
                                archivedAt: timestampIso,
                                snapshotReason: `Remediation via Coaching Schedule`,
                                coachingLog: {
                                    date: timestampIso,
                                    notes: notes.trim(),
                                    facilitatorId: session.assessorId,
                                    facilitatorName: session.assessorName,
                                    acknowledged: false
                                }
                            });

                            await updateDoc(doc(db, 'learner_submissions', submissionDoc.id), {
                                status: 'not_started',
                                startedAt: deleteField(),
                                competency: deleteField(),
                                grading: deleteField(),
                                moderation: deleteField(),
                                submittedAt: deleteField(),
                                learnerDeclaration: deleteField(),
                                coachingRequested: deleteField(),
                                coachingRequestedAt: deleteField(),
                                attemptNumber: (subData.attemptNumber || 1) + 1,
                                lastStaffEditAt: timestampIso,
                                latestCoachingLog: {
                                    date: timestampIso,
                                    notes: notes.trim(),
                                    facilitatorId: session.assessorId,
                                    facilitatorName: session.assessorName,
                                    acknowledged: false
                                }
                            });

                            toast.success("Session saved & linked assessment auto-unlocked!");
                            onClose();
                            return;
                        }
                    }
                } catch (unlockErr) {
                    console.error("Auto-unlock failed:", unlockErr);
                    toast.success("Session saved, but auto-unlocking the assessment failed.");
                    onClose();
                    return;
                }
            }

            toast.success(markComplete ? "Session completed and notes saved!" : "Session details updated successfully!");
            onClose();
        } catch (err: any) {
            toast.error("Failed to save updates: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title"><Edit3 size={16} /> Manage Support Session</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <div className="lfm-body">
                    {session.requiresManualLink && !session.meetLink && (
                        <div style={{ background: '#fff1f2', borderLeft: '4px solid #e11d48', padding: '10px 12px', marginBottom: '1rem', borderRadius: '4px', fontSize: '0.8rem', color: '#be123c', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <ShieldAlert size={16} /> <span><strong>Action Required:</strong> The automatic calendar link failed to generate. Please paste a manual Google Meet or Zoom link below.</span>
                        </div>
                    )}

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
                        <div className="lfm-fg lfm-fg--full">
                            <label>Meeting Link (Google Meet / Zoom)</label>
                            <div style={{ position: 'relative' }}>
                                <Link size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)' }} />
                                <input
                                    type="url"
                                    className="lfm-input"
                                    placeholder="Paste link here..."
                                    value={meetLink}
                                    onChange={e => setMeetLink(e.target.value)}
                                    style={{ paddingLeft: '32px', borderColor: (!meetLink && session.requiresManualLink) ? '#fca5a5' : 'var(--mlab-border)' }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><FileText size={13} /> Post-Session Documentation</div>
                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Coaching Notes</label>
                            <textarea
                                className="lfm-input"
                                rows={6}
                                placeholder="Detail what was discussed, what the learner struggled with, and any agreed upon next steps. Required to complete the session."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>
                </div>

                <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="lfm-btn lfm-btn--outline" style={{ color: 'var(--mlab-blue)' }} onClick={() => handleSaveUpdates(false)} disabled={isSaving}>
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <Save size={13} />} Update Details
                        </button>
                        <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => handleSaveUpdates(true)} disabled={isSaving}>
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <CheckCircle size={13} />} Mark as Completed
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Create Session Modal (Manual Entry) ───
const CreateSessionModal: React.FC<{
    user: any;
    learners: any[];
    onClose: () => void;
    toast: any;
}> = ({ user, learners, onClose, toast }) => {
    const [selectedLearnerId, setSelectedLearnerId] = useState('');
    const [category, setCategory] = useState('Academic Support & Remediation');
    const [topic, setTopic] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [meetLink, setMeetLink] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Sort learners alphabetically for the dropdown
    const activeLearners = useMemo(() => {
        return [...learners]
            .filter(l => l.fullName && !l.isArchived)
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [learners]);

    const handleSubmit = async () => {
        if (!selectedLearnerId || !dateTime || !topic || !meetLink) {
            toast.error("Please fill in all required fields, including the meeting link.");
            return;
        }

        const learner = activeLearners.find(l => l.id === selectedLearnerId || l.learnerId === selectedLearnerId);
        if (!learner) {
            toast.error("Selected learner not found.");
            return;
        }

        setIsSaving(true);
        try {
            const newSessionRef = doc(collection(db, 'coaching_sessions'));
            await setDoc(newSessionRef, {
                assessorId: user.uid,
                assessorName: user.fullName,
                learnerId: learner.learnerId || learner.id,
                learnerName: learner.fullName,
                assessmentId: null,
                sessionCategory: category,
                topic: topic.trim(),
                dateTime: new Date(dateTime).toISOString(),
                meetLink: meetLink.trim(),
                status: 'requested',
                initiatedBy: user.uid,
                createdAt: new Date().toISOString()
            });

            toast.success("Manual session scheduled successfully!");
            onClose();
        } catch (err: any) {
            toast.error("Failed to schedule session: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title"><Calendar size={16} /> Schedule Session Manually</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <div className="lfm-body">
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.5 }}>
                        Use this form to manually schedule a session if the automatic Google Calendar integration is unavailable. You will need to generate and provide your own Google Meet or Zoom link.
                    </p>

                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Learner *</label>
                            <select className="lfm-input" value={selectedLearnerId} onChange={e => setSelectedLearnerId(e.target.value)}>
                                <option value="">-- Select Learner --</option>
                                {activeLearners.map(l => (
                                    <option key={l.id} value={l.id}>{l.fullName} ({l.idNumber})</option>
                                ))}
                            </select>
                        </div>
                        <div className="lfm-fg">
                            <label>Category *</label>
                            <select className="lfm-input" value={category} onChange={e => setCategory(e.target.value)}>
                                <option value="Academic Support & Remediation">📚 Academic Support & Remediation</option>
                                <option value="Missed Assessment Re-schedule Request">⚠️ Missed Assessment Re-schedule</option>
                                <option value="Career Guidance & Placement">💼 Career Guidance & Placement</option>
                                <option value="Wellness & Personal Support">🧠 Wellness & Personal Support</option>
                                <option value="General Check-in">💬 General Check-in</option>
                            </select>
                        </div>
                        <div className="lfm-fg">
                            <label>Date & Time *</label>
                            <input type="datetime-local" className="lfm-input" value={dateTime} onChange={e => setDateTime(e.target.value)} />
                        </div>
                        <div className="lfm-fg lfm-fg--full">
                            <label>Meeting Link (Google Meet / Zoom) *</label>
                            <div style={{ position: 'relative' }}>
                                <Link size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)' }} />
                                <input type="url" className="lfm-input" placeholder="https://meet.google.com/..." value={meetLink} onChange={e => setMeetLink(e.target.value)} style={{ paddingLeft: '32px' }} />
                            </div>
                        </div>
                        <div className="lfm-fg lfm-fg--full">
                            <label>Topic / Reason *</label>
                            <input type="text" className="lfm-input" placeholder="What will this session cover?" value={topic} onChange={e => setTopic(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><CheckCircle size={13} /> Schedule Session</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- Main View Component ---
export const CoachingScheduleView: React.FC = () => {
    const { user, learners, fetchLearners, cohorts } = useStore() as any;
    const toast = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'upcoming' | 'pending_notes' | 'completed' | 'cancelled' | 'all'>('upcoming');
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    const isSystemAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.isSuperAdmin === true;
    const isLearner = user?.role === 'learner';
    const isStaff = !isSystemAdmin && !isLearner;

    useEffect(() => {
        if (!isLearner && (!learners || learners.length === 0)) {
            fetchLearners();
        }
    }, [isLearner, learners, fetchLearners]);

    // We create a Set of learner IDs that are assigned to this staff member's cohorts
    const assignedLearnerIds = useMemo(() => {
        if (!isStaff || !cohorts || !learners) return new Set<string>();

        const myCohortIds = cohorts
            .filter((c: any) => c.assessorId === user.uid || c.facilitatorId === user.uid || c.assessorEmail === user.email)
            .map((c: any) => c.id);

        const myLearnerIds = new Set<string>();
        learners.forEach((l: any) => {
            if (myCohortIds.includes(l.cohortId)) {
                myLearnerIds.add(l.id);
                if (l.learnerId) myLearnerIds.add(l.learnerId);
            }
        });
        return myLearnerIds;
    }, [isStaff, cohorts, learners, user]);


    useEffect(() => {
        if (!user?.uid) return;

        let q;
        const sessionsRef = collection(db, 'coaching_sessions');

        if (isLearner) {
            // Learner strictly sees their own sessions
            q = query(sessionsRef, where('learnerId', '==', user.uid));
        } else {
            // Admins & Staff fetch ALL sessions and we filter client-side 
            // to catch sessions scheduled on behalf of the cohort by an Admin.
            q = query(sessionsRef);
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let fetched: CoachingSession[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as CoachingSession));

            // FILTER OUT SESSIONS THAT DON'T BELONG TO THIS STAFF MEMBER'S COHORT
            if (isStaff) {
                fetched = fetched.filter(session =>
                    session.assessorId === user.uid ||
                    assignedLearnerIds.has(session.learnerId)
                );
            }

            setSessions(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching coaching sessions:", err);
            toast.error("Failed to load schedule.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, isLearner, isStaff, assignedLearnerIds, toast]);

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

    const stats = useMemo(() => {
        const now = new Date().getTime();
        return {
            upcoming: sessions.filter(s => (s.status === 'requested' || s.status === 'pending_notes') && new Date(s.dateTime).getTime() > now - (60 * 60000)).length,
            pending_notes: sessions.filter(s => s.status !== 'completed' && s.status !== 'cancelled' && new Date(s.dateTime).getTime() <= now - (60 * 60000)).length,
            completed: sessions.filter(s => s.status === 'completed').length,
            cancelled: sessions.filter(s => s.status === 'cancelled').length,
            all: sessions.length
        };
    }, [sessions]);

    // 🚀 NEW: Dynamic Tab Config with Indicators
    const tabConfigs = [
        { id: 'upcoming', label: 'Upcoming', count: stats.upcoming, alert: false },
        { id: 'pending_notes', label: 'Pending Notes', count: stats.pending_notes, alert: stats.pending_notes > 0 },
        { id: 'completed', label: 'Completed', count: stats.completed, alert: false },
        { id: 'cancelled', label: 'Cancelled', count: stats.cancelled, alert: false },
        { id: 'all', label: 'All', count: stats.all, alert: false }
    ];

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

    return (
        <div className="wm-root animate-fade-in">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

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
                <ManageSessionModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                    toast={toast}
                />
            )}

            {showCreateModal && (
                <CreateSessionModal
                    user={user}
                    learners={learners || []}
                    onClose={() => setShowCreateModal(false)}
                    toast={toast}
                />
            )}

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Video size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Coaching Schedule</h1>
                        <p className="wm-page-header__desc">Manage 1-on-1 sessions, notes, and upcoming meetings.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {!isLearner && (
                        <button className="wm-btn wm-btn--primary" onClick={() => setShowCreateModal(true)}>
                            <Plus size={14} /> Schedule Session
                        </button>
                    )}
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
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.pending_notes}</h3>
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

                {/* ── TOOLBAR WITH INDICATORS ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-white)', padding: '1rem', border: '1px solid var(--mlab-border)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {tabConfigs.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id as any)}
                                className={`wm-btn ${filter === f.id ? 'wm-btn--primary' : 'wm-btn--ghost'}`}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    fontSize: '0.75rem',
                                    background: filter === f.id ? 'var(--mlab-blue)' : 'transparent',
                                    color: filter === f.id ? 'white' : 'var(--mlab-grey)',
                                    borderColor: filter === f.id ? 'var(--mlab-blue)' : 'var(--mlab-border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {f.label}
                                {f.count > 0 && (
                                    <span style={{
                                        background: f.alert ? '#ef4444' : (filter === f.id ? 'rgba(255,255,255,0.2)' : 'var(--mlab-bg)'),
                                        color: f.alert ? 'white' : (filter === f.id ? 'white' : 'var(--mlab-blue)'),
                                        padding: '2px 6px',
                                        borderRadius: '12px',
                                        fontSize: '0.65rem',
                                        fontWeight: 'bold',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '20px'
                                    }}>
                                        {f.count}
                                    </span>
                                )}
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
                        const needsLink = !session.meetLink || session.requiresManualLink;

                        return (
                            <div key={session.id} className="mlab-cohort-card animate-fade-in" style={{ borderLeftColor: needsLink && !isCompleted && !isCancelled ? '#fca5a5' : undefined }}>
                                <div className="mlab-cohort-card__header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <h3 className="mlab-cohort-card__name" title={session.learnerName}>{session.learnerName}</h3>

                                        {/* Dynamic Badges */}
                                        {isPending && !isCompleted && !isCancelled && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ffedd5', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fed7aa', flexShrink: 0 }}>
                                                <Clock size={10} /> Pending
                                            </span>
                                        )}
                                        {needsLink && !isLearner && !isCompleted && !isCancelled && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff1f2', color: '#e11d48', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fecdd3', flexShrink: 0 }}>
                                                <ShieldAlert size={10} /> Missing Link
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

                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {/* Join Button */}
                                        {session.meetLink && !isCancelled && !isCompleted && (
                                            <a href={session.meetLink} target="_blank" rel="noreferrer" className="wm-btn wm-btn--ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', borderColor: 'var(--mlab-border)', color: 'var(--mlab-blue)' }}>
                                                <Video size={13} /> Join
                                            </a>
                                        )}

                                        {/* Learner Awaiting Link Indicator */}
                                        {isLearner && needsLink && !isCompleted && !isCancelled && (
                                            <span style={{ fontSize: '0.7rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px', background: '#ffedd5', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fed7aa' }}>
                                                <Clock size={12} /> Awaiting Link
                                            </span>
                                        )}

                                        {/* Staff Management Buttons */}
                                        {!isLearner && !isCompleted && !isCancelled && (
                                            <button
                                                className={`wm-btn ${needsLink ? 'wm-btn--warning' : 'wm-btn--ghost'}`}
                                                style={{
                                                    padding: '0.4rem 0.75rem',
                                                    fontSize: '0.72rem',
                                                    background: needsLink ? '#ffedd5' : '#f8fafc',
                                                    color: needsLink ? '#ea580c' : 'var(--mlab-blue)',
                                                    border: `1px solid ${needsLink ? '#fed7aa' : 'var(--mlab-border)'}`
                                                }}
                                                onClick={() => setSelectedSession(session)}
                                            >
                                                {needsLink ? <><Link size={13} /> Add Link</> : isPast ? <><FileText size={13} /> Notes</> : <><Edit3 size={13} /> Edit</>}
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