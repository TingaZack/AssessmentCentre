// src/components/views/CoachingScheduleView/CoachingScheduleView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteField, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import {
    Calendar, Video, MessageSquare, CheckCircle,
    Clock, X, FileText, Search,
    Trash2, UserX, Loader2, Info,
    Plus, Link, Edit3, ShieldAlert,
    Save, ExternalLink, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useToast, ToastContainer } from '../../common/Toast/Toast';
import { createPortal } from 'react-dom';
import moment from 'moment';
import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

// --- STYLES ---
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import '../../admin/WorkplacesManager/WorkplacesManager.css';
import '../CohortsView/CohortsView.css';
import Loader from '../../common/Loader/Loader';

// --- Interfaces ---
interface CoachingSession {
    id: string;
    assessorId?: string;
    assessorName?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    hostId?: string;
    hostName?: string;
    learnerId: string;
    learnerName: string;
    learnerEmail?: string;
    assessmentId?: string | null;
    sessionCategory?: string;
    topic: string;
    reason?: string;
    dateTime: string;
    meetLink?: string;
    status: 'requested' | 'scheduled' | 'pending_notes' | 'completed' | 'cancelled' | 'declined' | 'missed';
    initiatedBy?: string;
    requestedBy?: string;
    createdAt?: any;
    notes?: string;
    completedAt?: string;
    requiresManualLink?: boolean;
    systemNote?: string;
    cohortId?: string;
}

// ─── MANAGE SESSION MODAL (Notes & Link Editor for Staff) ───
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
                payload.status = 'scheduled';
            }

            await updateDoc(doc(db, 'coaching_sessions', session.id), payload);

            // 🚀 BIDIRECTIONAL SYNC: AUTO-UNLOCK LINKED ASSESSMENT WITH COMPLETE REMEDIATION PAYLOAD
            if (markComplete && session.assessmentId) {
                try {
                    const subQ = query(
                        collection(db, 'learner_submissions'),
                        where('learnerId', '==', session.learnerId),
                        where('assessmentId', '==', session.assessmentId)
                    );
                    let subSnap = await getDocs(subQ);

                    if (subSnap.empty) {
                        const subQAuth = query(
                            collection(db, 'learner_submissions'),
                            where('authUid', '==', session.learnerId),
                            where('assessmentId', '==', session.assessmentId)
                        );
                        subSnap = await getDocs(subQAuth);
                    }

                    if (!subSnap.empty) {
                        const submissionDoc = subSnap.docs[0];
                        const subData = submissionDoc.data();

                        const historyRef = doc(collection(db, 'learner_submissions', submissionDoc.id, 'history'));
                        await setDoc(historyRef, {
                            ...subData,
                            archivedAt: timestampIso,
                            snapshotReason: `Remediation via Coaching Schedule`,
                            coachingLog: {
                                date: timestampIso,
                                notes: notes.trim(),
                                facilitatorId: session.facilitatorId || session.assessorId || '',
                                facilitatorName: session.facilitatorName || session.assessorName || 'Educator',
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
                            // Clear termination & breach flags from previous attempt
                            isTerminated: deleteField(),
                            terminatedAt: deleteField(),
                            terminationReason: deleteField(),
                            invigilationBreached: deleteField(),
                            isMissed: deleteField(),
                            missedAt: deleteField(),
                            timeExpired: deleteField(),
                            hasOverride: true,
                            overrideUnlock: true,
                            attemptNumber: (subData.attemptNumber || 1) + 1,
                            lastStaffEditAt: timestampIso,
                            remediationDate: timestampIso,
                            remediationNotes: notes.trim(),
                            remediatedBy: session.facilitatorId || session.assessorId || '',
                            remediatedAt: timestampIso,
                            latestCoachingLog: {
                                date: timestampIso,
                                notes: notes.trim(),
                                facilitatorId: session.facilitatorId || session.assessorId || '',
                                facilitatorName: session.facilitatorName || session.assessorName || 'Educator',
                                acknowledged: false
                            }
                        });

                        toast.success("Session saved & linked assessment auto-unlocked!");
                        onClose();
                        return;
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
                            <ShieldAlert size={16} /> <span><strong>Action Required:</strong> Please attach a Google Meet or Zoom link below to schedule this session.</span>
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
                                    placeholder="Paste https://meet.google.com/... link here"
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
                                placeholder="Detail what was discussed, what the learner struggled with, and agreed next steps..."
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
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <Save size={13} />} Save Link & Details
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

// ─── LEARNER REQUEST COACHING MODAL ───
const LearnerRequestModal: React.FC<{
    user: any;
    myLearnerDoc: any;
    cohorts: any[];
    onClose: () => void;
    toast: any;
}> = ({ user, myLearnerDoc, cohorts, onClose, toast }) => {
    const [topic, setTopic] = useState('');
    const [reason, setReason] = useState('');
    const [preferredDate, setPreferredDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLearnerSubmit = async () => {
        if (!topic.trim()) {
            toast.warning("Please provide a topic or subject for the coaching session.");
            return;
        }

        setIsSubmitting(true);
        try {
            const learnerName = user?.fullName || myLearnerDoc?.fullName || 'Learner';
            const learnerId = myLearnerDoc?.idNumber || myLearnerDoc?.id || user?.uid;
            const cohortId = myLearnerDoc?.cohortId || (cohorts.length > 0 ? cohorts[0].id : '');

            await addDoc(collection(db, 'coaching_sessions'), {
                topic: topic.trim(),
                reason: reason.trim(),
                sessionCategory: 'Academic Support & Remediation',
                dateTime: preferredDate ? new Date(preferredDate).toISOString() : new Date().toISOString(),
                status: 'requested',
                learnerId: learnerId,
                learnerName: learnerName,
                learnerEmail: user?.email || myLearnerDoc?.email || '',
                cohortId: cohortId,
                assessorId: 'Unassigned Staff',
                assessorName: 'Unassigned Facilitator',
                requestedBy: user?.uid,
                createdAt: new Date().toISOString()
            });

            toast.success("Coaching request submitted successfully!");
            onClose();
        } catch (err: any) {
            console.error("Create coaching error:", err);
            toast.error("Failed to submit coaching request: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title"><MessageSquare size={16} /> Request 1-on-1 Coaching</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSubmitting}><X size={20} /></button>
                </div>

                <div className="lfm-body">
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)', lineHeight: 1.5 }}>
                        Request a 1-on-1 academic or remediation session with a facilitator. Your request will be reviewed and assigned.
                    </p>

                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Session Topic / Subject *</label>
                            <input
                                type="text"
                                className="lfm-input"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="e.g. Guidance on Module 2 Practical Assessment"
                            />
                        </div>

                        <div className="lfm-fg lfm-fg--full">
                            <label>Specific Questions / Reasons</label>
                            <textarea
                                className="lfm-input"
                                rows={3}
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Explain what concepts or topics you would like assistance with..."
                                style={{ resize: 'vertical' }}
                            />
                        </div>

                        <div className="lfm-fg lfm-fg--full">
                            <label>Preferred Date & Time</label>
                            <input
                                type="datetime-local"
                                className="lfm-input"
                                value={preferredDate}
                                onChange={e => setPreferredDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleLearnerSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 size={13} className="lfm-spin" /> Submitting…</> : <><CheckCircle size={13} /> Submit Request</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── STAFF CREATE SESSION MODAL ───
const StaffCreateSessionModal: React.FC<{
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

    const activeLearners = useMemo(() => {
        return [...learners]
            .filter(l => l.fullName && !l.isArchived)
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [learners]);

    const handleSubmit = async () => {
        if (!selectedLearnerId || !dateTime || !topic) {
            toast.error("Please fill in all required fields.");
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
                assessorName: user.fullName || 'Staff Member',
                facilitatorId: user.uid,
                facilitatorName: user.fullName || 'Staff Member',
                learnerId: learner.learnerId || learner.idNumber || learner.id,
                learnerName: learner.fullName,
                learnerEmail: learner.email || '',
                cohortId: learner.cohortId || '',
                assessmentId: null,
                sessionCategory: category,
                topic: topic.trim(),
                dateTime: new Date(dateTime).toISOString(),
                meetLink: meetLink.trim(),
                requiresManualLink: !meetLink.trim(),
                status: meetLink.trim() ? 'scheduled' : 'requested',
                initiatedBy: user.uid,
                createdAt: new Date().toISOString()
            });

            toast.success("Coaching session created successfully!");
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
                    <h2 className="lfm-header__title"><Calendar size={16} /> Schedule Session</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <div className="lfm-body">
                    <div className="lfm-grid">
                        <div className="lfm-fg lfm-fg--full">
                            <label>Learner *</label>
                            <select className="lfm-input" value={selectedLearnerId} onChange={e => setSelectedLearnerId(e.target.value)}>
                                <option value="">-- Select Learner --</option>
                                {activeLearners.map(l => (
                                    <option key={l.id} value={l.id}>{l.fullName} ({l.idNumber || l.email})</option>
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
                            <label>Meeting Link (Google Meet / Zoom)</label>
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

// ─── MAIN VIEW COMPONENT ───
export const CoachingScheduleView: React.FC = () => {
    const { user, learners = [], fetchLearners, cohorts = [], staff = [], fetchStaff, fetchCohorts } = useStore() as any;
    const toast = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'upcoming' | 'pending_notes' | 'completed' | 'cancelled' | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [showLearnerModal, setShowLearnerModal] = useState(false);
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    const activeRole = (user?.role || '').toLowerCase();
    const isLearner = activeRole === 'learner';
    const isSuperAdmin = (user as any)?.isSuperAdmin === true || activeRole.includes('super');
    const isAdmin = activeRole.includes('admin');

    useEffect(() => {
        if (!isLearner && (!learners || learners.length === 0)) fetchLearners();
        if (staff.length === 0 && fetchStaff) fetchStaff();
        if (cohorts.length === 0 && fetchCohorts) fetchCohorts();
    }, [isLearner, learners, fetchLearners, staff.length, fetchStaff, cohorts.length, fetchCohorts]);

    // RESOLVE ALL LEARNER IDENTIFIERS (UID, SA ID, EMAIL, DOC ID)
    const myLearnerDoc = useMemo(() => {
        return learners.find((l: any) => l.authUid === user?.uid || l.email === user?.email || l.id === user?.uid);
    }, [learners, user]);

    const myLearnerIdentifiers = useMemo(() => {
        const set = new Set<string>();
        if (user?.uid) set.add(user.uid);
        if ((user as any)?.id) set.add((user as any).id);
        if (myLearnerDoc?.id) set.add(myLearnerDoc.id);
        if (myLearnerDoc?.idNumber) set.add(myLearnerDoc.idNumber);
        if ((user as any)?.idNumber) set.add((user as any).idNumber);
        return set;
    }, [user, myLearnerDoc]);

    const myStaffDoc = useMemo(() => {
        return staff.find((s: any) => s.authUid === user?.uid || s.email === user?.email || s.id === user?.uid);
    }, [staff, user]);

    const myStaffId = myStaffDoc?.id;
    const myEmail = user?.email?.toLowerCase().trim();

    const myCohortIds = useMemo(() => {
        return cohorts
            .filter((c: any) =>
                c.facilitatorId === user?.uid || c.facilitatorId === myStaffId ||
                c.supportFacilitatorId === user?.uid || c.supportFacilitatorId === myStaffId ||
                c.assessorId === user?.uid || c.assessorId === myStaffId
            )
            .map((c: any) => c.id);
    }, [cohorts, user?.uid, myStaffId]);

    // REAL-TIME FIRESTORE LISTENER (Client-side matching for multi-ID robustness)
    useEffect(() => {
        if (!user?.uid) return;

        const sessionsRef = collection(db, 'coaching_sessions');

        const unsubscribe = onSnapshot(sessionsRef, (snapshot) => {
            const fetched: CoachingSession[] = [];

            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const sessionObj = { id: docSnap.id, ...data } as CoachingSession;

                const facId = data.facilitatorId;
                const assId = data.assessorId;
                const hostId = data.hostId;
                const learnerId = data.learnerId;
                const requestedBy = data.requestedBy;
                const hostEmail = (data.hostEmail || data.facilitatorEmail || '').toLowerCase().trim();
                const learnerEmail = (data.learnerEmail || '').toLowerCase().trim();
                const cohortId = data.cohortId;

                const isUnassigned = !assId || assId === 'Unassigned Staff' || !facId || facId === 'Unassigned';

                const isRelevant = isLearner ? (
                    (learnerId && myLearnerIdentifiers.has(learnerId)) ||
                    (requestedBy && requestedBy === user.uid) ||
                    (myEmail && learnerEmail === myEmail) ||
                    (data.learnerName && user?.fullName && data.learnerName.toLowerCase() === user.fullName.toLowerCase())
                ) : (
                    isSuperAdmin ||
                    isAdmin ||
                    facId === user.uid || (myStaffId && facId === myStaffId) ||
                    assId === user.uid || (myStaffId && assId === myStaffId) ||
                    hostId === user.uid || (myStaffId && hostId === myStaffId) ||
                    (hostEmail && myEmail && hostEmail === myEmail) ||
                    (cohortId && myCohortIds.includes(cohortId)) ||
                    isUnassigned
                );

                if (isRelevant) {
                    fetched.push(sessionObj);
                }
            });

            setSessions(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching coaching sessions:", err);
            toast.error("Failed to load schedule.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, isLearner, isSuperAdmin, isAdmin, myLearnerIdentifiers, myStaffId, myEmail, myCohortIds, toast]);

    const handleCancelClick = (session: CoachingSession, isPast: boolean) => {
        const confirmMsg = isPast
            ? "Are you sure you want to mark this session as a No-Show / Missed?"
            : "Are you sure you want to cancel this session?";

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
        } catch (err: any) {
            toast.error("Failed to update session.");
        }
    };

    const stats = useMemo(() => {
        const nowMs = Date.now();
        let upcoming = 0, pending_notes = 0, completed = 0, cancelled = 0;

        sessions.forEach(s => {
            const st = (s.status || '').toLowerCase();
            const sessionTime = new Date(s.dateTime || s.createdAt || 0).getTime();
            const isPast = sessionTime <= nowMs;

            if (st === 'completed') {
                completed++;
            } else if (st === 'cancelled' || st === 'declined' || st === 'missed') {
                cancelled++;
            } else if (st === 'pending_notes' || (st === 'scheduled' && isPast)) {
                pending_notes++;
            } else if (st === 'requested' || (st === 'scheduled' && !isPast)) {
                upcoming++;
            }
        });

        return {
            upcoming,
            pending_notes,
            completed,
            cancelled,
            all: sessions.length
        };
    }, [sessions]);

    const tabConfigs = [
        { id: 'all', label: 'All', count: stats.all, alert: false },
        { id: 'upcoming', label: 'Upcoming / Requested', count: stats.upcoming, alert: false },
        { id: 'pending_notes', label: 'Pending Notes', count: stats.pending_notes, alert: stats.pending_notes > 0 },
        { id: 'completed', label: 'Completed', count: stats.completed, alert: false },
        { id: 'cancelled', label: 'Cancelled', count: stats.cancelled, alert: false }
    ];

    const filteredSessions = useMemo(() => {
        const nowMs = Date.now();

        return sessions.filter(s => {
            const st = (s.status || '').toLowerCase();
            const sessionTime = new Date(s.dateTime || s.createdAt || 0).getTime();
            const isPast = sessionTime <= nowMs;

            if (filter === 'upcoming') {
                if (st === 'completed' || st === 'cancelled' || st === 'declined' || st === 'missed') return false;
                if (st === 'pending_notes') return false;
                if (st === 'scheduled' && isPast) return false;
                return true;
            }
            if (filter === 'pending_notes') {
                if (st === 'completed' || st === 'cancelled' || st === 'declined' || st === 'missed') return false;
                return st === 'pending_notes' || (st === 'scheduled' && isPast);
            }
            if (filter === 'completed') return st === 'completed';
            if (filter === 'cancelled') return st === 'cancelled' || st === 'declined' || st === 'missed';

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                return (
                    (s.learnerName || '').toLowerCase().includes(term) ||
                    (s.topic || '').toLowerCase().includes(term) ||
                    (s.sessionCategory || '').toLowerCase().includes(term) ||
                    (s.assessorName || s.facilitatorName || '').toLowerCase().includes(term)
                );
            }
            return true;
        }).sort((a, b) => {
            if (filter === 'upcoming') {
                return new Date(a.dateTime || a.createdAt || 0).getTime() - new Date(b.dateTime || b.createdAt || 0).getTime();
            }
            return new Date(b.dateTime || b.createdAt || 0).getTime() - new Date(a.dateTime || a.createdAt || 0).getTime();
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

            {showStaffModal && (
                <StaffCreateSessionModal
                    user={user}
                    learners={learners || []}
                    onClose={() => setShowStaffModal(false)}
                    toast={toast}
                />
            )}

            {showLearnerModal && (
                <LearnerRequestModal
                    user={user}
                    myLearnerDoc={myLearnerDoc}
                    cohorts={cohorts || []}
                    onClose={() => setShowLearnerModal(false)}
                    toast={toast}
                />
            )}

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Video size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Coaching & Support Schedule</h1>
                        <p className="wm-page-header__desc">
                            {isLearner ? 'Track your requested 1-on-1 sessions, scheduled meetings, and facilitator notes.' : 'Manage 1-on-1 sessions, notes, and upcoming student meetings.'}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        type="button"
                        className="wm-btn wm-btn--primary"
                        onClick={() => isLearner ? setShowLearnerModal(true) : setShowStaffModal(true)}
                        style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', fontWeight: 800, padding: '10px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    >
                        <Plus size={16} /> {isLearner ? 'Request 1-on-1 Session' : 'Schedule Session'}
                    </button>
                </div>
            </div>

            {/* ── TOP STATS ROW ── */}
            <div style={{ padding: '0 1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div className="mlab-cohort-card" onClick={() => setFilter('upcoming')} style={{ padding: '1.25rem', borderTopColor: '#0ea5e9', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0, cursor: 'pointer' }}>
                        <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '8px', color: '#0ea5e9' }}><Calendar size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isLearner ? 'Upcoming & Requested' : 'Upcoming'}</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.upcoming}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" onClick={() => setFilter('pending_notes')} style={{ padding: '1.25rem', borderTopColor: '#ea580c', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0, cursor: 'pointer' }}>
                        <div style={{ background: '#ffedd5', padding: '12px', borderRadius: '8px', color: '#ea580c' }}><Clock size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Notes</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.pending_notes}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" onClick={() => setFilter('completed')} style={{ padding: '1.25rem', borderTopColor: '#16a34a', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0, cursor: 'pointer' }}>
                        <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', color: '#16a34a' }}><CheckCircle size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--mlab-blue)' }}>{stats.completed}</h3>
                        </div>
                    </div>
                    <div className="mlab-cohort-card" onClick={() => setFilter('cancelled')} style={{ padding: '1.25rem', borderTopColor: '#e11d48', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: 0, cursor: 'pointer' }}>
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
                            placeholder="Search by topic or participant..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 10px', color: 'var(--mlab-blue)', width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
                        />
                    </div>
                </div>
            </div>

            {/* ── SESSIONS LIST ── */}
            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                    <Loader />
                </div>
            ) : filteredSessions.length === 0 ? (
                <div className="mlab-cohort-empty" style={{ margin: '0 1.5rem' }}>
                    <Calendar size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                    <p className="mlab-cohort-empty__title">No Sessions Found</p>
                    <p className="mlab-cohort-empty__desc">There are no sessions matching your current filter criteria.</p>
                </div>
            ) : (
                <div className="mlab-cohort-grid" style={{ padding: '0 1.5rem', paddingBottom: '2rem' }}>
                    {filteredSessions.map(session => {
                        const nowMs = Date.now();
                        const sessionTime = new Date(session.dateTime || session.createdAt || 0).getTime();
                        const isPast = sessionTime <= nowMs;
                        const isCompleted = session.status === 'completed';
                        const isCancelled = session.status === 'cancelled' || session.status === 'declined' || session.status === 'missed';
                        const isPendingNotes = session.status === 'pending_notes' || (session.status === 'scheduled' && isPast);
                        const isRequested = session.status === 'requested';
                        const needsLink = !session.meetLink || session.requiresManualLink;

                        return (
                            <div key={session.id} className="mlab-cohort-card animate-fade-in" style={{ borderLeftColor: needsLink && !isCompleted && !isCancelled ? '#fca5a5' : undefined }}>
                                <div className="mlab-cohort-card__header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <h3 className="mlab-cohort-card__name" title={session.learnerName}>{session.learnerName}</h3>

                                        {isRequested && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
                                                <AlertCircle size={10} /> Requested
                                            </span>
                                        )}
                                        {isPendingNotes && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ffedd5', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
                                                <Clock size={10} /> Pending Notes
                                            </span>
                                        )}
                                        {needsLink && !isLearner && !isCompleted && !isCancelled && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff1f2', color: '#e11d48', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
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
                                    {session.sessionCategory && (
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot mlab-role-dot--blue" />
                                            <span className="mlab-role-label">Category:</span>
                                            <span className="mlab-role-name">{session.sessionCategory}</span>
                                        </div>
                                    )}
                                    <div className="mlab-role-row">
                                        <div className="mlab-role-dot mlab-role-dot--red" />
                                        <span className="mlab-role-label">Topic:</span>
                                        <span className="mlab-role-name" title={session.topic}>{session.topic}</span>
                                    </div>
                                    {session.reason && (
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot" style={{ background: '#0284c7' }} />
                                            <span className="mlab-role-label">Notes/Questions:</span>
                                            <span className="mlab-role-name" title={session.reason}>{session.reason}</span>
                                        </div>
                                    )}
                                    {!isLearner && (
                                        <div className="mlab-role-row">
                                            <div className="mlab-role-dot mlab-role-dot--green" />
                                            <span className="mlab-role-label">Staff Host:</span>
                                            <span className="mlab-role-name">{session.assessorName || session.facilitatorName || 'Assigned Educator'}</span>
                                        </div>
                                    )}
                                </div>

                                {isCompleted && session.notes && (
                                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '0.8rem', color: '#166534' }}>
                                        <strong style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <FileText size={13} /> Facilitator Session Notes:
                                        </strong>
                                        <div style={{ whiteSpace: 'pre-wrap', maxHeight: '70px', overflowY: 'auto' }}>{session.notes}</div>
                                    </div>
                                )}

                                <div className="mlab-cohort-card__footer" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                                    <div className="mlab-cohort-card__learner-count">
                                        {isCompleted ? (
                                            <span style={{ color: 'var(--mlab-green)' }}><CheckCircle size={14} /> <strong>Completed</strong></span>
                                        ) : isCancelled ? (
                                            <span style={{ color: 'var(--mlab-red)' }}><Trash2 size={14} /> <strong>{isPast ? 'Missed' : 'Cancelled'}</strong></span>
                                        ) : isPendingNotes ? (
                                            <span style={{ color: '#ea580c' }}><Clock size={14} /> <strong>Pending Notes</strong></span>
                                        ) : isRequested ? (
                                            <span style={{ color: '#b45309' }}><AlertCircle size={14} /> <strong>Requested</strong></span>
                                        ) : (
                                            <span style={{ color: 'var(--mlab-blue)' }}><Calendar size={14} /> <strong>Scheduled</strong></span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {session.meetLink && !isCancelled && !isCompleted && (
                                            <a href={session.meetLink} target="_blank" rel="noreferrer" className="wm-btn wm-btn--ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', borderColor: 'var(--mlab-border)', color: 'var(--mlab-blue)' }}>
                                                <Video size={13} /> Join
                                            </a>
                                        )}

                                        {isLearner && needsLink && !isCompleted && !isCancelled && (
                                            <span style={{ fontSize: '0.7rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px', background: '#ffedd5', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fed7aa' }}>
                                                <Clock size={12} /> Awaiting Link
                                            </span>
                                        )}

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