import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Briefcase,
    CheckCircle,
    Clock,
    Search,
    LogOut,
    User,
    FileText,
    ChevronRight,
    Activity,
    Users
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import { auth } from '../../../lib/firebase';

export const MentorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();

    const {
        user,
        learners,
        assessments,
        submissions,
        enrollments,
        fetchLearners,
        fetchAssessments,
        fetchSubmissions,
        fetchEnrollments
    } = useStore();

    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

    useEffect(() => {
        const loadDashboardData = async () => {
            setLoading(true);
            try {
                await Promise.all([
                    fetchLearners(),
                    fetchAssessments(),
                    fetchSubmissions(),
                    fetchEnrollments()
                ]);
            } catch (error) {
                console.error("Mentor Dashboard Load Error:", error);
                toast.error("Failed to sync workplace data.");
            } finally {
                setLoading(false);
            }
        };

        if (user?.uid) {
            loadDashboardData();
        }
    }, [user?.uid, fetchLearners, fetchAssessments, fetchSubmissions, fetchEnrollments]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            toast.error("Failed to sign out.");
        }
    };

    // ─── MENTOR FILTERING LOGIC (DIRECT SUBMISSION CHECK) ───
    const mentorData = useMemo(() => {
        if (!user || !submissions || !assessments) return { pending: [], completed: [] };

        const pending: any[] = [];
        const completed: any[] = [];

        submissions.forEach(sub => {
            // STRICT CHECK: Does this submission specifically belong to THIS mentor?
            if (sub.mentorId !== user.uid) return;

            // Must be a workplace module
            if (sub.moduleType !== 'workplace' && sub.moduleType !== 'qcto_workplace') return;

            const assInfo = assessments.find(a => a.id === sub.assessmentId);
            const learnerInfo = learners.find(l => l.learnerId === sub.learnerId || l.id === sub.learnerId);

            // Skip if somehow the assessment or learner data is completely missing
            if (!assInfo || !learnerInfo) return;

            const subExtended = { ...sub, assessment: assInfo, learner: learnerInfo };
            const status = String(sub.status || '').toLowerCase();

            // Routing based on submission status
            if (['submitted', 'in_progress'].includes(status)) {
                pending.push(subExtended);
            }
            else if (['awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated'].includes(status)) {
                completed.push(subExtended);
            }
        });

        return {
            pending: pending.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()),
            completed: completed.sort((a, b) => new Date(b.grading?.facilitatorReviewedAt || 0).getTime() - new Date(a.grading?.facilitatorReviewedAt || 0).getTime())
        };
    }, [user, submissions, assessments, learners]);

    // Apply Search Filter
    const filteredList = mentorData[activeTab].filter(item => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            item.learner?.fullName?.toLowerCase().includes(term) ||
            item.assessment?.title?.toLowerCase().includes(term) ||
            item.assessment?.moduleInfo?.moduleNumber?.toLowerCase().includes(term)
        );
    });

    // Calculate total unique learners assigned to this mentor using enrollments data
    const totalAssignedLearners = useMemo(() => {
        const uniqueLearners = new Set(
            (enrollments || [])
                .filter(e => e.mentorId === user?.uid)
                .map(e => e.learnerId)
        );
        return uniqueLearners.size;
    }, [enrollments, user?.uid]);

    if (loading) {
        return (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div className="ap-spinner" style={{ borderTopColor: 'var(--mlab-blue)' }} />
                <p style={{ marginTop: '1.5rem', color: '#64748b', fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Loading Workplace Data...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ── HEADER ── */}
            <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '8px' }}>
                            <Briefcase size={24} color="var(--mlab-blue)" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#0f172a' }}>Workplace Mentor</h1>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{user?.companyName || 'Verified Host Company'}</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ textAlign: 'right', display: 'none', '@media (min-width: 640px)': { display: 'block' } } as any}>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{user?.fullName}</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>Workplace Verifier</p>
                        </div>
                        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff1f2', color: '#e11d48', border: '1px solid #ffe4e6', padding: '8px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}>
                            <LogOut size={14} /> Exit
                        </button>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 1.5rem' }}>

                {/* ── STATS ROW ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ background: '#fff7ed', padding: '12px', borderRadius: '10px', color: '#f97316' }}><Clock size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Sign-off</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{mentorData.pending.length}</h3>
                        </div>
                    </div>
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', color: '#22c55e' }}><CheckCircle size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Total</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{mentorData.completed.length}</h3>
                        </div>
                    </div>
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', color: '#475569' }}><Users size={24} /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Learners</p>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{totalAssignedLearners}</h3>
                        </div>
                    </div>
                </div>

                {/* ── LOGBOOK TABLE ── */}
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>

                    {/* Toolbar */}
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '8px', gap: '4px' }}>
                            <button
                                onClick={() => setActiveTab('pending')}
                                style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: activeTab === 'pending' ? 'white' : 'transparent', color: activeTab === 'pending' ? '#0f172a' : '#64748b', boxShadow: activeTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                            >
                                Needs Review ({mentorData.pending.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('completed')}
                                style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: activeTab === 'completed' ? 'white' : 'transparent', color: activeTab === 'completed' ? '#0f172a' : '#64748b', boxShadow: activeTab === 'completed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                            >
                                History ({mentorData.completed.length})
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', width: '320px' }}>
                            <Search size={16} color="#94a3b8" />
                            <input
                                type="text"
                                placeholder="Filter by learner or module..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ border: 'none', background: 'transparent', padding: '10px', width: '100%', outline: 'none', fontSize: '0.85rem', color: '#334155' }}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        {filteredList.length === 0 ? (
                            <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
                                <div style={{ width: '56px', height: '56px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                    <Activity size={28} color="#cbd5e1" />
                                </div>
                                <h3 style={{ margin: '0 0 4px 0', color: '#334155', fontSize: '1rem', fontWeight: 700 }}>No results found</h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                                    {activeTab === 'pending' ? 'There are currently no workplace logbooks awaiting your sign-off.' : 'You have not verified any logbooks yet.'}
                                </p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Learner Details</th>
                                        <th style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Workplace Module</th>
                                        <th style={{ padding: '1rem 1.5rem', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Verification Status</th>
                                        <th style={{ padding: '1rem 1.5rem' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredList.map((sub: any) => (
                                        <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                                                        {sub.learner?.fullName?.charAt(0) || 'L'}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{sub.learner?.fullName || 'Unknown Learner'}</div>
                                                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>ID: {sub.learner?.idNumber || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{sub.assessment?.title}</div>
                                                <div style={{ color: 'var(--mlab-blue)', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <FileText size={12} /> {sub.assessment?.moduleInfo?.moduleNumber || 'Workplace'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                {activeTab === 'pending' ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#d97706', background: '#fff7ed', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, width: 'fit-content' }}>
                                                            <Clock size={12} /> Awaiting Sign-off
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Submitted: {new Date(sub.submittedAt || sub.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#16a34a', background: '#f0fdf4', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, width: 'fit-content' }}>
                                                            <CheckCircle size={12} /> Verified & Signed
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Signed: {new Date(sub.grading?.facilitatorReviewedAt || sub.updatedAt).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => navigate(`/portfolio/submission/${sub.id}`)}
                                                    style={{ background: activeTab === 'pending' ? 'var(--mlab-blue)' : '#f8fafc', color: activeTab === 'pending' ? 'white' : '#475569', border: activeTab === 'pending' ? 'none' : '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', transition: 'all 0.2s' }}
                                                >
                                                    {activeTab === 'pending' ? 'Verify Logbook' : 'View Record'} <ChevronRight size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

            </main>
        </div>
    );
};
