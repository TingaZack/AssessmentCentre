// src/pages/AdminDashboard/AdminInterviewStudioView/AdminInterviewStudioView.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
    Search, ThumbsUp, ThumbsDown, Eye, X, Loader2, MessageSquare, Video,
    Calendar, UserCheck, ShieldAlert, Award, Layers, Flame, Zap, Sprout,
    Lock, Filter, ChevronRight, ChevronDown, AlertTriangle, ArrowUpDown,
    ChevronLeft, Users, TrendingUp
} from 'lucide-react';
import { useToast } from '../../../components/common/Toast/Toast';
import moment from 'moment';

import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../../../components/views/LearnerDirectoryView/LearnerDirectoryView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

const AUDIT_ITEMS_PER_PAGE = 25;

export const AdminInterviewStudioView: React.FC = () => {
    const toast = useToast();
    const [activeSubTab, setActiveTab] = useState<'progression' | 'audit'>('progression');
    const [interviews, setInterviews] = useState<any[]>([]);
    const [learners, setLearners] = useState<any[]>([]);
    const [cohorts, setCohorts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters & Pagination States
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCohortFilter, setSelectedCohortFilter] = useState('all');
    const [selectedTierFilter, setSelectedTierFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'name' | 'score' | 'tier'>('score');
    const [auditPage, setAuditPage] = useState(1);

    // Accordion State for Cohorts (Collapsible blocks)
    const [expandedCohorts, setExpandedCohorts] = useState<Record<string, boolean>>({});

    const [selectedInterview, setSelectedInterview] = useState<any | null>(null);
    const [adminNotes, setAdminNotes] = useState('');

    // Fetch once on mount to prevent toast reference triggers resetting expanded cohorts
    useEffect(() => {
        let isMounted = true;

        const fetchStudioData = async () => {
            try {
                const [intSnap, learnerSnap, cohortSnap] = await Promise.all([
                    getDocs(query(collection(db, 'ai_interviews'), orderBy('completedAt', 'desc'))),
                    getDocs(collection(db, 'learners')),
                    getDocs(collection(db, 'cohorts'))
                ]);

                if (!isMounted) return;

                setInterviews(intSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLearners(learnerSnap.docs.map(d => ({ id: d.id, ...d.data() })));

                const cohortList = cohortSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setCohorts(cohortList);

                // Expand first cohort by default on initial load
                if (cohortList.length > 0) {
                    setExpandedCohorts({ [cohortList[0].name || 'Unassigned Cohort']: true });
                }
            } catch (err) {
                console.error("Failed to fetch studio data:", err);
                toast.error("Could not load AI interview matrix.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchStudioData();

        return () => {
            isMounted = false;
        };
    }, []); // Empty dependency array prevents re-fetching on toast or state changes

    const handleSessionRating = async (interviewId: string, rating: 'up' | 'down') => {
        try {
            const ref = doc(db, 'ai_interviews', interviewId);
            await updateDoc(ref, {
                'adminFeedback.rating': rating,
                'adminFeedback.notes': adminNotes,
                'adminFeedback.updatedAt': new Date().toISOString()
            });

            setInterviews(prev => prev.map(item => item.id === interviewId ? {
                ...item,
                adminFeedback: { ...(item.adminFeedback || {}), rating, notes: adminNotes }
            } : item));

            if (selectedInterview?.id === interviewId) {
                setSelectedInterview((prev: any) => ({
                    ...prev,
                    adminFeedback: { ...(prev?.adminFeedback || {}), rating, notes: adminNotes }
                }));
            }

            toast.success(`Session Rated: Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
        } catch (err: any) {
            toast.error("Failed to save feedback: " + err.message);
        }
    };

    const handleTurnRating = async (interviewId: string, turnIndex: number, rating: 'up' | 'down') => {
        try {
            const updatedTranscript = [...(selectedInterview.transcript || [])];
            updatedTranscript[turnIndex] = {
                ...updatedTranscript[turnIndex],
                adminRating: rating
            };

            const ref = doc(db, 'ai_interviews', interviewId);
            await updateDoc(ref, { transcript: updatedTranscript });

            setSelectedInterview((prev: any) => ({ ...prev, transcript: updatedTranscript }));
            setInterviews(prev => prev.map(item => item.id === interviewId ? { ...item, transcript: updatedTranscript } : item));

            toast.success(`Turn #${turnIndex + 1} rated Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
        } catch (err: any) {
            toast.error("Failed to rate turn: " + err.message);
        }
    };

    const toggleCohortExpand = (cohortName: string) => {
        setExpandedCohorts(prev => ({ ...prev, [cohortName]: !prev[cohortName] }));
    };

    // 🚀 FIXED: Correct variable scope in loop
    const toggleAllCohorts = (expand: boolean) => {
        const nextState: Record<string, boolean> = {};
        groupedCohortMatrix.forEach(g => { nextState[g.cohortName] = expand; });
        setExpandedCohorts(nextState);
    };

    // ── EXECUTIVE KPI METRICS ──────────────────
    const studioMetrics = useMemo(() => {
        let t1Count = 0, t2Count = 0, t3Count = 0;
        let totalScoreSum = 0, ratedSessionsCount = 0;

        learners.forEach(l => {
            const p = l.interviewProgress || {};
            if (p.unlockedTier === 'hard') t3Count++;
            else if (p.unlockedTier === 'mid') t2Count++;
            else t1Count++;
        });

        interviews.forEach(i => {
            if (i.scorecard?.overallScore) {
                totalScoreSum += Number(i.scorecard.overallScore);
                ratedSessionsCount++;
            }
        });

        return {
            totalLearners: learners.length,
            t1Count, t2Count, t3Count,
            totalInterviews: interviews.length,
            avgScore: ratedSessionsCount > 0 ? Math.round(totalScoreSum / ratedSessionsCount) : 0
        };
    }, [learners, interviews]);

    // ── COHORT GROUPING & PROGRESSION MATRIX ──────────────────
    const groupedCohortMatrix = useMemo(() => {
        const cohortMap = new Map<string, { cohortName: string; learners: any[] }>();

        cohorts.forEach(c => {
            cohortMap.set(c.id, { cohortName: c.name || 'Unassigned Cohort', learners: [] });
        });
        cohortMap.set('unassigned', { cohortName: 'Unassigned / Independent', learners: [] });

        learners.forEach(l => {
            if (!l.fullName) return;

            const progress = l.interviewProgress || {};
            const learnerCohortId = l.cohortId && cohortMap.has(l.cohortId) ? l.cohortId : 'unassigned';

            const learnerSessions = interviews.filter(i => i.learnerId === l.id || i.learnerName === l.fullName);
            const latestSession = learnerSessions[0];

            const item = {
                id: l.id,
                fullName: l.fullName,
                idNumber: l.idNumber,
                email: l.email,
                cohortId: learnerCohortId,
                currentTier: progress.currentTier || 'simple',
                unlockedTier: progress.unlockedTier || 'simple',
                t1Score: progress.tier1HighScore || 0,
                t2Score: progress.tier2HighScore || 0,
                t3Score: progress.tier3HighScore || 0,
                readinessStatus: l.readinessStatus || progress.readinessStatus || 'NOT_READY',
                unresolvedGaps: progress.unresolvedGaps || [],
                totalSessions: learnerSessions.length,
                lastSession: latestSession
            };

            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                if (!item.fullName.toLowerCase().includes(s) && !item.email?.toLowerCase().includes(s)) return;
            }

            if (selectedTierFilter !== 'all' && item.unlockedTier !== selectedTierFilter) return;

            cohortMap.get(learnerCohortId)?.learners.push(item);
        });

        const result = Array.from(cohortMap.values())
            .filter(group => group.learners.length > 0)
            .filter(group => selectedCohortFilter === 'all' || group.cohortName === selectedCohortFilter);

        result.forEach(group => {
            group.learners.sort((a, b) => {
                if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
                if (sortBy === 'score') return (b.t1Score + b.t2Score + b.t3Score) - (a.t1Score + a.t2Score + a.t3Score);
                const tierRank = { simple: 1, mid: 2, hard: 3 };
                return (tierRank[b.unlockedTier as keyof typeof tierRank] || 1) - (tierRank[a.unlockedTier as keyof typeof tierRank] || 1);
            });
        });

        return result;
    }, [learners, cohorts, interviews, searchTerm, selectedCohortFilter, selectedTierFilter, sortBy]);

    // ── AUDIT TAB PAGINATION ──────────────────
    const filteredAudits = useMemo(() => {
        return interviews.filter(item =>
            item.learnerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.targetRole?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [interviews, searchTerm]);

    const totalAuditPages = Math.ceil(filteredAudits.length / AUDIT_ITEMS_PER_PAGE);
    const paginatedAudits = useMemo(() => {
        const start = (auditPage - 1) * AUDIT_ITEMS_PER_PAGE;
        return filteredAudits.slice(start, start + AUDIT_ITEMS_PER_PAGE);
    }, [filteredAudits, auditPage]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh', flexDirection: 'column', gap: '1rem' }}>
                <Loader2 className="lfm-spin" size={40} color="var(--mlab-blue)" />
                <span style={{ color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loading AI Interview Matrix...</span>
            </div>
        );
    }

    return (
        <div className="wm-root animate-fade-in mlab-learners">
            <style>{`
                .mlab-learners .wm-search__input,
                .mlab-learners .wm-btn,
                .mlab-learners .mlab-btn,
                .mlab-learners .mlab-table-wrap,
                .mlab-learners .mlab-badge {
                    border-radius: 0 !important;
                }
                .wm-btn, .mlab-btn { 
                    text-transform: uppercase; 
                    font-family: var(--font-heading); 
                    font-size: 0.75rem; 
                    font-weight: 700; 
                    letter-spacing: 0.05em; 
                }
                .ais-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }
                .ais-kpi-card {
                    background: var(--mlab-white);
                    border: 1px solid var(--mlab-border);
                    border-top: 3px solid var(--mlab-blue);
                    padding: 1rem 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .ais-accordion-header {
                    padding: 0.85rem 1.25rem;
                    background: var(--mlab-blue);
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                    transition: background 0.15s ease;
                }
                .ais-accordion-header:hover {
                    background: var(--mlab-blue-dark);
                }
                .ais-sticky-table-body {
                    max-height: 520px;
                    overflow-y: auto;
                }
            `}</style>

            {/* PAGE HEADER */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Video size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">AI Interview Studio & Employability Matrix</h1>
                        <p className="wm-page-header__desc">
                            Track learner tier progression, inspect session transcripts, and audit AI evaluation metrics.
                        </p>
                    </div>
                </div>
            </div>

            {/* EXECUTIVE KPI SUMMARY ROW */}
            <div className="ais-kpi-grid">
                <div className="ais-kpi-card">
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                        <Users size={12} style={{ display: 'inline', marginRight: 4 }} /> Evaluated Learners
                    </span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>{studioMetrics.totalLearners}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>Across {cohorts.length} Cohorts</span>
                </div>

                <div className="ais-kpi-card" style={{ borderTopColor: '#16a34a' }}>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                        <Sprout size={12} style={{ display: 'inline', marginRight: 4, color: '#16a34a' }} /> Tier 1 • Novice
                    </span>
                    <strong style={{ fontSize: '1.4rem', color: '#16a34a', fontFamily: 'var(--font-heading)' }}>{studioMetrics.t1Count}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#15803d' }}>Fundamentals Active</span>
                </div>

                <div className="ais-kpi-card" style={{ borderTopColor: '#0284c7' }}>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                        <Zap size={12} style={{ display: 'inline', marginRight: 4, color: '#0284c7' }} /> Tier 2 • Mid Practitioner
                    </span>
                    <strong style={{ fontSize: '1.4rem', color: '#0284c7', fontFamily: 'var(--font-heading)' }}>{studioMetrics.t2Count}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#0369a1' }}>Unlocked via 90%+ T1</span>
                </div>

                <div className="ais-kpi-card" style={{ borderTopColor: '#dc2626' }}>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                        <Flame size={12} style={{ display: 'inline', marginRight: 4, color: '#dc2626' }} /> Tier 3 • Master Gate
                    </span>
                    <strong style={{ fontSize: '1.4rem', color: '#dc2626', fontFamily: 'var(--font-heading)' }}>{studioMetrics.t3Count}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#b91c1c' }}>Industry-Ready Candidates</span>
                </div>

                <div className="ais-kpi-card" style={{ borderTopColor: 'var(--mlab-green)' }}>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                        <TrendingUp size={12} style={{ display: 'inline', marginRight: 4 }} /> Platform Avg Readiness
                    </span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>{studioMetrics.avgScore}%</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>From {studioMetrics.totalInterviews} Total Runs</span>
                </div>
            </div>

            {/* TAB SWITCHER */}
            <div className="lfm-tabs" style={{ marginTop: '1.5rem' }}>
                <button
                    type="button"
                    className={`lfm-tab ${activeSubTab === 'progression' ? 'active' : ''}`}
                    onClick={() => setActiveTab('progression')}
                >
                    <Layers size={13} /> Cohort Progression Matrix
                </button>
                <button
                    type="button"
                    className={`lfm-tab ${activeSubTab === 'audit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audit')}
                >
                    <Video size={13} /> Session Turn Audit Logs ({interviews.length})
                </button>
            </div>

            {/* TAB 1: COHORT PROGRESSION MATRIX */}
            {activeSubTab === 'progression' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                    {/* TOOLBAR FILTERS */}
                    <div className="wm-toolbar" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="wm-search" style={{ flex: '1 1 220px' }}>
                            <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                            <input
                                type="text"
                                className="wm-search__input"
                                placeholder="Search candidate by name or email…"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>}
                        </div>

                        {/* COHORT FILTER */}
                        <div className="wm-search" style={{ flex: 'none', minWidth: '180px' }}>
                            <Filter size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                            <select
                                className="wm-search__input"
                                value={selectedCohortFilter}
                                onChange={e => setSelectedCohortFilter(e.target.value)}
                            >
                                <option value="all">All Classes / Cohorts</option>
                                {cohorts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>

                        {/* TIER FILTER */}
                        <div className="wm-search" style={{ flex: 'none', minWidth: '160px' }}>
                            <Filter size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                            <select
                                className="wm-search__input"
                                value={selectedTierFilter}
                                onChange={e => setSelectedTierFilter(e.target.value)}
                            >
                                <option value="all">All Unlocked Tiers</option>
                                <option value="simple">Tier 1 • Novice</option>
                                <option value="mid">Tier 2 • Mid</option>
                                <option value="hard">Tier 3 • Hard</option>
                            </select>
                        </div>

                        {/* SORT BY */}
                        <div className="wm-search" style={{ flex: 'none', minWidth: '160px' }}>
                            <ArrowUpDown size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                            <select
                                className="wm-search__input"
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as any)}
                            >
                                <option value="score">Sort by High Score</option>
                                <option value="tier">Sort by Unlocked Tier</option>
                                <option value="name">Sort by Name</option>
                            </select>
                        </div>

                        {/* ACCORDION QUICK TOGGLES */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                            <button className="mlab-btn mlab-btn--ghost" onClick={() => toggleAllCohorts(true)} style={{ padding: '6px 10px', fontSize: '0.7rem' }}>Expand All</button>
                            <button className="mlab-btn mlab-btn--ghost" onClick={() => toggleAllCohorts(false)} style={{ padding: '6px 10px', fontSize: '0.7rem' }}>Collapse All</button>
                        </div>
                    </div>

                    {/* COLLAPSIBLE ACCORDION COHORT GROUPS */}
                    {groupedCohortMatrix.map(group => {
                        const isExpanded = Boolean(expandedCohorts[group.cohortName]);
                        const t2MasteredCount = group.learners.filter(l => l.unlockedTier === 'mid' || l.unlockedTier === 'hard').length;
                        const t3MasteredCount = group.learners.filter(l => l.unlockedTier === 'hard').length;

                        return (
                            <div key={group.cohortName} className="mlab-table-wrap" style={{ borderRadius: 0, overflow: 'hidden' }}>
                                {/* ACCORDION HEADER */}
                                <div
                                    className="ais-accordion-header"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        toggleCohortExpand(group.cohortName);
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {isExpanded ? <ChevronDown size={18} color="var(--mlab-green)" /> : <ChevronRight size={18} color="var(--mlab-green)" />}
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.92rem', letterSpacing: '0.05em' }}>
                                            {group.cohortName} ({group.learners.length} Candidates)
                                        </h3>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                        <span style={{ color: 'var(--mlab-green)' }}>⚡ {t2MasteredCount} Tier 2 Mid</span>
                                        <span style={{ color: '#f87171' }}>🔥 {t3MasteredCount} Tier 3 Master</span>
                                    </div>
                                </div>

                                {/* COLLAPSIBLE CONTENT TABLE BODY */}
                                {isExpanded && (
                                    <div className="ais-sticky-table-body">
                                        <table className="mlab-table" style={{ margin: 0 }}>
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                                                <tr>
                                                    <th>Learner Candidate</th>
                                                    <th>Tier 1 (Simple)</th>
                                                    <th>Tier 2 (Mid)</th>
                                                    <th>Tier 3 (Hard)</th>
                                                    <th>Progression State</th>
                                                    <th>Unresolved Priority Gaps</th>
                                                    <th style={{ textAlign: 'right' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.learners.map(l => {
                                                    const isT2Unlocked = l.unlockedTier === 'mid' || l.unlockedTier === 'hard';
                                                    const isT3Unlocked = l.unlockedTier === 'hard';

                                                    return (
                                                        <tr key={l.id}>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                        {l.fullName}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.email || l.idNumber}</span>
                                                                </div>
                                                            </td>

                                                            {/* TIER 1 */}
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <Sprout size={14} color="#16a34a" />
                                                                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: l.t1Score >= 90 ? '#16a34a' : 'var(--mlab-midnight)' }}>
                                                                        {l.t1Score}%
                                                                    </strong>
                                                                    {l.t1Score >= 90 && <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 800 }}>🏆 MASTERED</span>}
                                                                </div>
                                                            </td>

                                                            {/* TIER 2 */}
                                                            <td>
                                                                {isT2Unlocked ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <Zap size={14} color="#0284c7" />
                                                                        <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: l.t2Score >= 90 ? '#0284c7' : 'var(--mlab-midnight)' }}>
                                                                            {l.t2Score}%
                                                                        </strong>
                                                                        {l.t2Score >= 90 && <span style={{ fontSize: '0.65rem', color: '#0284c7', fontWeight: 800 }}>🏆 MASTERED</span>}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <Lock size={12} /> Locked (Req: 90% T1)
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* TIER 3 */}
                                                            <td>
                                                                {isT3Unlocked ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <Flame size={14} color="#dc2626" />
                                                                        <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: l.t3Score >= 90 ? '#dc2626' : 'var(--mlab-midnight)' }}>
                                                                            {l.t3Score}%
                                                                        </strong>
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <Lock size={12} /> Locked (Req: 90% T2)
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* PROGRESSION STATE BADGE */}
                                                            <td>
                                                                {isT3Unlocked ? (
                                                                    <span style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                                        🔥 Tier 3 Master Active
                                                                    </span>
                                                                ) : isT2Unlocked ? (
                                                                    <span style={{ padding: '4px 8px', background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                                        ⚡ Tier 2 Mid Unlocked
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ padding: '4px 8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                                        🌱 Tier 1 Novice (Needs 90%+)
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* UNRESOLVED GAPS */}
                                                            <td>
                                                                {l.unresolvedGaps.length > 0 ? (
                                                                    <span style={{ fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <AlertTriangle size={12} /> {l.unresolvedGaps.slice(0, 2).join(', ')}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>No critical gaps logged</span>
                                                                )}
                                                            </td>

                                                            {/* ACTION */}
                                                            <td style={{ textAlign: 'right' }}>
                                                                {l.lastSession ? (
                                                                    <button
                                                                        className="mlab-btn mlab-btn--ghost"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedInterview(l.lastSession);
                                                                        }}
                                                                        style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                                                    >
                                                                        <Eye size={12} /> Inspect Last
                                                                    </button>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>No Runs</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* TAB 2: AUDIT LOG TABLE */}
            {activeSubTab === 'audit' && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="wm-toolbar" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="wm-search" style={{ flex: '1 1 250px' }}>
                            <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
                            <input
                                type="text"
                                className="wm-search__input"
                                placeholder="Search candidate or role..."
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setAuditPage(1); }}
                            />
                            {searchTerm && <button className="wm-search__clear" onClick={() => setSearchTerm('')}><X size={13} /></button>}
                        </div>

                        <div className="wm-toolbar__count" style={{ marginLeft: 'auto' }}>
                            Showing {paginatedAudits.length} of {filteredAudits.length} sessions
                        </div>
                    </div>

                    <div className="mlab-table-wrap">
                        <div className="ais-sticky-table-body">
                            <table className="mlab-table" style={{ margin: 0 }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                                    <tr>
                                        <th>Date & Time</th>
                                        <th>Candidate</th>
                                        <th>Target Role</th>
                                        <th>Difficulty</th>
                                        <th>Score & Readiness</th>
                                        <th>Session Audit</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedAudits.length > 0 ? (
                                        paginatedAudits.map(item => {
                                            const sc = item.scorecard || {};
                                            const score = sc.overallScore ?? '—';
                                            const status = sc.readinessStatus || 'NOT_EVALUATED';
                                            const rating = item.adminFeedback?.rating;

                                            return (
                                                <tr key={item.id}>
                                                    <td>{moment(item.completedAt).format('D MMM YYYY, HH:mm')}</td>
                                                    <td><strong>{item.learnerName}</strong></td>
                                                    <td>{item.targetRole}</td>
                                                    <td style={{ textTransform: 'uppercase', fontWeight: 700 }}>{item.difficulty}</td>
                                                    <td><strong>{score}%</strong> ({status})</td>
                                                    <td>
                                                        {rating === 'up' && <span style={{ color: '#16a34a', fontWeight: 700 }}>👍 Approved</span>}
                                                        {rating === 'down' && <span style={{ color: '#dc2626', fontWeight: 700 }}>👎 Flagged</span>}
                                                        {!rating && <span style={{ color: '#94a3b8' }}>Unreviewed</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button className="mlab-btn mlab-btn--ghost" onClick={() => setSelectedInterview(item)} style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
                                                            <Eye size={12} /> Audit Turns
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>No matching interview logs found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* PAGINATION CONTROLS */}
                    {totalAuditPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--mlab-border)', background: 'var(--mlab-white)' }}>
                            <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1}>
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, padding: '0 10px' }}>
                                Page {auditPage} of {totalAuditPages} (Total: {filteredAudits.length})
                            </span>
                            <button className="mlab-btn mlab-btn--ghost" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setAuditPage(p => Math.min(totalAuditPages, p + 1))} disabled={auditPage === totalAuditPages}>
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* AUDIT MODAL */}
            {selectedInterview && (
                <div className="lfm-overlay" onClick={() => setSelectedInterview(null)}>
                    <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>

                        {/* HEADER */}
                        <div className="lfm-header">
                            <h2 className="lfm-header__title">
                                <Video size={16} /> Turn-by-Turn AI Audit • {selectedInterview.targetRole}
                            </h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setSelectedInterview(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* BODY */}
                        <div className="lfm-body">
                            <div style={{ fontSize: '0.82rem', color: 'var(--mlab-grey)', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
                                Candidate: <strong style={{ color: 'var(--mlab-blue)' }}>{selectedInterview.learnerName}</strong> • {moment(selectedInterview.completedAt).format('D MMM YYYY, HH:mm')}
                            </div>

                            {/* SECTION 1: OVERALL SESSION RATING */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <ThumbsUp size={13} /> 1. Overall Session Audit Rating
                                </div>
                                <div className="lfm-flags-panel" style={{ gap: '0.85rem' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleSessionRating(selectedInterview.id, 'up')}
                                            className="lfm-btn"
                                            style={{
                                                background: selectedInterview.adminFeedback?.rating === 'up' ? '#16a34a' : 'white',
                                                color: selectedInterview.adminFeedback?.rating === 'up' ? 'white' : '#16a34a',
                                                border: '1px solid #16a34a',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <ThumbsUp size={14} /> Approve Session
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSessionRating(selectedInterview.id, 'down')}
                                            className="lfm-btn"
                                            style={{
                                                background: selectedInterview.adminFeedback?.rating === 'down' ? '#dc2626' : 'white',
                                                color: selectedInterview.adminFeedback?.rating === 'down' ? 'white' : '#dc2626',
                                                border: '1px solid #dc2626',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <ThumbsDown size={14} /> Flag Session Issues
                                        </button>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Audit Notes</label>
                                        <input
                                            type="text"
                                            className="lfm-input"
                                            placeholder="Audit notes (e.g., 'Solid pacing, but React state question was too lenient')..."
                                            value={adminNotes}
                                            onChange={e => setAdminNotes(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: GRANULAR TURN-BY-TURN REVIEW */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <MessageSquare size={13} /> 2. Granular Turn-by-Turn Review
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)', margin: '-0.25rem 0 0.75rem 0' }}>
                                    Rate individual AI turns. Approved AI questions enter the Global Gold Standard Library.
                                </p>

                                <div style={{ background: 'var(--mlab-blue)', padding: '1.25rem', maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--mlab-border)' }}>
                                    {selectedInterview.transcript?.map((t: any, idx: number) => {
                                        const isAi = t.speaker === 'interviewer';

                                        return (
                                            <div key={idx} style={{ alignSelf: isAi ? 'flex-start' : 'flex-end', maxWidth: '85%', width: '100%' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Turn #{idx + 1} • {isAi ? 'AI Interviewer' : selectedInterview.learnerName}
                                                    </span>
                                                    {isAi && (
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTurnRating(selectedInterview.id, idx, 'up')}
                                                                style={{ background: t.adminRating === 'up' ? '#16a34a' : 'transparent', color: t.adminRating === 'up' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                                                                title="Approve AI Turn (Gold Standard)"
                                                            >
                                                                <ThumbsUp size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTurnRating(selectedInterview.id, idx, 'down')}
                                                                style={{ background: t.adminRating === 'down' ? '#dc2626' : 'transparent', color: t.adminRating === 'down' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                                                                title="Flag AI Turn (Bad Question / Loop)"
                                                            >
                                                                <ThumbsDown size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{
                                                    padding: '10px 14px',
                                                    background: isAi ? '#334155' : 'var(--mlab-green)',
                                                    color: isAi ? 'white' : 'var(--mlab-blue)',
                                                    fontWeight: isAi ? 400 : 700,
                                                    fontSize: '0.82rem',
                                                    lineHeight: 1.5,
                                                    borderLeft: t.adminRating === 'up' ? '4px solid #16a34a' : t.adminRating === 'down' ? '4px solid #dc2626' : 'none'
                                                }}>
                                                    {t.text}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SECTION 3: SCORECARD SUMMARY */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <Award size={13} /> 3. AI Generated Scorecard Summary
                                </div>
                                <div className="lfm-demographics-panel" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--mlab-midnight)' }}>
                                    <p style={{ margin: '0 0 6px 0' }}><strong>Overall Score:</strong> {selectedInterview.scorecard?.overallScore}% ({selectedInterview.scorecard?.readinessStatus})</p>
                                    <p style={{ margin: '0 0 6px 0' }}><strong>Technical Score:</strong> {selectedInterview.scorecard?.technicalScore}% | <strong>Communication:</strong> {selectedInterview.scorecard?.communicationScore}%</p>
                                    <p style={{ margin: '0 0 6px 0' }}><strong>Summary:</strong> {selectedInterview.scorecard?.readinessSummary}</p>
                                    <p style={{ margin: 0 }}><strong>Priority Gaps:</strong> {selectedInterview.scorecard?.priorityGaps?.join(', ') || 'None'}</p>
                                </div>
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setSelectedInterview(null)}>
                                Close Audit
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};




// // src/pages/AdminDashboard/AdminInterviewStudioView/AdminInterviewStudioView.tsx

// import React, { useEffect, useState } from 'react';
// import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { Search, ThumbsUp, ThumbsDown, Eye, X, Loader2, MessageSquare, Video, Calendar, UserCheck, ShieldAlert, Award } from 'lucide-react';
// import { useToast } from '../../../components/common/Toast/Toast';
// import moment from 'moment';

// import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// import '../../../components/views/LearnersView/LearnersView.css';
// import '../../../components/views/LearnerDirectoryView/LearnerDirectoryView.css';
// import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// export const AdminInterviewStudioView: React.FC = () => {
//     const toast = useToast();
//     const [interviews, setInterviews] = useState<any[]>([]);
//     const [loading, setLoading] = useState(true);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [selectedInterview, setSelectedInterview] = useState<any | null>(null);
//     const [adminNotes, setAdminNotes] = useState('');

//     useEffect(() => {
//         const fetchInterviews = async () => {
//             try {
//                 const q = query(collection(db, 'ai_interviews'), orderBy('completedAt', 'desc'));
//                 const snap = await getDocs(q);
//                 const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//                 setInterviews(list);
//             } catch (err) {
//                 console.error("Failed to fetch interviews:", err);
//                 toast.error("Could not load AI interview logs.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchInterviews();
//     }, [toast]);

//     const handleSessionRating = async (interviewId: string, rating: 'up' | 'down') => {
//         try {
//             const ref = doc(db, 'ai_interviews', interviewId);
//             await updateDoc(ref, {
//                 'adminFeedback.rating': rating,
//                 'adminFeedback.notes': adminNotes,
//                 'adminFeedback.updatedAt': new Date().toISOString()
//             });

//             setInterviews(prev => prev.map(item => item.id === interviewId ? {
//                 ...item,
//                 adminFeedback: { ...(item.adminFeedback || {}), rating, notes: adminNotes }
//             } : item));

//             if (selectedInterview?.id === interviewId) {
//                 setSelectedInterview((prev: any) => ({
//                     ...prev,
//                     adminFeedback: { ...(prev?.adminFeedback || {}), rating, notes: adminNotes }
//                 }));
//             }

//             toast.success(`Overall Session Rated: Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
//         } catch (err: any) {
//             toast.error("Failed to save feedback: " + err.message);
//         }
//     };

//     const handleTurnRating = async (interviewId: string, turnIndex: number, rating: 'up' | 'down') => {
//         try {
//             const updatedTranscript = [...(selectedInterview.transcript || [])];
//             updatedTranscript[turnIndex] = {
//                 ...updatedTranscript[turnIndex],
//                 adminRating: rating
//             };

//             const ref = doc(db, 'ai_interviews', interviewId);
//             await updateDoc(ref, { transcript: updatedTranscript });

//             setSelectedInterview((prev: any) => ({ ...prev, transcript: updatedTranscript }));
//             setInterviews(prev => prev.map(item => item.id === interviewId ? { ...item, transcript: updatedTranscript } : item));

//             toast.success(`Turn #${turnIndex + 1} rated Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
//         } catch (err: any) {
//             toast.error("Failed to rate turn: " + err.message);
//         }
//     };

//     const filteredInterviews = interviews.filter(item =>
//         item.learnerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         item.targetRole?.toLowerCase().includes(searchTerm.toLowerCase())
//     );

//     if (loading) {
//         return (
//             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh', flexDirection: 'column', gap: '1rem' }}>
//                 <Loader2 className="lfm-spin" size={40} color="var(--mlab-blue)" />
//                 <span style={{ color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loading AI Interview Logs...</span>
//             </div>
//         );
//     }

//     return (
//         <div className="wm-root animate-fade-in mlab-learners">
//             <style>{`
//                 .mlab-learners .wm-search__input,
//                 .mlab-learners .wm-btn,
//                 .mlab-learners .mlab-btn,
//                 .mlab-learners .mlab-table-wrap,
//                 .mlab-learners .mlab-badge {
//                     border-radius: 0 !important;
//                 }
//                 .wm-btn, .mlab-btn { 
//                     text-transform: uppercase; 
//                     font-family: var(--font-heading); 
//                     font-size: 0.75rem; 
//                     font-weight: 700; 
//                     letter-spacing: 0.05em; 
//                 }
//             `}</style>

//             {/* PAGE HEADER */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><Video size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">AI Interview Studio & Audit Log</h1>
//                         <p className="wm-page-header__desc">
//                             Inspect completed mock interviews, review transcripts turn-by-turn, and audit AI evaluation metrics.
//                         </p>
//                     </div>
//                 </div>
//             </div>

//             {/* TOOLBAR */}
//             <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
//                 <div className="wm-search" style={{ flex: '1 1 250px' }}>
//                     <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search by candidate name or target role…"
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                     {searchTerm && (
//                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}>
//                             <X size={13} color="var(--mlab-grey)" />
//                         </button>
//                     )}
//                 </div>

//                 <div className="wm-toolbar__count" style={{ marginLeft: 'auto' }}>
//                     {filteredInterviews.length} session{filteredInterviews.length !== 1 ? 's' : ''}
//                 </div>
//             </div>

//             {/* TABLE */}
//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Date & Time</th>
//                             <th>Candidate</th>
//                             <th>Target Role</th>
//                             <th>Difficulty</th>
//                             <th>Score & Readiness</th>
//                             <th>Session Audit</th>
//                             <th style={{ textAlign: 'right' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredInterviews.length > 0 ? (
//                             filteredInterviews.map(item => {
//                                 const sc = item.scorecard || {};
//                                 const score = sc.overallScore ?? '—';
//                                 const status = sc.readinessStatus || 'NOT_EVALUATED';
//                                 const rating = item.adminFeedback?.rating;

//                                 return (
//                                     <tr key={item.id} className="animate-fade-in" style={{ transition: 'all 0.2s' }}>
//                                         <td>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                                 <Calendar size={12} color="var(--mlab-grey)" />
//                                                 <span>{moment(item.completedAt).format('D MMM YYYY, HH:mm')}</span>
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>
//                                                 {item.learnerName || 'Unknown Candidate'}
//                                             </span>
//                                         </td>
//                                         <td>
//                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
//                                                 {item.targetRole}
//                                             </span>
//                                         </td>
//                                         <td>
//                                             <span style={{
//                                                 display: 'inline-flex',
//                                                 alignItems: 'center',
//                                                 fontSize: '0.7rem',
//                                                 fontFamily: 'var(--font-heading)',
//                                                 fontWeight: 700,
//                                                 textTransform: 'uppercase',
//                                                 background: '#f1f5f9',
//                                                 color: 'var(--mlab-grey)',
//                                                 padding: '4px 8px',
//                                                 border: '1px solid var(--mlab-border)',
//                                                 borderRadius: 0
//                                             }}>
//                                                 {item.difficulty}
//                                             </span>
//                                         </td>
//                                         <td>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{score}%</strong>
//                                                 <span style={{
//                                                     fontSize: '0.65rem',
//                                                     fontFamily: 'var(--font-heading)',
//                                                     fontWeight: 700,
//                                                     textTransform: 'uppercase',
//                                                     padding: '2px 6px',
//                                                     background: status === 'READY' ? 'var(--mlab-light-blue)' : '#fffbeb',
//                                                     color: status === 'READY' ? 'var(--mlab-blue)' : '#b45309',
//                                                     border: `1px solid ${status === 'READY' ? '#bae6fd' : '#fde68a'}`,
//                                                     borderRadius: 0
//                                                 }}>
//                                                     {status}
//                                                 </span>
//                                             </div>
//                                         </td>
//                                         <td>
//                                             {rating === 'up' && (
//                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 0 }}>
//                                                     <UserCheck size={12} /> Approved
//                                                 </span>
//                                             )}
//                                             {rating === 'down' && (
//                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 0 }}>
//                                                     <ShieldAlert size={12} /> Flagged
//                                                 </span>
//                                             )}
//                                             {!rating && (
//                                                 <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Unreviewed</span>
//                                             )}
//                                         </td>
//                                         <td style={{ textAlign: 'right' }}>
//                                             <button
//                                                 className="mlab-btn mlab-btn--ghost"
//                                                 onClick={() => { setSelectedInterview(item); setAdminNotes(item.adminFeedback?.notes || ''); }}
//                                                 style={{ fontSize: '0.7rem', padding: '6px 12px', color: 'var(--mlab-blue)', borderColor: 'var(--mlab-border)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
//                                             >
//                                                 <Eye size={13} /> Audit Turns
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             })
//                         ) : (
//                             <tr>
//                                 <td colSpan={7} style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)' }}>
//                                     <Video size={36} color="var(--mlab-grey)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
//                                         {searchTerm ? 'No matching logs found' : 'No Completed Sessions'}
//                                     </p>
//                                     <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
//                                         {searchTerm ? 'Try adjusting your search criteria.' : 'Completed learner AI mock interviews will appear here for audit.'}
//                                     </p>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* TURN-BY-TURN AUDIT MODAL (STRICT LEARNER FORM MODAL STYLING) */}
//             {selectedInterview && (
//                 <div className="lfm-overlay" onClick={() => setSelectedInterview(null)}>
//                     <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>

//                         {/* HEADER */}
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title">
//                                 <Video size={16} /> Turn-by-Turn AI Audit • {selectedInterview.targetRole}
//                             </h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setSelectedInterview(null)}>
//                                 <X size={20} />
//                             </button>
//                         </div>

//                         {/* BODY */}
//                         <div className="lfm-body">
//                             <div style={{ fontSize: '0.82rem', color: 'var(--mlab-grey)', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
//                                 Candidate: <strong style={{ color: 'var(--mlab-blue)' }}>{selectedInterview.learnerName}</strong> • {moment(selectedInterview.completedAt).format('D MMM YYYY, HH:mm')}
//                             </div>

//                             {/* SECTION 1: OVERALL SESSION RATING */}
//                             <div>
//                                 <div className="lfm-section-hdr">
//                                     <ThumbsUp size={13} /> 1. Overall Session Audit Rating
//                                 </div>
//                                 <div className="lfm-flags-panel" style={{ gap: '0.85rem' }}>
//                                     <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//                                         <button
//                                             type="button"
//                                             onClick={() => handleSessionRating(selectedInterview.id, 'up')}
//                                             className="lfm-btn"
//                                             style={{
//                                                 background: selectedInterview.adminFeedback?.rating === 'up' ? '#16a34a' : 'white',
//                                                 color: selectedInterview.adminFeedback?.rating === 'up' ? 'white' : '#16a34a',
//                                                 border: '1px solid #16a34a',
//                                                 display: 'flex',
//                                                 alignItems: 'center',
//                                                 gap: '6px'
//                                             }}
//                                         >
//                                             <ThumbsUp size={14} /> Approve Session
//                                         </button>
//                                         <button
//                                             type="button"
//                                             onClick={() => handleSessionRating(selectedInterview.id, 'down')}
//                                             className="lfm-btn"
//                                             style={{
//                                                 background: selectedInterview.adminFeedback?.rating === 'down' ? '#dc2626' : 'white',
//                                                 color: selectedInterview.adminFeedback?.rating === 'down' ? 'white' : '#dc2626',
//                                                 border: '1px solid #dc2626',
//                                                 display: 'flex',
//                                                 alignItems: 'center',
//                                                 gap: '6px'
//                                             }}
//                                         >
//                                             <ThumbsDown size={14} /> Flag Session Issues
//                                         </button>
//                                     </div>
//                                     <div className="lfm-fg">
//                                         <label>Audit Notes</label>
//                                         <input
//                                             type="text"
//                                             className="lfm-input"
//                                             placeholder="Audit notes (e.g., 'Solid pacing, but React state question was too lenient')..."
//                                             value={adminNotes}
//                                             onChange={e => setAdminNotes(e.target.value)}
//                                         />
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* SECTION 2: GRANULAR TURN-BY-TURN REVIEW */}
//                             <div>
//                                 <div className="lfm-section-hdr">
//                                     <MessageSquare size={13} /> 2. Granular Turn-by-Turn Review
//                                 </div>
//                                 <p style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)', margin: '-0.25rem 0 0.75rem 0' }}>
//                                     Rate individual AI turns. Approved AI questions enter the Global Gold Standard Library.
//                                 </p>

//                                 <div style={{ background: 'var(--mlab-blue)', padding: '1.25rem', maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--mlab-border)' }}>
//                                     {selectedInterview.transcript?.map((t: any, idx: number) => {
//                                         const isAi = t.speaker === 'interviewer';

//                                         return (
//                                             <div key={idx} style={{ alignSelf: isAi ? 'flex-start' : 'flex-end', maxWidth: '85%', width: '100%' }}>
//                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
//                                                     <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                         Turn #{idx + 1} • {isAi ? 'AI Interviewer' : selectedInterview.learnerName}
//                                                     </span>
//                                                     {isAi && (
//                                                         <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
//                                                             <button
//                                                                 type="button"
//                                                                 onClick={() => handleTurnRating(selectedInterview.id, idx, 'up')}
//                                                                 style={{ background: t.adminRating === 'up' ? '#16a34a' : 'transparent', color: t.adminRating === 'up' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
//                                                                 title="Approve AI Turn (Gold Standard)"
//                                                             >
//                                                                 <ThumbsUp size={12} />
//                                                             </button>
//                                                             <button
//                                                                 type="button"
//                                                                 onClick={() => handleTurnRating(selectedInterview.id, idx, 'down')}
//                                                                 style={{ background: t.adminRating === 'down' ? '#dc2626' : 'transparent', color: t.adminRating === 'down' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
//                                                                 title="Flag AI Turn (Bad Question / Loop)"
//                                                             >
//                                                                 <ThumbsDown size={12} />
//                                                             </button>
//                                                         </div>
//                                                     )}
//                                                 </div>

//                                                 <div style={{
//                                                     padding: '10px 14px',
//                                                     background: isAi ? '#334155' : 'var(--mlab-green)',
//                                                     color: isAi ? 'white' : 'var(--mlab-blue)',
//                                                     fontWeight: isAi ? 400 : 700,
//                                                     fontSize: '0.82rem',
//                                                     lineHeight: 1.5,
//                                                     borderLeft: t.adminRating === 'up' ? '4px solid #16a34a' : t.adminRating === 'down' ? '4px solid #dc2626' : 'none'
//                                                 }}>
//                                                     {t.text}
//                                                 </div>
//                                             </div>
//                                         );
//                                     })}
//                                 </div>
//                             </div>

//                             {/* SECTION 3: SCORECARD SUMMARY */}
//                             <div>
//                                 <div className="lfm-section-hdr">
//                                     <Award size={13} /> 3. AI Generated Scorecard Summary
//                                 </div>
//                                 <div className="lfm-demographics-panel" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--mlab-midnight)' }}>
//                                     <p style={{ margin: '0 0 6px 0' }}><strong>Overall Score:</strong> {selectedInterview.scorecard?.overallScore}% ({selectedInterview.scorecard?.readinessStatus})</p>
//                                     <p style={{ margin: '0 0 6px 0' }}><strong>Technical Score:</strong> {selectedInterview.scorecard?.technicalScore}% | <strong>Communication:</strong> {selectedInterview.scorecard?.communicationScore}%</p>
//                                     <p style={{ margin: '0 0 6px 0' }}><strong>Summary:</strong> {selectedInterview.scorecard?.readinessSummary}</p>
//                                     <p style={{ margin: 0 }}><strong>Priority Gaps:</strong> {selectedInterview.scorecard?.priorityGaps?.join(', ') || 'None'}</p>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* FOOTER */}
//                         <div className="lfm-footer">
//                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setSelectedInterview(null)}>
//                                 Close Audit
//                             </button>
//                         </div>

//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };


// // // src/pages/AdminDashboard/AdminInterviewStudioView/AdminInterviewStudioView.tsx

// // import React, { useEffect, useState } from 'react';
// // import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { Search, ThumbsUp, ThumbsDown, Eye, X, Loader2, MessageSquare, Video, Calendar, UserCheck, ShieldAlert } from 'lucide-react';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import moment from 'moment';


// // import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';


// // // import '../../../components/admin/WorkplacesManager/WorkplacesManager.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // // import '../../../components/views/LearnerDirectoryView/LearnerDirectoryView.css';
// // import '../../../components/views/LearnerDirectoryView/LearnerDirectoryView.css';

// // export const AdminInterviewStudioView: React.FC = () => {
// //     const toast = useToast();
// //     const [interviews, setInterviews] = useState<any[]>([]);
// //     const [loading, setLoading] = useState(true);
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [selectedInterview, setSelectedInterview] = useState<any | null>(null);
// //     const [adminNotes, setAdminNotes] = useState('');

// //     useEffect(() => {
// //         const fetchInterviews = async () => {
// //             try {
// //                 const q = query(collection(db, 'ai_interviews'), orderBy('completedAt', 'desc'));
// //                 const snap = await getDocs(q);
// //                 const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// //                 setInterviews(list);
// //             } catch (err) {
// //                 console.error("Failed to fetch interviews:", err);
// //                 toast.error("Could not load AI interview logs.");
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };

// //         fetchInterviews();
// //     }, [toast]);

// //     const handleSessionRating = async (interviewId: string, rating: 'up' | 'down') => {
// //         try {
// //             const ref = doc(db, 'ai_interviews', interviewId);
// //             await updateDoc(ref, {
// //                 'adminFeedback.rating': rating,
// //                 'adminFeedback.notes': adminNotes,
// //                 'adminFeedback.updatedAt': new Date().toISOString()
// //             });

// //             setInterviews(prev => prev.map(item => item.id === interviewId ? {
// //                 ...item,
// //                 adminFeedback: { ...(item.adminFeedback || {}), rating, notes: adminNotes }
// //             } : item));

// //             if (selectedInterview?.id === interviewId) {
// //                 setSelectedInterview((prev: any) => ({
// //                     ...prev,
// //                     adminFeedback: { ...(prev?.adminFeedback || {}), rating, notes: adminNotes }
// //                 }));
// //             }

// //             toast.success(`Overall Session Rated: Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
// //         } catch (err: any) {
// //             toast.error("Failed to save feedback: " + err.message);
// //         }
// //     };

// //     const handleTurnRating = async (interviewId: string, turnIndex: number, rating: 'up' | 'down') => {
// //         try {
// //             const updatedTranscript = [...(selectedInterview.transcript || [])];
// //             updatedTranscript[turnIndex] = {
// //                 ...updatedTranscript[turnIndex],
// //                 adminRating: rating
// //             };

// //             const ref = doc(db, 'ai_interviews', interviewId);
// //             await updateDoc(ref, { transcript: updatedTranscript });

// //             setSelectedInterview((prev: any) => ({ ...prev, transcript: updatedTranscript }));
// //             setInterviews(prev => prev.map(item => item.id === interviewId ? { ...item, transcript: updatedTranscript } : item));

// //             toast.success(`Turn #${turnIndex + 1} rated Thumbs ${rating === 'up' ? 'Up 👍' : 'Down 👎'}`);
// //         } catch (err: any) {
// //             toast.error("Failed to rate turn: " + err.message);
// //         }
// //     };

// //     const filteredInterviews = interviews.filter(item =>
// //         item.learnerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
// //         item.targetRole?.toLowerCase().includes(searchTerm.toLowerCase())
// //     );

// //     if (loading) {
// //         return (
// //             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh', flexDirection: 'column', gap: '1rem' }}>
// //                 <Loader2 className="lfm-spin" size={40} color="var(--mlab-blue)" />
// //                 <span style={{ color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loading AI Interview Logs...</span>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="wm-root animate-fade-in mlab-learners">
// //             <style>{`
// //                 .mlab-learners .wm-search__input,
// //                 .mlab-learners .wm-btn,
// //                 .mlab-learners .mlab-btn,
// //                 .mlab-learners .mlab-table-wrap,
// //                 .mlab-learners .mlab-badge {
// //                     border-radius: 0 !important;
// //                 }
// //                 .wm-btn, .mlab-btn { 
// //                     text-transform: uppercase; 
// //                     font-family: var(--font-heading); 
// //                     font-size: 0.75rem; 
// //                     font-weight: 700; 
// //                     letter-spacing: 0.05em; 
// //                 }
// //             `}</style>

// //             {/* PAGE HEADER */}
// //             <div className="wm-page-header">
// //                 <div className="wm-page-header__left">
// //                     <div className="wm-page-header__icon"><Video size={22} /></div>
// //                     <div>
// //                         <h1 className="wm-page-header__title">AI Interview Studio & Audit Log</h1>
// //                         <p className="wm-page-header__desc">
// //                             Inspect completed mock interviews, review transcripts turn-by-turn, and audit AI evaluation metrics.
// //                         </p>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* TOOLBAR */}
// //             <div className="wm-toolbar" style={{ flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
// //                 <div className="wm-search" style={{ flex: '1 1 250px' }}>
// //                     <Search size={15} className="wm-search__icon" color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         className="wm-search__input"
// //                         placeholder="Search by candidate name or target role…"
// //                         value={searchTerm}
// //                         onChange={e => setSearchTerm(e.target.value)}
// //                     />
// //                     {searchTerm && (
// //                         <button className="wm-search__clear" onClick={() => setSearchTerm('')}>
// //                             <X size={13} color="var(--mlab-grey)" />
// //                         </button>
// //                     )}
// //                 </div>

// //                 <div className="wm-toolbar__count" style={{ marginLeft: 'auto' }}>
// //                     {filteredInterviews.length} session{filteredInterviews.length !== 1 ? 's' : ''}
// //                 </div>
// //             </div>

// //             {/* TABLE */}
// //             <div className="mlab-table-wrap">
// //                 <table className="mlab-table">
// //                     <thead>
// //                         <tr>
// //                             <th>Date & Time</th>
// //                             <th>Candidate</th>
// //                             <th>Target Role</th>
// //                             <th>Difficulty</th>
// //                             <th>Score & Readiness</th>
// //                             <th>Session Audit</th>
// //                             <th style={{ textAlign: 'right' }}>Actions</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {filteredInterviews.length > 0 ? (
// //                             filteredInterviews.map(item => {
// //                                 const sc = item.scorecard || {};
// //                                 const score = sc.overallScore ?? '—';
// //                                 const status = sc.readinessStatus || 'NOT_EVALUATED';
// //                                 const rating = item.adminFeedback?.rating;

// //                                 return (
// //                                     <tr key={item.id} className="animate-fade-in" style={{ transition: 'all 0.2s' }}>
// //                                         <td>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
// //                                                 <Calendar size={12} color="var(--mlab-grey)" />
// //                                                 <span>{moment(item.completedAt).format('D MMM YYYY, HH:mm')}</span>
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>
// //                                                 {item.learnerName || 'Unknown Candidate'}
// //                                             </span>
// //                                         </td>
// //                                         <td>
// //                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
// //                                                 {item.targetRole}
// //                                             </span>
// //                                         </td>
// //                                         <td>
// //                                             <span style={{
// //                                                 display: 'inline-flex',
// //                                                 alignItems: 'center',
// //                                                 fontSize: '0.7rem',
// //                                                 fontFamily: 'var(--font-heading)',
// //                                                 fontWeight: 700,
// //                                                 textTransform: 'uppercase',
// //                                                 background: '#f1f5f9',
// //                                                 color: 'var(--mlab-grey)',
// //                                                 padding: '4px 8px',
// //                                                 border: '1px solid var(--mlab-border)',
// //                                                 borderRadius: 0
// //                                             }}>
// //                                                 {item.difficulty}
// //                                             </span>
// //                                         </td>
// //                                         <td>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                 <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{score}%</strong>
// //                                                 <span style={{
// //                                                     fontSize: '0.65rem',
// //                                                     fontFamily: 'var(--font-heading)',
// //                                                     fontWeight: 700,
// //                                                     textTransform: 'uppercase',
// //                                                     padding: '2px 6px',
// //                                                     background: status === 'READY' ? 'var(--mlab-light-blue)' : '#fffbeb',
// //                                                     color: status === 'READY' ? 'var(--mlab-blue)' : '#b45309',
// //                                                     border: `1px solid ${status === 'READY' ? '#bae6fd' : '#fde68a'}`,
// //                                                     borderRadius: 0
// //                                                 }}>
// //                                                     {status}
// //                                                 </span>
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             {rating === 'up' && (
// //                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 0 }}>
// //                                                     <UserCheck size={12} /> Approved
// //                                                 </span>
// //                                             )}
// //                                             {rating === 'down' && (
// //                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 0 }}>
// //                                                     <ShieldAlert size={12} /> Flagged
// //                                                 </span>
// //                                             )}
// //                                             {!rating && (
// //                                                 <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Unreviewed</span>
// //                                             )}
// //                                         </td>
// //                                         <td style={{ textAlign: 'right' }}>
// //                                             <button
// //                                                 className="mlab-btn mlab-btn--ghost"
// //                                                 onClick={() => { setSelectedInterview(item); setAdminNotes(item.adminFeedback?.notes || ''); }}
// //                                                 style={{ fontSize: '0.7rem', padding: '6px 12px', color: 'var(--mlab-blue)', borderColor: 'var(--mlab-border)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
// //                                             >
// //                                                 <Eye size={13} /> Audit Turns
// //                                             </button>
// //                                         </td>
// //                                     </tr>
// //                                 );
// //                             })
// //                         ) : (
// //                             <tr>
// //                                 <td colSpan={7} style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)' }}>
// //                                     <Video size={36} color="var(--mlab-grey)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// //                                     <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
// //                                         {searchTerm ? 'No matching logs found' : 'No Completed Sessions'}
// //                                     </p>
// //                                     <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
// //                                         {searchTerm ? 'Try adjusting your search criteria.' : 'Completed learner AI mock interviews will appear here for audit.'}
// //                                     </p>
// //                                 </td>
// //                             </tr>
// //                         )}
// //                     </tbody>
// //                 </table>
// //             </div>

// //             {/* TURN-BY-TURN AUDIT MODAL */}
// //             {selectedInterview && (
// //                 <div style={{ position: 'fixed', inset: 0, background: 'rgba(7, 63, 78, 0.75)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
// //                     <div style={{ background: 'var(--mlab-white)', maxWidth: '850px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 0, padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', borderTop: '4px solid var(--mlab-blue)' }}>

// //                         {/* MODAL HEADER */}
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// //                             <div>
// //                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontSize: '1.2rem', letterSpacing: '0.05em' }}>
// //                                     Turn-by-Turn AI Audit • {selectedInterview.targetRole}
// //                                 </h3>
// //                                 <span style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'block' }}>
// //                                     Candidate: <strong>{selectedInterview.learnerName}</strong> • {moment(selectedInterview.completedAt).format('D MMM YYYY, HH:mm')}
// //                                 </span>
// //                             </div>
// //                             <button onClick={() => setSelectedInterview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// //                                 <X size={20} />
// //                             </button>
// //                         </div>

// //                         {/* SESSION RATING BOX */}
// //                         <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '1rem', marginBottom: '1.5rem' }}>
// //                             <strong style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', display: 'block', marginBottom: '8px', letterSpacing: '0.05em' }}>
// //                                 1. Overall Session Audit Rating
// //                             </strong>
// //                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
// //                                 <button
// //                                     onClick={() => handleSessionRating(selectedInterview.id, 'up')}
// //                                     className="mlab-btn"
// //                                     style={{
// //                                         background: selectedInterview.adminFeedback?.rating === 'up' ? '#16a34a' : 'white',
// //                                         color: selectedInterview.adminFeedback?.rating === 'up' ? 'white' : '#16a34a',
// //                                         border: '1px solid #16a34a',
// //                                         padding: '6px 14px',
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         gap: '6px'
// //                                     }}
// //                                 >
// //                                     <ThumbsUp size={14} /> Approve Session
// //                                 </button>
// //                                 <button
// //                                     onClick={() => handleSessionRating(selectedInterview.id, 'down')}
// //                                     className="mlab-btn"
// //                                     style={{
// //                                         background: selectedInterview.adminFeedback?.rating === 'down' ? '#dc2626' : 'white',
// //                                         color: selectedInterview.adminFeedback?.rating === 'down' ? 'white' : '#dc2626',
// //                                         border: '1px solid #dc2626',
// //                                         padding: '6px 14px',
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         gap: '6px'
// //                                     }}
// //                                 >
// //                                     <ThumbsDown size={14} /> Flag Session Issues
// //                                 </button>
// //                             </div>
// //                             <input
// //                                 type="text"
// //                                 placeholder="Audit notes (e.g., 'Solid pacing, but React state question was too lenient')..."
// //                                 value={adminNotes}
// //                                 onChange={e => setAdminNotes(e.target.value)}
// //                                 style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', border: '1px solid var(--mlab-border)', outline: 'none', boxSizing: 'border-box', background: 'white' }}
// //                             />
// //                         </div>

// //                         {/* PER-TURN GRANULAR FEED */}
// //                         <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '0.4rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.05em' }}>
// //                             <MessageSquare size={16} /> 2. Granular Turn-by-Turn Review
// //                         </h4>
// //                         <p style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)', margin: '0 0 1rem 0' }}>
// //                             Rate individual AI turns. Approved AI questions enter the Global Gold Standard Library.
// //                         </p>

// //                         <div style={{ background: 'var(--mlab-midnight)', padding: '1.25rem', maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '1.5rem' }}>
// //                             {selectedInterview.transcript?.map((t: any, idx: number) => {
// //                                 const isAi = t.speaker === 'interviewer';

// //                                 return (
// //                                     <div key={idx} style={{ alignSelf: isAi ? 'flex-start' : 'flex-end', maxWidth: '85%', width: '100%' }}>
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
// //                                             <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                                 Turn #{idx + 1} • {isAi ? 'AI Interviewer' : selectedInterview.learnerName}
// //                                             </span>
// //                                             {isAi && (
// //                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// //                                                     <button
// //                                                         onClick={() => handleTurnRating(selectedInterview.id, idx, 'up')}
// //                                                         style={{ background: t.adminRating === 'up' ? '#16a34a' : 'transparent', color: t.adminRating === 'up' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 0 }}
// //                                                         title="Approve AI Turn (Gold Standard)"
// //                                                     >
// //                                                         <ThumbsUp size={12} />
// //                                                     </button>
// //                                                     <button
// //                                                         onClick={() => handleTurnRating(selectedInterview.id, idx, 'down')}
// //                                                         style={{ background: t.adminRating === 'down' ? '#dc2626' : 'transparent', color: t.adminRating === 'down' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 0 }}
// //                                                         title="Flag AI Turn (Bad Question / Loop)"
// //                                                     >
// //                                                         <ThumbsDown size={12} />
// //                                                     </button>
// //                                                 </div>
// //                                             )}
// //                                         </div>

// //                                         <div style={{
// //                                             padding: '10px 14px',
// //                                             background: isAi ? '#334155' : 'var(--mlab-blue)',
// //                                             color: 'white',
// //                                             borderRadius: 0,
// //                                             fontSize: '0.82rem',
// //                                             lineHeight: 1.5,
// //                                             borderLeft: t.adminRating === 'up' ? '4px solid #16a34a' : t.adminRating === 'down' ? '4px solid #dc2626' : 'none'
// //                                         }}>
// //                                             {t.text}
// //                                         </div>
// //                                     </div>
// //                                 );
// //                             })}
// //                         </div>

// //                         {/* SCORECARD BREAKDOWN */}
// //                         <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', marginBottom: '0.5rem', fontSize: '0.9rem', letterSpacing: '0.05em' }}>
// //                             3. AI Generated Scorecard Summary
// //                         </h4>
// //                         <div style={{ background: 'var(--mlab-bg)', padding: '1rem', border: '1px solid var(--mlab-border)', fontSize: '0.85rem', color: 'var(--mlab-midnight)', lineHeight: 1.6 }}>
// //                             <p style={{ margin: '0 0 6px 0' }}><strong>Overall Score:</strong> {selectedInterview.scorecard?.overallScore}% ({selectedInterview.scorecard?.readinessStatus})</p>
// //                             <p style={{ margin: '0 0 6px 0' }}><strong>Technical Score:</strong> {selectedInterview.scorecard?.technicalScore}% | <strong>Communication:</strong> {selectedInterview.scorecard?.communicationScore}%</p>
// //                             <p style={{ margin: '0 0 6px 0' }}><strong>Summary:</strong> {selectedInterview.scorecard?.readinessSummary}</p>
// //                             <p style={{ margin: 0 }}><strong>Priority Gaps:</strong> {selectedInterview.scorecard?.priorityGaps?.join(', ') || 'None'}</p>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };