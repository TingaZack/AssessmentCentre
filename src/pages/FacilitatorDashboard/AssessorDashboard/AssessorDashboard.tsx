// src/pages/AssessorPortal/AssessorDashboard/AssessorDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
    Calendar, ArrowRight, PenTool, Clock, CheckCircle, AlertTriangle,
    FileText, Layers, Info, User, Activity, Timer, Users, Search,
    ChevronRight, LayoutDashboard, UserCircle, ChevronUp, ChevronDown,
    Filter, BookOpen, CheckCircle2, RotateCcw, ShieldAlert, Eye, Video, Zap,
    Loader2
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import './AssessorDashboard.css';
// 🚀 IMPORT COHORT VIEW STYLES TO MATCH EXACT UI
import '../../../components/views/CohortsView/CohortsView.css';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import { AssessorProfileView } from '../AssessorProfileView/AssessorProfileView';

import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
import { CoachingScheduleView } from '../../../components/views/CoachingScheduleView/CoachingScheduleView';

interface PendingTask {
    id: string;
    learnerId: string;
    learnerName: string;
    assessmentId: string;
    title: string;
    type?: string;
    assessmentType?: string;
    moduleType?: string;
    status: string;
    submittedAt: string;
    isReturned: boolean;
    isReassessment?: boolean;
    attempt?: number;
    facilitatorName: string;
    facilitatorTimeSpent?: number;
    facilitatorStartedAt?: string;
}

interface LearnerStat {
    id: string;
    enrollmentId: string;
    fullName: string;
    idNumber: string;
    cohortName: string;
    cohortId: string;
    completedAssessments: number;
    totalAssessments: number;
    needsGrading: number;
    activeRiskCount: number;
    resolvedRiskCount: number;
    flaggedAssessments: { title: string; status: string; isActive: boolean }[];
    coachingState?: {
        status: 'upcoming' | 'pending_notes';
        date: string;
    };
}

export const AssessorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'cohorts' | 'profile' | 'coaching'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showKPIs, setShowKPIs] = useState(true);

    const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
    const [historicalTasks, setHistoricalTasks] = useState<any[]>([]);
    const [learnerStats, setLearnerStats] = useState<LearnerStat[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingTasks, setLoadingTasks] = useState(true);

    const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(true);
    const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'returned' | 'pending' | 'reassessments'>('all');
    const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

    const [learnerView, setLearnerView] = useState<'all' | 'at_risk'>('all');
    const [riskFilter, setRiskFilter] = useState<'all' | 'active' | 'resolved'>('all');

    const [coachingAlertCount, setCoachingAlertCount] = useState(0);

    const [qctoCompliance, setQctoCompliance] = useState({
        knowTotal: 0, knowGraded: 0,
        pracTotal: 0, pracGraded: 0,
        workTotal: 0, workGraded: 0,
        otherTotal: 0, otherGraded: 0
    });

    const [reassessmentMetrics, setReassessmentMetrics] = useState({
        totalEvaluatedLearners: 0,
        learnersPassedFirstTry: 0,
        learnersNeededReassessment: 0
    });

    const toggleAssessmentAccordion = (id: string) => {
        setExpandedAssessments(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, []);

    const myStaffProfile = store.staff.find(s =>
        s.authUid === store.user?.uid || s.email === store.user?.email || s.id === store.user?.uid
    );
    const myCohorts = store.cohorts.filter(c =>
        c.assessorId === store.user?.uid || c.assessorId === myStaffProfile?.id || c.assessorEmail === store.user?.email
    );
    const myCohortIds = myCohorts.map(c => c.id);
    const isAdmin = store.user?.role === 'admin';

    useEffect(() => {
        const fetchTasksAndStats = async () => {
            if (!store.user?.uid || store.cohorts.length === 0) return;
            if (!isAdmin && myCohortIds.length === 0) { setLoadingTasks(false); return; }

            try {
                const snap = await getDocs(query(collection(db, 'learner_submissions')));
                const coachingSnap = await getDocs(query(collection(db, 'coaching_sessions'), where('status', 'in', ['requested', 'pending_notes'])));

                const pTasks: PendingTask[] = [];
                const hTasks: any[] = [];
                const lStatsMap: Record<string, LearnerStat> = {};
                const compStats = { knowTotal: 0, knowGraded: 0, pracTotal: 0, pracGraded: 0, workTotal: 0, workGraded: 0, otherTotal: 0, otherGraded: 0 };

                const lookupMap: Record<string, string> = {};

                store.learners.forEach(l => {
                    if (isAdmin || (l.cohortId && myCohortIds.includes(l.cohortId))) {
                        const cName = store.cohorts.find(c => c.id === l.cohortId)?.name || 'Unknown Class';
                        lStatsMap[l.id] = {
                            id: l.id, enrollmentId: l.enrollmentId || l.id, fullName: l.fullName, idNumber: l.idNumber || 'N/A',
                            cohortName: cName, cohortId: l.cohortId || 'Unassigned',
                            completedAssessments: 0, totalAssessments: 0, needsGrading: 0,
                            activeRiskCount: 0, resolvedRiskCount: 0, flaggedAssessments: []
                        };

                        lookupMap[l.id] = l.id;
                        if (l.idNumber) lookupMap[l.idNumber] = l.id;
                        if (l.enrollmentId) lookupMap[l.enrollmentId] = l.id;
                        if (l.id.includes('_')) {
                            const splitPart = l.id.split('_').pop();
                            if (splitPart) lookupMap[splitPart] = l.id;
                        }
                    }
                });

                let cAlerts = 0;
                coachingSnap.docs.forEach(cDoc => {
                    const cData = cDoc.data();
                    const actualLearnerId = lookupMap[cData.learnerId] || cData.learnerId;

                    if (lStatsMap[actualLearnerId]) {
                        const isPast = new Date(cData.dateTime).getTime() < Date.now();
                        let stateStatus: 'upcoming' | 'pending_notes' | null = null;
                        const needsLink = !cData.meetLink || cData.requiresManualLink;

                        if (cData.status === 'pending_notes' || (cData.status === 'requested' && isPast) || needsLink) {
                            cAlerts++;
                            stateStatus = 'pending_notes';
                        } else if (cData.status === 'requested' && !isPast) {
                            stateStatus = 'upcoming';
                        }

                        if (stateStatus) {
                            if (!lStatsMap[actualLearnerId].coachingState || stateStatus === 'pending_notes') {
                                lStatsMap[actualLearnerId].coachingState = {
                                    status: stateStatus,
                                    date: cData.dateTime
                                };
                            }
                        }
                    }
                });
                setCoachingAlertCount(cAlerts);

                const groupedSubmissions: Record<string, any[]> = {};

                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const actualLearnerId = lookupMap[data.learnerId];
                    if (!actualLearnerId || !lStatsMap[actualLearnerId] || !data.assessmentId) return;

                    const key = `${actualLearnerId}:::${data.assessmentId}`;
                    if (!groupedSubmissions[key]) groupedSubmissions[key] = [];
                    groupedSubmissions[key].push({ id: docSnap.id, ...data });
                });

                Object.entries(groupedSubmissions).forEach(([key, submissions]) => {
                    const actualLearnerId = key.split(':::')[0];
                    submissions.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

                    const latestSub = submissions[submissions.length - 1];
                    const attemptCount = submissions.length;
                    const finalAttempt = Math.max(attemptCount, latestSub.attempt || 1, latestSub.grading?.attempt || 1);

                    const isReassessmentHistory = finalAttempt > 1 || ['resubmitted', 'appealed'].includes(latestSub.status) || latestSub.isReassessment === true;
                    const isActiveOp = ['in_progress', 'submitted', 'resubmitted', 'awaiting_learner_signoff', 'facilitator_reviewed', 'returned', 'graded', 'moderated', 'appealed'].includes(latestSub.status);

                    if (isActiveOp) {
                        lStatsMap[actualLearnerId].totalAssessments += 1;
                        if (['graded', 'moderated'].includes(latestSub.status)) lStatsMap[actualLearnerId].completedAssessments += 1;
                        if (['facilitator_reviewed', 'returned', 'resubmitted', 'appealed'].includes(latestSub.status)) lStatsMap[actualLearnerId].needsGrading += 1;

                        if (latestSub.status === 'returned') {
                            lStatsMap[actualLearnerId].activeRiskCount += 1;
                            lStatsMap[actualLearnerId].flaggedAssessments.push({ title: latestSub.title || 'Unknown', status: `Action Reqd (Returned, Att #${finalAttempt})`, isActive: true });
                        } else if (latestSub.status === 'appealed') {
                            lStatsMap[actualLearnerId].activeRiskCount += 1;
                            lStatsMap[actualLearnerId].flaggedAssessments.push({ title: latestSub.title || 'Unknown', status: `Appealed (Att #${finalAttempt})`, isActive: true });
                        } else if (isReassessmentHistory) {
                            if (['graded', 'moderated'].includes(latestSub.status)) {
                                lStatsMap[actualLearnerId].resolvedRiskCount += 1;
                                lStatsMap[actualLearnerId].flaggedAssessments.push({ title: latestSub.title || 'Unknown', status: `Resolved (Passed Att #${finalAttempt})`, isActive: false });
                            } else if (['not_started', 'in_progress'].includes(latestSub.status)) {
                                lStatsMap[actualLearnerId].activeRiskCount += 1;
                                lStatsMap[actualLearnerId].flaggedAssessments.push({ title: latestSub.title || 'Unknown', status: `Busy Re-Assessing (Att #${finalAttempt})`, isActive: true });
                            } else {
                                lStatsMap[actualLearnerId].activeRiskCount += 1;
                                lStatsMap[actualLearnerId].flaggedAssessments.push({ title: latestSub.title || 'Unknown', status: `Reassessment (Att #${finalAttempt})`, isActive: true });
                            }
                        }
                    }

                    const modTypeStr = (latestSub.moduleType || '').toLowerCase();
                    const titleStr = (latestSub.title || '').toLowerCase();
                    const isFullyGraded = ['graded', 'moderated'].includes(latestSub.status);

                    let cat = 'other';
                    if (modTypeStr.includes('knowledge') || titleStr.includes('knowledge')) cat = 'know';
                    else if (modTypeStr.includes('practical') || titleStr.includes('practical')) cat = 'prac';
                    else if (modTypeStr.includes('workplace') || modTypeStr.includes('work experience')) cat = 'work';

                    (compStats as any)[`${cat}Total`] += 1;
                    if (isFullyGraded) (compStats as any)[`${cat}Graded`] += 1;

                    if (['facilitator_reviewed', 'returned', 'resubmitted', 'appealed'].includes(latestSub.status)) {
                        const learner = store.learners.find(l => l.id === actualLearnerId);
                        pTasks.push({
                            id: latestSub.id,
                            learnerId: actualLearnerId,
                            learnerName: learner?.fullName || latestSub.learnerDeclaration?.learnerName || 'Unknown Learner',
                            assessmentId: latestSub.assessmentId,
                            title: latestSub.title || 'Untitled Assessment',
                            type: latestSub.type || latestSub.assessmentType || 'Unknown',
                            moduleType: latestSub.moduleType || 'unknown',
                            status: latestSub.status,
                            submittedAt: latestSub.grading?.facilitatorReviewedAt || latestSub.submittedAt || latestSub.assignedAt || new Date().toISOString(),
                            isReturned: latestSub.status === 'returned',
                            isReassessment: isReassessmentHistory,
                            attempt: finalAttempt,
                            facilitatorName: latestSub.grading?.facilitatorName || 'Facilitator',
                            facilitatorTimeSpent: latestSub.grading?.facilitatorTimeSpent,
                            facilitatorStartedAt: latestSub.grading?.facilitatorStartedAt
                        });
                    } else if (['graded', 'moderated'].includes(latestSub.status)) {
                        if ((isAdmin || latestSub.grading?.gradedBy === store.user?.uid) && latestSub.grading?.assessorTimeSpent) {
                            hTasks.push({ ...latestSub, actualLearnerId, finalAttempt });
                        }
                    }
                });

                const allLearnersList = Object.values(lStatsMap);
                let neededReassess = 0;
                let passed1st = 0;

                allLearnersList.forEach(l => {
                    const hasReassessmentOrFlags = l.activeRiskCount > 0 || l.resolvedRiskCount > 0;
                    if (hasReassessmentOrFlags) {
                        neededReassess += 1;
                    } else if (l.completedAssessments > 0) {
                        passed1st += 1;
                    }
                });

                const totalEvaluated = passed1st + neededReassess;

                setReassessmentMetrics({
                    totalEvaluatedLearners: totalEvaluated,
                    learnersPassedFirstTry: passed1st,
                    learnersNeededReassessment: neededReassess
                });

                pTasks.sort((a, b) => { if (a.isReturned !== b.isReturned) return a.isReturned ? -1 : 1; return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(); });
                setPendingTasks(pTasks);
                setHistoricalTasks(hTasks);
                setQctoCompliance(compStats);
                setLearnerStats(allLearnersList.sort((a, b) => b.needsGrading - a.needsGrading || a.fullName.localeCompare(b.fullName)));
            } catch (err) { console.error('Error fetching marking queue:', err); }
            finally { setLoadingTasks(false); }
        };
        fetchTasksAndStats();
    }, [store.user?.uid, myCohortIds.length, store.cohorts.length, store.learners.length, isAdmin]);

    const handleLogout = async () => {
        try { await signOut(auth); navigate('/login'); }
        catch (err) { console.error('Logout failed', err); }
    };

    const getFacilitatorName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const formatTimeSpent = (seconds?: number) => {
        if (!seconds) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
    };

    const facTasksWithTime = pendingTasks.filter(t => t.facilitatorTimeSpent && t.facilitatorTimeSpent > 0);
    const avgFacilitatorTime = facTasksWithTime.length > 0
        ? facTasksWithTime.reduce((s, t) => s + (t.facilitatorTimeSpent || 0), 0) / facTasksWithTime.length : 0;
    const avgAssessorTime = historicalTasks.length > 0
        ? historicalTasks.reduce((s, t) => s + (t.grading.assessorTimeSpent || 0), 0) / historicalTasks.length : 0;

    const { formativeTotal, summativeTotal, otherAssessTotal, formativePending, summativePending, otherAssessPending } = useMemo(() => {
        let ft = 0, st = 0, ot = 0, fp = 0, sp = 0, op = 0;

        historicalTasks.forEach(t => {
            const typeStr = (t.type || t.assessmentType || '').toLowerCase();
            const titleStr = (t.title || '').toLowerCase();
            if (typeStr.includes('formative') || titleStr.includes('formative')) ft++;
            else if (typeStr.includes('summative') || titleStr.includes('summative') || titleStr.includes('eisa')) st++;
            else ot++;
        });

        pendingTasks.forEach(t => {
            const typeStr = (t.type || t.assessmentType || '').toLowerCase();
            const titleStr = (t.title || '').toLowerCase();
            if (typeStr.includes('formative') || titleStr.includes('formative')) { ft++; fp++; }
            else if (typeStr.includes('summative') || titleStr.includes('summative') || titleStr.includes('eisa')) { st++; sp++; }
            else { ot++; op++; }
        });

        return { formativeTotal: ft, summativeTotal: st, otherAssessTotal: ot, formativePending: fp, summativePending: sp, otherAssessPending: op };
    }, [historicalTasks, pendingTasks]);

    const { knowTotal, pracTotal, workTotal, otherModTotal, knowPending, pracPending, workPending, otherModPending } = useMemo(() => {
        let kt = 0, pt = 0, wt = 0, omt = 0, kp = 0, pp = 0, wp = 0, omp = 0;

        historicalTasks.forEach(t => {
            const modType = (t.moduleType || '').toLowerCase();
            const titleStr = (t.title || '').toLowerCase();
            if (modType.includes('knowledge') || titleStr.includes('knowledge')) kt++;
            else if (modType.includes('practical') || titleStr.includes('practical')) pt++;
            else if (modType.includes('workplace') || modType.includes('work experience')) wt++;
            else omt++;
        });

        pendingTasks.forEach(t => {
            const modType = (t.moduleType || '').toLowerCase();
            const titleStr = (t.title || '').toLowerCase();
            if (modType.includes('knowledge') || titleStr.includes('knowledge')) { kt++; kp++; }
            else if (modType.includes('practical') || titleStr.includes('practical')) { pt++; pp++; }
            else if (modType.includes('workplace') || modType.includes('work experience')) { wt++; wp++; }
            else { omt++; omp++; }
        });

        return { knowTotal: kt, pracTotal: pt, workTotal: wt, otherModTotal: omt, knowPending: kp, pracPending: pp, workPending: wp, otherModPending: omp };
    }, [historicalTasks, pendingTasks]);

    const totalMarkingVolume = historicalTasks.length + pendingTasks.length;

    const totalComplianceExpected = qctoCompliance.knowTotal + qctoCompliance.pracTotal + qctoCompliance.workTotal + qctoCompliance.otherTotal;
    const totalComplianceGraded = qctoCompliance.knowGraded + qctoCompliance.pracGraded + qctoCompliance.workGraded + qctoCompliance.otherGraded;

    const { slaUnder24, sla1to5, slaOver5 } = useMemo(() => {
        let u24 = 0, u5 = 0, o5 = 0;
        const now = new Date().getTime();
        pendingTasks.forEach(t => {
            const daysOld = (now - new Date(t.submittedAt).getTime()) / (1000 * 3600 * 24);
            if (daysOld <= 1) u24++;
            else if (daysOld <= 5) u5++;
            else o5++;
        });
        return { slaUnder24: u24, sla1to5: u5, slaOver5: o5 };
    }, [pendingTasks]);

    const { totalModerated, acceptedModeration } = useMemo(() => {
        const returnedQueue = pendingTasks.filter(t => t.isReturned).length;
        const totalMod = historicalTasks.length + returnedQueue;
        return { totalModerated: totalMod, acceptedModeration: historicalTasks.length };
    }, [historicalTasks, pendingTasks]);

    const eisaClearedCount = useMemo(() => {
        return learnerStats.filter(l => l.completedAssessments === l.totalAssessments && l.totalAssessments > 0).length;
    }, [learnerStats]);

    const estEarnings = ((formativeTotal - formativePending) * 50) + ((summativeTotal - summativePending) * 150) + ((otherAssessTotal - otherAssessPending) * 30);

    const filteredLearners = useMemo(() => {
        let list = learnerStats;
        if (learnerView === 'at_risk') {
            if (riskFilter === 'active') list = list.filter(l => l.activeRiskCount > 0);
            else if (riskFilter === 'resolved') list = list.filter(l => l.activeRiskCount === 0 && l.resolvedRiskCount > 0);
            else list = list.filter(l => l.activeRiskCount > 0 || l.resolvedRiskCount > 0);
        }
        if (!searchTerm) return list;
        const t = searchTerm.toLowerCase();
        return list.filter(l => l.fullName.toLowerCase().includes(t) || l.idNumber.toLowerCase().includes(t) || l.cohortName.toLowerCase().includes(t));
    }, [learnerStats, searchTerm, learnerView, riskFilter]);

    const assessmentStatsMap = useMemo(() => {
        const map = new Map<string, {
            assessmentId: string, title: string, returned: PendingTask[], reassessments: PendingTask[], pending: PendingTask[], graded: any[]
        }>();

        pendingTasks.forEach(task => {
            if (!map.has(task.assessmentId)) map.set(task.assessmentId, { assessmentId: task.assessmentId, title: task.title, returned: [], reassessments: [], pending: [], graded: [] });
            if (task.isReturned) map.get(task.assessmentId)!.returned.push(task);
            else if (task.isReassessment) map.get(task.assessmentId)!.reassessments.push(task);
            else map.get(task.assessmentId)!.pending.push(task);
        });

        historicalTasks.forEach(task => {
            if (!map.has(task.assessmentId)) map.set(task.assessmentId, { assessmentId: task.assessmentId, title: task.title || 'Unknown Assessment', returned: [], reassessments: [], pending: [], graded: [] });
            map.get(task.assessmentId)!.graded.push(task);
        });

        return Array.from(map.values()).filter(a => a.pending.length > 0 || a.returned.length > 0 || a.reassessments.length > 0 || a.graded.length > 0);
    }, [pendingTasks, historicalTasks]);

    const filteredAssessments = useMemo(() => {
        if (assessmentFilter === 'returned') return assessmentStatsMap.filter(a => a.returned.length > 0);
        if (assessmentFilter === 'reassessments') return assessmentStatsMap.filter(a => a.reassessments.length > 0);
        if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
        return assessmentStatsMap;
    }, [assessmentStatsMap, assessmentFilter]);

    const totalReturned = assessmentStatsMap.reduce((acc, curr) => acc + curr.returned.length, 0);
    const totalReassessments = assessmentStatsMap.reduce((acc, curr) => acc + curr.reassessments.length, 0);
    const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

    const pageTitle = currentNav === 'dashboard' ? 'Marking Centre' : currentNav === 'cohorts' ? 'My Assigned Classes' : currentNav === 'coaching' ? 'Coaching & Support Schedule' : 'Compliance Profile';
    const PageIcon = currentNav === 'dashboard' ? LayoutDashboard : currentNav === 'cohorts' ? Layers : currentNav === 'coaching' ? Calendar : UserCircle;

    return (
        <div className="cdp-layout">
            <style>{`
                .lfm-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid var(--mlab-border); background: var(--mlab-white); }
                .lfm-header__title { font-family: var(--font-heading); font-size: 1rem; font-weight: 800; color: var(--mlab-blue); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px; margin: 0; }
                .lfm-body { padding: 1.5rem; background: var(--mlab-bg); }
                .lfm-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-family: var(--font-heading); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; border-radius: 0; cursor: pointer; transition: all 0.2s; }
                .lfm-btn--primary { background: var(--mlab-blue); color: var(--mlab-white); border: 1px solid var(--mlab-blue); }
                .lfm-btn--primary:hover { background: var(--mlab-midnight); border-color: var(--mlab-midnight); }
                .lfm-btn--ghost { background: transparent; color: var(--mlab-grey); border: 1px solid var(--mlab-border); }
                .lfm-btn--ghost:hover { background: var(--mlab-white); color: var(--mlab-blue); border-color: var(--mlab-blue); }
                .lfm-input { padding: 8px 12px; border: 1px solid var(--mlab-border); border-radius: 0; font-family: var(--font-body); font-size: 0.85rem; width: 100%; outline: none; }
                .lfm-input:focus { border-color: var(--mlab-blue); }

                @keyframes live-dot-ping {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { transform: scale(1.2); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                @keyframes warning-dot-ping {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.7); }
                    50% { transform: scale(1.2); box-shadow: 0 0 0 8px rgba(234, 88, 12, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); }
                }
            `}</style>

            <Sidebar
                role={store.user?.role}
                currentNav={currentNav}
                setCurrentNav={setCurrentNav as any}
                onLogout={handleLogout}
                alerts={{
                    dashboard: pendingTasks.length,
                    marking: pendingTasks.length,
                    coaching: coachingAlertCount
                }}
            />

            <main className="cdp-main">
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-blue)' }}>
                    <div className="cdp-header__left">
                        <div className="cdp-header__icon-wrap">
                            <PageIcon size={22} />
                        </div>
                        <div className="cdp-header__text">
                            <span className="cdp-header__eyebrow">Assessor Portal</span>
                            <h1 className="cdp-header__title">{pageTitle}</h1>
                            <p className="cdp-header__sub">
                                Practitioner: {store.user?.fullName || 'Unknown User'}
                                {isAdmin && <span style={{ marginLeft: '8px', background: 'var(--mlab-red)', color: 'white', padding: '2px 6px', fontSize: '0.65rem', borderRadius: '4px' }}>Admin Bypass</span>}
                            </p>
                        </div>
                    </div>
                    <div className="cdp-header__right">
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content" style={{ padding: '2rem' }}>

                    {showDiagnostics && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '1rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}><Info size={14} /> System Identity Bridge</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                                <div><strong>Auth UID:</strong> {store.user?.uid}</div>
                                <div><strong>Staff ID:</strong> {myStaffProfile?.id || 'Not Linked'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><strong>Assigned Cohort IDs:</strong> {myCohortIds.length > 0 ? myCohortIds.join(', ') : 'None'}</div>
                            </div>
                        </div>
                    )}

                    {currentNav === 'coaching' && <CoachingScheduleView />}

                    {currentNav === 'dashboard' && (
                        <div className="animate-fade-in">

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
                                <button
                                    onClick={() => setShowKPIs(!showKPIs)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        background: 'transparent', border: 'none', color: 'var(--mlab-grey)',
                                        fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
                                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
                                >
                                    {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
                                </button>
                            </div>

                            {showKPIs && (
                                <div className="animate-slide-down">
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                        <ModuleProgressCard
                                            type="Assigned Cohorts"
                                            data={{ total: 0, logged: isAdmin ? myCohorts.length : myCohorts.length, subValue: 'Active cohort allocations' }}
                                        />
                                        <ModuleProgressCard
                                            type="Total Pending Action"
                                            data={{ total: totalMarkingVolume > 0 ? totalMarkingVolume : 1, logged: pendingTasks.length, subValue: 'Submissions awaiting review' }}
                                        />
                                        <ModuleProgressCard
                                            type="Facilitator Pace"
                                            data={{ total: 0, logged: formatTimeSpent(avgFacilitatorTime), subValue: 'Facilitator clearance pace' }}
                                        />
                                        <ModuleProgressCard
                                            type="Assessor Pace"
                                            data={{ total: 0, logged: formatTimeSpent(avgAssessorTime), subValue: 'Your average turnaround' }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                        <ModuleProgressCard
                                            type="Queue Aging & SLA"
                                            orientation="landscape"
                                            data={{
                                                total: pendingTasks.length,
                                                logged: pendingTasks.length,
                                                subValue: 'SLA breakdown for pending items',
                                                lines: [
                                                    { label: `< 24 Hours (${slaUnder24})`, value: slaUnder24, total: pendingTasks.length, color: '#16a34a', bg: '#dcfce7' },
                                                    { label: `1 - 5 Days (${sla1to5})`, value: sla1to5, total: pendingTasks.length, color: '#f59e0b', bg: '#fef3c7' },
                                                    { label: `Overdue > 5 Days (${slaOver5})`, value: slaOver5, total: pendingTasks.length, color: '#dc2626', bg: '#fee2e2' }
                                                ]
                                            }}
                                        />

                                        <ModuleProgressCard
                                            type="Moderation Health"
                                            orientation="landscape"
                                            data={{
                                                total: totalModerated > 0 ? totalModerated : 1,
                                                logged: acceptedModeration,
                                                subValue: 'IQA Rejection vs Acceptance Rate',
                                                lines: [
                                                    { label: `Accepted First Time (${acceptedModeration})`, value: acceptedModeration, total: totalModerated, color: '#8b5cf6', bg: '#f3e8ff' },
                                                    { label: `Returned for Fixes (${totalReturned})`, value: totalReturned, total: totalModerated, color: '#dc2626', bg: '#fee2e2' }
                                                ]
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                        <ModuleProgressCard
                                            type="Grading by Type"
                                            orientation="landscape"
                                            data={{
                                                total: totalMarkingVolume,
                                                logged: historicalTasks.length,
                                                subValue: 'Formative vs Summative split',
                                                lines: [
                                                    {
                                                        label: `Formative (${formativeTotal > 0 ? (((formativeTotal - formativePending) / formativeTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: formativeTotal - formativePending,
                                                        total: formativeTotal, color: '#3b82f6', bg: '#eff6ff'
                                                    },
                                                    {
                                                        label: `Summative (${summativeTotal > 0 ? (((summativeTotal - summativePending) / summativeTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: summativeTotal - summativePending,
                                                        total: summativeTotal, color: '#f59e0b', bg: '#fff7ed'
                                                    },
                                                    {
                                                        label: `Other Tasks (${otherAssessTotal > 0 ? (((otherAssessTotal - otherAssessPending) / otherAssessTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: otherAssessTotal - otherAssessPending,
                                                        total: otherAssessTotal, color: '#8b5cf6', bg: '#f3e8ff'
                                                    }
                                                ].filter(l => l.total > 0)
                                            }}
                                        />

                                        <ModuleProgressCard
                                            type="Grading by Module"
                                            orientation="landscape"
                                            data={{
                                                total: totalMarkingVolume,
                                                logged: historicalTasks.length,
                                                subValue: 'QCTO Curriculum distribution',
                                                lines: [
                                                    {
                                                        label: `Knowledge (${knowTotal > 0 ? (((knowTotal - knowPending) / knowTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: knowTotal - knowPending,
                                                        total: knowTotal, color: '#16a34a', bg: '#dcfce7'
                                                    },
                                                    {
                                                        label: `Practical (${pracTotal > 0 ? (((pracTotal - pracPending) / pracTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: pracTotal - pracPending,
                                                        total: pracTotal, color: '#0ea5e9', bg: '#e0f2fe'
                                                    },
                                                    {
                                                        label: `Workplace (${workTotal > 0 ? (((workTotal - workPending) / workTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: workTotal - workPending,
                                                        total: workTotal, color: '#d97706', bg: '#fef3c7'
                                                    },
                                                    {
                                                        label: `Other Modules (${otherModTotal > 0 ? (((otherModTotal - otherModPending) / otherModTotal) * 100).toFixed(2) : '0.00'}% Graded)`,
                                                        value: otherModTotal - otherModPending,
                                                        total: otherModTotal, color: '#ec4899', bg: '#fdf2f8'
                                                    }
                                                ].filter(l => l.total > 0)
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                        <ModuleProgressCard
                                            type="First-Time Pass Rate"
                                            data={{
                                                total: reassessmentMetrics.totalEvaluatedLearners > 0 ? reassessmentMetrics.totalEvaluatedLearners : 1,
                                                logged: reassessmentMetrics.learnersPassedFirstTry,
                                                subValue: reassessmentMetrics.learnersNeededReassessment > 0
                                                    ? `${reassessmentMetrics.learnersNeededReassessment} needed reassessment`
                                                    : 'No reassessments required'
                                            }}
                                        />
                                        <ModuleProgressCard
                                            type="EISA Readiness"
                                            data={{ total: learnerStats.length > 0 ? learnerStats.length : 1, logged: eisaClearedCount, subValue: '100% Fully Compliant' }}
                                        />
                                        <ModuleProgressCard
                                            type="Estimated Earnings"
                                            data={{ total: 0, logged: `R ${estEarnings.toLocaleString()}`, subValue: 'Projected marking value' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '2rem' }}>
                                        <ModuleProgressCard
                                            type="QCTO Compliance"
                                            orientation="landscape"
                                            data={{
                                                total: totalComplianceExpected > 0 ? totalComplianceExpected : 1,
                                                logged: totalComplianceGraded,
                                                subValue: 'Progress against exact Blueprint',
                                                lines: [
                                                    {
                                                        label: `Knowledge Requirements (${qctoCompliance.knowTotal > 0 ? ((qctoCompliance.knowGraded / qctoCompliance.knowTotal) * 100).toFixed(2) : '0.00'}% Met)`,
                                                        value: qctoCompliance.knowGraded,
                                                        total: qctoCompliance.knowTotal, color: '#16a34a', bg: '#dcfce7'
                                                    },
                                                    {
                                                        label: `Practical Requirements (${qctoCompliance.pracTotal > 0 ? ((qctoCompliance.pracGraded / qctoCompliance.pracTotal) * 100).toFixed(2) : '0.00'}% Met)`,
                                                        value: qctoCompliance.pracGraded,
                                                        total: qctoCompliance.pracTotal, color: '#0ea5e9', bg: '#e0f2fe'
                                                    },
                                                    {
                                                        label: `Workplace Requirements (${qctoCompliance.workTotal > 0 ? ((qctoCompliance.workGraded / qctoCompliance.workTotal) * 100).toFixed(2) : '0.00'}% Met)`,
                                                        value: qctoCompliance.workGraded,
                                                        total: qctoCompliance.workTotal, color: '#d97706', bg: '#fef3c7'
                                                    },
                                                    {
                                                        label: `Other Requirements (${qctoCompliance.otherTotal > 0 ? ((qctoCompliance.otherGraded / qctoCompliance.otherTotal) * 100).toFixed(2) : '0.00'}% Met)`,
                                                        value: qctoCompliance.otherGraded,
                                                        total: qctoCompliance.otherTotal, color: '#ec4899', bg: '#fdf2f8'
                                                    }
                                                ].filter(l => l.total > 0)
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {!loadingTasks && assessmentStatsMap.length > 0 && (
                                <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>

                                    <div className="lfm-header" onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)} style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                            <div style={{ background: '#ea580c', color: 'white', padding: '12px', border: '1px solid #c2410c' }}>
                                                <PenTool size={24} />
                                            </div>
                                            <div>
                                                <h2 className="lfm-header__title">Grading Operations Center</h2>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>

                                                    {totalReturned > 0 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 800, background: '#fef2f2', color: '#b91c1c', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid #fca5a5' }}>
                                                            <span style={{ width: '6px', height: '6px', background: '#ef4444', animation: 'live-dot-ping 1.5s infinite' }} />
                                                            {totalReturned} QA Returned
                                                        </span>
                                                    )}

                                                    {totalReassessments > 0 && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 800, background: '#fff7ed', color: '#ea580c', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid #fdba74' }}>
                                                            <span style={{ width: '6px', height: '6px', background: '#ea580c', animation: 'warning-dot-ping 1.5s infinite' }} />
                                                            {totalReassessments} Reassessments
                                                        </span>
                                                    )}

                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', padding: '2px 8px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
                                                        <Clock size={10} /> {totalPending} Initial Submissions
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ color: 'var(--mlab-blue)' }}>
                                            {isAssessmentsExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                        </div>
                                    </div>

                                    {isAssessmentsExpanded && (
                                        <div className="lfm-body animate-slide-down">

                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
                                                <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
                                                <button onClick={() => setAssessmentFilter('returned')} className={`lfm-btn ${assessmentFilter === 'returned' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>QA Returned Only</button>
                                                <button onClick={() => setAssessmentFilter('reassessments')} className={`lfm-btn ${assessmentFilter === 'reassessments' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Reassessments Only</button>
                                                <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Initial Submissions Only</button>
                                            </div>

                                            {filteredAssessments.length === 0 ? (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-white)' }}>
                                                    No assessments match this filter.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                    {filteredAssessments.map(exam => {
                                                        const isExpanded = expandedAssessments.has(exam.assessmentId);
                                                        const hasReturned = exam.returned.length > 0;
                                                        const hasReassessments = exam.reassessments.length > 0;
                                                        const hasPending = exam.pending.length > 0;
                                                        const hasGraded = exam.graded.length > 0;

                                                        return (
                                                            <div key={exam.assessmentId} className="animate-fade-in" style={{
                                                                background: 'var(--mlab-white)',
                                                                border: hasReturned ? '2px solid #fca5a5' : hasReassessments ? '2px solid #fdba74' : hasPending ? '2px solid #bfdbfe' : '2px solid var(--mlab-border)',
                                                            }}>
                                                                <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                                                                        <div style={{ color: hasReturned ? '#ef4444' : hasReassessments ? '#ea580c' : hasPending ? '#3b82f6' : 'var(--mlab-grey)' }}>
                                                                            <BookOpen size={20} />
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                            <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
                                                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                                {hasReturned && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: '#b91c1c', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid #fca5a5' }}>
                                                                                        <span style={{ width: '6px', height: '6px', background: '#ef4444', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                        {exam.returned.length} Returned (Action Reqd)
                                                                                    </span>
                                                                                )}
                                                                                {hasReassessments && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fff7ed', color: '#c2410c', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid #fdba74' }}>
                                                                                        <RotateCcw size={10} /> {exam.reassessments.length} Reassessments
                                                                                    </span>
                                                                                )}
                                                                                {hasPending && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid var(--mlab-border)' }}>
                                                                                        <Clock size={10} /> {exam.pending.length} Initial Submissions
                                                                                    </span>
                                                                                )}
                                                                                {hasGraded && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', textTransform: 'uppercase', border: '1px solid var(--mlab-green)' }}>
                                                                                        <CheckCircle2 size={10} /> {exam.graded.length} Graded
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ color: 'var(--mlab-blue)' }}>
                                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                                    </div>
                                                                </div>

                                                                {isExpanded && (
                                                                    <div style={{ padding: '1.5rem', background: 'var(--mlab-bg)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                                                                        {/* 1. Returned Submissions */}
                                                                        {exam.returned.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Urgent Fixes (Moderator Returned)</h4>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {exam.returned.map(task => (
                                                                                        <div key={task.id} style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #ef4444', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                                                            <div>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                                    <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{task.learnerName}</span>
                                                                                                    <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', border: '1px solid #fca5a5' }}>Mod. Returned</span>
                                                                                                </div>
                                                                                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                    <FileText size={12} /> {task.title}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                                <button className="lfm-btn lfm-btn--ghost" onClick={() => navigate(`/portfolio/${task.learnerId}`)}><Layers size={14} /> Portfolio</button>
                                                                                                <button className="lfm-btn" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5' }} onClick={() => navigate(`/portfolio/submission/${task.id}`)}><AlertTriangle size={14} /> Fix Return</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* 2. Reassessments */}
                                                                        {exam.reassessments.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Learner Reassessments & Appeals</h4>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {exam.reassessments.map(task => (
                                                                                        <div key={task.id} style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #ea580c', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                                                            <div>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                                    <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{task.learnerName}</span>
                                                                                                    <span style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', border: '1px solid #fdba74' }}>Att. #{task.attempt || 2}</span>
                                                                                                </div>
                                                                                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                    <Clock size={12} /> Resubmitted: {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                                <button className="lfm-btn lfm-btn--ghost" onClick={() => navigate(`/portfolio/${task.learnerId}`)}><Layers size={14} /> Portfolio</button>
                                                                                                <button className="lfm-btn" style={{ background: '#ea580c', color: 'white', border: '1px solid #c2410c' }} onClick={() => navigate(`/portfolio/submission/${task.id}`)}><RotateCcw size={14} /> Grade Attempt</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* 3. Pending Submissions */}
                                                                        {exam.pending.length > 0 && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Initial Submissions (Awaiting Marking)</h4>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {exam.pending.map(task => (
                                                                                        <div key={task.id} style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                                                            <div>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                                    <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{task.learnerName}</span>
                                                                                                </div>
                                                                                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> Pre-Mark: {task.facilitatorName}</span>
                                                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {new Date(task.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                                <button className="lfm-btn lfm-btn--ghost" onClick={() => navigate(`/portfolio/${task.learnerId}`)}><Layers size={14} /> Portfolio</button>
                                                                                                <button className="lfm-btn lfm-btn--primary" onClick={() => navigate(`/portfolio/submission/${task.id}`)}><PenTool size={14} /> Grade Now</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* 4. Recently Graded */}
                                                                        {hasGraded && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: (hasReturned || hasReassessments || hasPending) ? '1rem' : '0' }}>
                                                                                <h4 style={{ margin: '0 0 5px 0', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-green-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recently Graded (Completed)</h4>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {exam.graded.map((task: any) => {
                                                                                        const learnerDetails = store.learners.find(l => l.id === task.actualLearnerId);
                                                                                        const displayLearnerName = learnerDetails?.fullName || task.learnerDeclaration?.learnerName || 'Unknown Learner';

                                                                                        return (
                                                                                            <div key={task.id} style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', opacity: 0.85 }}>
                                                                                                <div>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                                        <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{displayLearnerName}</span>
                                                                                                        <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', border: '1px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={10} /> Graded</span>
                                                                                                    </div>
                                                                                                    <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                        <Clock size={12} /> Graded: {new Date(task.grading?.assessorGradedAt || task.updatedAt || new Date()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                                                    <button className="lfm-btn lfm-btn--ghost" onClick={() => navigate(`/portfolio/${task.actualLearnerId || task.learnerId}`)}><Layers size={14} /> Portfolio</button>
                                                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }} onClick={() => navigate(`/portfolio/submission/${task.id}`)}><Eye size={14} /> Review Marking</button>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!loadingTasks && assessmentStatsMap.length === 0 && (
                                <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', marginBottom: '2rem' }}>
                                    <CheckCircle size={44} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
                                    <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>All Caught Up</h3>
                                    <p style={{ fontFamily: 'var(--font-body)', margin: 0 }}>No submissions are currently waiting for your review.</p>
                                    {!isAdmin && myCohortIds.length === 0 && (
                                        <p style={{ marginTop: '1rem', color: '#b91c1c', fontSize: '0.85rem' }}>You are not assigned to any cohorts. Contact an administrator.</p>
                                    )}
                                </div>
                            )}

                            {loadingTasks && (
                                <div style={{ border: '2px solid var(--mlab-border)', background: 'var(--mlab-white)', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', marginBottom: '2rem' }}>
                                    <Loader2 size={32} className="lfm-spin" style={{ margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
                                    <p style={{ fontFamily: 'var(--font-body)', margin: 0 }}>Loading marking queue...</p>
                                </div>
                            )}

                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 className="lfm-header__title"><Users size={18} /> Learner Progress Overview</h2>

                                    <div style={{ position: 'relative', width: '250px' }}>
                                        <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            className="lfm-input"
                                            placeholder="Search learners..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '32px' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', padding: '0 1.5rem' }}>
                                    <button
                                        onClick={() => setLearnerView('all')}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                                            padding: '12px 24px',
                                            background: learnerView === 'all' ? 'var(--mlab-white)' : 'transparent',
                                            color: learnerView === 'all' ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
                                            border: '1px solid var(--mlab-border)',
                                            borderBottom: learnerView === 'all' ? '1px solid var(--mlab-white)' : '1px solid var(--mlab-border)',
                                            borderTop: learnerView === 'all' ? '3px solid var(--mlab-blue)' : '1px solid transparent',
                                            marginBottom: '-1px',
                                            marginTop: '12px',
                                            marginRight: '8px',
                                            fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Users size={14} /> All Assigned Learners
                                    </button>
                                    <button
                                        onClick={() => { setLearnerView('at_risk'); setRiskFilter('all'); }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                                            padding: '12px 24px',
                                            background: learnerView === 'at_risk' ? 'var(--mlab-white)' : 'transparent',
                                            color: learnerView === 'at_risk' ? '#ef4444' : 'var(--mlab-grey)',
                                            border: '1px solid var(--mlab-border)',
                                            borderBottom: learnerView === 'at_risk' ? '1px solid var(--mlab-white)' : '1px solid var(--mlab-border)',
                                            borderTop: learnerView === 'at_risk' ? '3px solid #ef4444' : '1px solid transparent',
                                            marginBottom: '-1px',
                                            marginTop: '12px',
                                            fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <ShieldAlert size={14} /> At-Risk / Intervention Hub
                                    </button>
                                </div>

                                {learnerView === 'at_risk' && (
                                    <div className="animate-fade-in" style={{ display: 'flex', gap: '8px', background: 'var(--mlab-bg)', padding: '10px 1.5rem', borderBottom: '1px solid var(--mlab-border)', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '8px' }}>Risk Status:</span>

                                        <button
                                            onClick={() => setRiskFilter('all')}
                                            className={`lfm-btn ${riskFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}
                                            style={{ padding: '4px 12px', fontSize: '0.7rem', borderRadius: '16px' }}
                                        >
                                            Show All Flagged
                                        </button>

                                        <button
                                            onClick={() => setRiskFilter('active')}
                                            className="lfm-btn"
                                            style={{ background: riskFilter === 'active' ? '#ef4444' : 'var(--mlab-white)', color: riskFilter === 'active' ? 'white' : '#ef4444', border: `1px solid ${riskFilter === 'active' ? '#ef4444' : '#fca5a5'}`, padding: '4px 12px', borderRadius: '16px', fontSize: '0.7rem' }}
                                        >
                                            <span style={{ width: '6px', height: '6px', background: riskFilter === 'active' ? 'white' : '#ef4444', borderRadius: '50%' }} /> Active Issues
                                        </button>

                                        <button
                                            onClick={() => setRiskFilter('resolved')}
                                            className="lfm-btn"
                                            style={{ background: riskFilter === 'resolved' ? '#f59e0b' : 'var(--mlab-white)', color: riskFilter === 'resolved' ? 'white' : '#d97706', border: `1px solid ${riskFilter === 'resolved' ? '#f59e0b' : '#fcd34d'}`, padding: '4px 12px', borderRadius: '16px', fontSize: '0.7rem' }}
                                        >
                                            <span style={{ width: '6px', height: '6px', background: riskFilter === 'resolved' ? 'white' : '#f59e0b', borderRadius: '50%' }} /> Monitoring (Resolved)
                                        </button>
                                    </div>
                                )}

                                <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
                                    <table className="mlab-table" style={{ border: 'none', margin: 0 }}>
                                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                            <tr>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Learner Name</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Class</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Assessor Progress</th>
                                                {learnerView === 'at_risk' && <th style={{ color: 'var(--mlab-grey)' }}>Risk Factors & History</th>}
                                                <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={learnerView === 'at_risk' ? 5 : 4} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        {learnerView === 'at_risk'
                                                            ? (riskFilter === 'active' ? 'Great news! No learners currently have active reassessments or returns.' : 'No learners found matching this risk profile.')
                                                            : 'No learners found in your assigned cohorts.'}
                                                    </td>
                                                </tr>
                                            ) : filteredLearners.map(l => {
                                                const pct = l.totalAssessments > 0 ? (l.completedAssessments / l.totalAssessments) * 100 : 0;
                                                const isDone = l.completedAssessments === l.totalAssessments && l.totalAssessments > 0;
                                                const totalFlags = l.activeRiskCount + l.resolvedRiskCount;

                                                return (
                                                    <tr key={l.id} style={{ background: learnerView === 'at_risk' ? (l.activeRiskCount > 0 ? '#fef2f2' : '#fffbeb') : 'var(--mlab-white)' }}>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: learnerView === 'at_risk' ? (l.activeRiskCount > 0 ? '2px solid #ef4444' : '2px solid #f59e0b') : '2px solid var(--mlab-blue)' }}>
                                                                    {l.fullName.charAt(0)}
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{l.fullName}</span>
                                                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.idNumber}</span>

                                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                                        {l.needsGrading > 0 && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}><Clock size={10} /> {l.needsGrading} To Grade</span>
                                                                        )}

                                                                        {l.coachingState?.status === 'upcoming' && (
                                                                            <span
                                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bae6fd', cursor: 'pointer' }}
                                                                                onClick={(e) => { e.stopPropagation(); setCurrentNav('coaching'); }}
                                                                                title="Click to view schedule"
                                                                            >
                                                                                <Video size={10} /> Upcoming Session
                                                                            </span>
                                                                        )}

                                                                        {l.coachingState?.status === 'pending_notes' && (
                                                                            <span
                                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ffedd5', color: '#c2410c', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fed7aa', cursor: 'pointer' }}
                                                                                onClick={(e) => { e.stopPropagation(); setCurrentNav('coaching'); }}
                                                                                title="Click to resolve pending coaching notes"
                                                                            >
                                                                                <FileText size={10} /> Pending Notes
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>{l.cohortName}</span></td>
                                                        <td>
                                                            <div style={{ width: '100%', maxWidth: '200px' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', marginBottom: '4px' }}>
                                                                    <span>Progress</span>
                                                                    <span>{l.completedAssessments} / {l.totalAssessments}</span>
                                                                </div>
                                                                <div style={{ height: '6px', background: 'var(--mlab-border)', width: '100%' }}>
                                                                    <div style={{ height: '100%', width: `${pct}%`, background: isDone ? 'var(--mlab-green)' : 'var(--mlab-blue)' }} />
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {learnerView === 'at_risk' && (
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 800, color: l.activeRiskCount > 0 ? '#b91c1c' : '#b45309', textTransform: 'uppercase' }}>
                                                                        {totalFlags} Historical Flag(s):
                                                                    </span>
                                                                    {l.flaggedAssessments.map((flag, idx) => (
                                                                        <div key={idx} style={{
                                                                            fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '6px',
                                                                            color: flag.isActive ? '#991b1b' : '#78350f',
                                                                            background: flag.isActive ? 'var(--mlab-white)' : '#fdf8f6',
                                                                            border: `1px solid ${flag.isActive ? '#fca5a5' : '#fcd34d'}`,
                                                                            padding: '3px 8px'
                                                                        }}>
                                                                            {flag.isActive ? <AlertTriangle size={12} color="#ef4444" /> : <Eye size={12} color="#f59e0b" />}
                                                                            <strong style={{ whiteSpace: 'nowrap' }}>[{flag.status}]</strong>
                                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{flag.title}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        )}

                                                        <td style={{ textAlign: 'right' }}>
                                                            <button
                                                                className="lfm-btn lfm-btn--ghost"
                                                                style={{ padding: '6px 10px', fontSize: '0.7rem', color: learnerView === 'at_risk' ? (l.activeRiskCount > 0 ? '#ef4444' : '#d97706') : 'var(--mlab-blue)', borderColor: learnerView === 'at_risk' ? (l.activeRiskCount > 0 ? '#fca5a5' : '#fcd34d') : 'var(--mlab-border)' }}
                                                                onClick={() => navigate(`/portfolio/${l.enrollmentId}`)}
                                                            >
                                                                View PoE History <ChevronRight size={13} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentNav === 'cohorts' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}><Layers size={18} /> Assigned Cohorts</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {myCohorts.map(cohort => {
                                    const isBootcamp = (cohort as any).type === 'bootcamp' || (cohort as any).isBootcamp === true;

                                    return (
                                        <div key={cohort.id} className="mlab-cohort-card animate-fade-in">
                                            <div className="mlab-cohort-card__header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
                                                    {isBootcamp && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fde68a' }}>
                                                            <Zap size={10} /> Bootcamp
                                                        </span>
                                                    )}
                                                    <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', border: '1px solid var(--mlab-green)', borderRadius: '4px' }}>Assessing</span>
                                                </div>
                                            </div>

                                            <div className="mlab-cohort-card__dates">
                                                <Calendar size={14} />
                                                <span>{cohort.startDate} — {cohort.endDate}</span>
                                            </div>

                                            <div className="mlab-role-row-stack">
                                                <div className="mlab-role-row">
                                                    <div className="mlab-role-dot mlab-role-dot--blue" />
                                                    <span className="mlab-role-label">Facilitator:</span>
                                                    <span className="mlab-role-name">{getFacilitatorName(cohort.facilitatorId)}</span>
                                                </div>
                                                <div className="mlab-role-row">
                                                    <div className="mlab-role-dot mlab-role-dot--red" />
                                                    <span className="mlab-role-label">Assessor:</span>
                                                    <span className="mlab-role-name">Me</span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', marginTop: 16 }}>
                                                <button className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                                    View Portfolios <ArrowRight size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {myCohorts.length === 0 && (
                                    <div className="mlab-cohort-empty" style={{ gridColumn: '1 / -1', margin: '2rem 0' }}>
                                        <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                        <p className="mlab-cohort-empty__title">No Cohorts Assigned</p>
                                        <p className="mlab-cohort-empty__desc">No cohorts were found linked to your account IDs.</p>
                                        <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowDiagnostics(true)}>Run ID Diagnostics</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {currentNav === 'profile' && (
                        <AssessorProfileView profile={store.user} user={store.user} onUpdate={store.updateStaffProfile} />
                    )}

                </div>
            </main>
        </div>
    );
};