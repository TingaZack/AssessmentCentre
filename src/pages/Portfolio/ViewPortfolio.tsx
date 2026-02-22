// src/pages/Portfolio/ViewPortfolio.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, User, GraduationCap, Calendar,
    FileText, CheckCircle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
    ShieldCheck, Award, MessageSquareWarning, PenTool, Scale
} from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar';
import './ViewPortfolio.css';

interface LearnerSubmission {
    id: string;
    assessmentId: string;
    learnerId: string;
    title: string;
    type: string;
    // 🚀 FULL QCTO STATUS LIFECYCLE
    status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
    assignedAt: string;
    startedAt?: string;
    marks: number;
    totalMarks: number;
    competency?: 'C' | 'NYC';
    moduleNumber?: string;
    moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
    timeLimit?: number;
    moderation?: {
        outcome?: 'Endorsed' | 'Returned';
    };
}

const TABS = [
    { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
    { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
    { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
    { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
    { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
] as const;

type TabId = typeof TABS[number]['id'];

export const ViewPortfolio: React.FC = () => {
    const { id: learnerId } = useParams();
    const navigate = useNavigate();

    const { user, learners, fetchLearners } = useStore();
    const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('knowledge');

    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

    const learner = learners.find(l => l.id === learnerId);

    useEffect(() => {
        const fetchSecureTimeOffset = async () => {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                setTimeOffset(new Date(data.utc_datetime).getTime() - new Date().getTime());
            } catch (error) { setTimeOffset(0); }
        };
        fetchSecureTimeOffset();
        const interval = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getSecureNow = () => currentTimeTick + timeOffset;

    useEffect(() => {
        if (learners.length === 0) fetchLearners();

        const fetchSubmissionsAndTemplates = async () => {
            if (!learnerId) return;
            setLoadingSubmissions(true);
            try {
                const q = query(collection(db, 'learner_submissions'), where('learnerId', '==', learnerId));
                const snap = await getDocs(q);
                let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

                const cache = new Map<string, number | undefined>();

                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    if (!cache.has(sub.assessmentId)) {
                        const templateSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
                        if (templateSnap.exists()) {
                            cache.set(sub.assessmentId, templateSnap.data().moduleInfo?.timeLimit);
                        } else {
                            cache.set(sub.assessmentId, undefined);
                        }
                    }
                    subs[i].timeLimit = cache.get(sub.assessmentId);
                }

                subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
                setSubmissions(subs);
            } catch (err) { console.error('Error fetching submissions:', err); }
            finally { setLoadingSubmissions(false); }
        };

        fetchSubmissionsAndTemplates();
    }, [learnerId, learners.length, fetchLearners]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    const handleNavChange = (nav: string) => {
        if (user?.role === 'learner') {
            if (nav === 'dashboard') navigate('/portal');
            if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
        } else {
            navigate('/admin', { state: { activeTab: nav } });
        }
    };

    const handleActionClick = (sub: LearnerSubmission) => {
        if (user?.role === 'learner') {
            navigate(`/learner/assessment/${sub.assessmentId}`);
        } else {
            navigate(`/portfolio/submission/${sub.id}`);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 🚀 BULLETPROOF QCTO STATUS MATRIX 🚀
    // This correctly translates the backend status to the user's specific perspective.
    // ─────────────────────────────────────────────────────────────────────────
    const getStatusBadge = (sub: LearnerSubmission) => {
        const role = user?.role || 'learner';

        switch (sub.status) {
            case 'moderated':
                return sub.competency === 'C'
                    ? <span className="mlab-badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}><Award size={12} /> Final: Competent</span>
                    : <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> Final: NYC</span>;

            case 'appealed':
                return <span className="mlab-badge" style={{ background: '#ffedd5', color: '#b45309', border: '1px solid #fed7aa' }}><Scale size={12} /> Appeal Under Review</span>;

            case 'returned':
                // Moderator returned it. Learners shouldn't see "Returned" (internal staff dispute).
                if (role === 'learner') return <span className="mlab-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}><ShieldCheck size={12} /> Pending Internal QA</span>;
                if (role === 'assessor') return <span className="mlab-badge" style={{ background: '#ffe4e6', color: '#e11d48', border: '1px solid #fecdd3' }}><MessageSquareWarning size={12} /> Action Required (QA Return)</span>;
                return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}><Clock size={12} /> Waiting for Assessor Fix</span>;

            case 'graded':
                // Assessor is done. Waiting for Moderator.
                if (role === 'learner') return <span className="mlab-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}><ShieldCheck size={12} /> Pending Internal QA</span>;
                if (role === 'moderator') return <span className="mlab-badge" style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}><ShieldCheck size={12} /> Needs Moderation</span>;
                return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}><Clock size={12} /> Awaiting QA</span>;

            case 'facilitator_reviewed':
                // Facilitator is done. Waiting for Assessor.
                if (role === 'assessor') return <span className="mlab-badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}><PenTool size={12} /> Needs Assessor Grading (Red Pen)</span>;
                if (role === 'learner') return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}><Clock size={12} /> Under Review</span>;
                return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}><Clock size={12} /> Awaiting Assessor</span>;

            case 'submitted':
                // Learner is done. Waiting for Facilitator.
                if (role === 'facilitator') return <span className="mlab-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}><PenTool size={12} /> Needs Pre-Marking (Blue Pen)</span>;
                if (role === 'learner') return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}><CheckCircle size={12} /> Submitted successfully</span>;
                return <span className="mlab-badge" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}><Clock size={12} /> Awaiting Facilitator</span>;

            case 'in_progress':
                return <span className="mlab-badge" style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}><Edit3 size={12} /> In Progress</span>;

            case 'not_started':
            default:
                return <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>Not Started</span>;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 🚀 ROLE-SPECIFIC ACTION BUTTONS 🚀
    // Ensures the button text perfectly describes what the user is about to do.
    // ─────────────────────────────────────────────────────────────────────────
    const getActionContent = (sub: LearnerSubmission) => {
        const role = user?.role || 'learner';

        if (role === 'learner') {
            if (sub.status === 'not_started') return <><Play size={13} /> Start</>;
            if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
            if (['moderated', 'appealed'].includes(sub.status)) return <><Eye size={13} /> View Results</>;
            return <><Eye size={13} /> View Submission</>;
        }

        if (role === 'facilitator') {
            if (sub.status === 'submitted') return <><PenTool size={13} /> Pre-Mark Script</>;
            return <><Eye size={13} /> View Record</>;
        }

        if (role === 'assessor') {
            if (sub.status === 'returned') return <><AlertCircle size={13} /> Fix QA Revisions</>;
            if (sub.status === 'facilitator_reviewed') return <><Edit3 size={13} /> Grade Script</>;
            return <><Eye size={13} /> View Record</>;
        }

        if (role === 'moderator') {
            if (sub.status === 'graded') return <><ShieldCheck size={13} /> Moderate Script</>;
            if (sub.status === 'appealed') return <><Scale size={13} /> Review Appeal</>;
            return <><Eye size={13} /> View Record</>;
        }

        // Admin fallback
        return <><Eye size={13} /> View Record</>;
    };

    // Helper to color the button Primary (Blue) if it is THEIR turn to act
    const isActionRequired = (sub: LearnerSubmission) => {
        const role = user?.role;
        if (role === 'facilitator' && sub.status === 'submitted') return true;
        if (role === 'assessor' && (sub.status === 'facilitator_reviewed' || sub.status === 'returned')) return true;
        if (role === 'moderator' && (sub.status === 'graded' || sub.status === 'appealed')) return true;
        return false;
    };

    const renderTimeRemaining = (sub: LearnerSubmission) => {
        if (!sub.timeLimit) return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No Limit</span>;

        if (sub.status === 'not_started') {
            return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{sub.timeLimit}m Total</span>;
        }

        if (sub.status === 'in_progress' && sub.startedAt) {
            const startTime = new Date(sub.startedAt).getTime();
            const timeLimitMs = sub.timeLimit * 60 * 1000;
            const endTime = startTime + timeLimitMs;

            const secureNow = getSecureNow();
            const remainingSeconds = Math.max(0, Math.floor((endTime - secureNow) / 1000));

            if (remainingSeconds === 0) {
                return (
                    <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={14} /> Time Expired
                    </span>
                );
            }

            const m = Math.floor(remainingSeconds / 60);
            const s = remainingSeconds % 60;
            const isLow = remainingSeconds < 300;

            return (
                <span style={{
                    color: isLow ? '#ef4444' : '#2563eb',
                    fontWeight: isLow ? 'bold' : 'normal',
                    fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                    <Timer size={14} />
                    {m}m {s.toString().padStart(2, '0')}s
                </span>
            );
        }

        return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>;
    };

    if (!learner) return <div className="mlab-state mlab-state--loading">Loading Portfolio Data…</div>;

    const filteredSubmissions = submissions.filter(sub => {
        const currentTab = activeTab.toLowerCase();
        const subType = (sub.moduleType || 'knowledge').toLowerCase();
        if (currentTab === 'knowledge') {
            return subType === 'knowledge' || subType === '' || !sub.moduleType;
        }
        return subType === currentTab;
    });

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar
                role={user?.role}
                currentNav="learners"
                setCurrentNav={handleNavChange}
                onLogout={handleLogout}
            />

            <main className="main-wrapper" style={{ width: '100%', height: '100vh', overflowY: 'auto' }}>
                <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10 }}>
                    <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={16} /> Back
                    </button>

                    <div className="mlab-portfolio-header">
                        <h1>Portfolio of Evidence</h1>
                        <p>QCTO / SETA Compliance Record</p>
                    </div>
                </header>

                <div className="admin-content" style={{ paddingBottom: '4rem' }}>
                    <div className="mlab-profile-card">
                        <div className="mlab-profile-avatar"><User size={36} /></div>
                        <div className="mlab-profile-info">
                            <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
                            <div className="mlab-profile-info__meta">
                                <span><strong>ID:</strong> {learner.idNumber}</span>
                                <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
                                <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
                            </div>
                        </div>
                        <div className="mlab-profile-status">
                            <span className="mlab-profile-status__label">Overall Status</span>
                            {learner.status === 'active'
                                ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
                                : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
                            }
                        </div>
                    </div>

                    <div className="mlab-tab-bar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab !== 'compliance' && (
                        <div className="mlab-panel animate-fade-in">
                            {loadingSubmissions ? (
                                <div className="mlab-state mlab-state--loading">Loading assignments…</div>
                            ) : filteredSubmissions.length === 0 ? (
                                <div className="mlab-state">
                                    <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                    <span className="mlab-state__title">No {activeTab} assessments assigned.</span>
                                </div>
                            ) : (
                                <table className="mlab-table">
                                    <thead>
                                        <tr>
                                            <th>Assessment Title</th>
                                            <th>Type</th>
                                            <th>Time Limit</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSubmissions.map(sub => (
                                            <tr key={sub.id}>
                                                <td>
                                                    <div className="mlab-cell-title">{sub.title}</div>
                                                    <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
                                                </td>
                                                <td><span className="mlab-cell-meta">{sub.type}</span></td>
                                                <td>{renderTimeRemaining(sub)}</td>
                                                <td>{getStatusBadge(sub)}</td>
                                                <td className="mlab-cell-action">
                                                    <button
                                                        className={`mlab-btn ${isActionRequired(sub) ? 'mlab-btn--primary' : 'mlab-btn--outline-blue'}`}
                                                        onClick={() => handleActionClick(sub)}
                                                    >
                                                        {getActionContent(sub)}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'compliance' && (
                        <div className="mlab-compliance-panel animate-fade-in">
                            <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                            <h3>Compliance Documents</h3>
                            <p>Learner ID, CV, and Enrollment Contracts.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};


// import React, { useEffect, useState } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import {
//     ArrowLeft, User, GraduationCap, Calendar,
//     FileText, CheckCircle, AlertCircle, Clock,
//     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
//     ShieldCheck, Award, MessageSquareWarning
// } from 'lucide-react';
// import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// import { signOut } from 'firebase/auth';
// import { auth, db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar';
// import './ViewPortfolio.css';

// interface LearnerSubmission {
//     id: string;
//     assessmentId: string;
//     learnerId: string;
//     title: string;
//     type: string;
//     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'moderated' | 'appealed'; // Updated Status types
//     assignedAt: string;
//     startedAt?: string;
//     marks: number;
//     totalMarks: number;
//     competency?: 'C' | 'NYC';
//     moduleNumber?: string;
//     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
//     timeLimit?: number;
//     moderation?: {
//         outcome?: 'Endorsed' | 'Returned';
//     };
// }

// const TABS = [
//     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
//     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
//     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
//     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
//     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// ] as const;

// type TabId = typeof TABS[number]['id'];

// export const ViewPortfolio: React.FC = () => {
//     const { id: learnerId } = useParams();
//     const navigate = useNavigate();

//     const { user, learners, fetchLearners } = useStore();
//     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
//     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
//     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

//     const [timeOffset, setTimeOffset] = useState<number>(0);
//     const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

//     const learner = learners.find(l => l.id === learnerId);

//     useEffect(() => {
//         const fetchSecureTimeOffset = async () => {
//             try {
//                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
//                 const data = await res.json();
//                 const secureServerTime = new Date(data.utc_datetime).getTime();
//                 const localMachineTime = new Date().getTime();
//                 setTimeOffset(secureServerTime - localMachineTime);
//             } catch (error) {
//                 console.warn("Could not sync with secure time server.", error);
//                 setTimeOffset(0);
//             }
//         };
//         fetchSecureTimeOffset();

//         const interval = setInterval(() => {
//             setCurrentTimeTick(Date.now());
//         }, 1000);

//         return () => clearInterval(interval);
//     }, []);

//     const getSecureNow = () => currentTimeTick + timeOffset;

//     useEffect(() => {
//         if (learners.length === 0) fetchLearners();

//         const fetchSubmissionsAndTemplates = async () => {
//             if (!learnerId) return;
//             setLoadingSubmissions(true);
//             try {
//                 const q = query(
//                     collection(db, 'learner_submissions'),
//                     where('learnerId', '==', learnerId)
//                 );
//                 const snap = await getDocs(q);
//                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

//                 const cache = new Map<string, number | undefined>();

//                 for (let i = 0; i < subs.length; i++) {
//                     const sub = subs[i];
//                     if (!cache.has(sub.assessmentId)) {
//                         const templateSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
//                         if (templateSnap.exists()) {
//                             const templateData = templateSnap.data();
//                             cache.set(sub.assessmentId, templateData.moduleInfo?.timeLimit);
//                         } else {
//                             cache.set(sub.assessmentId, undefined);
//                         }
//                     }
//                     subs[i].timeLimit = cache.get(sub.assessmentId);
//                 }

//                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
//                 setSubmissions(subs);
//             } catch (err) {
//                 console.error('Error fetching submissions:', err);
//             } finally {
//                 setLoadingSubmissions(false);
//             }
//         };

//         fetchSubmissionsAndTemplates();
//     }, [learnerId, learners.length, fetchLearners]);

//     const handleLogout = async () => {
//         await signOut(auth);
//         navigate('/login');
//     };

//     const handleNavChange = (nav: string) => {
//         if (user?.role === 'learner') {
//             if (nav === 'dashboard') navigate('/portal');
//             if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
//         } else {
//             navigate('/admin', { state: { activeTab: nav } });
//         }
//     };

//     const handleActionClick = (sub: LearnerSubmission) => {
//         if (user?.role === 'learner') {
//             navigate(`/learner/assessment/${sub.assessmentId}`);
//         } else {
//             navigate(`/portfolio/submission/${sub.id}`);
//         }
//     };

//     // 🚀 ENHANCED STATUS BADGE LOGIC 🚀
//     const getStatusBadge = (sub: LearnerSubmission) => {
//         const isStudent = user?.role === 'learner';

//         // 1. Fully Moderated (Finalised)
//         if (sub.status === 'moderated') {
//             return sub.competency === 'C'
//                 ? <span className="mlab-badge mlab-badge--competent"><Award size={12} /> Final: Competent</span>
//                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> Final: NYC</span>;
//         }

//         // 2. Graded by Assessor (Awaiting Moderation)
//         if (sub.status === 'graded') {
//             // If the user is a learner, we don't necessarily want to say "Awaiting Moderation", 
//             // just that it's graded. But for staff, they need to know QA is pending.
//             if (isStudent) {
//                 return sub.competency === 'C'
//                     ? <span className="mlab-badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Graded: Competent</span>
//                     : <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> Graded: NYC</span>;
//             } else {
//                 return <span className="mlab-badge" style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}><ShieldCheck size={12} /> Needs Moderation</span>;
//             }
//         }

//         // 3. Submitted (Awaiting Assessor)
//         if (sub.status === 'submitted') {
//             // Check if it was returned by a moderator!
//             if (sub.moderation?.outcome === 'Returned') {
//                 return <span className="mlab-badge" style={{ background: '#ffe4e6', color: '#9f1239', border: '1px solid #fecdd3' }}><MessageSquareWarning size={12} /> Assessor Revision Needed</span>;
//             }
//             return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Awaiting Assessor</span>;
//         }

//         // 4. In Progress
//         if (sub.status === 'in_progress') {
//             return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
//         }

//         // 5. Not Started
//         return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
//     };

//     const getActionContent = (sub: LearnerSubmission) => {
//         if (user?.role === 'learner') {
//             if (sub.status === 'not_started') return <><Play size={13} /> Start</>;
//             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
//             if (['graded', 'moderated'].includes(sub.status)) return <><Eye size={13} /> Feedback</>;
//             return <><Eye size={13} /> View</>;
//         }

//         // Staff actions
//         if (user?.role === 'assessor' && sub.status === 'submitted') return <><Edit3 size={13} /> Grade Script</>;
//         if (user?.role === 'moderator' && sub.status === 'graded') return <><ShieldCheck size={13} /> Moderate Script</>;

//         return <><Eye size={13} /> View Record</>;
//     };

//     const renderTimeRemaining = (sub: LearnerSubmission) => {
//         if (!sub.timeLimit) return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No Limit</span>;

//         if (sub.status === 'not_started') {
//             return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{sub.timeLimit}m Total</span>;
//         }

//         if (sub.status === 'in_progress' && sub.startedAt) {
//             const startTime = new Date(sub.startedAt).getTime();
//             const timeLimitMs = sub.timeLimit * 60 * 1000;
//             const endTime = startTime + timeLimitMs;

//             const secureNow = getSecureNow();
//             const remainingSeconds = Math.max(0, Math.floor((endTime - secureNow) / 1000));

//             if (remainingSeconds === 0) {
//                 return (
//                     <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                         <AlertCircle size={14} /> Time Expired
//                     </span>
//                 );
//             }

//             const m = Math.floor(remainingSeconds / 60);
//             const s = remainingSeconds % 60;
//             const isLow = remainingSeconds < 300;

//             return (
//                 <span style={{
//                     color: isLow ? '#ef4444' : '#2563eb',
//                     fontWeight: isLow ? 'bold' : 'normal',
//                     fontSize: '0.9rem',
//                     display: 'flex', alignItems: 'center', gap: '4px'
//                 }}>
//                     <Timer size={14} />
//                     {m}m {s.toString().padStart(2, '0')}s
//                 </span>
//             );
//         }

//         return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>;
//     };

//     if (!learner) {
//         return <div className="mlab-state mlab-state--loading">Loading Portfolio Data…</div>;
//     }

//     const filteredSubmissions = submissions.filter(sub => {
//         const currentTab = activeTab.toLowerCase();
//         const subType = (sub.moduleType || 'knowledge').toLowerCase();
//         if (currentTab === 'knowledge') {
//             return subType === 'knowledge' || subType === '' || !sub.moduleType;
//         }
//         return subType === currentTab;
//     });

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
//             <Sidebar
//                 role={user?.role}
//                 currentNav="learners"
//                 setCurrentNav={handleNavChange}
//                 onLogout={handleLogout}
//             />

//             <main className="main-wrapper" style={{ width: '100%', height: '100vh', overflowY: 'auto' }}>
//                 <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10 }}>
//                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
//                         <ArrowLeft size={16} /> Back
//                     </button>

//                     <div className="mlab-portfolio-header">
//                         <h1>Portfolio of Evidence</h1>
//                         <p>QCTO / SETA Compliance Record</p>
//                     </div>
//                 </header>

//                 <div className="admin-content" style={{ paddingBottom: '4rem' }}>
//                     <div className="mlab-profile-card">
//                         <div className="mlab-profile-avatar"><User size={36} /></div>
//                         <div className="mlab-profile-info">
//                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
//                             <div className="mlab-profile-info__meta">
//                                 <span><strong>ID:</strong> {learner.idNumber}</span>
//                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
//                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
//                             </div>
//                         </div>
//                         <div className="mlab-profile-status">
//                             <span className="mlab-profile-status__label">Overall Status</span>
//                             {learner.status === 'active'
//                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
//                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
//                             }
//                         </div>
//                     </div>

//                     <div className="mlab-tab-bar">
//                         {TABS.map(tab => (
//                             <button
//                                 key={tab.id}
//                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
//                                 onClick={() => setActiveTab(tab.id)}
//                             >
//                                 {tab.icon} {tab.label}
//                             </button>
//                         ))}
//                     </div>

//                     {activeTab !== 'compliance' && (
//                         <div className="mlab-panel animate-fade-in">
//                             {loadingSubmissions ? (
//                                 <div className="mlab-state mlab-state--loading">Loading assignments…</div>
//                             ) : filteredSubmissions.length === 0 ? (
//                                 <div className="mlab-state">
//                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                                     <span className="mlab-state__title">No {activeTab} assessments assigned.</span>
//                                 </div>
//                             ) : (
//                                 <table className="mlab-table">
//                                     <thead>
//                                         <tr>
//                                             <th>Assessment Title</th>
//                                             <th>Type</th>
//                                             <th>Time Limit</th>
//                                             <th>Status</th>
//                                             <th>Action</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {filteredSubmissions.map(sub => (
//                                             <tr key={sub.id}>
//                                                 <td>
//                                                     <div className="mlab-cell-title">{sub.title}</div>
//                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
//                                                 </td>
//                                                 <td><span className="mlab-cell-meta">{sub.type}</span></td>
//                                                 <td>{renderTimeRemaining(sub)}</td>
//                                                 <td>{getStatusBadge(sub)}</td> {/* 🚀 PASS THE WHOLE OBJ */}
//                                                 <td className="mlab-cell-action">
//                                                     {/* 🚀 DYNAMIC BUTTON STYLING BASED ON ROLE/STATUS */}
//                                                     <button
//                                                         className={`mlab-btn ${(user?.role === 'assessor' && sub.status === 'submitted') ||
//                                                             (user?.role === 'moderator' && sub.status === 'graded')
//                                                             ? 'mlab-btn--primary'
//                                                             : 'mlab-btn--outline-blue'
//                                                             }`}
//                                                         onClick={() => handleActionClick(sub)}
//                                                     >
//                                                         {getActionContent(sub)}
//                                                     </button>
//                                                 </td>
//                                             </tr>
//                                         ))}
//                                     </tbody>
//                                 </table>
//                             )}
//                         </div>
//                     )}

//                     {activeTab === 'compliance' && (
//                         <div className="mlab-compliance-panel animate-fade-in">
//                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                             <h3>Compliance Documents</h3>
//                             <p>Learner ID, CV, and Enrollment Contracts.</p>
//                         </div>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };


// // import React, { useEffect, useState } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     ArrowLeft, User, GraduationCap, Calendar,
// //     FileText, CheckCircle, AlertCircle, Clock,
// //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer
// // } from 'lucide-react';
// // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // import { signOut } from 'firebase/auth';
// // import { auth, db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import './ViewPortfolio.css';

// // interface LearnerSubmission {
// //     id: string;
// //     assessmentId: string;
// //     learnerId: string;
// //     title: string;
// //     type: string;
// //     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'appealed';
// //     assignedAt: string;
// //     startedAt?: string; // Captured when learner starts
// //     marks: number;
// //     totalMarks: number;
// //     competency?: 'C' | 'NYC';
// //     moduleNumber?: string;
// //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// //     // We will populate this dynamically from the assessment template
// //     timeLimit?: number;
// // }

// // const TABS = [
// //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
// //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
// //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
// //     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
// //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// // ] as const;

// // type TabId = typeof TABS[number]['id'];

// // export const ViewPortfolio: React.FC = () => {
// //     const { id: learnerId } = useParams();
// //     const navigate = useNavigate();

// //     const { user, learners, fetchLearners } = useStore();
// //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

// //     // 🚀 SECURE TIME STATES
// //     const [timeOffset, setTimeOffset] = useState<number>(0);
// //     const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

// //     const learner = learners.find(l => l.id === learnerId);

// //     // ─── 1. FETCH SECURE TIME OFFSET ───
// //     useEffect(() => {
// //         const fetchSecureTimeOffset = async () => {
// //             try {
// //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// //                 const data = await res.json();
// //                 const secureServerTime = new Date(data.utc_datetime).getTime();
// //                 const localMachineTime = new Date().getTime();
// //                 setTimeOffset(secureServerTime - localMachineTime);
// //             } catch (error) {
// //                 console.warn("Could not sync with secure time server.", error);
// //                 setTimeOffset(0);
// //             }
// //         };
// //         fetchSecureTimeOffset();

// //         // Tick every second to update UI live
// //         const interval = setInterval(() => {
// //             setCurrentTimeTick(Date.now());
// //         }, 1000);

// //         return () => clearInterval(interval);
// //     }, []);

// //     // Helper to get true current time
// //     const getSecureNow = () => currentTimeTick + timeOffset;

// //     // ─── 2. FETCH DATA ───
// //     useEffect(() => {
// //         if (learners.length === 0) fetchLearners();

// //         const fetchSubmissionsAndTemplates = async () => {
// //             if (!learnerId) return;
// //             setLoadingSubmissions(true);
// //             try {
// //                 // 1. Fetch the Learner's Submissions
// //                 const q = query(
// //                     collection(db, 'learner_submissions'),
// //                     where('learnerId', '==', learnerId)
// //                 );
// //                 const snap = await getDocs(q);
// //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// //                 // 2. Fetch Time Limits from Assessment Templates
// //                 // (Since timeLimit is stored in the template, not the submission doc)
// //                 const cache = new Map<string, number | undefined>();

// //                 for (let i = 0; i < subs.length; i++) {
// //                     const sub = subs[i];
// //                     if (!cache.has(sub.assessmentId)) {
// //                         const templateSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// //                         if (templateSnap.exists()) {
// //                             const templateData = templateSnap.data();
// //                             cache.set(sub.assessmentId, templateData.moduleInfo?.timeLimit);
// //                         } else {
// //                             cache.set(sub.assessmentId, undefined);
// //                         }
// //                     }
// //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// //                 }

// //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// //                 setSubmissions(subs);
// //             } catch (err) {
// //                 console.error('Error fetching submissions:', err);
// //             } finally {
// //                 setLoadingSubmissions(false);
// //             }
// //         };

// //         fetchSubmissionsAndTemplates();
// //     }, [learnerId, learners.length, fetchLearners]);

// //     // ─── 3. ACTIONS ───
// //     const handleLogout = async () => {
// //         await signOut(auth);
// //         navigate('/login');
// //     };

// //     const handleNavChange = (nav: string) => {
// //         if (user?.role === 'learner') {
// //             if (nav === 'dashboard') navigate('/portal');
// //             if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
// //         } else {
// //             navigate('/admin', { state: { activeTab: nav } });
// //         }
// //     };

// //     const handleActionClick = (sub: LearnerSubmission) => {
// //         if (user?.role === 'learner') {
// //             navigate(`/learner/assessment/${sub.assessmentId}`);
// //         } else {
// //             navigate(`/portfolio/submission/${sub.id}`);
// //         }
// //     };

// //     // ─── 4. HELPERS ───
// //     const getStatusBadge = (status: string, competency?: string) => {
// //         if (status === 'graded') {
// //             return competency === 'C'
// //                 ? <span className="mlab-badge mlab-badge--competent"><CheckCircle size={12} /> Competent</span>
// //                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> NYC</span>;
// //         }
// //         switch (status) {
// //             case 'submitted': return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Under Review</span>;
// //             case 'in_progress': return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
// //             case 'not_started': return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
// //             default: return <span className="mlab-badge mlab-badge--not-started">{status}</span>;
// //         }
// //     };

// //     const getActionContent = (sub: LearnerSubmission) => {
// //         if (user?.role === 'learner') {
// //             if (sub.status === 'not_started') return <><Play size={13} /> Start</>;
// //             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
// //             if (sub.status === 'graded') return <><Eye size={13} /> Feedback</>;
// //             return <><Eye size={13} /> View</>;
// //         }
// //         return <><Eye size={13} /> View Record</>;
// //     };

// //     // 🚀 TIME CALCULATION LOGIC
// //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// //         if (!sub.timeLimit) return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No Limit</span>;

// //         if (sub.status === 'not_started') {
// //             return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{sub.timeLimit}m Total</span>;
// //         }

// //         if (sub.status === 'in_progress' && sub.startedAt) {
// //             const startTime = new Date(sub.startedAt).getTime();
// //             const timeLimitMs = sub.timeLimit * 60 * 1000;
// //             const endTime = startTime + timeLimitMs;

// //             const secureNow = getSecureNow();
// //             const remainingSeconds = Math.max(0, Math.floor((endTime - secureNow) / 1000));

// //             if (remainingSeconds === 0) {
// //                 return (
// //                     <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                         <AlertCircle size={14} /> Time Expired
// //                     </span>
// //                 );
// //             }

// //             const m = Math.floor(remainingSeconds / 60);
// //             const s = remainingSeconds % 60;
// //             const isLow = remainingSeconds < 300; // Under 5 mins

// //             return (
// //                 <span style={{
// //                     color: isLow ? '#ef4444' : '#2563eb',
// //                     fontWeight: isLow ? 'bold' : 'normal',
// //                     fontSize: '0.9rem',
// //                     display: 'flex', alignItems: 'center', gap: '4px'
// //                 }}>
// //                     <Timer size={14} />
// //                     {m}m {s.toString().padStart(2, '0')}s
// //                 </span>
// //             );
// //         }

// //         return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>;
// //     };

// //     if (!learner) {
// //         return <div className="mlab-state mlab-state--loading">Loading Portfolio Data…</div>;
// //     }

// //     const filteredSubmissions = submissions.filter(sub => {
// //         const currentTab = activeTab.toLowerCase();
// //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// //         if (currentTab === 'knowledge') {
// //             return subType === 'knowledge' || subType === '' || !sub.moduleType;
// //         }
// //         return subType === currentTab;
// //     });

// //     return (
// //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav="learners"
// //                 setCurrentNav={handleNavChange}
// //                 onLogout={handleLogout}
// //             />

// //             <main className="main-wrapper" style={{ width: '100%' }}>
// //                 <header className="dashboard-header">
// //                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
// //                         <ArrowLeft size={16} /> Back
// //                     </button>

// //                     <div className="mlab-portfolio-header">
// //                         <h1>Portfolio of Evidence</h1>
// //                         <p>QCTO / SETA Compliance Record</p>
// //                     </div>
// //                 </header>

// //                 <div className="admin-content">
// //                     <div className="mlab-profile-card">
// //                         <div className="mlab-profile-avatar"><User size={36} /></div>
// //                         <div className="mlab-profile-info">
// //                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
// //                             <div className="mlab-profile-info__meta">
// //                                 <span><strong>ID:</strong> {learner.idNumber}</span>
// //                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
// //                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
// //                             </div>
// //                         </div>
// //                         <div className="mlab-profile-status">
// //                             <span className="mlab-profile-status__label">Overall Status</span>
// //                             {learner.status === 'active'
// //                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
// //                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
// //                             }
// //                         </div>
// //                     </div>

// //                     <div className="mlab-tab-bar">
// //                         {TABS.map(tab => (
// //                             <button
// //                                 key={tab.id}
// //                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// //                                 onClick={() => setActiveTab(tab.id)}
// //                             >
// //                                 {tab.icon} {tab.label}
// //                             </button>
// //                         ))}
// //                     </div>

// //                     {activeTab !== 'compliance' && (
// //                         <div className="mlab-panel animate-fade-in">
// //                             {loadingSubmissions ? (
// //                                 <div className="mlab-state mlab-state--loading">Loading assignments…</div>
// //                             ) : filteredSubmissions.length === 0 ? (
// //                                 <div className="mlab-state">
// //                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// //                                     <span className="mlab-state__title">No {activeTab} assessments assigned.</span>
// //                                 </div>
// //                             ) : (
// //                                 <table className="mlab-table">
// //                                     <thead>
// //                                         <tr>
// //                                             <th>Assessment Title</th>
// //                                             <th>Type</th>
// //                                             <th>Time Limit</th> {/* 🚀 NEW COLUMN */}
// //                                             <th>Status</th>
// //                                             <th>Action</th>
// //                                         </tr>
// //                                     </thead>
// //                                     <tbody>
// //                                         {filteredSubmissions.map(sub => (
// //                                             <tr key={sub.id}>
// //                                                 <td>
// //                                                     <div className="mlab-cell-title">{sub.title}</div>
// //                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
// //                                                 </td>
// //                                                 <td><span className="mlab-cell-meta">{sub.type}</span></td>
// //                                                 <td>{renderTimeRemaining(sub)}</td> {/* 🚀 RENDER TIMER HERE */}
// //                                                 <td>{getStatusBadge(sub.status, sub.competency)}</td>
// //                                                 <td className="mlab-cell-action">
// //                                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={() => handleActionClick(sub)}>
// //                                                         {getActionContent(sub)}
// //                                                     </button>
// //                                                 </td>
// //                                             </tr>
// //                                         ))}
// //                                     </tbody>
// //                                 </table>
// //                             )}
// //                         </div>
// //                     )}

// //                     {activeTab === 'compliance' && (
// //                         <div className="mlab-compliance-panel animate-fade-in">
// //                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// //                             <h3>Compliance Documents</h3>
// //                             <p>Learner ID, CV, and Enrollment Contracts.</p>
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };

// // // // src/pages/Portfolio/ViewPortfolio.tsx
// // // // Styled to align with mLab Corporate Identity Brand Guide 2019
// // // // All visual styling lives in ViewPortfolio.css

// // // import React, { useEffect, useState } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     ArrowLeft, User, GraduationCap, Calendar,
// // //     FileText, CheckCircle, AlertCircle, Clock,
// // //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3
// // // } from 'lucide-react';
// // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // import { db } from '../../lib/firebase';
// // // import { useStore } from '../../store/useStore';
// // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // import './ViewPortfolio.css';

// // // interface LearnerSubmission {
// // //     id: string;
// // //     assessmentId: string;
// // //     learnerId: string;
// // //     title: string;
// // //     type: string;
// // //     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'appealed';
// // //     assignedAt: string;
// // //     marks: number;
// // //     totalMarks: number;
// // //     competency?: 'C' | 'NYC';
// // //     moduleNumber?: string;
// // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other'; // ✅ Make sure this is typed!
// // // }

// // // // ✅ Added the 'other' tab for practice tests
// // // const TABS = [
// // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
// // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
// // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
// // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
// // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// // // ] as const;

// // // type TabId = typeof TABS[number]['id'];

// // // export const ViewPortfolio: React.FC = () => {
// // //     const { id: learnerId } = useParams();
// // //     const navigate = useNavigate();

// // //     const { user, learners, fetchLearners } = useStore();
// // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

// // //     const learner = learners.find(l => l.id === learnerId);

// // //     useEffect(() => {
// // //         if (learners.length === 0) fetchLearners();

// // //         const fetchSubmissions = async () => {
// // //             if (!learnerId) return;
// // //             setLoadingSubmissions(true);
// // //             try {
// // //                 const q = query(
// // //                     collection(db, 'learner_submissions'),
// // //                     where('learnerId', '==', learnerId)
// // //                 );
// // //                 const snap = await getDocs(q);
// // //                 const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearnerSubmission));
// // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // //                 setSubmissions(subs);
// // //                 console.log("Fetched Submissions for this learner:", subs); // 🔍 Debugging log
// // //             } catch (err) {
// // //                 console.error('Error fetching submissions:', err);
// // //             } finally {
// // //                 setLoadingSubmissions(false);
// // //             }
// // //         };

// // //         fetchSubmissions();
// // //     }, [learnerId, learners.length, fetchLearners]);

// // //     if (!learner) {
// // //         return (
// // //             <div className="mlab-state mlab-state--loading">
// // //                 Loading Portfolio Data…
// // //             </div>
// // //         );
// // //     }

// // //     // ── Badge helper ──────────────────────────────────────────────────────────
// // //     const getStatusBadge = (status: string, competency?: string) => {
// // //         if (status === 'graded') {
// // //             return competency === 'C'
// // //                 ? <span className="mlab-badge mlab-badge--competent"><CheckCircle size={12} /> Competent</span>
// // //                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> Not Yet Competent</span>;
// // //         }
// // //         switch (status) {
// // //             case 'submitted': return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Under Review</span>;
// // //             case 'in_progress': return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
// // //             case 'not_started': return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
// // //             default: return <span className="mlab-badge mlab-badge--not-started">{status}</span>;
// // //         }
// // //     };

// // //     // ── Action helpers ────────────────────────────────────────────────────────
// // //     const handleActionClick = (sub: LearnerSubmission) => {
// // //         if (user?.role === 'learner') {
// // //             navigate(`/assessment-player/${sub.assessmentId}`);
// // //         } else if (user?.role === 'assessor') {
// // //             navigate(`/grading/${sub.id}`);
// // //         } else {
// // //             navigate(`/portfolio/submission/${sub.id}`);
// // //         }
// // //     };

// // //     const getActionContent = (sub: LearnerSubmission) => {
// // //         if (user?.role === 'learner') {
// // //             if (sub.status === 'not_started') return <><Play size={13} /> Start Assessment</>;
// // //             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
// // //             if (sub.status === 'graded') return <><Eye size={13} /> View Feedback</>;
// // //             return <><Eye size={13} /> View Submission</>;
// // //         }
// // //         if (user?.role === 'assessor') {
// // //             if (sub.status === 'submitted') return <><Edit3 size={13} /> Grade Now</>;
// // //             return <><Eye size={13} /> View</>;
// // //         }
// // //         return <><Eye size={13} /> View Record</>;
// // //     };

// // //     // ✅ THE MISSING FILTER LOGIC: Filter by Active Tab
// // //     // const filteredSubmissions = submissions.filter(sub => {
// // //     //     // If an assessment was published before we added the 'moduleType' dropdown, 
// // //     //     // default it to 'knowledge' so it doesn't disappear completely.
// // //     //     const type = sub.moduleType || 'knowledge';
// // //     //     return type === activeTab;
// // //     // });
// // //     // Inside ViewPortfolio.tsx, update this block:

// // //     const filteredSubmissions = submissions.filter(sub => {
// // //         // 1. Convert everything to lowercase to avoid "Knowledge" vs "knowledge" bugs
// // //         const currentTab = activeTab.toLowerCase();
// // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();

// // //         // 2. If we are on the Knowledge tab, show anything that is knowledge OR missing a type
// // //         if (currentTab === 'knowledge') {
// // //             return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // //         }

// // //         // 3. Otherwise, do a strict match
// // //         return subType === currentTab;
// // //     });

// // //     // ── Render ────────────────────────────────────────────────────────────────
// // //     return (
// // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// // //             <Sidebar
// // //                 currentNav="learners"
// // //                 setCurrentNav={() => navigate(-1)}
// // //                 onLogout={() => navigate('/login')}
// // //             />

// // //             <main className="main-wrapper" style={{ width: '100%' }}>
// // //                 <header className="dashboard-header">

// // //                     {/* Back */}
// // //                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
// // //                         <ArrowLeft size={16} /> Back
// // //                     </button>

// // //                     {/* Page title */}
// // //                     <div className="mlab-portfolio-header">
// // //                         <h1>Portfolio of Evidence</h1>
// // //                         <p>QCTO / SETA Compliance Record</p>
// // //                     </div>
// // //                 </header>

// // //                 <div className="admin-content">

// // //                     {/* ── Learner Profile Card ──────────────────────────── */}
// // //                     <div className="mlab-profile-card">
// // //                         <div className="mlab-profile-avatar">
// // //                             <User size={36} />
// // //                         </div>

// // //                         <div className="mlab-profile-info">
// // //                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
// // //                             <div className="mlab-profile-info__meta">
// // //                                 <span><strong>ID:</strong> {learner.idNumber}</span>
// // //                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
// // //                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
// // //                             </div>
// // //                         </div>

// // //                         <div className="mlab-profile-status">
// // //                             <span className="mlab-profile-status__label">Overall Status</span>
// // //                             {learner.status === 'active'
// // //                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
// // //                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
// // //                             }
// // //                         </div>
// // //                     </div>

// // //                     {/* ── Tab Bar ───────────────────────────────────────── */}
// // //                     <div className="mlab-tab-bar">
// // //                         {TABS.map(tab => (
// // //                             <button
// // //                                 key={tab.id}
// // //                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // //                                 onClick={() => setActiveTab(tab.id)}
// // //                             >
// // //                                 {tab.icon} {tab.label}
// // //                             </button>
// // //                         ))}
// // //                     </div>

// // //                     {/* ── Assessment Tab Content ────────────────────────── */}
// // //                     {activeTab !== 'compliance' && (
// // //                         <div className="mlab-panel">
// // //                             {loadingSubmissions ? (
// // //                                 <div className="mlab-state mlab-state--loading">
// // //                                     Loading assignments…
// // //                                 </div>
// // //                             ) : filteredSubmissions.length === 0 ? (  // ✅ Use filteredSubmissions here
// // //                                 <div className="mlab-state">
// // //                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // //                                     <span className="mlab-state__title">
// // //                                         {activeTab === 'other' ? 'No practice tests assigned.' : `No ${activeTab} assessments assigned.`}
// // //                                     </span>
// // //                                     <p className="mlab-state__desc">
// // //                                         Assessments published by the Facilitator will appear here.
// // //                                     </p>
// // //                                 </div>
// // //                             ) : (
// // //                                 <table className="mlab-table">
// // //                                     <thead>
// // //                                         <tr>
// // //                                             <th>Assessment Title</th>
// // //                                             <th>Type</th>
// // //                                             <th>Assigned Date</th>
// // //                                             <th>Status</th>
// // //                                             <th>Action</th>
// // //                                         </tr>
// // //                                     </thead>
// // //                                     <tbody>
// // //                                         {/* ✅ Use filteredSubmissions here too! */}
// // //                                         {filteredSubmissions.map(sub => (
// // //                                             <tr key={sub.id}>
// // //                                                 <td>
// // //                                                     <div className="mlab-cell-title">{sub.title}</div>
// // //                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <span className="mlab-cell-meta">{sub.type}</span>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <span className="mlab-cell-meta">
// // //                                                         {new Date(sub.assignedAt).toLocaleDateString()}
// // //                                                     </span>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {getStatusBadge(sub.status, sub.competency)}
// // //                                                 </td>
// // //                                                 <td className="mlab-cell-action">
// // //                                                     <button
// // //                                                         className="mlab-btn mlab-btn--outline-blue"
// // //                                                         onClick={() => handleActionClick(sub)}
// // //                                                     >
// // //                                                         {getActionContent(sub)}
// // //                                                     </button>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         ))}
// // //                                     </tbody>
// // //                                 </table>
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     {/* ── Compliance Tab Content ────────────────────────── */}
// // //                     {activeTab === 'compliance' && (
// // //                         <div className="mlab-compliance-panel">
// // //                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // //                             <h3 className="mlab-compliance-panel__title">Compliance Documents</h3>
// // //                             <p className="mlab-compliance-panel__desc">
// // //                                 This section will hold the Learner's Certified ID, CV, and Signed Enrollment Contracts.
// // //                             </p>
// // //                             <button className="mlab-btn mlab-btn--green">
// // //                                 Upload Document
// // //                             </button>
// // //                         </div>
// // //                     )}

// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };