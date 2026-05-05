// src/pages/LearnerPortal/AssessmentLaunchpad/AssessmentLaunchpad.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Clock, BookOpen, AlertTriangle, ShieldAlert, Loader2, Play, CheckCircle, Layers } from 'lucide-react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../components/common/Toast/Toast';
// NOTE: We will re-use your LearnerActionInbox here so they can clear tasks instantly!
// You may need to export it from LearnerDashboard.tsx or move it to a shared component folder.

export const AssessmentLaunchpad: React.FC = () => {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useStore();

    const [submission, setSubmission] = useState<any>(null);
    const [moduleLogs, setModuleLogs] = useState<any[]>([]);
    const [passedFormative, setPassedFormative] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [loading, setLoading] = useState(true);

    // 1. Listen to the specific Assessment Submission
    useEffect(() => {
        if (!submissionId) return;
        const unsub = onSnapshot(doc(db, 'learner_submissions', submissionId), (doc) => {
            if (doc.exists()) {
                setSubmission({ id: doc.id, ...doc.data() });
            }
        });
        return () => unsub();
    }, [submissionId]);

    // 2. Fetch Compliance Data (Logs and Formative Scores)
    useEffect(() => {
        if (!submission || !user?.uid) return;

        const isSummative = submission.type?.toLowerCase().includes('summative');

        if (isSummative) {
            // Watch for unacknowledged curriculum logs for this specific module
            const logsQ = query(
                collection(db, 'curriculum_logs'),
                where('cohortId', '==', submission.cohortId),
                where('moduleCode', '==', submission.moduleNumber)
            );

            const unsubLogs = onSnapshot(logsQ, (snap) => {
                setModuleLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            });

            // Check if they passed the Formative for this module
            const formQ = query(
                collection(db, 'learner_submissions'),
                where('learnerId', '==', submission.learnerId),
                where('moduleNumber', '==', submission.moduleNumber),
                where('status', '==', 'moderated'),
                where('competency', '==', 'C')
            );

            onSnapshot(formQ, (snap) => {
                setPassedFormative(!snap.empty);
            });

            return () => unsubLogs();
        } else {
            setLoading(false); // If it's a formative, no checks needed!
        }
    }, [submission, user?.uid]);

    const pendingTopics = useMemo(() => {
        if (!submission) return [];
        return moduleLogs.filter(log => !log.acknowledgedBy?.includes(submission.learnerId));
    }, [moduleLogs, submission]);

    const handleStartExam = async () => {
        setIsStarting(true);
        try {
            const functions = getFunctions();
            const startFn = httpsCallable(functions, 'startAssessment');
            await startFn({ submissionId: submission.id });

            // Navigate to the actual exam engine page (we will build this next!)
            navigate(`/learner/exam/${submission.id}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to start exam.");
            setIsStarting(false);
        }
    };

    if (loading || !submission) return <div style={{ padding: '3rem', textAlign: 'center' }}><Loader2 className="lfm-spin" size={40} /></div>;

    const isSummative = submission.type?.toLowerCase().includes('summative');
    const isFullyCompliant = pendingTopics.length === 0;
    const hasOverride = submission.facilitatorOverride === true;

    // THE HARD GATE: Failed Formative & No Override
    if (isSummative && !passedFormative && !hasOverride) {
        return (
            <div style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center', background: 'white', padding: '3rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <ShieldAlert size={64} color="#dc2626" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ color: '#991b1b', fontFamily: 'var(--font-heading)' }}>Readiness Requirement Not Met</h2>
                <p style={{ color: '#7f1d1d' }}>You must successfully complete and achieve Competency (C) in your Formative Assessment for <strong>{submission.moduleNumber}</strong> before you can unlock this Summative Exam.</p>
                <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--ghost" style={{ marginTop: '1.5rem' }}>Return to Dashboard</button>
            </div>
        );
    }

    // THE LAUNCHPAD UI
    return (
        <div style={{ maxWidth: '800px', margin: '3rem auto' }}>
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
                <div style={{ background: 'var(--mlab-blue)', padding: '2rem', color: 'white', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', display: 'inline-block', padding: '12px', borderRadius: '50%', marginBottom: '1rem' }}>
                        <BookOpen size={40} color="var(--mlab-green)" />
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>{submission.title}</h1>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.9rem', opacity: 0.9 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={14} /> {submission.moduleNumber}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {submission.timeLimit || 60} Minutes</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={14} /> {submission.type}</span>
                    </div>
                </div>

                <div style={{ padding: '2rem' }}>
                    {/* THE SOFT GATE: Pending Topics */}
                    {isSummative && !isFullyCompliant ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem' }}>
                                <AlertTriangle size={24} color="#d97706" />
                                <div>
                                    <h3 style={{ margin: 0, color: '#92400e', fontSize: '1.1rem' }}>Pre-Flight Check</h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#b45309', fontSize: '0.85rem' }}>You must acknowledge the delivery of these module topics before the exam will unlock.</p>
                                </div>
                            </div>
                            {/* NOTE: You will render your LearnerActionInbox here! */}
                            <p style={{ fontStyle: 'italic', color: 'var(--mlab-grey)' }}>[ Action Inbox renders here ]</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#dcfce7', color: '#166534', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '2rem' }}>
                                <CheckCircle size={16} /> All compliance checks passed
                            </div>
                            <p style={{ color: 'var(--mlab-grey)', marginBottom: '2rem' }}>Once you click start, your timer will begin immediately. You cannot pause the exam once it starts.</p>

                            <button
                                onClick={handleStartExam}
                                disabled={isStarting}
                                className="mlab-btn"
                                style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', fontSize: '1.2rem', padding: '1rem 3rem', borderRadius: '8px', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px' }}
                            >
                                {isStarting ? <Loader2 className="lfm-spin" size={24} /> : <Play size={24} fill="currentColor" />}
                                {isStarting ? 'Preparing Exam...' : 'Start Assessment'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};