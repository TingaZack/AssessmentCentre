// src/components/admin/attendance/SessionAudienceModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Users, X, Search, CheckCircle2, Loader2, ShieldCheck,
    UserCheck, AlertCircle, Info, CheckSquare, Square
} from 'lucide-react';
import { doc, getDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../common/Toast/Toast';
import type { DashboardLearner } from '../../../types';

interface SessionAudienceModalProps {
    cohort: any;
    session: any; // The selected session log or unrolled sub-session
    enrolledLearners: DashboardLearner[];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const SessionAudienceModal: React.FC<SessionAudienceModalProps> = ({
    cohort,
    session,
    enrolledLearners,
    isOpen,
    onClose,
    onSuccess
}) => {
    const toast = useToast();
    const [sessionScope, setSessionScope] = useState<'mandatory' | 'targeted'>('mandatory');
    const [invitedLearnerIds, setInvitedLearnerIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Active learners only (withdrawn learners are excluded from invites)
    const activeRoster = useMemo(() => {
        return enrolledLearners.filter(l => l.status !== 'dropped');
    }, [enrolledLearners]);

    // Load initial invite state when opened
    useEffect(() => {
        if (session && isOpen) {
            const scope = session.sessionScope || 'mandatory';
            setSessionScope(scope);

            if (Array.isArray(session.invitedLearnerIds) && session.invitedLearnerIds.length > 0) {
                setInvitedLearnerIds(new Set(session.invitedLearnerIds));
            } else {
                // Default: All active learners invited
                setInvitedLearnerIds(new Set(activeRoster.map(l => l.learnerId || l.id)));
            }
        }
    }, [session, isOpen, activeRoster]);

    const filteredLearners = useMemo(() => {
        const queryStr = search.toLowerCase().trim();
        if (!queryStr) return activeRoster;
        return activeRoster.filter(l =>
            l.fullName.toLowerCase().includes(queryStr) ||
            l.idNumber.includes(queryStr) ||
            (l.email && l.email.toLowerCase().includes(queryStr))
        );
    }, [activeRoster, search]);

    const handleToggleSelectAll = () => {
        if (invitedLearnerIds.size === activeRoster.length) {
            setInvitedLearnerIds(new Set());
        } else {
            setInvitedLearnerIds(new Set(activeRoster.map(l => l.learnerId || l.id)));
        }
    };

    const handleToggleLearner = (id: string) => {
        const next = new Set(invitedLearnerIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setInvitedLearnerIds(next);
    };

    const handleSaveAudience = async () => {
        if (sessionScope === 'targeted' && invitedLearnerIds.size === 0) {
            toast.error("Please select at least one invited learner for a targeted session.");
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const parentDocId = session.parentLogId || session.id;
            const logRef = doc(db, 'attendance_logs', parentDocId);

            const invitedArray = sessionScope === 'mandatory'
                ? activeRoster.map(l => l.learnerId || l.id)
                : Array.from(invitedLearnerIds);

            // 1. Fetch current attendance records for this session/date
            const recordsQuery = query(
                collection(db, 'attendance_records'),
                where('cohortId', '==', cohort.id),
                where('sessionDate', '==', session.sessionDate.split('T')[0])
            );
            const recordsSnap = await getDocs(recordsQuery);

            let presentCount = 0;
            let partialCount = 0;
            let absentCount = 0;
            let exemptCount = 0;

            const expectedDuration = session.expectedDuration || 120;

            // 2. Batch update individual attendance records
            activeRoster.forEach(learner => {
                const learnerId = learner.learnerId || learner.id;
                const isInvited = sessionScope === 'mandatory' || invitedLearnerIds.has(learnerId);

                const existingRecordDoc = recordsSnap.docs.find(d => {
                    const data = d.data();
                    return data.learnerId === learnerId && (
                        data.sessionId === session.id ||
                        data.sessionNumber === session.sessionNumber ||
                        d.id.includes(learnerId)
                    );
                });

                const recordRef = existingRecordDoc
                    ? existingRecordDoc.ref
                    : doc(db, 'attendance_records', `${cohort.id}_${session.sessionDate.split('T')[0]}_${learnerId}`);

                const actualDuration = existingRecordDoc?.data().actualDuration || 0;

                if (!isInvited) {
                    // ⚪ UNINVITED LEARNER -> MARK EXEMPT
                    exemptCount++;
                    batch.set(recordRef, {
                        attendanceLogId: parentDocId,
                        cohortId: cohort.id,
                        learnerId: learnerId,
                        sessionDate: session.sessionDate.split('T')[0],
                        expectedDuration: expectedDuration,
                        actualDuration: 0,
                        status: 'Exempt',
                        isExempt: true,
                        compliancePct: null,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                } else {
                    // 🟢 / 🟡 / 🔴 INVITED LEARNER -> RECALCULATE STATUS
                    const pct = expectedDuration > 0 ? (actualDuration / expectedDuration) * 100 : 0;
                    let status: 'Present' | 'Partial' | 'Absent' = 'Absent';

                    if (pct >= 80) status = 'Present';
                    else if (pct > 20) status = 'Partial';

                    if (status === 'Present') presentCount++;
                    else if (status === 'Partial') partialCount++;
                    else absentCount++;

                    batch.set(recordRef, {
                        attendanceLogId: parentDocId,
                        cohortId: cohort.id,
                        learnerId: learnerId,
                        sessionDate: session.sessionDate.split('T')[0],
                        expectedDuration: expectedDuration,
                        actualDuration: actualDuration,
                        status: status,
                        isExempt: false,
                        compliancePct: Math.min(100, Math.round(pct)),
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }
            });

            // 3. Update Parent Attendance Log Document
            if (session.parentLogId && session.subIndex !== undefined) {
                // If it's a sub-session in a batched log array
                const parentSnap = await getDoc(logRef);
                if (parentSnap.exists()) {
                    const parentData = parentSnap.data();
                    const sessions = parentData.sessions || [];
                    if (sessions[session.subIndex]) {
                        sessions[session.subIndex] = {
                            ...sessions[session.subIndex],
                            sessionScope,
                            invitedLearnerIds: invitedArray,
                            totalPresent: presentCount,
                            totalPartial: partialCount,
                            totalAbsent: absentCount,
                            totalExempt: exemptCount
                        };
                        batch.update(logRef, { sessions, lastEditedAt: new Date().toISOString() });
                    }
                }
            } else {
                // Standard single log document
                batch.set(logRef, {
                    sessionScope,
                    invitedLearnerIds: invitedArray,
                    totalPresent: presentCount,
                    totalPartial: partialCount,
                    totalAbsent: absentCount,
                    totalExempt: exemptCount,
                    lastEditedAt: new Date().toISOString()
                }, { merge: true });
            }

            await batch.commit();

            toast.success(
                sessionScope === 'targeted'
                    ? `Audience updated! ${invitedArray.length} invited, ${exemptCount} marked exempt.`
                    : `Session set to Mandatory for all ${activeRoster.length} active learners.`
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Error updating session audience:", err);
            toast.error("Failed to update session audience.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !session) return null;

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 999999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', borderRadius: 0, border: '2px solid var(--mlab-blue)' }}>

                {/* HEADER */}
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: '#f8fafc' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0284c7', borderRadius: 0 }}>
                        <Users size={20} />
                    </div>
                    <div>
                        <h2 className="wm-modal__title" style={{ color: "var(--mlab-blue)" }}>
                            Manage Session Audience
                        </h2>
                        <p className="wm-modal__subtitle" style={{ color: "var(--mlab-grey)" }}>
                            {session.sessionTitle || 'Virtual Class Session'} — {new Date(session.sessionDate.split('T')[0]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
                </div>

                {/* BODY */}
                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>

                    {/* SCOPE SELECTOR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-midnight)' }}>
                            Session Audience Scope *
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div
                                onClick={() => setSessionScope('mandatory')}
                                style={{
                                    border: sessionScope === 'mandatory' ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)',
                                    background: sessionScope === 'mandatory' ? '#f0f9ff' : 'var(--mlab-white)',
                                    padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px'
                                }}
                            >
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: sessionScope === 'mandatory' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Users size={14} /> Mandatory (All Learners)
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                    Required for all {activeRoster.length} active applicants. Missing learners marked Absent.
                                </span>
                            </div>

                            <div
                                onClick={() => setSessionScope('targeted')}
                                style={{
                                    border: sessionScope === 'targeted' ? '2px solid #8b5cf6' : '1px solid var(--mlab-border)',
                                    background: sessionScope === 'targeted' ? '#f5f3ff' : 'var(--mlab-white)',
                                    padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px'
                                }}
                            >
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: sessionScope === 'targeted' ? '#7c3aed' : 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <UserCheck size={14} /> Targeted / Selected Only
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                    Specific workshop or group. Uninvited learners are marked Exempt (N/A).
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* TARGETED CHECKLIST SECTION */}
                    {sessionScope === 'targeted' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                                    <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search learner name, ID or email..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px 6px 30px', background: 'var(--mlab-white)', fontSize: '0.8rem', border: '1px solid var(--mlab-border)', outline: 'none' }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleToggleSelectAll}
                                    style={{ background: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}
                                >
                                    {invitedLearnerIds.size === activeRoster.length ? <CheckSquare size={12} /> : <Square size={12} />}
                                    {invitedLearnerIds.size === activeRoster.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)' }}>
                                {filteredLearners.length === 0 ? (
                                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>
                                        No active learners match your search.
                                    </div>
                                ) : (
                                    filteredLearners.map(learner => {
                                        const lId = learner.learnerId || learner.id;
                                        const isChecked = invitedLearnerIds.has(lId);

                                        return (
                                            <div
                                                key={lId}
                                                onClick={() => handleToggleLearner(lId)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                                    background: isChecked ? '#f0fdf4' : 'transparent',
                                                    transition: 'background 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => { }}
                                                        style={{ accentColor: 'var(--mlab-green)', cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)', display: 'block' }}>{learner.fullName}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{learner.idNumber} — {learner.email || 'No Email'}</span>
                                                    </div>
                                                </div>

                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase', background: isChecked ? '#dcfce7' : '#f1f5f9', color: isChecked ? '#15803d' : '#64748b', border: `1px solid ${isChecked ? '#bbf7d0' : '#cbd5e1'}` }}>
                                                    {isChecked ? 'Invited' : 'Exempt (N/A)'}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '8px 12px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Info size={14} /> Selected: <strong>{invitedLearnerIds.size}</strong> invited / <strong>{activeRoster.length - invitedLearnerIds.size}</strong> marked exempt.
                            </div>
                        </div>
                    )}

                </div>

                {/* FOOTER */}
                <div className="wm-modal__footer" style={{ borderTop: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="wm-btn wm-btn--ghost" style={{ borderRadius: 0 }} onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-blue)', borderColor: 'var(--mlab-blue)', borderRadius: 0 }} onClick={handleSaveAudience} disabled={isSaving}>
                        {isSaving ? <><Loader2 className="spin" size={16} /> Applying...</> : <><UserCheck size={16} /> Apply Audience Scope</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};