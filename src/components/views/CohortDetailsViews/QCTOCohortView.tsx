// src/components/views/CohortsView/QCTOCohortView.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, DownloadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
    Layers, ChevronUp, ChevronDown, Sparkles,
    Edit3, X, PenTool, FileText, CheckCircle,
    Loader2, RefreshCcw, BookOpen, Filter,
    ChevronRight, History, Award, ShieldCheck,
    HelpCircle, Star, Eye, MapPin, Link as LinkIcon,
    Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
import type { DashboardLearner } from '../../../types';

import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
import { LearnerDropoutModal } from './LearnerDropoutModal';
import { AILessonPlanModal } from './AILessonPlanModal';
import moment from 'moment';
import { StipendExportModal } from '../../common/StipendExportModal/StipendExportModal';

const formatQCTODate = (d?: string) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
};

const getDOBFromID = (id: string) => {
    const clean = String(id || '').replace(/\s/g, '');
    if (clean.length !== 13) return '';
    try {
        let y = parseInt(clean.substring(0, 2), 10);
        const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
        y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
        return `${y}${m}${d2}`;
    } catch { return ''; }
};

const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

const getTimestampMs = (val: any): number => {
    if (!val) return 0;
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    if (val?.seconds) return val.seconds * 1000;
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
};

const formatLastLogin = (lastLoginAt: any): string => {
    const ms = getTimestampMs(lastLoginAt);
    if (!ms) return 'Never';

    const date = new Date(ms);
    return date.toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const ModuleChip: React.FC<{label: string, count: number, variant: 'k'|'p'|'w'}> = ({ label, count, variant }) => (
    <span className={`cdp-chip cdp-chip--${variant}`} style={{ borderRadius: 0 }}>{label}: {count}</span>
);

export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

    const { user, learners, staff, employers, settings, programmes } = useStore();

    // Sync Active Tab with URL Params (Includes 'surveys')
    const urlTab = searchParams.get('tab');
    const activeTab = (urlTab === 'curriculum' || urlTab === 'calendar' || urlTab === 'attendance' || urlTab === 'surveys') 
        ? urlTab 
        : 'learners'; 

    const setActiveTab = (tab: 'learners' | 'curriculum' | 'calendar' | 'attendance' | 'surveys') => {
        setSearchParams((prev) => {
            prev.set('tab', tab);
            prev.delete('expanded');
            return prev;
        }, { replace: true });
    };

    const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGrantingTime, setIsGrantingTime] = useState(false);
    const [isLogging, setIsLogging] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    
    const [showKPIs, setShowKPIs] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

    const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);

    const [submissions, setSubmissions] = useState<any[]>([]);
    const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
    const [sessionReports, setSessionReports] = useState<any[]>([]);
    const [editingReport, setEditingReport] = useState<any | null>(null);

    // COHORT SURVEY & FEEDBACK STATES
    const [cohortSurveyResponses, setCohortSurveyResponses] = useState<any[]>([]);
    const [surveyTemplates, setSurveyTemplates] = useState<any[]>([]);
    const [viewingSurveyResponse, setViewingSurveyResponse] = useState<any | null>(null);
    const [surveySearchQuery, setSurveySearchQuery] = useState('');

    const urlExpanded = searchParams.get('expanded');
    const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

    const toggleModuleAccordion = (moduleCode: string) => {
        setSearchParams((prev) => {
            const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);
            if (current.has(moduleCode)) current.delete(moduleCode);
            else current.add(moduleCode);
            
            if (current.size > 0) prev.set('expanded', Array.from(current).join(','));
            else prev.delete('expanded');
            
            return prev;
        }, { replace: true });
    };

    const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
    const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

    const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);

    const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
    const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
    const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

    const [holidays, setHolidays] = useState<string[]>([]);
    const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

    useEffect(() => {
        const fetchHolidays = async () => {
            const currentYear = new Date().getFullYear();
            const cacheKey = `holidays_za_${currentYear}`;
            const cached = localStorage.getItem(cacheKey);

            if (cached) {
                setHolidays(JSON.parse(cached));
            } else {
                try {
                    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
                    if (res.ok) {
                        const data = await res.json();
                        const dateList = data.map((h: any) => h.date);
                        setHolidays(dateList);
                        localStorage.setItem(cacheKey, JSON.stringify(dateList));
                    }
                } catch (e) {
                    console.warn("Holiday API unreachable for analytics.");
                }
            }
        };
        fetchHolidays();
    }, []);

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
        const unsub = onSnapshot(q, snap => {
            setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [cohort?.id]);

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLiveEnrollments(results);
        });
        return () => unsubscribe();
    }, [cohort.id]);

    // LISTEN TO COHORT SURVEY RESPONSES & ALL SURVEY TEMPLATES
    useEffect(() => {
        if (!cohort?.id) return;

        const qResponses = query(collection(db, 'survey_responses'), where('cohortId', '==', cohort.id));
        const unsubResponses = onSnapshot(qResponses, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
            setCohortSurveyResponses(list);
        });

        const unsubSurveys = onSnapshot(collection(db, 'surveys'), (snap) => {
            setSurveyTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubResponses();
            unsubSurveys();
        };
    }, [cohort?.id]);

    const cohortTargetedSurveys = useMemo(() => {
        return surveyTemplates.filter(s => {
            if (s.isActive === false) return false;
            const cIds = s.cohortIds || [];
            return cIds.length === 0 || cIds.includes('ALL') || cIds.includes(cohort.id);
        });
    }, [surveyTemplates, cohort?.id]);

    const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
    const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
    const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

    const toggleAssessmentAccordion = (id: string) => {
        setExpandedAssessments(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);
    const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

    const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

    const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin === true;
    const isFacilitator = user?.role === 'facilitator';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    const activeProgramme = useMemo(() => {
        if (!cohort || !programmes.length) return null;
        const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
        if (!templateId) return null;
        return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
    }, [cohort, programmes]);

    const groupedCurriculum = useMemo(() => {
        if (!activeProgramme) return {};
        const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
        const extractItems = (modules: any[], type: string) => {
            (modules || []).forEach(mod => {
                const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
                const modCode = mod.code || 'General';
                if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
                subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
            });
        };
        extractItems(activeProgramme.knowledgeModules, 'Knowledge');
        extractItems(activeProgramme.practicalModules, 'Practical');
        extractItems(activeProgramme.workExperienceModules, 'Workplace');
        return groups;
    }, [activeProgramme]);

    const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

    const groupedHistoryLogs = useMemo(() => {
        const groups: Record<string, any[]> = {};
        curriculumLogs.forEach(log => {
            const modCode = log.moduleCode || 'Uncategorized';
            if (!groups[modCode]) groups[modCode] = [];
            groups[modCode].push(log);
        });
        return groups;
    }, [curriculumLogs]);

    const moduleProgress = useMemo(() => {
        const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
        Object.values(groupedCurriculum).forEach(group => {
            const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
            if (stats[type]) {
                stats[type].total += group.items.length;
                stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
            }
        });
        return stats;
    }, [groupedCurriculum, curriculumLogs]);

    const enrolledLearners = useMemo(() => {
        const merged: DashboardLearner[] = [];

        liveEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) {
                merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });
        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, liveEnrollments, cohort.id]);

    // 🚀 FIXED: String type casting for status checks to satisfy TS2367
    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped' && (l.status as string) !== 'withdrawn' && !l.isArchived).length;

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setDailyRegisters(regs);
        });
        return () => unsubscribe();
    }, [cohort.id]);

    const rosterAttendanceMap = useMemo(() => {
        const map = new Map<string, { attended: number; total: number; pct: number }>();
        const totalSessions = dailyRegisters.length;

        enrolledLearners.forEach(l => {
            if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
        });

        dailyRegisters.forEach(reg => {
            const present = reg.presentLearners || [];
            present.forEach((idNum: string) => {
                if (map.has(idNum)) {
                    map.get(idNum)!.attended += 1;
                }
            });
        });

        map.forEach(value => {
            value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
        });

        return map;
    }, [dailyRegisters, enrolledLearners]);

    const cohortDemographics = useMemo(() => {
        let blackCount = 0, colouredCount = 0, indianCount = 0, whiteCount = 0, otherCount = 0;
        let youthCount = 0;

        enrolledLearners.forEach(l => {
            const eq = ((l as any).equityGroup || l.demographics?.equityCode || '').trim().toLowerCase();
            if (eq.includes('african') || eq === 'black' || eq === 'ba') blackCount++;
            else if (eq.includes('coloured') || eq === 'bc') colouredCount++;
            else if (eq.includes('indian') || eq === 'bi') indianCount++;
            else if (eq.includes('white') || eq === 'wh') whiteCount++;
            else otherCount++;

            let isYouth = true;
            if (l.idNumber && l.idNumber.length >= 6) {
                const yearNum = parseInt(l.idNumber.substring(0, 2), 10);
                const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
                const age = new Date().getFullYear() - birthYear;
                if (age > 35) isYouth = false;
            } else if ((l.demographics as any)?.youthStatus === 'N') {
                isYouth = false;
            }
            if (isYouth) youthCount++;
        });

        return { blackCount, colouredCount, indianCount, whiteCount, otherCount, youthCount, total: enrolledLearners.length };
    }, [enrolledLearners]);

    const attendanceHealth = useMemo(() => {
        let high = 0, mid = 0, low = 0;
        enrolledLearners.forEach(l => {
            const stats = rosterAttendanceMap.get(l.idNumber || '');
            const pct = stats ? stats.pct : 0;
            if (pct >= 75) high++;
            else if (pct >= 40) mid++;
            else low++;
        });
        return { high, mid, low, total: enrolledLearners.length };
    }, [enrolledLearners, rosterAttendanceMap]);

    // 🚀 FIXED: String type casting for status checks in filter logic
    const filteredLearners = useMemo(() => {
        return enrolledLearners.filter(learner => {
            const searchLower = searchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped' && (learner.status as string) !== 'withdrawn') ||
                (statusFilter === 'dropped' && (learner.status === 'dropped' || (learner.status as string) === 'withdrawn'));

            const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
            let matchesAttendance = true;
            if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
            else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
            else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

            return matchesSearch && matchesStatus && matchesAttendance;
        });
    }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

    // 🚀 WIRED UP: Filtered Daily Registers for Tab 4
    const filteredDailyRegisters = useMemo(() => {
        if (ledgerDates.length === 0) return dailyRegisters;
        return dailyRegisters.filter(reg => ledgerDates.includes(reg.date));
    }, [dailyRegisters, ledgerDates]);

    // 🚀 WIRED UP: Date handlers for Tab 4 Ledger Filters
    const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        if (date && !ledgerDates.includes(date)) {
            setLedgerDates([...ledgerDates, date]);
        }
    };

    const removeLedgerDate = (dateToRemove: string) => {
        setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
    };

    const fetchSubmissions = async () => {
        try {
            const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('Error fetching submissions:', e); }
    };

    useEffect(() => {
        fetchSubmissions();
        const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
        const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
        const unsubReports = onSnapshot(reportsQ, (snap) => {
            const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
            setSessionReports(reps);
        });
        return () => { unsubLogs(); unsubReports(); };
    }, [cohort.id]);

    const filteredSurveyResponses = useMemo(() => {
        if (!surveySearchQuery.trim()) return cohortSurveyResponses;
        const lower = surveySearchQuery.toLowerCase().trim();
        return cohortSurveyResponses.filter(r => 
            (r.learnerName || '').toLowerCase().includes(lower) ||
            (r.learnerEmail || '').toLowerCase().includes(lower)
        );
    }, [cohortSurveyResponses, surveySearchQuery]);

    const cohortSurveyMetrics = useMemo(() => {
        const totalSubmissions = cohortSurveyResponses.length;
        const completionRate = activeCount > 0 ? Math.round((totalSubmissions / activeCount) * 100) : 0;
        
        let starRatingSum = 0;
        let starRatingCount = 0;

        cohortSurveyResponses.forEach(r => {
            Object.values(r.answers || {}).forEach((val: any) => {
                if (typeof val === 'number' && val <= 5) {
                    starRatingSum += val;
                    starRatingCount++;
                }
            });
        });

        const avgScore = starRatingCount > 0 ? (starRatingSum / starRatingCount).toFixed(1) : 'N/A';

        return { totalSubmissions, completionRate, avgScore };
    }, [cohortSurveyResponses, activeCount]);

    const handleDeleteCohortResponse = async (id: string) => {
        if (!window.confirm("Delete this survey response permanently?")) return;
        try {
            await deleteDoc(doc(db, 'survey_responses', id));
            toast.success("Response deleted successfully.");
        } catch {
            toast.error("Failed to delete response.");
        }
    };

    const handleCopySurveyLink = (surveyId: string) => {
        const publicUrl = `${window.location.origin}/survey/${surveyId}`;
        navigator.clipboard.writeText(publicUrl);
        toast.success("Public survey link copied to clipboard!");
    };

    const exportCohortSurveyExcel = () => {
        if (cohortSurveyResponses.length === 0) return toast.warning("No survey responses available to export.");

        const rows = cohortSurveyResponses.map(r => {
            const template = surveyTemplates.find(s => s.id === r.surveyId);
            const questionMap = new Map<string, string>();
            template?.questions?.forEach((q: any) => questionMap.set(q.id, q.label));

            const flattenedAnswers: Record<string, any> = {};
            Object.entries(r.answers || {}).forEach(([qId, val]) => {
                const label = questionMap.get(qId) || qId;
                if (val && typeof val === 'object' && 'formattedAddress' in val) {
                    flattenedAnswers[`${label} - Address`] = val.formattedAddress || '';
                    flattenedAnswers[`${label} - City`] = val.city || '';
                } else {
                    flattenedAnswers[label] = val;
                }
            });

            return {
                "Response ID": r.id,
                "Participant": r.learnerName || 'Anonymous',
                "Email": r.learnerEmail || 'N/A',
                "Survey Title": template?.title || r.surveyId,
                "Submitted At": new Date(r.submittedAt).toLocaleString('en-ZA'),
                ...flattenedAnswers
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cohort Feedback");
        XLSX.writeFile(wb, `Cohort_Feedback_${cohort.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
        toast.success("Cohort feedback exported!");
    };

    const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
    const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
    const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
    const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

    const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string, sessionDateStr?: string) => {
        const finalDate = sessionDateStr || new Date().toISOString().split('T')[0];
        const finalTimestamp = `${finalDate}T12:00:00.000Z`;

        if (isEdit && reportId) {
            setIsLogging(true);
            try {
                const batch = writeBatch(db);

                batch.update(doc(db, 'session_reports', reportId), {
                    reportHtml: planHtml,
                    evidenceLinks,
                    dateLogged: finalTimestamp,
                    sessionDate: finalDate,
                    lastEditedAt: new Date().toISOString(),
                    lastEditedBy: user?.uid
                });

                const logsQ = query(collection(db, 'curriculum_logs'), where('sessionReportId', '==', reportId));
                const logsSnap = await getDocs(logsQ);
                logsSnap.forEach(logDoc => {
                    batch.update(logDoc.ref, {
                        coveredAt: finalDate
                    });
                });

                await batch.commit();
                toast.success("Session report updated successfully.");
                setShowAIModal(false);
                setEditingReport(null);
            } catch (error) {
                toast.error("Failed to update report.");
            } finally {
                setIsLogging(false);
            }
        } else {
            const selectedTopicIds = Object.keys(selectedTopics);
            if (selectedTopicIds.length === 0) return;
            setShowAIModal(false);
            setIsLogging(true);
            try {
                const batch = writeBatch(db);
                const now = new Date();
                const reportRef = doc(collection(db, 'session_reports'));

                batch.set(reportRef, {
                    cohortId: cohort.id,
                    facilitatorId: user?.uid,
                    facilitatorName: user?.fullName,
                    facilitatorSignatureUrl: user?.signatureUrl || null,
                    dateLogged: finalTimestamp,
                    sessionDate: finalDate,
                    reportHtml: planHtml,
                    evidenceLinks,
                    topicsCovered: selectedTopicIds
                });

                selectedTopicIds.forEach(topicId => {
                    const itemDef = curriculumItems.find(i => i.id === topicId);
                    if (!itemDef) return;
                    const coveredDateStr = selectedTopics[topicId] || finalDate;

                    batch.set(doc(collection(db, 'curriculum_logs')), {
                        cohortId: cohort.id,
                        topicId: itemDef.id,
                        topicCode: itemDef.code,
                        topicTitle: itemDef.title,
                        moduleCode: itemDef.moduleCode,
                        moduleName: itemDef.moduleName,
                        moduleType: itemDef.moduleType,
                        coveredAt: coveredDateStr,
                        loggedAt: now.toISOString(),
                        deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
                        loggedBy: user?.uid,
                        loggedByName: user?.fullName,
                        sessionReportId: reportRef.id,
                        acknowledgedBy: [],
                        penalizeLearners: []
                    });
                });

                await batch.commit();
                setSelectedTopics({});
                showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
            } catch (error) {
                showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
            } finally {
                setIsLogging(false);
            }
        }
    };

    const assessmentStatsMap = useMemo(() => {
        const map = new Map<string, {
            assessmentId: string,
            title: string,
            writing: any[],
            pending: any[],
            graded: any[],
            learnerNamesWriting: string[]
        }>();

        submissions.forEach(s => {
            if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

            if (!map.has(s.assessmentId)) {
                map.set(s.assessmentId, {
                    assessmentId: s.assessmentId,
                    title: s.title || 'Unknown Assessment',
                    writing: [], pending: [], graded: [], learnerNamesWriting: []
                });
            }

            const entry = map.get(s.assessmentId)!;

            if (s.status === 'in_progress') {
                entry.writing.push(s);
                const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
                if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
            } else if (s.status === 'submitted') {
                entry.pending.push(s);
            } else if (s.status === 'graded' || s.status === 'moderated') {
                entry.graded.push(s);
            }
        });

        return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
    }, [submissions, enrolledLearners]);

    const filteredAssessments = useMemo(() => {
        if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
        if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
        return assessmentStatsMap;
    }, [assessmentStatsMap, assessmentFilter]);

    const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
    const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

    const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
        if (subsToUpdate.length === 0) return;
        if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);
            subsToUpdate.forEach(sub => {
                batch.update(doc(db, 'learner_submissions', sub.id), {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });
            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
            await fetchSubmissions();
        } catch (error) {
            toast.error("Failed to grant extra time.");
        } finally {
            setIsGrantingTime(false);
        }
    };

    const handleQCTOExport = async () => {
        if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
        setIsExporting(true);
        try {
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
            const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const todayQCTO = formatQCTODate(new Date().toISOString());

            const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

            const dataRows = [headers.map(createTextCell)];
            enrolledLearners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
                dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();
            const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
            XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
            const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success(`Export successful: ${fileName}`);
        } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
    };

    const syncLearnerWorkbooks = async () => {
        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            const aRef = collection(db, 'assessments');
            const [snapA, snapS] = await Promise.all([
                getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
                getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
            ]);
            const allAssessments = new Map<string, any>();
            snapA.docs.forEach(d => allAssessments.set(d.id, d));
            snapS.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

            // 🚀 FIXED: String casting for withdrawn check
            const activeLearnersToSync = enrolledLearners.filter(l => l.status !== 'dropped' && (l.status as string) !== 'withdrawn' && !l.isArchived);

            let count = 0;
            for (const learner of activeLearnersToSync) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;
                for (const [astId, astDoc] of allAssessments.entries()) {
                    const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.learnerId === humanId));
                    if (!exists) {
                        const data = astDoc.data();
                        batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
                        count++;
                    }
                }
            }
            if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
            else toast.success('All active learners are synced.');
        } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
    };

    const getStaffName = async (id: string) => {
        const cachedStaff = useStore.getState().staff;
        const match = cachedStaff.find(s => s.id === id);
        if (match) return match.fullName;

        try {
            const userSnap = await getDoc(doc(db, 'users', id));
            if (userSnap.exists()) return userSnap.data().fullName;
        } catch { }

        return 'Unassigned';
    };

    const [facName, setFacName] = useState('Loading...');
    const [assName, setAssName] = useState('Loading...');
    const [modName, setModName] = useState('Loading...');

    useEffect(() => {
        if (!cohort) return;
        getStaffName(cohort.facilitatorId).then(setFacName);
        getStaffName(cohort.assessorId).then(setAssName);
        getStaffName(cohort.moderatorId).then(setModName);
    }, [cohort]);

    const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
        if (!learnerToDrop) return;
        try {
            const batch = writeBatch(db);

            const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
            const enrollRef = doc(db, 'enrollments', routingId);

            batch.update(enrollRef, {
                status: 'dropped',
                exitDate: data.date,
                exitReasonCategory: data.reason,
                exitNotes: data.notes,
                exitEvidenceUrl: data.evidenceUrl,
                resignationLetterUrl: data.resignationUrl,
                updatedAt: new Date().toISOString()
            });

            const learnersRef = collection(db, 'learners');
            const q = query(learnersRef, where("idNumber", "==", learnerToDrop.idNumber));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const actualLearnerDoc = snapshot.docs[0];
                const learnerRef = doc(db, 'learners', actualLearnerDoc.id);

                batch.update(learnerRef, {
                    status: 'dropped',
                    updatedAt: new Date().toISOString()
                });
            }

            await batch.commit();

            toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);

            if (useStore.getState().fetchLearners) {
                useStore.getState().fetchLearners(true);
            }

            setLearnerToDrop(null); 
        } catch (err: any) {
            console.error("Error in handleConfirmDrop:", err);
            toast.error(err.message || 'Failed to complete withdrawal process.');
            throw err;
        }
    };

    // 🚀 FIXED: String casting for withdrawn status checks
    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped' || (l.status as string) === 'withdrawn').length;
    const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
    const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
    const selectedTopicCount = Object.keys(selectedTopics).length;

    const calendarGrid = useMemo(() => {
        const startDay = calendarMonth.day();
        const diff = startDay === 0 ? 6 : startDay - 1;
        const startGrid = calendarMonth.clone().subtract(diff, 'days');

        const endOfMonth = calendarMonth.clone().endOf('month');
        const endDay = endOfMonth.day();
        const endDiff = endDay === 0 ? 0 : 7 - endDay;
        const endGrid = endOfMonth.clone().add(endDiff, 'days');

        const grid = [];
        let curr = startGrid.clone();
        while (curr.isSameOrBefore(endGrid)) {
            grid.push(curr.clone());
            curr.add(1, 'day');
        }
        return grid;
    }, [calendarMonth]);

    const calendarDataMap = useMemo(() => {
        const map = new Map();

        holidays.forEach(h => map.set(h, { isHoliday: true }));

        if (cohort?.recessPeriods) {
            cohort.recessPeriods.forEach((p: any) => {
                let curr = moment(p.start);
                const end = moment(p.end);
                if (!curr.isValid() || !end.isValid()) return;
                let failsafe = 0;
                while (curr.isSameOrBefore(end) && failsafe < 60) {
                    const dStr = curr.format('YYYY-MM-DD');
                    map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
                    curr.add(1, 'day');
                    failsafe++;
                }
            });
        }
        
        dailyRegisters.forEach(h => {
            if (!h.date) return;
            const dStr = moment(h.date).format('YYYY-MM-DD');
            const existing = map.get(dStr) || {};
            existing.hasRegister = true;
            existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
            existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
            map.set(dStr, existing);
        });

        cohortLeaves.forEach(l => {
            if (!l.startDate && !l.dateAffected) return;
            let curr = moment(l.startDate || l.dateAffected);
            const end = moment(l.endDate || l.dateAffected);
            if (!curr.isValid() || !end.isValid()) return;
            let failsafe = 0;
            while(curr.isSameOrBefore(end) && failsafe < 60) {
                const dStr = curr.format('YYYY-MM-DD');
                const existing = map.get(dStr) || {};
                existing.leaves = (existing.leaves || 0) + 1;
                if(l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
                map.set(dStr, existing);
                curr.add(1, 'day');
                failsafe++;
            }
        });
        
        return map;
    }, [dailyRegisters, holidays, cohort, cohortLeaves]);

    return (
        <div className="cdp-layout">
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--mlab-green)" />
                        <stop offset="100%" stopColor="var(--mlab-green-dark)" />
                    </linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="100%" stopColor="#475569" />
                    </linearGradient>
                </defs>
            </svg>

            <style>{`
                .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); }
                .mc-orb { display: none; }
                
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
                .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
                .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
                .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
                .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem 0; }
                .mc-ring-svg { transform: rotate(-90deg); }
                .mc-ring-track { fill: none; stroke: var(--mlab-border); stroke-width: 8px; }
                .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: butt; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
                .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
                .mc-ring-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--mlab-blue); }
                .mc-ring-denom { font-family: var(--font-heading); text-transform: uppercase; font-size: 0.65rem; font-weight: 700; color: var(--mlab-grey); }
                
                .mc-bars { display: flex; flex-direction: column; gap: 8px; }
                .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
                .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
                .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
                .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
                .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                
                .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
                .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
                .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
                .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
                .mc-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; background: var(--mlab-blue); }
                
                .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background: var(--mlab-green); } .mc-k .mc-fill-secondary { background: var(--mlab-green-bg); }
                .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background: #0ea5e9; } .mc-p .mc-fill-secondary { background: #e0f2fe; }
                .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background: #d97706; } .mc-w .mc-fill-secondary { background: #fef3c7; }
                .mc-a .mc-ring-fill { stroke: url(#gA); } .mc-a .mc-fill-primary { background: #0ea5e9; } .mc-a .mc-fill-secondary { background: #e0f2fe; }
                .mc-d .mc-ring-fill { stroke: url(#gD); } .mc-d .mc-fill-primary { background: #64748b; } .mc-d .mc-fill-secondary { background: #f1f5f9; }

                .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
            `}</style>

            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {modalConfig.isOpen && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
                </div>,
                document.body
            )}

            {learnerToPlace && createPortal(
                <WorkplacePlacementModal
                    learner={learnerToPlace}
                    // @ts-ignore
                    cohort={cohort}
                    onClose={() => setLearnerToPlace(null)}
                />,
                document.body
            )}

            {learnerToDrop && (
                <LearnerDropoutModal
                    learner={learnerToDrop}
                    onClose={() => setLearnerToDrop(null)}
                    onConfirm={handleConfirmDrop}
                />
            )}

            <AILessonPlanModal
                isOpen={showAIModal || !!editingReport}
                onClose={() => { setShowAIModal(false); setEditingReport(null); }}
                onSave={handleSaveReport}
                onShowStatus={showStatusPopup}
                selectedTopics={selectedTopics}
                curriculumItems={activeProgramme ? curriculumItems : []}
                activeProgramme={activeProgramme}
                cohort={cohort}
                user={user}
                existingReport={editingReport}
            />

            {/* STIPEND EXPORT MODAL */}
            <StipendExportModal
                isOpen={isStipendModalOpen}
                onClose={() => setIsStipendModalOpen(false)}
                cohortId={cohort?.id || ''}
                cohortName={cohort?.name || 'Cohort'}
                learners={enrolledLearners}
                attendanceMode="qcto"
                initialMonth={calendarMonth.format('YYYY-MM')}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
                    <div className="cdp-header__left">
                        <button className="lfm-btn lfm-btn--ghost" onClick={handleBack} style={{ padding: '4px 10px', fontSize: '0.7rem', marginBottom: '10px' }}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div style={{ fontFamily: 'var(--font-heading)', color: 'whitesmoke', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={12} /> Cohort Overview</div>
                        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '4px 0', textTransform: 'uppercase' }}>{cohort.name}</h1>
                        <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={12} /> {cohort.startDate} — {cohort.endDate}
                            <span style={{ display: 'inline-block', background: cohort.isArchived ? 'var(--mlab-bg)' : 'var(--mlab-green-bg)', color: cohort.isArchived ? 'var(--mlab-grey)' : 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', border: `1px solid ${cohort.isArchived ? 'var(--mlab-border)' : 'var(--mlab-green)'}`, textTransform: 'uppercase' }}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
                        </p>
                    </div>
                    <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {(isAdmin || isFacilitator) && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="lfm-btn lfm-btn--ghost" onClick={handleQCTOExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={13} className="lfm-spin" /> : <DownloadCloud size={13} />} Export LEISA
                                </button>
                                <button className="lfm-btn lfm-btn--primary" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 size={13} className="lfm-spin" /> : <RefreshCcw size={13} />} Sync Workbooks
                                </button>
                            </div>
                        )}
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content" style={{ padding: '2rem' }}>
                    
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

                    {/* TOP KPIs CONVERTED TO PROGRESS CARDS (COLLAPSIBLE) */}
                    {showKPIs && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }} className="animate-slide-down">
                            <ModuleProgressCard 
                                type="Active Learners" 
                                data={{ total: cohortDemographics.total, logged: activeCount }} 
                            />
                            
                            <ModuleProgressCard 
                                type="Active Attendance" 
                                data={{ 
                                    total: attendanceHealth.total, 
                                    logged: attendanceHealth.high,
                                    segments: [
                                        { label: 'High (75%+)', value: attendanceHealth.high, color: '#16a34a' },
                                        { label: 'At-Risk (40-74%)', value: attendanceHealth.mid, color: '#f59e0b' },
                                        { label: 'Critical (<40%)', value: attendanceHealth.low, color: '#dc2626' }
                                    ]
                                }} 
                            />
                            
                            <ModuleProgressCard 
                                type="ACI Demographics" 
                                data={{ 
                                    total: cohortDemographics.total, 
                                    logged: cohortDemographics.blackCount + cohortDemographics.colouredCount + cohortDemographics.indianCount,
                                    segments: [
                                        { label: 'Black African', value: cohortDemographics.blackCount, color: '#16a34a' },
                                        { label: 'Coloured', value: cohortDemographics.colouredCount, color: '#0ea5e9' },
                                        { label: 'Indian/Asian', value: cohortDemographics.indianCount, color: '#d97706' },
                                        { label: 'White', value: cohortDemographics.whiteCount, color: '#94a3b8' },
                                        { label: 'Other', value: cohortDemographics.otherCount, color: '#cbd5e1' }
                                    ]
                                }} 
                            />
                            
                            <ModuleProgressCard 
                                type="Youth Representation" 
                                data={{ 
                                    total: cohortDemographics.total, 
                                    logged: cohortDemographics.youthCount,
                                    lines: [
                                        { label: 'Youth (< 35 Years)', value: cohortDemographics.youthCount, total: cohortDemographics.total, color: '#4d7c0f', bg: '#ecfccb' },
                                        { label: 'Adults (35+ Years)', value: cohortDemographics.total - cohortDemographics.youthCount, total: cohortDemographics.total, color: '#ca8a04', bg: '#fef3c7' }
                                    ]
                                }} 
                            />
                            
                            <ModuleProgressCard 
                                type="Workplace Placements" 
                                data={{ total: activeCount > 0 ? activeCount : 1, logged: placedCount }} 
                            />
                            <ModuleProgressCard 
                                type="Pending Marking" 
                                data={{ total: submissions.length > 0 ? submissions.length : 1, logged: pendingTotal }} 
                            />
                        </div>
                    )}

                    {/* PERMANENTLY VISIBLE COHORT META DATA */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        
                        {/* Timeline Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Duration</div>
                                    <div className="mc-title">Cohort Timeline</div>
                                </div>
                                <Calendar size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
                                <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
                                </div>
                                <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
                                </div>
                            </div>
                        </div>

                        {/* Facilitator Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Facilitator</div>
                                </div>
                                <Users size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
                                    {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
                                </div>
                            </div>
                        </div>

                        {/* Assessor Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Assessor</div>
                                </div>
                                <Award size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
                                    {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
                                </div>
                            </div>
                        </div>

                        {/* Moderator Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Moderator</div>
                                </div>
                                <ShieldCheck size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
                                    {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MASTER ASSESSMENTS ACCORDION */}
                    {assessmentStatsMap.length > 0 && (
                        <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>
                            <div className="lfm-header" style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }} onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}>
                                <h2 className="lfm-header__title"><BookOpen size={16} /> Assessment Operations Center</h2>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-white)', color: 'var(--mlab-red)', padding: '4px 10px', border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
                                            {totalWriting > 0 && <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />}
                                            {totalWriting} Writing
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
                                            <Clock size={10} /> {totalPending} Pending Marking
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--mlab-white)' }}>
                                        {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>
                            </div>
                            
                            {isAssessmentsExpanded && (
                                <div className="lfm-body animate-slide-down">
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
                                        <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
                                        <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
                                        <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
                                    </div>
                                    {filteredAssessments.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-bg)' }}>
                                            No assessments match this filter.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {filteredAssessments.map(exam => {
                                                const isExpanded = expandedAssessments.has(exam.assessmentId);
                                                const isLive = exam.writing.length > 0;
                                                const hasPending = exam.pending.length > 0;
                                                return (
                                                    <div key={exam.assessmentId} className="animate-fade-in" style={{
                                                        background: 'var(--mlab-white)',
                                                        border: isLive ? '2px solid var(--mlab-red)' : hasPending ? '2px solid #f59e0b' : '2px solid var(--mlab-border)',
                                                    }}>
                                                        <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                                                                <div style={{ color: 'var(--mlab-blue)' }}>
                                                                    <BookOpen size={20} />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
                                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                        {isLive && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', border: '1px solid #fca5a5', textTransform: 'uppercase' }}>
                                                                                <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                {exam.writing.length} Writing
                                                                            </span>
                                                                        )}
                                                                        {hasPending && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
                                                                                <Clock size={10} /> {exam.pending.length} Awaiting Marking
                                                                            </span>
                                                                        )}
                                                                        {exam.graded.length > 0 && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', border: '1px solid var(--mlab-green)', textTransform: 'uppercase' }}>
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
                                                            <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                {isLive && (
                                                                    <div style={{ border: '2px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                                                        <div>
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                                <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                Currently Live ({exam.writing.length})
                                                                            </span>
                                                                            <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
                                                                                {exam.learnerNamesWriting.join(', ')}
                                                                            </p>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                                            <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
                                                                                {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
                                                                            </button>
                                                                            <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
                                                                                {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {hasPending && (
                                                                    <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                                        <div>
                                                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
                                                                            <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                                                                                <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
                                                                            </p>
                                                                        </div>
                                                                        <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
                                                                            <PenTool size={14} /> Go to Grading Queue
                                                                        </button>
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

                    {/* TAB NAVIGATION */}
                    <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
                            <Users size={16} /> Learner Roster
                        </button>
                        <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
                            <LayoutList size={16} /> Curriculum Tracker
                        </button>
                        <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
                            <Calendar size={16} /> Calendar View
                        </button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
                            <UserCheck size={16} /> Attendance Tracker
                        </button>
                        <button className={`lfm-tab ${activeTab === 'surveys' ? 'active' : ''}`} onClick={() => setActiveTab('surveys')}>
                            <HelpCircle size={16} /> Surveys & Feedback ({cohortSurveyResponses.length})
                        </button>
                    </div>

                    {/* ─── TAB 1: LEARNER ROSTER ─── */}
                    {activeTab === 'learners' && (
                        <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '2px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                    <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Status:</label>
                                        <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ minWidth: '150px' }}>
                                            <option value="all">All Applicants</option>
                                            <option value="active">Active Only</option>
                                            <option value="dropped">Withdrawn Only</option>
                                        </select>
                                    </div>

                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Attendance:</label>
                                        <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ minWidth: '180px' }}>
                                            <option value="all">All Attendance Bands</option>
                                            <option value="high">High Compliance (75%+)</option>
                                            <option value="mid">Average Compliance (40% - 74%)</option>
                                            <option value="low">Critical Risk (&lt; 40%)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="lfm-body" style={{ padding: 0 }}>
                                <div className="mlab-table-wrap">
                                    <table className="mlab-table" style={{ margin: 0 }}>
                                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                            <tr>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Learner</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Workplace</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Module Progress</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Attendance</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Last Active</th>
                                                <th style={{ color: 'var(--mlab-grey)' }}>Status</th>
                                                <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLearners.map(learner => {
                                                    // 🚀 FIXED: String casting to prevent TS2367 comparison error
                                                    const isDropped = learner.status === 'dropped' || (learner.status as string) === 'withdrawn';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                                    const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
                                                    const isPlaced = !!learner.employerId;

                                                    const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
                                                    const learnerLogin = learner.lastLoginAt || (learner as any).lastLoginAt || null;

                                                    return (
                                                        <tr key={learner.id} style={{ opacity: isDropped ? 0.6 : 1, background: isDropped ? 'var(--mlab-bg)' : 'transparent' }}>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)' }}>
                                                                        {learner.fullName.charAt(0)}
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{learner.fullName}</span>
                                                                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
                                                                        {!isDropped && pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', marginTop: '4px' }}><Clock size={10} /> {pendingCount} marking pending</span>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>{isPlaced ? <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{employers.find(e => e.id === learner.employerId)?.name}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}><AlertCircle size={12} /> Pending</span>}</td>
                                                            <td>
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
                                                                    <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', border: '1px solid #bae6fd', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
                                                                    <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', border: '1px solid #fed7aa', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex', alignItems: 'center', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
                                                                        background: stats.pct >= 75 ? 'var(--mlab-green-bg)' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
                                                                        color: stats.pct >= 75 ? 'var(--mlab-green-dark)' : stats.pct >= 40 ? '#b45309' : '#991b1b',
                                                                        border: `1px solid ${stats.pct >= 75 ? 'var(--mlab-green)' : stats.pct >= 40 ? '#fde68a' : '#fca5a5'}`
                                                                    }}>{stats.pct}%</span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{stats.attended} / {stats.total}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: learnerLogin ? 'var(--mlab-midnight)' : 'var(--mlab-grey-light)' }}>
                                                                    <Clock size={12} color={learnerLogin ? "var(--mlab-blue)" : "var(--mlab-grey-light)"} />
                                                                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: learnerLogin ? 500 : 400 }}>
                                                                        {formatLastLogin(learnerLogin)}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: isDropped ? 'var(--mlab-bg)' : 'var(--mlab-light-blue)', color: isDropped ? 'var(--mlab-grey)' : 'var(--mlab-blue)', border: `1px solid ${isDropped ? 'var(--mlab-border)' : 'var(--mlab-blue)'}` }}>
                                                                    {isDropped ? 'Dropped' : 'Active'}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                                    {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>

                                                                    {isDropped ? (
                                                                        <button 
                                                                            onClick={() => setLearnerToDrop(learner)} 
                                                                            title="View Withdrawal Details" 
                                                                            className="lfm-btn lfm-btn--ghost" 
                                                                            style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}
                                                                        >
                                                                            <FileText size={12} /> View Exit
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => setLearnerToDrop(learner)}
                                                                            title="Process Withdrawal / Dropout"
                                                                            className="lfm-btn"
                                                                            style={{
                                                                                background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem'
                                                                            }}
                                                                            onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                                                                            onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
                                                                        >
                                                                            <UserMinus size={12} /> Withdraw
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 2: CURRICULUM TRACKER ─── */}
                    {activeTab === 'curriculum' && (
                        <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
                            {activeProgramme && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                    <ModuleProgressCard type="Knowledge" data={moduleProgress.Knowledge} />
                                    <ModuleProgressCard type="Practical" data={moduleProgress.Practical} />
                                    <ModuleProgressCard type="Workplace" data={moduleProgress.Workplace} />
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <div style={{ background: 'var(--mlab-white)', display: 'inline-flex', border: '2px solid var(--mlab-blue)' }}>
                                    <button onClick={() => setCurriculumViewMode('blueprint')} className={`lfm-btn ${curriculumViewMode === 'blueprint' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none' }}><CheckSquare size={14} /> Log New Topics</button>
                                    <button onClick={() => setCurriculumViewMode('history')} className={`lfm-btn ${curriculumViewMode === 'history' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none', borderLeft: '2px solid var(--mlab-blue)' }}><Clock size={14} /> View Past Sessions</button>
                                </div>
                            </div>

                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title"><BookOpen size={16} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2>
                                </div>
                                <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'var(--mlab-white)' : 'var(--mlab-bg)', padding: '1.5rem' }}>
                                    {!activeProgramme ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No formal Qualification Blueprint is linked to this cohort.</p></div>
                                    ) : (
                                        <>
                                            {curriculumViewMode === 'blueprint' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                    {Object.keys(groupedCurriculum).map(modCode => {
                                                        const group = groupedCurriculum[modCode];
                                                        const isOpen = expandedModules.has(modCode);
                                                        const totalItems = group.items.length;
                                                        const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
                                                        const isComplete = loggedItems === totalItems && totalItems > 0;

                                                        return (
                                                            <div key={modCode}>
                                                                <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
                                                                    <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
                                                                    <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', border: `1px solid ${isComplete ? 'var(--mlab-green)' : 'transparent'}` }}>{loggedItems} / {totalItems} COVERED</span>
                                                                    {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
                                                                </div>
                                                                {isOpen && (
                                                                    <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
                                                                        <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
                                                                            <table className="mlab-table" style={{ margin: '0', border: 'none' }}>
                                                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                                                    <tr>
                                                                                        <th style={{ width: '50px', color: 'var(--mlab-grey)', textAlign: 'center', borderRight: '1px solid var(--mlab-border)', borderRadius: 0 }}>Log</th>
                                                                                        <th style={{ color: 'var(--mlab-grey)', borderRadius: 0 }}>Topic / Activity</th>
                                                                                        <th style={{ width: '280px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Status / Session Report</th>
                                                                                        <th style={{ width: '180px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Engagement</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {group.items.map(item => {
                                                                                        const logRecord = curriculumLogs.find(log => log.topicId === item.id);
                                                                                        const isLogged = !!logRecord;
                                                                                        const isSelected = selectedTopics.hasOwnProperty(item.id);
                                                                                        const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
                                                                                        const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

                                                                                        return (
                                                                                            <tr key={item.id} style={{ background: isLogged ? 'var(--mlab-green-bg)' : (isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)') }}>
                                                                                                <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
                                                                                                    {isLogged ? <CheckCircle size={18} color="var(--mlab-green-dark)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
                                                                                                </td>
                                                                                                <td>
                                                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', color: isLogged ? 'var(--mlab-green-dark)' : 'var(--mlab-blue)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
                                                                                                        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td>
                                                                                                    {isLogged ? (
                                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                                            <span style={{ display: 'inline-block', background: 'var(--mlab-white)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                                                                                                            {associatedReport && <button className="lfm-btn lfm-btn--ghost" onClick={() => setEditingReport(associatedReport)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}><Edit3 size={12} /> Edit Report</button>}
                                                                                                        </div>
                                                                                                    ) : isSelected ? (
                                                                                                        <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
                                                                                                    ) : <span style={{ display: 'inline-block', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
                                                                                                </td>
                                                                                                <td>
                                                                                                    {isLogged ? (
                                                                                                        <div className="cdp-progress-col" style={{ width: '100%' }}>
                                                                                                            <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green-dark)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)'), fontSize: '0.85rem' }}>{ackPct}%</span></div>
                                                                                                            <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0', background: 'var(--mlab-border)', width: '100%' }}><div className="cdp-progress-fill" style={{ height: '100%', width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)') }} /></div>
                                                                                                        </div>
                                                                                                    ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)' }}>—</span>}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {curriculumViewMode === 'history' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                    {curriculumLogs.length === 0 ? (
                                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No topics have been logged for this cohort yet.</p></div>
                                                    ) : (
                                                        Object.keys(groupedHistoryLogs).sort().map(modCode => {
                                                            const logsInModule = groupedHistoryLogs[modCode];
                                                            const isOpen = expandedHistoryModules.has(modCode);
                                                            const moduleName = groupedCurriculum[modCode]?.moduleName || '';

                                                            return (
                                                                <div key={`hist-${modCode}`}>
                                                                    <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
                                                                        <Layers size={16} color="var(--mlab-blue)" />
                                                                        <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
                                                                        <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: 'var(--mlab-light-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
                                                                        {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
                                                                    </div>
                                                                    {isOpen && (
                                                                        <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
                                                                            {logsInModule.map(log => {
                                                                                const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
                                                                                return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {selectedTopicCount > 0 && createPortal(
                                <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
                                        <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
                                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
                                            <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
                                        </div>
                                        <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
                                        <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
                                            {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
                                        </button>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}

                    {/* ─── TAB 3: CALENDAR VIEW WITH STIPEND EXPORT ─── */}
                    {activeTab === 'calendar' && (
                        <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title">
                                    <Calendar size={18} /> Cohort Attendance Calendar
                                </h2>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {cohort?.id && (
                                        <button 
                                            className="lfm-btn"
                                            onClick={() => setIsStipendModalOpen(true)}
                                            style={{ background: 'var(--mlab-green)', border: 'none' }}
                                        >
                                            <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
                                        </button>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
                                        <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
                                        <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
                                        {dailyRegisters.length} Total Sessions
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
                                        {cohortLeaves.filter(l => l.status === 'Pending').length} Pending Leaves
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                                    ))}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                                    {calendarGrid.map((day) => {
                                        const dateStr = day.format('YYYY-MM-DD');
                                        const isCurrentMonth = day.month() === calendarMonth.month();
                                        const isToday = dateStr === moment().format('YYYY-MM-DD');
                                        const data = calendarDataMap.get(dateStr);

                                        return (
                                            <div 
                                                key={dateStr} 
                                                onClick={() => {
                                                    if (data?.hasRegister && cohort?.id) {
                                                        navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
                                                    } else {
                                                        setLedgerDates(prev => prev.includes(dateStr) ? prev : [...prev, dateStr]);
                                                        setActiveTab('attendance');
                                                    }
                                                }}
                                                style={{ 
                                                    border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', 
                                                    borderRadius: 0, 
                                                    minHeight: '110px', 
                                                    padding: '10px', 
                                                    backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', 
                                                    opacity: isCurrentMonth ? 1 : 0.6,
                                                    cursor: data?.hasRegister ? 'pointer' : 'default',
                                                    transition: 'all 0.2s',
                                                    boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
                                                }}
                                                onMouseOver={e => { if (data?.hasRegister) { e.currentTarget.style.borderColor = 'var(--mlab-green)' } }}
                                                onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ 
                                                        fontWeight: '700',
                                                        fontFamily: 'var(--font-heading)',
                                                        color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', 
                                                        background: isToday ? 'var(--mlab-blue)' : 'transparent',
                                                        width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
                                                    }}>{day.format('D')}</span>
                                                </div>
                                                
                                                {data && (
                                                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
                                                        {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}
                                                        
                                                        {data.hasRegister && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                                                                <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>{data.present} Present</span>
                                                                {data.absent > 0 && <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>{data.absent} Absent</span>}
                                                            </div>
                                                        )}

                                                        {data.leaves > 0 && (
                                                            <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
                                                                <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 4: ATTENDANCE LEDGER ─── */}
                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title">
                                        <History size={18} /> Historical Session Ledger
                                    </h2>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px' }}>
                                            <Calendar size={14} color="var(--mlab-blue)" />
                                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
                                            <input 
                                                type="date" 
                                                max={new Date().toISOString().split('T')[0]} 
                                                onChange={handleAddLedgerDate} 
                                                style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} 
                                            />
                                        </div>
                                        <button className="lfm-btn lfm-btn--primary" onClick={() => setIsDropZoneOpen(true)} style={{ border: '1px solid var(--mlab-white)' }}>
                                            <UploadCloud size={14} /> Upload Zoom CSV
                                        </button>
                                    </div>
                                </div>

                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => (
                                            <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
                                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
                                            </span>
                                        ))}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <XCircle size={12} /> Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="lfm-body" style={{ padding: 0 }}>
                                    <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                                        {filteredDailyRegisters.length === 0 ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>
                                                    {ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}
                                                </p>
                                            </div>
                                        ) : (
                                            <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                    <tr>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Expected Duration</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Captured</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Present (80%+)</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Short Hours</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Absent</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredDailyRegisters.map((reg) => {
                                                        const presentCount = reg.presentLearners?.length || 0;
                                                        const absentCount = reg.absentLearners?.length || 0;
                                                        const partialCount = reg.partialLearners?.length || 0;
                                                        const totalCaptured = presentCount + absentCount + partialCount;

                                                        return (
                                                            <tr key={reg.id}>
                                                                <td style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
                                                                    {reg.date ? new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                                                                </td>
                                                                <td>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                                                        <Clock size={14} /> {reg.expectedDuration || 0} mins
                                                                    </span>
                                                                </td>
                                                                <td style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{totalCaptured} Learners</td>
                                                                <td>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--mlab-green)' }}>
                                                                        <CheckCircle2 size={12} /> {presentCount}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fcd34d' }}>
                                                                        <AlertCircle size={12} /> {partialCount}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
                                                                        <XCircle size={12} /> {absentCount}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 5: SURVEYS & FEEDBACK ─── */}
                    {activeTab === 'surveys' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-green)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Average Feedback Rating</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                        <Star size={28} color="#f59e0b" fill="#f59e0b" />
                                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.avgScore}</span>
                                        <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>/ 5.0</span>
                                    </div>
                                </div>

                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Cohort Participation Rate</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                        <Users size={24} color="var(--mlab-blue)" />
                                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.completionRate}%</span>
                                        <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>({cohortSurveyMetrics.totalSubmissions} / {activeCount})</span>
                                    </div>
                                </div>

                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Feedback Submissions</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                        <HelpCircle size={24} color="var(--mlab-green)" />
                                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.totalSubmissions}</span>
                                        <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>Log Entries</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title">
                                        <HelpCircle size={18} /> Assigned Surveys for {cohort.name} ({cohortTargetedSurveys.length})
                                    </h2>
                                </div>
                                <div className="lfm-body" style={{ padding: '1.25rem', background: 'var(--mlab-bg)' }}>
                                    {cohortTargetedSurveys.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            No native survey forms published for this cohort.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                            {cohortTargetedSurveys.map(survey => {
                                                const subCount = cohortSurveyResponses.filter(r => r.surveyId === survey.id).length;
                                                const isGlobal = !survey.cohortIds || survey.cohortIds.includes('ALL');

                                                return (
                                                    <div key={survey.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                                <strong style={{ fontSize: '0.95rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{survey.title}</strong>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', background: isGlobal ? 'var(--mlab-light-blue)' : 'var(--mlab-green-bg)', color: isGlobal ? 'var(--mlab-blue)' : 'var(--mlab-green-dark)', padding: '2px 6px', border: `1px solid ${isGlobal ? 'var(--mlab-border)' : 'var(--mlab-green)'}` }}>
                                                                    {isGlobal ? 'All Cohorts' : 'Specific Cohort'}
                                                                </span>
                                                            </div>
                                                            {survey.description && (
                                                                <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                                                                    {survey.description}
                                                                </p>
                                                            )}
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>
                                                                {survey.questions?.length || 0} Questions • {subCount} / {activeCount} Responded
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button 
                                                                onClick={() => handleCopySurveyLink(survey.id)} 
                                                                className="lfm-btn lfm-btn--ghost" 
                                                                style={{ flex: 1, fontSize: '0.72rem', padding: '6px 8px' }}
                                                            >
                                                                <LinkIcon size={12} /> Share Link
                                                            </button>
                                                            <button 
                                                                onClick={() => window.open(`/survey/${survey.id}`, '_blank')} 
                                                                className="lfm-btn lfm-btn--primary" 
                                                                style={{ flex: 1, fontSize: '0.72rem', padding: '6px 8px' }}
                                                            >
                                                                <Eye size={12} /> Preview Form
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 className="lfm-header__title">
                                        <HelpCircle size={18} /> Cohort Survey Submissions ({filteredSurveyResponses.length})
                                    </h2>

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <div style={{ position: 'relative', width: '220px' }}>
                                            <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                            <input
                                                type="text"
                                                className="lfm-input"
                                                value={surveySearchQuery}
                                                onChange={e => setSurveySearchQuery(e.target.value)}
                                                placeholder="Search participant..."
                                                style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem' }}
                                            />
                                        </div>

                                        <button className="lfm-btn" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none' }} onClick={exportCohortSurveyExcel}>
                                            <DownloadCloud size={14} /> Export Feedback
                                        </button>
                                    </div>
                                </div>

                                <div className="lfm-body" style={{ padding: 0 }}>
                                    <div className="mlab-table-wrap">
                                        {filteredSurveyResponses.length === 0 ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                <HelpCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                                <p style={{ fontFamily: 'var(--font-body)', margin: 0 }}>No survey feedback logs found for this cohort.</p>
                                            </div>
                                        ) : (
                                            <table className="mlab-table" style={{ margin: 0 }}>
                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                    <tr>
                                                        <th>Date Submitted</th>
                                                        <th>Participant</th>
                                                        <th>Survey Template</th>
                                                        <th>Contact Status</th>
                                                        <th style={{ textAlign: 'center' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredSurveyResponses.map(resp => {
                                                        const template = surveyTemplates.find(s => s.id === resp.surveyId);

                                                        return (
                                                            <tr key={resp.id}>
                                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                                    {new Date(resp.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </td>
                                                                <td>
                                                                    <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{resp.learnerName || 'Anonymous Participant'}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{resp.learnerEmail || resp.learnerPhone || 'N/A'}</div>
                                                                </td>
                                                                <td>
                                                                    <span style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{template?.title || resp.surveyId}</span>
                                                                </td>
                                                                <td>
                                                                    {resp.isVerifiedRespondent 
                                                                        ? <span className="sm-badge-verified"><CheckCircle2 size={12}/> Verified</span>
                                                                        : <span className="sm-badge-unverified">Unverified</span>
                                                                    }
                                                                </td>
                                                                <td style={{ textAlign: 'center' }}>
                                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                                        <button onClick={() => setViewingSurveyResponse({ response: resp, template })} title="View Submission Details" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button onClick={() => handleDeleteCohortResponse(resp.id)} title="Delete Response" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* MODAL: VIEW COHORT SURVEY RESPONSE DETAILS */}
            {viewingSurveyResponse && (
                <div className="lfm-overlay" onClick={() => setViewingSurveyResponse(null)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><HelpCircle size={16} /> Participant Feedback</h2>
                            <button className="lfm-close-btn" onClick={() => setViewingSurveyResponse(null)}><X size={20} /></button>
                        </div>
                        
                        <div className="lfm-body" style={{ background: '#f8fafc', padding: 0 }}>
                            <div style={{ padding: '1.25rem', background: '#fff', borderBottom: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.2rem', textTransform: 'uppercase' }}>
                                        {viewingSurveyResponse.response.learnerName || 'Anonymous'}
                                    </h3>
                                    {viewingSurveyResponse.response.isVerifiedRespondent 
                                        ? <span className="sm-badge-verified"><CheckCircle2 size={12}/> Verified Contact</span>
                                        : <span className="sm-badge-unverified">Unverified</span>
                                    }
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span><strong>Survey Form:</strong> {viewingSurveyResponse.template?.title || viewingSurveyResponse.response.surveyId}</span>
                                    <span><strong>Submitted:</strong> {new Date(viewingSurveyResponse.response.submittedAt).toLocaleString('en-ZA')}</span>
                                    {viewingSurveyResponse.response.learnerEmail && <span><strong>Email:</strong> {viewingSurveyResponse.response.learnerEmail}</span>}
                                </div>
                            </div>

                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Feedback Breakdown</h4>
                                
                                {viewingSurveyResponse.template?.questions?.map((q: any, idx: number) => {
                                    const answer = viewingSurveyResponse.response.answers?.[q.id];
                                    
                                    return (
                                        <div key={q.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', marginBottom: '8px' }}>
                                                {idx + 1}. {q.label}
                                            </div>
                                            
                                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                {answer === undefined || answer === '' ? (
                                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Skipped / No Answer</span>
                                                ) : q.type === 'rating' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Star size={16} color="#f59e0b" fill="#f59e0b" />
                                                        <strong>{answer}</strong> / {q.maxStars || 5}
                                                    </div>
                                                ) : q.type === 'address' ? (
                                                    <div style={{ background: 'var(--mlab-bg)', padding: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.8rem' }}>
                                                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={12}/> {answer.formattedAddress}</div>
                                                        {answer.localMunicipality && <div style={{ color: 'var(--mlab-grey)' }}>Municipality: {answer.localMunicipality}</div>}
                                                    </div>
                                                ) : (
                                                    <span style={{ whiteSpace: 'pre-wrap' }}>{String(answer)}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        <div className="lfm-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="lfm-btn lfm-btn--outline" onClick={() => setViewingSurveyResponse(null)} style={{ background: '#fff', border: '1px solid var(--mlab-border)' }}>Close View</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



// // src/components/views/CohortsView/QCTOCohortView.tsx

// import React, { useMemo, useState, useEffect } from 'react';
// import { useNavigate, useSearchParams } from 'react-router-dom';
// import { createPortal } from 'react-dom';
// import {
//     Users, Calendar, ChevronLeft, DownloadCloud,
//     FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
//     UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
//     Layers, ChevronUp, ChevronDown, Sparkles,
//     Edit3, X, PenTool, FileText, CheckCircle,
//     Loader2, RefreshCcw, BookOpen, Filter,
//     ChevronRight, History, Award, ShieldCheck,
//     HelpCircle, Star, Eye, MapPin, Link as LinkIcon,
//     Trash2
// } from 'lucide-react';
// import * as XLSX from 'xlsx';
// import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, getDoc, deleteDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
// import type { DashboardLearner } from '../../../types';

// import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
// import { LearnerDropoutModal } from './LearnerDropoutModal';
// import { AILessonPlanModal } from './AILessonPlanModal';
// import { StipendExportModal } from '../../common/StipendExportModal/StipendExportModal';
// import moment from 'moment';

// const formatQCTODate = (d?: string) => {
//     if (!d) return '';
//     const dt = new Date(d);
//     if (isNaN(dt.getTime())) return '';
//     return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
// };

// const getDOBFromID = (id: string) => {
//     const clean = String(id || '').replace(/\s/g, '');
//     if (clean.length !== 13) return '';
//     try {
//         let y = parseInt(clean.substring(0, 2), 10);
//         const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
//         y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
//         return `${y}${m}${d2}`;
//     } catch { return ''; }
// };

// const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

// const getTimestampMs = (val: any): number => {
//     if (!val) return 0;
//     if (typeof val?.toDate === 'function') return val.toDate().getTime();
//     if (val?.seconds) return val.seconds * 1000;
//     const t = new Date(val).getTime();
//     return isNaN(t) ? 0 : t;
// };

// const formatLastLogin = (lastLoginAt: any): string => {
//     const ms = getTimestampMs(lastLoginAt);
//     if (!ms) return 'Never';

//     const date = new Date(ms);
//     return date.toLocaleString('en-ZA', {
//         day: '2-digit',
//         month: 'short',
//         year: 'numeric',
//         hour: '2-digit',
//         minute: '2-digit',
//     });
// };

// export const ModuleChip: React.FC<{label: string, count: number, variant: 'k'|'p'|'w'}> = ({ label, count, variant }) => (
//     <span className={`cdp-chip cdp-chip--${variant}`} style={{ borderRadius: 0 }}>{label}: {count}</span>
// );

// export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
//     const navigate = useNavigate();
//     const [searchParams, setSearchParams] = useSearchParams();
//     const toast = useToast();

//     const { user, learners, staff, employers, settings, programmes } = useStore();

//     // Sync Active Tab with URL Params (Includes 'surveys')
//     const urlTab = searchParams.get('tab');
//     const activeTab = (urlTab === 'curriculum' || urlTab === 'calendar' || urlTab === 'attendance' || urlTab === 'surveys') 
//         ? urlTab 
//         : 'learners'; 

//     const setActiveTab = (tab: 'learners' | 'curriculum' | 'calendar' | 'attendance' | 'surveys') => {
//         setSearchParams((prev) => {
//             prev.set('tab', tab);
//             prev.delete('expanded');
//             return prev;
//         }, { replace: true });
//     };

//     const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

//     const [isSyncing, setIsSyncing] = useState(false);
//     const [isExporting, setIsExporting] = useState(false);
//     const [isGrantingTime, setIsGrantingTime] = useState(false);
//     const [isLogging, setIsLogging] = useState(false);
//     const [showAIModal, setShowAIModal] = useState(false);
//     const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    
//     const [showKPIs, setShowKPIs] = useState(true);

//     const [searchTerm, setSearchTerm] = useState('');
//     const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
//     const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

//     const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
//     const [ledgerDates, setLedgerDates] = useState<string[]>([]);

//     const [submissions, setSubmissions] = useState<any[]>([]);
//     const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
//     const [sessionReports, setSessionReports] = useState<any[]>([]);
//     const [editingReport, setEditingReport] = useState<any | null>(null);

//     // COHORT SURVEY & FEEDBACK STATES
//     const [cohortSurveyResponses, setCohortSurveyResponses] = useState<any[]>([]);
//     const [surveyTemplates, setSurveyTemplates] = useState<any[]>([]);
//     const [viewingSurveyResponse, setViewingSurveyResponse] = useState<any | null>(null);
//     const [surveySearchQuery, setSurveySearchQuery] = useState('');

//     const urlExpanded = searchParams.get('expanded');
//     const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

//     const toggleModuleAccordion = (moduleCode: string) => {
//         setSearchParams((prev) => {
//             const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);
//             if (current.has(moduleCode)) current.delete(moduleCode);
//             else current.add(moduleCode);
            
//             if (current.size > 0) prev.set('expanded', Array.from(current).join(','));
//             else prev.delete('expanded');
            
//             return prev;
//         }, { replace: true });
//     };

//     const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
//     const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
//     const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

//     const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);

//     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);
//     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
//     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
//     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

//     const [holidays, setHolidays] = useState<string[]>([]);
//     const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

//     useEffect(() => {
//         const fetchHolidays = async () => {
//             const currentYear = new Date().getFullYear();
//             const cacheKey = `holidays_za_${currentYear}`;
//             const cached = localStorage.getItem(cacheKey);

//             if (cached) {
//                 setHolidays(JSON.parse(cached));
//             } else {
//                 try {
//                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
//                     if (res.ok) {
//                         const data = await res.json();
//                         const dateList = data.map((h: any) => h.date);
//                         setHolidays(dateList);
//                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
//                     }
//                 } catch (e) {
//                     console.warn("Holiday API unreachable for analytics.");
//                 }
//             }
//         };
//         fetchHolidays();
//     }, []);

//     useEffect(() => {
//         if (!cohort?.id) return;
//         const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
//         const unsub = onSnapshot(q, snap => {
//             setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//         });
//         return () => unsub();
//     }, [cohort?.id]);

//     useEffect(() => {
//         if (!cohort?.id) return;
//         const q = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             setLiveEnrollments(results);
//         });
//         return () => unsubscribe();
//     }, [cohort.id]);

//     // LISTEN TO COHORT SURVEY RESPONSES & ALL SURVEY TEMPLATES
//     useEffect(() => {
//         if (!cohort?.id) return;

//         const qResponses = query(collection(db, 'survey_responses'), where('cohortId', '==', cohort.id));
//         const unsubResponses = onSnapshot(qResponses, (snap) => {
//             const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//             list.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
//             setCohortSurveyResponses(list);
//         });

//         const unsubSurveys = onSnapshot(collection(db, 'surveys'), (snap) => {
//             setSurveyTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//         });

//         return () => {
//             unsubResponses();
//             unsubSurveys();
//         };
//     }, [cohort?.id]);

//     // 🚀 FILTER SURVEY TEMPLATES TARGETED TO THIS SPECIFIC COHORT (SPECIFIC ID OR 'ALL' OR UNRESTRICTED)
//     const cohortTargetedSurveys = useMemo(() => {
//         return surveyTemplates.filter(s => {
//             if (s.isActive === false) return false;
//             const cIds = s.cohortIds || [];
//             return cIds.length === 0 || cIds.includes('ALL') || cIds.includes(cohort.id);
//         });
//     }, [surveyTemplates, cohort?.id]);

//     const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
//     const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
//     const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

//     const toggleAssessmentAccordion = (id: string) => {
//         setExpandedAssessments(prev => {
//             const next = new Set(prev);
//             next.has(id) ? next.delete(id) : next.add(id);
//             return next;
//         });
//     };

//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
//     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);
//     const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

//     const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

//     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin === true;
//     const isFacilitator = user?.role === 'facilitator';

//     const handleBack = () => {
//         if (isAdmin) {
//             navigate('/admin', { state: { activeTab: 'cohorts' } });
//         } else {
//             navigate(-1);
//         }
//     };

//     const activeProgramme = useMemo(() => {
//         if (!cohort || !programmes.length) return null;
//         const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
//         if (!templateId) return null;
//         return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
//     }, [cohort, programmes]);

//     const groupedCurriculum = useMemo(() => {
//         if (!activeProgramme) return {};
//         const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
//         const extractItems = (modules: any[], type: string) => {
//             (modules || []).forEach(mod => {
//                 const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
//                 const modCode = mod.code || 'General';
//                 if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
//                 subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
//             });
//         };
//         extractItems(activeProgramme.knowledgeModules, 'Knowledge');
//         extractItems(activeProgramme.practicalModules, 'Practical');
//         extractItems(activeProgramme.workExperienceModules, 'Workplace');
//         return groups;
//     }, [activeProgramme]);

//     const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

//     const groupedHistoryLogs = useMemo(() => {
//         const groups: Record<string, any[]> = {};
//         curriculumLogs.forEach(log => {
//             const modCode = log.moduleCode || 'Uncategorized';
//             if (!groups[modCode]) groups[modCode] = [];
//             groups[modCode].push(log);
//         });
//         return groups;
//     }, [curriculumLogs]);

//     const moduleProgress = useMemo(() => {
//         const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
//         Object.values(groupedCurriculum).forEach(group => {
//             const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
//             if (stats[type]) {
//                 stats[type].total += group.items.length;
//                 stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
//             }
//         });
//         return stats;
//     }, [groupedCurriculum, curriculumLogs]);

//     const enrolledLearners = useMemo(() => {
//         const merged: DashboardLearner[] = [];

//         liveEnrollments.forEach(enrollment => {
//             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
//             if (profile?.fullName && profile?.idNumber) {
//                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });

//         learners.forEach(profile => {
//             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
//                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });
//         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
//     }, [learners, liveEnrollments, cohort.id]);

//     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

//     useEffect(() => {
//         if (!cohort?.id) return;
//         const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
//             setDailyRegisters(regs);
//         });
//         return () => unsubscribe();
//     }, [cohort.id]);

//     const rosterAttendanceMap = useMemo(() => {
//         const map = new Map<string, { attended: number; total: number; pct: number }>();
//         const totalSessions = dailyRegisters.length;

//         enrolledLearners.forEach(l => {
//             if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
//         });

//         dailyRegisters.forEach(reg => {
//             const present = reg.presentLearners || [];
//             present.forEach((idNum: string) => {
//                 if (map.has(idNum)) {
//                     map.get(idNum)!.attended += 1;
//                 }
//             });
//         });

//         map.forEach(value => {
//             value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
//         });

//         return map;
//     }, [dailyRegisters, enrolledLearners]);

//     const cohortDemographics = useMemo(() => {
//         let blackCount = 0, colouredCount = 0, indianCount = 0, whiteCount = 0, otherCount = 0;
//         let youthCount = 0;

//         enrolledLearners.forEach(l => {
//             const eq = ((l as any).equityGroup || l.demographics?.equityCode || '').trim().toLowerCase();
//             if (eq.includes('african') || eq === 'black' || eq === 'ba') blackCount++;
//             else if (eq.includes('coloured') || eq === 'bc') colouredCount++;
//             else if (eq.includes('indian') || eq === 'bi') indianCount++;
//             else if (eq.includes('white') || eq === 'wh') whiteCount++;
//             else otherCount++;

//             let isYouth = true;
//             if (l.idNumber && l.idNumber.length >= 6) {
//                 const yearNum = parseInt(l.idNumber.substring(0, 2), 10);
//                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
//                 const age = new Date().getFullYear() - birthYear;
//                 if (age > 35) isYouth = false;
//             } else if ((l.demographics as any)?.youthStatus === 'N') {
//                 isYouth = false;
//             }
//             if (isYouth) youthCount++;
//         });

//         return { blackCount, colouredCount, indianCount, whiteCount, otherCount, youthCount, total: enrolledLearners.length };
//     }, [enrolledLearners]);

//     const attendanceHealth = useMemo(() => {
//         let high = 0, mid = 0, low = 0;
//         enrolledLearners.forEach(l => {
//             const stats = rosterAttendanceMap.get(l.idNumber || '');
//             const pct = stats ? stats.pct : 0;
//             if (pct >= 75) high++;
//             else if (pct >= 40) mid++;
//             else low++;
//         });
//         return { high, mid, low, total: enrolledLearners.length };
//     }, [enrolledLearners, rosterAttendanceMap]);

//     const filteredLearners = useMemo(() => {
//         return enrolledLearners.filter(learner => {
//             const searchLower = searchTerm.toLowerCase().trim();
//             const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
//             const matchesSearch = !searchLower ||
//                 learner.fullName.toLowerCase().includes(searchLower) ||
//                 learner.idNumber.includes(searchLower) ||
//                 dbEmail.includes(searchLower);

//             const matchesStatus = statusFilter === 'all' ||
//                 (statusFilter === 'active' && learner.status !== 'dropped') ||
//                 (statusFilter === 'dropped' && learner.status === 'dropped');

//             const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
//             let matchesAttendance = true;
//             if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
//             else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
//             else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

//             return matchesSearch && matchesStatus && matchesAttendance;
//         });
//     }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

//     const filteredDailyRegisters = useMemo(() => {
//         if (ledgerDates.length === 0) return dailyRegisters;
//         return dailyRegisters.filter(reg => ledgerDates.includes(reg.date));
//     }, [dailyRegisters, ledgerDates]);

//     const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const date = e.target.value;
//         if (date && !ledgerDates.includes(date)) {
//             setLedgerDates([...ledgerDates, date]);
//         }
//     };

//     const removeLedgerDate = (dateToRemove: string) => {
//         setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
//     };

//     const fetchSubmissions = async () => {
//         try {
//             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
//             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//         } catch (e) { console.error('Error fetching submissions:', e); }
//     };

//     useEffect(() => {
//         fetchSubmissions();
//         const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
//         const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
//         const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
//         const unsubReports = onSnapshot(reportsQ, (snap) => {
//             const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
//             reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
//             setSessionReports(reps);
//         });
//         return () => { unsubLogs(); unsubReports(); };
//     }, [cohort.id]);

//     // FILTERED SURVEY RESPONSES FOR COHORT SEARCH
//     const filteredSurveyResponses = useMemo(() => {
//         if (!surveySearchQuery.trim()) return cohortSurveyResponses;
//         const lower = surveySearchQuery.toLowerCase().trim();
//         return cohortSurveyResponses.filter(r => 
//             (r.learnerName || '').toLowerCase().includes(lower) ||
//             (r.learnerEmail || '').toLowerCase().includes(lower)
//         );
//     }, [cohortSurveyResponses, surveySearchQuery]);

//     // COHORT SURVEY METRICS
//     const cohortSurveyMetrics = useMemo(() => {
//         const totalSubmissions = cohortSurveyResponses.length;
//         const completionRate = activeCount > 0 ? Math.round((totalSubmissions / activeCount) * 100) : 0;
        
//         let starRatingSum = 0;
//         let starRatingCount = 0;

//         cohortSurveyResponses.forEach(r => {
//             Object.values(r.answers || {}).forEach((val: any) => {
//                 if (typeof val === 'number' && val <= 5) {
//                     starRatingSum += val;
//                     starRatingCount++;
//                 }
//             });
//         });

//         const avgScore = starRatingCount > 0 ? (starRatingSum / starRatingCount).toFixed(1) : 'N/A';

//         return { totalSubmissions, completionRate, avgScore };
//     }, [cohortSurveyResponses, activeCount]);

//     const handleDeleteCohortResponse = async (id: string) => {
//         if (!window.confirm("Delete this survey response permanently?")) return;
//         try {
//             await deleteDoc(doc(db, 'survey_responses', id));
//             toast.success("Response deleted successfully.");
//         } catch {
//             toast.error("Failed to delete response.");
//         }
//     };

//     const handleCopySurveyLink = (surveyId: string) => {
//         const publicUrl = `${window.location.origin}/survey/${surveyId}`;
//         navigator.clipboard.writeText(publicUrl);
//         toast.success("Public survey link copied to clipboard!");
//     };

//     const exportCohortSurveyExcel = () => {
//         if (cohortSurveyResponses.length === 0) return toast.warning("No survey responses available to export.");

//         const rows = cohortSurveyResponses.map(r => {
//             const template = surveyTemplates.find(s => s.id === r.surveyId);
//             const questionMap = new Map<string, string>();
//             template?.questions?.forEach((q: any) => questionMap.set(q.id, q.label));

//             const flattenedAnswers: Record<string, any> = {};
//             Object.entries(r.answers || {}).forEach(([qId, val]) => {
//                 const label = questionMap.get(qId) || qId;
//                 if (val && typeof val === 'object' && 'formattedAddress' in val) {
//                     flattenedAnswers[`${label} - Address`] = val.formattedAddress || '';
//                     flattenedAnswers[`${label} - City`] = val.city || '';
//                 } else {
//                     flattenedAnswers[label] = val;
//                 }
//             });

//             return {
//                 "Response ID": r.id,
//                 "Participant": r.learnerName || 'Anonymous',
//                 "Email": r.learnerEmail || 'N/A',
//                 "Survey Title": template?.title || r.surveyId,
//                 "Submitted At": new Date(r.submittedAt).toLocaleString('en-ZA'),
//                 ...flattenedAnswers
//             };
//         });

//         const ws = XLSX.utils.json_to_sheet(rows);
//         const wb = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(wb, ws, "Cohort Feedback");
//         XLSX.writeFile(wb, `Cohort_Feedback_${cohort.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
//         toast.success("Cohort feedback exported!");
//     };

//     const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
//     const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
//     const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
//     const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

//     const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string, sessionDateStr?: string) => {
//         const finalDate = sessionDateStr || new Date().toISOString().split('T')[0];
//         const finalTimestamp = `${finalDate}T12:00:00.000Z`;

//         if (isEdit && reportId) {
//             setIsLogging(true);
//             try {
//                 const batch = writeBatch(db);

//                 batch.update(doc(db, 'session_reports', reportId), {
//                     reportHtml: planHtml,
//                     evidenceLinks,
//                     dateLogged: finalTimestamp,
//                     sessionDate: finalDate,
//                     lastEditedAt: new Date().toISOString(),
//                     lastEditedBy: user?.uid
//                 });

//                 const logsQ = query(collection(db, 'curriculum_logs'), where('sessionReportId', '==', reportId));
//                 const logsSnap = await getDocs(logsQ);
//                 logsSnap.forEach(logDoc => {
//                     batch.update(logDoc.ref, {
//                         coveredAt: finalDate
//                     });
//                 });

//                 await batch.commit();
//                 toast.success("Session report updated successfully.");
//                 setShowAIModal(false);
//                 setEditingReport(null);
//             } catch (error) {
//                 toast.error("Failed to update report.");
//             } finally {
//                 setIsLogging(false);
//             }
//         } else {
//             const selectedTopicIds = Object.keys(selectedTopics);
//             if (selectedTopicIds.length === 0) return;
//             setShowAIModal(false);
//             setIsLogging(true);
//             try {
//                 const batch = writeBatch(db);
//                 const now = new Date();
//                 const reportRef = doc(collection(db, 'session_reports'));

//                 batch.set(reportRef, {
//                     cohortId: cohort.id,
//                     facilitatorId: user?.uid,
//                     facilitatorName: user?.fullName,
//                     facilitatorSignatureUrl: user?.signatureUrl || null,
//                     dateLogged: finalTimestamp,
//                     sessionDate: finalDate,
//                     reportHtml: planHtml,
//                     evidenceLinks,
//                     topicsCovered: selectedTopicIds
//                 });

//                 selectedTopicIds.forEach(topicId => {
//                     const itemDef = curriculumItems.find(i => i.id === topicId);
//                     if (!itemDef) return;
//                     const coveredDateStr = selectedTopics[topicId] || finalDate;

//                     batch.set(doc(collection(db, 'curriculum_logs')), {
//                         cohortId: cohort.id,
//                         topicId: itemDef.id,
//                         topicCode: itemDef.code,
//                         topicTitle: itemDef.title,
//                         moduleCode: itemDef.moduleCode,
//                         moduleName: itemDef.moduleName,
//                         moduleType: itemDef.moduleType,
//                         coveredAt: coveredDateStr,
//                         loggedAt: now.toISOString(),
//                         deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
//                         loggedBy: user?.uid,
//                         loggedByName: user?.fullName,
//                         sessionReportId: reportRef.id,
//                         acknowledgedBy: [],
//                         penalizeLearners: []
//                     });
//                 });

//                 await batch.commit();
//                 setSelectedTopics({});
//                 showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
//             } catch (error) {
//                 showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
//             } finally {
//                 setIsLogging(false);
//             }
//         }
//     };

//     const assessmentStatsMap = useMemo(() => {
//         const map = new Map<string, {
//             assessmentId: string,
//             title: string,
//             writing: any[],
//             pending: any[],
//             graded: any[],
//             learnerNamesWriting: string[]
//         }>();

//         submissions.forEach(s => {
//             if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

//             if (!map.has(s.assessmentId)) {
//                 map.set(s.assessmentId, {
//                     assessmentId: s.assessmentId,
//                     title: s.title || 'Unknown Assessment',
//                     writing: [], pending: [], graded: [], learnerNamesWriting: []
//                 });
//             }

//             const entry = map.get(s.assessmentId)!;

//             if (s.status === 'in_progress') {
//                 entry.writing.push(s);
//                 const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
//                 if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
//             } else if (s.status === 'submitted') {
//                 entry.pending.push(s);
//             } else if (s.status === 'graded' || s.status === 'moderated') {
//                 entry.graded.push(s);
//             }
//         });

//         return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
//     }, [submissions, enrolledLearners]);

//     const filteredAssessments = useMemo(() => {
//         if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
//         if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
//         return assessmentStatsMap;
//     }, [assessmentStatsMap, assessmentFilter]);

//     const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
//     const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

//     const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
//         if (subsToUpdate.length === 0) return;
//         if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

//         setIsGrantingTime(true);
//         try {
//             const batch = writeBatch(db);
//             subsToUpdate.forEach(sub => {
//                 batch.update(doc(db, 'learner_submissions', sub.id), {
//                     extraTimeGranted: increment(minutes),
//                     lastStaffEditAt: new Date().toISOString()
//                 });
//             });
//             await batch.commit();
//             toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
//             await fetchSubmissions();
//         } catch (error) {
//             toast.error("Failed to grant extra time.");
//         } finally {
//             setIsGrantingTime(false);
//         }
//     };

//     const handleQCTOExport = async () => {
//         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
//         setIsExporting(true);
//         try {
//             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
//             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
//             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
//             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
//             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
//             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
//             const todayQCTO = formatQCTODate(new Date().toISOString());

//             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

//             const dataRows = [headers.map(createTextCell)];
//             enrolledLearners.forEach(learner => {
//                 const d = learner.demographics || {};
//                 const names = (learner.fullName || '').trim().split(' ');
//                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
//                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
//             });

//             const wb = XLSX.utils.book_new();
//             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
//             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
//             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
//             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
//             XLSX.writeFile(wb, fileName);
//             toast.success(`Export successful: ${fileName}`);
//         } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
//     };

//     const syncLearnerWorkbooks = async () => {
//         setIsSyncing(true);
//         try {
//             const batch = writeBatch(db);
//             const aRef = collection(db, 'assessments');
//             const [snapA, snapS] = await Promise.all([
//                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
//                 getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
//             ]);
//             const allAssessments = new Map<string, any>();
//             snapA.docs.forEach(d => allAssessments.set(d.id, d));
//             snapS.docs.forEach(d => allAssessments.set(d.id, d));

//             if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

//             const activeLearnersToSync = enrolledLearners.filter(l => l.status !== 'dropped');

//             let count = 0;
//             for (const learner of activeLearnersToSync) {
//                 const enrolId = learner.enrollmentId || learner.id;
//                 const humanId = learner.learnerId || learner.id;
//                 for (const [astId, astDoc] of allAssessments.entries()) {
//                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.learnerId === humanId));
//                     if (!exists) {
//                         const data = astDoc.data();
//                         batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
//                         count++;
//                     }
//                 }
//             }
//             if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
//             else toast.success('All active learners are synced.');
//         } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
//     };

//     const getStaffName = async (id: string) => {
//         const cachedStaff = useStore.getState().staff;
//         const match = cachedStaff.find(s => s.id === id);
//         if (match) return match.fullName;

//         try {
//             const userSnap = await getDoc(doc(db, 'users', id));
//             if (userSnap.exists()) return userSnap.data().fullName;
//         } catch { }

//         return 'Unassigned';
//     };

//     const [facName, setFacName] = useState('Loading...');
//     const [assName, setAssName] = useState('Loading...');
//     const [modName, setModName] = useState('Loading...');

//     useEffect(() => {
//         if (!cohort) return;
//         getStaffName(cohort.facilitatorId).then(setFacName);
//         getStaffName(cohort.assessorId).then(setAssName);
//         getStaffName(cohort.moderatorId).then(setModName);
//     }, [cohort]);

//     const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
//         if (!learnerToDrop) return;
//         try {
//             const batch = writeBatch(db);

//             const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
//             const enrollRef = doc(db, 'enrollments', routingId);

//             batch.update(enrollRef, {
//                 status: 'dropped',
//                 exitDate: data.date,
//                 exitReasonCategory: data.reason,
//                 exitNotes: data.notes,
//                 exitEvidenceUrl: data.evidenceUrl,
//                 resignationLetterUrl: data.resignationUrl,
//                 updatedAt: new Date().toISOString()
//             });

//             const learnersRef = collection(db, 'learners');
//             const q = query(learnersRef, where("idNumber", "==", learnerToDrop.idNumber));
//             const snapshot = await getDocs(q);

//             if (!snapshot.empty) {
//                 const actualLearnerDoc = snapshot.docs[0];
//                 const learnerRef = doc(db, 'learners', actualLearnerDoc.id);

//                 batch.update(learnerRef, {
//                     status: 'dropped',
//                     updatedAt: new Date().toISOString()
//                 });
//             }

//             await batch.commit();

//             toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);

//             if (useStore.getState().fetchLearners) {
//                 useStore.getState().fetchLearners(true);
//             }

//             setLearnerToDrop(null); 
//         } catch (err: any) {
//             console.error("Error in handleConfirmDrop:", err);
//             toast.error(err.message || 'Failed to complete withdrawal process.');
//             throw err;
//         }
//     };

//     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
//     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
//     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
//     const selectedTopicCount = Object.keys(selectedTopics).length;

//     const calendarGrid = useMemo(() => {
//         const startDay = calendarMonth.day();
//         const diff = startDay === 0 ? 6 : startDay - 1;
//         const startGrid = calendarMonth.clone().subtract(diff, 'days');

//         const endOfMonth = calendarMonth.clone().endOf('month');
//         const endDay = endOfMonth.day();
//         const endDiff = endDay === 0 ? 0 : 7 - endDay;
//         const endGrid = endOfMonth.clone().add(endDiff, 'days');

//         const grid = [];
//         let curr = startGrid.clone();
//         while (curr.isSameOrBefore(endGrid)) {
//             grid.push(curr.clone());
//             curr.add(1, 'day');
//         }
//         return grid;
//     }, [calendarMonth]);

//     const calendarDataMap = useMemo(() => {
//         const map = new Map();

//         holidays.forEach(h => map.set(h, { isHoliday: true }));

//         if (cohort?.recessPeriods) {
//             cohort.recessPeriods.forEach((p: any) => {
//                 let curr = moment(p.start);
//                 const end = moment(p.end);
//                 if (!curr.isValid() || !end.isValid()) return;
//                 let failsafe = 0;
//                 while (curr.isSameOrBefore(end) && failsafe < 60) {
//                     const dStr = curr.format('YYYY-MM-DD');
//                     map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
//                     curr.add(1, 'day');
//                     failsafe++;
//                 }
//             });
//         }
        
//         dailyRegisters.forEach(h => {
//             if (!h.date) return;
//             const dStr = moment(h.date).format('YYYY-MM-DD');
//             const existing = map.get(dStr) || {};
//             existing.hasRegister = true;
//             existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
//             existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
//             map.set(dStr, existing);
//         });

//         cohortLeaves.forEach(l => {
//             if (!l.startDate && !l.dateAffected) return;
//             let curr = moment(l.startDate || l.dateAffected);
//             const end = moment(l.endDate || l.dateAffected);
//             if (!curr.isValid() || !end.isValid()) return;
//             let failsafe = 0;
//             while(curr.isSameOrBefore(end) && failsafe < 60) {
//                 const dStr = curr.format('YYYY-MM-DD');
//                 const existing = map.get(dStr) || {};
//                 existing.leaves = (existing.leaves || 0) + 1;
//                 if(l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
//                 map.set(dStr, existing);
//                 curr.add(1, 'day');
//                 failsafe++;
//             }
//         });
        
//         return map;
//     }, [dailyRegisters, holidays, cohort, cohortLeaves]);

//     return (
//         <div className="cdp-layout">

//             <svg width="0" height="0" style={{ position: 'absolute' }}>
//                 <defs>
//                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
//                         <stop offset="0%" stopColor="var(--mlab-green)" />
//                         <stop offset="100%" stopColor="var(--mlab-green-dark)" />
//                     </linearGradient>
//                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
//                         <stop offset="0%" stopColor="#38bdf8" />
//                         <stop offset="100%" stopColor="#0284c7" />
//                     </linearGradient>
//                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
//                         <stop offset="0%" stopColor="#f59e0b" />
//                         <stop offset="100%" stopColor="#d97706" />
//                     </linearGradient>
//                     <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
//                         <stop offset="0%" stopColor="#38bdf8" />
//                         <stop offset="100%" stopColor="#0284c7" />
//                     </linearGradient>
//                     <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
//                         <stop offset="0%" stopColor="#94a3b8" />
//                         <stop offset="100%" stopColor="#475569" />
//                     </linearGradient>
//                 </defs>
//             </svg>

//             <style>{`
//                 .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
//                 .mc:hover { transform: translateY(-4px); }
//                 .mc-orb { display: none; }
                
//                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
//                 .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
//                 .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
//                 .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
//                 .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
//                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem 0; }
//                 .mc-ring-svg { transform: rotate(-90deg); }
//                 .mc-ring-track { fill: none; stroke: var(--mlab-border); stroke-width: 8px; }
//                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: butt; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
//                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
//                 .mc-ring-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--mlab-blue); }
//                 .mc-ring-denom { font-family: var(--font-heading); text-transform: uppercase; font-size: 0.65rem; font-weight: 700; color: var(--mlab-grey); }
                
//                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
//                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
//                 .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
//                 .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
//                 .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
//                 .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                
//                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
//                 .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
//                 .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
//                 .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
//                 .mc-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; background: var(--mlab-blue); }
                
//                 .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background: var(--mlab-green); } .mc-k .mc-fill-secondary { background: var(--mlab-green-bg); }
//                 .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background: #0ea5e9; } .mc-p .mc-fill-secondary { background: #e0f2fe; }
//                 .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background: #d97706; } .mc-w .mc-fill-secondary { background: #fef3c7; }
//                 .mc-a .mc-ring-fill { stroke: url(#gA); } .mc-a .mc-fill-primary { background: #0ea5e9; } .mc-a .mc-fill-secondary { background: #e0f2fe; }
//                 .mc-d .mc-ring-fill { stroke: url(#gD); } .mc-d .mc-fill-primary { background: #64748b; } .mc-d .mc-fill-secondary { background: #f1f5f9; }

//                 .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
//             `}</style>

//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {modalConfig.isOpen && createPortal(
//                 <div style={{ position: 'relative', zIndex: 999999 }}>
//                     <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
//                 </div>,
//                 document.body
//             )}

//             {learnerToPlace && createPortal(
//                 <WorkplacePlacementModal
//                     learner={learnerToPlace}
//                     // @ts-ignore
//                     cohort={cohort}
//                     onClose={() => setLearnerToPlace(null)}
//                 />,
//                 document.body
//             )}

//             {learnerToDrop && (
//                 <LearnerDropoutModal
//                     learner={learnerToDrop}
//                     onClose={() => setLearnerToDrop(null)}
//                     onConfirm={handleConfirmDrop}
//                 />
//             )}

//             <AILessonPlanModal
//                 isOpen={showAIModal || !!editingReport}
//                 onClose={() => { setShowAIModal(false); setEditingReport(null); }}
//                 onSave={handleSaveReport}
//                 onShowStatus={showStatusPopup}
//                 selectedTopics={selectedTopics}
//                 curriculumItems={activeProgramme ? curriculumItems : []}
//                 activeProgramme={activeProgramme}
//                 cohort={cohort}
//                 user={user}
//                 existingReport={editingReport}
//             />

//             <StipendExportModal 
//                 isOpen={isStipendModalOpen}
//                 onClose={() => setIsStipendModalOpen(false)}
//                 cohortId={cohort?.id || ''}
//                 cohortName={cohort?.name || 'Cohort'}
//                 learners={enrolledLearners.filter(l => l.status !== 'dropped')}
//                 attendanceMode="qcto"
//                 initialMonth={calendarMonth.format('YYYY-MM')}
//             />

//             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

//             <main className="cdp-main">
//                 <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
//                     <div className="cdp-header__left">
//                         <button className="lfm-btn lfm-btn--ghost" onClick={handleBack} style={{ padding: '4px 10px', fontSize: '0.7rem', marginBottom: '10px' }}>
//                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
//                         </button>
//                         <div style={{ fontFamily: 'var(--font-heading)', color: 'whitesmoke', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={12} /> Cohort Overview</div>
//                         <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '4px 0', textTransform: 'uppercase' }}>{cohort.name}</h1>
//                         <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <Calendar size={12} /> {cohort.startDate} — {cohort.endDate}
//                             <span style={{ display: 'inline-block', background: cohort.isArchived ? 'var(--mlab-bg)' : 'var(--mlab-green-bg)', color: cohort.isArchived ? 'var(--mlab-grey)' : 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', border: `1px solid ${cohort.isArchived ? 'var(--mlab-border)' : 'var(--mlab-green)'}`, textTransform: 'uppercase' }}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
//                         </p>
//                     </div>
//                     <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                         {(isAdmin || isFacilitator) && (
//                             <div style={{ display: 'flex', gap: '0.5rem' }}>
//                                 <button className="lfm-btn lfm-btn--ghost" onClick={handleQCTOExport} disabled={isExporting}>
//                                     {isExporting ? <Loader2 size={13} className="lfm-spin" /> : <DownloadCloud size={13} />} Export LEISA
//                                 </button>
//                                 <button className="lfm-btn lfm-btn--primary" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
//                                     {isSyncing ? <Loader2 size={13} className="lfm-spin" /> : <RefreshCcw size={13} />} Sync Workbooks
//                                 </button>
//                             </div>
//                         )}
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="cdp-content" style={{ padding: '2rem' }}>
                    
//                     <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
//                         <button 
//                             onClick={() => setShowKPIs(!showKPIs)} 
//                             style={{ 
//                                 display: 'flex', alignItems: 'center', gap: '6px', 
//                                 background: 'transparent', border: 'none', color: 'var(--mlab-grey)', 
//                                 fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, 
//                                 textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s' 
//                             }}
//                             onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
//                             onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
//                         >
//                             {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
//                         </button>
//                     </div>

//                     {/* TOP KPIs CONVERTED TO PROGRESS CARDS (COLLAPSIBLE) */}
//                     {showKPIs && (
//                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }} className="animate-slide-down">
//                             <ModuleProgressCard 
//                                 type="Active Learners" 
//                                 data={{ total: cohortDemographics.total, logged: activeCount }} 
//                             />
                            
//                             <ModuleProgressCard 
//                                 type="Active Attendance" 
//                                 data={{ 
//                                     total: attendanceHealth.total, 
//                                     logged: attendanceHealth.high,
//                                     segments: [
//                                         { label: 'High (75%+)', value: attendanceHealth.high, color: '#16a34a' },
//                                         { label: 'At-Risk (40-74%)', value: attendanceHealth.mid, color: '#f59e0b' },
//                                         { label: 'Critical (<40%)', value: attendanceHealth.low, color: '#dc2626' }
//                                     ]
//                                 }} 
//                             />
                            
//                             <ModuleProgressCard 
//                                 type="ACI Demographics" 
//                                 data={{ 
//                                     total: cohortDemographics.total, 
//                                     logged: cohortDemographics.blackCount + cohortDemographics.colouredCount + cohortDemographics.indianCount,
//                                     segments: [
//                                         { label: 'Black African', value: cohortDemographics.blackCount, color: '#16a34a' },
//                                         { label: 'Coloured', value: cohortDemographics.colouredCount, color: '#0ea5e9' },
//                                         { label: 'Indian/Asian', value: cohortDemographics.indianCount, color: '#d97706' },
//                                         { label: 'White', value: cohortDemographics.whiteCount, color: '#94a3b8' },
//                                         { label: 'Other', value: cohortDemographics.otherCount, color: '#cbd5e1' }
//                                     ]
//                                 }} 
//                             />
                            
//                             <ModuleProgressCard 
//                                 type="Youth Representation" 
//                                 data={{ 
//                                     total: cohortDemographics.total, 
//                                     logged: cohortDemographics.youthCount,
//                                     lines: [
//                                         { label: 'Youth (< 35 Years)', value: cohortDemographics.youthCount, total: cohortDemographics.total, color: '#4d7c0f', bg: '#ecfccb' },
//                                         { label: 'Adults (35+ Years)', value: cohortDemographics.total - cohortDemographics.youthCount, total: cohortDemographics.total, color: '#ca8a04', bg: '#fef3c7' }
//                                     ]
//                                 }} 
//                             />
                            
//                             <ModuleProgressCard 
//                                 type="Workplace Placements" 
//                                 data={{ total: activeCount > 0 ? activeCount : 1, logged: placedCount }} 
//                             />
//                             <ModuleProgressCard 
//                                 type="Pending Marking" 
//                                 data={{ total: submissions.length > 0 ? submissions.length : 1, logged: pendingTotal }} 
//                             />
//                         </div>
//                     )}

//                     {/* PERMANENTLY VISIBLE COHORT META DATA */}
//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        
//                         {/* Timeline Card */}
//                         <div className="mc">
//                             <div className="mc-hdr">
//                                 <div>
//                                     <div className="mc-label">Duration</div>
//                                     <div className="mc-title">Cohort Timeline</div>
//                                 </div>
//                                 <Calendar size={20} color="var(--mlab-blue)" />
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
//                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
//                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
//                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
//                                 </div>
//                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
//                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
//                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* Facilitator Card */}
//                         <div className="mc">
//                             <div className="mc-hdr">
//                                 <div>
//                                     <div className="mc-label">Assigned Staff</div>
//                                     <div className="mc-title">Facilitator</div>
//                                 </div>
//                                 <Users size={20} color="var(--mlab-blue)" />
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
//                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
//                                     {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
//                                 </div>
//                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
//                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* Assessor Card */}
//                         <div className="mc">
//                             <div className="mc-hdr">
//                                 <div>
//                                     <div className="mc-label">Assigned Staff</div>
//                                     <div className="mc-title">Assessor</div>
//                                 </div>
//                                 <Award size={20} color="var(--mlab-blue)" />
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
//                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
//                                     {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
//                                 </div>
//                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
//                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* Moderator Card */}
//                         <div className="mc">
//                             <div className="mc-hdr">
//                                 <div>
//                                     <div className="mc-label">Assigned Staff</div>
//                                     <div className="mc-title">Moderator</div>
//                                 </div>
//                                 <ShieldCheck size={20} color="var(--mlab-blue)" />
//                             </div>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
//                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
//                                     {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
//                                 </div>
//                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
//                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>

//                     {/* MASTER ASSESSMENTS ACCORDION */}
//                     {assessmentStatsMap.length > 0 && (
//                         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>
//                             <div className="lfm-header" style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }} onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}>
//                                 <h2 className="lfm-header__title"><BookOpen size={16} /> Assessment Operations Center</h2>
                                
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-white)', color: 'var(--mlab-red)', padding: '4px 10px', border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
//                                             {totalWriting > 0 && <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />}
//                                             {totalWriting} Writing
//                                         </span>
//                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
//                                             <Clock size={10} /> {totalPending} Pending Marking
//                                         </span>
//                                     </div>
//                                     <div style={{ color: 'var(--mlab-white)' }}>
//                                         {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
//                                     </div>
//                                 </div>
//                             </div>
                            
//                             {isAssessmentsExpanded && (
//                                 <div className="lfm-body animate-slide-down">
//                                     <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
//                                         <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
//                                         <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
//                                         <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
//                                     </div>
//                                     {filteredAssessments.length === 0 ? (
//                                         <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-bg)' }}>
//                                             No assessments match this filter.
//                                         </div>
//                                     ) : (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                                             {filteredAssessments.map(exam => {
//                                                 const isExpanded = expandedAssessments.has(exam.assessmentId);
//                                                 const isLive = exam.writing.length > 0;
//                                                 const hasPending = exam.pending.length > 0;
//                                                 return (
//                                                     <div key={exam.assessmentId} className="animate-fade-in" style={{
//                                                         background: 'var(--mlab-white)',
//                                                         border: isLive ? '2px solid var(--mlab-red)' : hasPending ? '2px solid #f59e0b' : '2px solid var(--mlab-border)',
//                                                     }}>
//                                                         <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
//                                                                 <div style={{ color: 'var(--mlab-blue)' }}>
//                                                                     <BookOpen size={20} />
//                                                                 </div>
//                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                                     <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
//                                                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                                                         {isLive && (
//                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', border: '1px solid #fca5a5', textTransform: 'uppercase' }}>
//                                                                                 <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
//                                                                                 {exam.writing.length} Writing
//                                                                             </span>
//                                                                         )}
//                                                                         {hasPending && (
//                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
//                                                                                 <Clock size={10} /> {exam.pending.length} Awaiting Marking
//                                                                             </span>
//                                                                         )}
//                                                                         {exam.graded.length > 0 && (
//                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', border: '1px solid var(--mlab-green)', textTransform: 'uppercase' }}>
//                                                                                 <CheckCircle2 size={10} /> {exam.graded.length} Graded
//                                                                             </span>
//                                                                         )}
//                                                                     </div>
//                                                                 </div>
//                                                             </div>
//                                                             <div style={{ color: 'var(--mlab-blue)' }}>
//                                                                 {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
//                                                             </div>
//                                                         </div>
//                                                         {isExpanded && (
//                                                             <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                                                                 {isLive && (
//                                                                     <div style={{ border: '2px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
//                                                                         <div>
//                                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                                                 <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
//                                                                                 Currently Live ({exam.writing.length})
//                                                                             </span>
//                                                                             <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
//                                                                                 {exam.learnerNamesWriting.join(', ')}
//                                                                             </p>
//                                                                         </div>
//                                                                         <div style={{ display: 'flex', gap: '8px' }}>
//                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
//                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
//                                                                             </button>
//                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
//                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
//                                                                             </button>
//                                                                         </div>
//                                                                     </div>
//                                                                 )}
//                                                                 {hasPending && (
//                                                                     <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
//                                                                         <div>
//                                                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
//                                                                             <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
//                                                                                 <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
//                                                                             </p>
//                                                                         </div>
//                                                                         <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
//                                                                             <PenTool size={14} /> Go to Grading Queue
//                                                                         </button>
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         )}
//                                                     </div>
//                                                 );
//                                             })}
//                                         </div>
//                                     )}
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* TAB NAVIGATION */}
//                     <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
//                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
//                             <Users size={16} /> Learner Roster
//                         </button>
//                         <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
//                             <LayoutList size={16} /> Curriculum Tracker
//                         </button>
//                         <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
//                             <Calendar size={16} /> Calendar View
//                         </button>
//                         <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
//                             <UserCheck size={16} /> Attendance Tracker
//                         </button>
//                         {/* 🚀 TAB 5: NATIVE COHORT SURVEYS & FEEDBACK */}
//                         <button className={`lfm-tab ${activeTab === 'surveys' ? 'active' : ''}`} onClick={() => setActiveTab('surveys')}>
//                             <HelpCircle size={16} /> Surveys & Feedback ({cohortSurveyResponses.length})
//                         </button>
//                     </div>

//                     {/* ─── TAB 1: LEARNER ROSTER ─── */}
//                     {activeTab === 'learners' && (
//                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
//                             <div className="lfm-header">
//                                 <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
//                             </div>

//                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '2px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
//                                 <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
//                                     <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
//                                     <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px' }} />
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                                     <div className="lfm-fg" style={{ gap: '4px' }}>
//                                         <label>Status:</label>
//                                         <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ minWidth: '150px' }}>
//                                             <option value="all">All Applicants</option>
//                                             <option value="active">Active Only</option>
//                                             <option value="dropped">Withdrawn Only</option>
//                                         </select>
//                                     </div>

//                                     <div className="lfm-fg" style={{ gap: '4px' }}>
//                                         <label>Attendance:</label>
//                                         <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ minWidth: '180px' }}>
//                                             <option value="all">All Attendance Bands</option>
//                                             <option value="high">High Compliance (75%+)</option>
//                                             <option value="mid">Average Compliance (40% - 74%)</option>
//                                             <option value="low">Critical Risk (&lt; 40%)</option>
//                                         </select>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="lfm-body" style={{ padding: 0 }}>
//                                 <div className="mlab-table-wrap">
//                                     <table className="mlab-table" style={{ margin: 0 }}>
//                                         <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                                             <tr>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Learner</th>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Workplace</th>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Module Progress</th>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Attendance</th>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Last Active</th>
//                                                 <th style={{ color: 'var(--mlab-grey)' }}>Status</th>
//                                                 <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {filteredLearners.length === 0 ? (
//                                                 <tr>
//                                                     <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                         <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
//                                                         <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
//                                                     </td>
//                                                 </tr>
//                                             ) : (
//                                                 filteredLearners.map(learner => {
//                                                     const isDropped = learner.status === 'dropped';
//                                                     const routingId = learner.enrollmentId || learner.id;
//                                                     const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
//                                                     const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
//                                                     const isPlaced = !!learner.employerId;

//                                                     const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
//                                                     const learnerLogin = learner.lastLoginAt || (learner as any).lastLoginAt || null;

//                                                     return (
//                                                         <tr key={learner.id} style={{ opacity: isDropped ? 0.6 : 1, background: isDropped ? 'var(--mlab-bg)' : 'transparent' }}>
//                                                             <td>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                                                     <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)' }}>
//                                                                         {learner.fullName.charAt(0)}
//                                                                     </div>
//                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
//                                                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{learner.fullName}</span>
//                                                                         <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
//                                                                         {!isDropped && pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', marginTop: '4px' }}><Clock size={10} /> {pendingCount} marking pending</span>}
//                                                                     </div>
//                                                                 </div>
//                                                             </td>
//                                                             <td>{isPlaced ? <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{employers.find(e => e.id === learner.employerId)?.name}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}><AlertCircle size={12} /> Pending</span>}</td>
//                                                             <td>
//                                                                 <div style={{ display: 'flex', gap: '6px' }}>
//                                                                     <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
//                                                                     <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', border: '1px solid #bae6fd', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
//                                                                     <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', border: '1px solid #fed7aa', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                                     <span style={{
//                                                                         display: 'inline-flex', alignItems: 'center', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
//                                                                         background: stats.pct >= 75 ? 'var(--mlab-green-bg)' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
//                                                                         color: stats.pct >= 75 ? 'var(--mlab-green-dark)' : stats.pct >= 40 ? '#b45309' : '#991b1b',
//                                                                         border: `1px solid ${stats.pct >= 75 ? 'var(--mlab-green)' : stats.pct >= 40 ? '#fde68a' : '#fca5a5'}`
//                                                                     }}>{stats.pct}%</span>
//                                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{stats.attended} / {stats.total}</span>
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: learnerLogin ? 'var(--mlab-midnight)' : 'var(--mlab-grey-light)' }}>
//                                                                     <Clock size={12} color={learnerLogin ? "var(--mlab-blue)" : "var(--mlab-grey-light)"} />
//                                                                     <span style={{ fontFamily: 'var(--font-body)', fontWeight: learnerLogin ? 500 : 400 }}>
//                                                                         {formatLastLogin(learnerLogin)}
//                                                                     </span>
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: isDropped ? 'var(--mlab-bg)' : 'var(--mlab-light-blue)', color: isDropped ? 'var(--mlab-grey)' : 'var(--mlab-blue)', border: `1px solid ${isDropped ? 'var(--mlab-border)' : 'var(--mlab-blue)'}` }}>
//                                                                     {isDropped ? 'Dropped' : 'Active'}
//                                                                 </span>
//                                                             </td>
//                                                             <td style={{ textAlign: 'right' }}>
//                                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
//                                                                     {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
//                                                                     <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>

//                                                                     {isDropped ? (
//                                                                         <button 
//                                                                             onClick={() => setLearnerToDrop(learner)} 
//                                                                             title="View Withdrawal Details" 
//                                                                             className="lfm-btn lfm-btn--ghost" 
//                                                                             style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}
//                                                                         >
//                                                                             <FileText size={12} /> View Exit
//                                                                         </button>
//                                                                     ) : (
//                                                                         <button
//                                                                             onClick={() => setLearnerToDrop(learner)}
//                                                                             title="Process Withdrawal / Dropout"
//                                                                             className="lfm-btn"
//                                                                             style={{
//                                                                                 background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem'
//                                                                             }}
//                                                                             onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
//                                                                             onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
//                                                                         >
//                                                                             <UserMinus size={12} /> Withdraw
//                                                                         </button>
//                                                                     )}
//                                                                 </div>
//                                                             </td>
//                                                         </tr>
//                                                     );
//                                                 })
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ─── TAB 2: CURRICULUM TRACKER ─── */}
//                     {activeTab === 'curriculum' && (
//                         <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
//                             {activeProgramme && (
//                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
//                                     <ModuleProgressCard type="Knowledge" data={moduleProgress.Knowledge} />
//                                     <ModuleProgressCard type="Practical" data={moduleProgress.Practical} />
//                                     <ModuleProgressCard type="Workplace" data={moduleProgress.Workplace} />
//                                 </div>
//                             )}

//                             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
//                                 <div style={{ background: 'var(--mlab-white)', display: 'inline-flex', border: '2px solid var(--mlab-blue)' }}>
//                                     <button onClick={() => setCurriculumViewMode('blueprint')} className={`lfm-btn ${curriculumViewMode === 'blueprint' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none' }}><CheckSquare size={14} /> Log New Topics</button>
//                                     <button onClick={() => setCurriculumViewMode('history')} className={`lfm-btn ${curriculumViewMode === 'history' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none', borderLeft: '2px solid var(--mlab-blue)' }}><Clock size={14} /> View Past Sessions</button>
//                                 </div>
//                             </div>

//                             <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
//                                 <div className="lfm-header">
//                                     <h2 className="lfm-header__title"><BookOpen size={16} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2>
//                                 </div>
//                                 <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'var(--mlab-white)' : 'var(--mlab-bg)', padding: '1.5rem' }}>
//                                     {!activeProgramme ? (
//                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No formal Qualification Blueprint is linked to this cohort.</p></div>
//                                     ) : (
//                                         <>
//                                             {curriculumViewMode === 'blueprint' && (
//                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                                                     {Object.keys(groupedCurriculum).map(modCode => {
//                                                         const group = groupedCurriculum[modCode];
//                                                         const isOpen = expandedModules.has(modCode);
//                                                         const totalItems = group.items.length;
//                                                         const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
//                                                         const isComplete = loggedItems === totalItems && totalItems > 0;

//                                                         return (
//                                                             <div key={modCode}>
//                                                                 <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
//                                                                     <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
//                                                                     <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
//                                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', border: `1px solid ${isComplete ? 'var(--mlab-green)' : 'transparent'}` }}>{loggedItems} / {totalItems} COVERED</span>
//                                                                     {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
//                                                                 </div>
//                                                                 {isOpen && (
//                                                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
//                                                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
//                                                                             <table className="mlab-table" style={{ margin: '0', border: 'none' }}>
//                                                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                                                                                     <tr>
//                                                                                         <th style={{ width: '50px', color: 'var(--mlab-grey)', textAlign: 'center', borderRight: '1px solid var(--mlab-border)', borderRadius: 0 }}>Log</th>
//                                                                                         <th style={{ color: 'var(--mlab-grey)', borderRadius: 0 }}>Topic / Activity</th>
//                                                                                         <th style={{ width: '280px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Status / Session Report</th>
//                                                                                         <th style={{ width: '180px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Engagement</th>
//                                                                                     </tr>
//                                                                                 </thead>
//                                                                                 <tbody>
//                                                                                     {group.items.map(item => {
//                                                                                         const logRecord = curriculumLogs.find(log => log.topicId === item.id);
//                                                                                         const isLogged = !!logRecord;
//                                                                                         const isSelected = selectedTopics.hasOwnProperty(item.id);
//                                                                                         const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
//                                                                                         const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

//                                                                                         return (
//                                                                                             <tr key={item.id} style={{ background: isLogged ? 'var(--mlab-green-bg)' : (isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)') }}>
//                                                                                                 <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
//                                                                                                     {isLogged ? <CheckCircle size={18} color="var(--mlab-green-dark)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
//                                                                                                 </td>
//                                                                                                 <td>
//                                                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                                                                         <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', color: isLogged ? 'var(--mlab-green-dark)' : 'var(--mlab-blue)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
//                                                                                                         <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
//                                                                                                     </div>
//                                                                                                 </td>
//                                                                                                 <td>
//                                                                                                     {isLogged ? (
//                                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                                                             <span style={{ display: 'inline-block', background: 'var(--mlab-white)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
//                                                                                                             {associatedReport && <button className="lfm-btn lfm-btn--ghost" onClick={() => setEditingReport(associatedReport)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}><Edit3 size={12} /> Edit Report</button>}
//                                                                                                         </div>
//                                                                                                     ) : isSelected ? (
//                                                                                                         <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
//                                                                                                     ) : <span style={{ display: 'inline-block', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
//                                                                                                 </td>
//                                                                                                 <td>
//                                                                                                     {isLogged ? (
//                                                                                                         <div className="cdp-progress-col" style={{ width: '100%' }}>
//                                                                                                             <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green-dark)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)'), fontSize: '0.85rem' }}>{ackPct}%</span></div>
//                                                                                                             <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0', background: 'var(--mlab-border)', width: '100%' }}><div className="cdp-progress-fill" style={{ height: '100%', width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)') }} /></div>
//                                                                                                         </div>
//                                                                                                     ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)' }}>—</span>}
//                                                                                                 </td>
//                                                                                             </tr>
//                                                                                         );
//                                                                                     })}
//                                                                                 </tbody>
//                                                                             </table>
//                                                                         </div>
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}

//                                             {curriculumViewMode === 'history' && (
//                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                                                     {curriculumLogs.length === 0 ? (
//                                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No topics have been logged for this cohort yet.</p></div>
//                                                     ) : (
//                                                         Object.keys(groupedHistoryLogs).sort().map(modCode => {
//                                                             const logsInModule = groupedHistoryLogs[modCode];
//                                                             const isOpen = expandedHistoryModules.has(modCode);
//                                                             const moduleName = groupedCurriculum[modCode]?.moduleName || '';

//                                                             return (
//                                                                 <div key={`hist-${modCode}`}>
//                                                                     <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
//                                                                         <Layers size={16} color="var(--mlab-blue)" />
//                                                                         <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
//                                                                         <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: 'var(--mlab-light-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
//                                                                         {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
//                                                                     </div>
//                                                                     {isOpen && (
//                                                                         <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
//                                                                             {logsInModule.map(log => {
//                                                                                 const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
//                                                                                 return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
//                                                                             })}
//                                                                         </div>
//                                                                     )}
//                                                                 </div>
//                                                             );
//                                                         })
//                                                     )}
//                                                 </div>
//                                             )}
//                                         </>
//                                     )}
//                                 </div>
//                             </div>

//                             {selectedTopicCount > 0 && createPortal(
//                                 <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
//                                         <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
//                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
//                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
//                                         </div>
//                                     </div>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
//                                             <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
//                                             <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
//                                         </div>
//                                         <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
//                                         <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
//                                             {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
//                                         </button>
//                                     </div>
//                                 </div>,
//                                 document.body
//                             )}
//                         </div>
//                     )}

//                     {/* ─── TAB 3: CALENDAR VIEW WITH STIPEND EXPORT ─── */}
//                     {activeTab === 'calendar' && (
//                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
//                             <div className="lfm-header">
//                                 <h2 className="lfm-header__title">
//                                     <Calendar size={18} /> Cohort Attendance Calendar
//                                 </h2>

//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                     {cohort?.id && (
//                                         <button 
//                                             className="lfm-btn"
//                                             onClick={() => setIsStipendModalOpen(true)}
//                                             style={{ background: 'var(--mlab-green)', border: 'none' }}
//                                         >
//                                             <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
//                                         </button>
//                                     )}

//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
//                                         <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
//                                         <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
//                                         <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
//                                 <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
//                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
//                                         {dailyRegisters.length} Total Sessions
//                                     </span>
//                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
//                                         {cohortLeaves.filter(l => l.status === 'Pending').length} Pending Leaves
//                                     </span>
//                                 </div>

//                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
//                                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
//                                         <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
//                                     ))}
//                                 </div>

//                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
//                                     {calendarGrid.map((day) => {
//                                         const dateStr = day.format('YYYY-MM-DD');
//                                         const isCurrentMonth = day.month() === calendarMonth.month();
//                                         const isToday = dateStr === moment().format('YYYY-MM-DD');
//                                         const data = calendarDataMap.get(dateStr);

//                                         return (
//                                             <div 
//                                                 key={dateStr} 
//                                                 onClick={() => {
//                                                     if (data?.hasRegister && cohort?.id) {
//                                                         navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
//                                                     } else {
//                                                         setLedgerDates(prev => prev.includes(dateStr) ? prev : [...prev, dateStr]);
//                                                         setActiveTab('attendance');
//                                                     }
//                                                 }}
//                                                 style={{ 
//                                                     border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', 
//                                                     borderRadius: 0, 
//                                                     minHeight: '110px', 
//                                                     padding: '10px', 
//                                                     backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', 
//                                                     opacity: isCurrentMonth ? 1 : 0.6,
//                                                     cursor: data?.hasRegister ? 'pointer' : 'default',
//                                                     transition: 'all 0.2s',
//                                                     boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
//                                                 }}
//                                                 onMouseOver={e => { if (data?.hasRegister) { e.currentTarget.style.borderColor = 'var(--mlab-green)' } }}
//                                                 onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)' }}
//                                             >
//                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                     <span style={{ 
//                                                         fontWeight: '700',
//                                                         fontFamily: 'var(--font-heading)',
//                                                         color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', 
//                                                         background: isToday ? 'var(--mlab-blue)' : 'transparent',
//                                                         width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
//                                                     }}>{day.format('D')}</span>
//                                                 </div>
                                                
//                                                 {data && (
//                                                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                         {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
//                                                         {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}
                                                        
//                                                         {data.hasRegister && (
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
//                                                                 <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>{data.present} Present</span>
//                                                                 {data.absent > 0 && <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>{data.absent} Absent</span>}
//                                                             </div>
//                                                         )}

//                                                         {data.leaves > 0 && (
//                                                             <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
//                                                                 <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
//                                                             </span>
//                                                         )}
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         )
//                                     })}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {/* ─── TAB 4: ATTENDANCE ─── */}
//                     {activeTab === 'attendance' && (
//                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
//                             <div style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
//                                 <div className="lfm-header">
//                                     <h2 className="lfm-header__title">
//                                         <History size={18} /> Historical Session Ledger
//                                     </h2>

//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px' }}>
//                                             <Calendar size={14} color="var(--mlab-blue)" />
//                                             <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
//                                             <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
//                                         </div>
//                                         <button className="lfm-btn lfm-btn--primary" onClick={() => setIsDropZoneOpen(true)} style={{ border: '1px solid var(--mlab-white)' }}>
//                                             <UploadCloud size={14} /> Upload Zoom CSV
//                                         </button>
//                                     </div>
//                                 </div>

//                                 {ledgerDates.length > 0 && (
//                                     <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
//                                         {ledgerDates.map(date => (
//                                             <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
//                                                 {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
//                                                 <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
//                                             </span>
//                                         ))}
//                                         <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                             <XCircle size={12} /> Clear All
//                                         </button>
//                                     </div>
//                                 )}

//                                 <div className="lfm-body" style={{ padding: 0 }}>
//                                     <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
//                                         {filteredDailyRegisters.length === 0 ? (
//                                             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                 <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                                                 <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}</p>
//                                             </div>
//                                         ) : (
//                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
//                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                                                     <tr>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Expected Duration</th>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Captured</th>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Present (80%+)</th>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Short Hours</th>
//                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Absent</th>
//                                                     </tr>
//                                                 </thead>
//                                                 <tbody>
//                                                     {filteredDailyRegisters.map((reg) => {
//                                                         const presentCount = reg.presentLearners?.length || 0;
//                                                         const absentCount = reg.absentLearners?.length || 0;
//                                                         const partialCount = reg.partialLearners?.length || 0;
//                                                         const totalCaptured = presentCount + absentCount + partialCount;

//                                                         return (
//                                                             <tr key={reg.id}>
//                                                                 <td style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
//                                                                     {reg.date ? new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
//                                                                 </td>
//                                                                 <td>
//                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                                                         <Clock size={14} /> {reg.expectedDuration || 0} mins
//                                                                     </span>
//                                                                 </td>
//                                                                 <td style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{totalCaptured} Learners</td>
//                                                                 <td>
//                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--mlab-green)' }}>
//                                                                         <CheckCircle2 size={12} /> {presentCount}
//                                                                     </span>
//                                                                 </td>
//                                                                 <td>
//                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fcd34d' }}>
//                                                                         <AlertCircle size={12} /> {partialCount}
//                                                                     </span>
//                                                                 </td>
//                                                                 <td>
//                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
//                                                                         <XCircle size={12} /> {absentCount}
//                                                                     </span>
//                                                                 </td>
//                                                             </tr>
//                                                         );
//                                                     })}
//                                                 </tbody>
//                                             </table>
//                                         )}
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                    {/* ─── TAB: SURVEYS & FEEDBACK (NATIVE ENGINE) ─── */}
// {activeTab === 'surveys' && (
//     <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
//         {/* COHORT SURVEY KPI CARDS */}
//         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
//             <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-green)', padding: '1.25rem' }}>
//                 <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Average Feedback Rating</div>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
//                     <Star size={28} color="#f59e0b" fill="#f59e0b" />
//                     <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.avgScore}</span>
//                     <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>/ 5.0</span>
//                 </div>
//             </div>

//             <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
//                 <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Cohort Participation Rate</div>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
//                     <Users size={24} color="var(--mlab-blue)" />
//                     <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.completionRate}%</span>
//                     <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>({cohortSurveyMetrics.totalSubmissions} / {activeCount})</span>
//                 </div>
//             </div>

//             <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
//                 <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Feedback Submissions</div>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
//                     <HelpCircle size={24} color="var(--mlab-green)" />
//                     <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.totalSubmissions}</span>
//                     <span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>Log Entries</span>
//                 </div>
//             </div>
//         </div>

//         {/* NATIVE SURVEYS ASSIGNED TO THIS COHORT */}
//         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
//             <div className="lfm-header">
//                 <h2 className="lfm-header__title">
//                     <HelpCircle size={18} /> Assigned Surveys for {cohort.name} ({cohortTargetedSurveys.length})
//                 </h2>
//             </div>
//             <div className="lfm-body" style={{ padding: '1.25rem', background: 'var(--mlab-bg)' }}>
//                 {cohortTargetedSurveys.length === 0 ? (
//                     <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                         No native survey forms published for this cohort.
//                     </div>
//                 ) : (
//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
//                         {cohortTargetedSurveys.map(survey => {
//                             const subCount = cohortSurveyResponses.filter(r => r.surveyId === survey.id).length;
//                             const isGlobal = !survey.cohortIds || survey.cohortIds.includes('ALL');

//                             return (
//                                 <div key={survey.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
//                                     <div>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
//                                             <strong style={{ fontSize: '0.95rem', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>{survey.title}</strong>
//                                             <span style={{ fontSize: '0.65rem', fontWeight: 'bold', background: isGlobal ? 'var(--mlab-light-blue)' : 'var(--mlab-green-bg)', color: isGlobal ? 'var(--mlab-blue)' : 'var(--mlab-green-dark)', padding: '2px 6px', border: `1px solid ${isGlobal ? 'var(--mlab-border)' : 'var(--mlab-green)'}` }}>
//                                                 {isGlobal ? 'All Cohorts' : 'Specific Cohort'}
//                                             </span>
//                                         </div>
//                                         {survey.description && (
//                                             <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
//                                                 {survey.description}
//                                             </p>
//                                         )}
//                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>
//                                             {survey.questions?.length || 0} Questions • {subCount} / {activeCount} Responded
//                                         </div>
//                                     </div>

//                                     <div style={{ display: 'flex', gap: '8px' }}>
//                                         <button 
//                                             onClick={() => handleCopySurveyLink(survey.id)} 
//                                             className="lfm-btn lfm-btn--ghost" 
//                                             style={{ flex: 1, fontSize: '0.72rem', padding: '6px 8px' }}
//                                         >
//                                             <LinkIcon size={12} /> Share Link
//                                         </button>
//                                         <button 
//                                             onClick={() => window.open(`/survey/${survey.id}`, '_blank')} 
//                                             className="lfm-btn lfm-btn--primary" 
//                                             style={{ flex: 1, fontSize: '0.72rem', padding: '6px 8px' }}
//                                         >
//                                             <Eye size={12} /> Preview Form
//                                         </button>
//                                     </div>
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 )}
//             </div>
//         </div>

//         {/* COHORT SUBMISSIONS TABLE */}
//         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
//             <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
//                 <h2 className="lfm-header__title">
//                     <HelpCircle size={18} /> Cohort Survey Submissions ({filteredSurveyResponses.length})
//                 </h2>

//                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
//                     <div style={{ position: 'relative', width: '220px' }}>
//                         <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
//                         <input
//                             type="text"
//                             className="lfm-input"
//                             value={surveySearchQuery}
//                             onChange={e => setSurveySearchQuery(e.target.value)}
//                             placeholder="Search participant..."
//                             style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem' }}
//                         />
//                     </div>

//                     <button className="lfm-btn" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none' }} onClick={exportCohortSurveyExcel}>
//                         <DownloadCloud size={14} /> Export Feedback
//                     </button>
//                 </div>
//             </div>

//             <div className="lfm-body" style={{ padding: 0 }}>
//                 <div className="mlab-table-wrap">
//                     {filteredSurveyResponses.length === 0 ? (
//                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                             <HelpCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                             <p style={{ fontFamily: 'var(--font-body)', margin: 0 }}>No survey feedback logs found for this cohort.</p>
//                         </div>
//                     ) : (
//                         <table className="mlab-table" style={{ margin: 0 }}>
//                             <thead style={{ background: 'var(--mlab-light-blue)' }}>
//                                 <tr>
//                                     <th>Date Submitted</th>
//                                     <th>Participant</th>
//                                     <th>Survey Template</th>
//                                     <th>Contact Status</th>
//                                     <th style={{ textAlign: 'center' }}>Actions</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {filteredSurveyResponses.map(resp => {
//                                     const template = surveyTemplates.find(s => s.id === resp.surveyId);

//                                     return (
//                                         <tr key={resp.id}>
//                                             <td style={{ whiteSpace: 'nowrap' }}>
//                                                 {new Date(resp.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
//                                             </td>
//                                             <td>
//                                                 <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{resp.learnerName || 'Anonymous Participant'}</div>
//                                                 <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{resp.learnerEmail || resp.learnerPhone || 'N/A'}</div>
//                                             </td>
//                                             <td>
//                                                 <span style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{template?.title || resp.surveyId}</span>
//                                             </td>
//                                             <td>
//                                                 {resp.isVerifiedRespondent 
//                                                     ? <span className="sm-badge-verified"><CheckCircle2 size={12}/> Verified</span>
//                                                     : <span className="sm-badge-unverified">Unverified</span>
//                                                 }
//                                             </td>
//                                             <td style={{ textAlign: 'center' }}>
//                                                 <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
//                                                     <button onClick={() => setViewingSurveyResponse({ response: resp, template })} title="View Submission Details" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
//                                                         <Eye size={14} />
//                                                     </button>
//                                                     <button onClick={() => handleDeleteCohortResponse(resp.id)} title="Delete Response" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>
//                                                         <Trash2 size={14} />
//                                                     </button>
//                                                 </div>
//                                             </td>
//                                         </tr>
//                                     );
//                                 })}
//                             </tbody>
//                         </table>
//                     )}
//                 </div>
//             </div>
//         </div>
//     </div>
// )}
//                 </div>
//             </main>

//             {/* MODAL: VIEW COHORT SURVEY RESPONSE DETAILS */}
//             {viewingSurveyResponse && (
//                 <div className="lfm-overlay" onClick={() => setViewingSurveyResponse(null)} style={{ zIndex: 9999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title"><HelpCircle size={16} /> Participant Feedback</h2>
//                             <button className="lfm-close-btn" onClick={() => setViewingSurveyResponse(null)}><X size={20} /></button>
//                         </div>
                        
//                         <div className="lfm-body" style={{ background: '#f8fafc', padding: 0 }}>
//                             <div style={{ padding: '1.25rem', background: '#fff', borderBottom: '1px solid var(--mlab-border)' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
//                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.2rem', textTransform: 'uppercase' }}>
//                                         {viewingSurveyResponse.response.learnerName || 'Anonymous'}
//                                     </h3>
//                                     {viewingSurveyResponse.response.isVerifiedRespondent 
//                                         ? <span className="sm-badge-verified"><CheckCircle2 size={12}/> Verified Contact</span>
//                                         : <span className="sm-badge-unverified">Unverified</span>
//                                     }
//                                 </div>
//                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                     <span><strong>Survey Form:</strong> {viewingSurveyResponse.template?.title || viewingSurveyResponse.response.surveyId}</span>
//                                     <span><strong>Submitted:</strong> {new Date(viewingSurveyResponse.response.submittedAt).toLocaleString('en-ZA')}</span>
//                                     {viewingSurveyResponse.response.learnerEmail && <span><strong>Email:</strong> {viewingSurveyResponse.response.learnerEmail}</span>}
//                                 </div>
//                             </div>

//                             <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                                 <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Feedback Breakdown</h4>
                                
//                                 {viewingSurveyResponse.template?.questions?.map((q: any, idx: number) => {
//                                     const answer = viewingSurveyResponse.response.answers?.[q.id];
                                    
//                                     return (
//                                         <div key={q.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem' }}>
//                                             <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', marginBottom: '8px' }}>
//                                                 {idx + 1}. {q.label}
//                                             </div>
                                            
//                                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
//                                                 {answer === undefined || answer === '' ? (
//                                                     <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Skipped / No Answer</span>
//                                                 ) : q.type === 'rating' ? (
//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                         <Star size={16} color="#f59e0b" fill="#f59e0b" />
//                                                         <strong>{answer}</strong> / {q.maxStars || 5}
//                                                     </div>
//                                                 ) : q.type === 'address' ? (
//                                                     <div style={{ background: 'var(--mlab-bg)', padding: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.8rem' }}>
//                                                         <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={12}/> {answer.formattedAddress}</div>
//                                                         {answer.localMunicipality && <div style={{ color: 'var(--mlab-grey)' }}>Municipality: {answer.localMunicipality}</div>}
//                                                     </div>
//                                                 ) : (
//                                                     <span style={{ whiteSpace: 'pre-wrap' }}>{String(answer)}</span>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     );
//                                 })}
//                             </div>
//                         </div>
                        
//                         <div className="lfm-footer" style={{ justifyContent: 'flex-end' }}>
//                             <button type="button" className="lfm-btn lfm-btn--outline" onClick={() => setViewingSurveyResponse(null)} style={{ background: '#fff', border: '1px solid var(--mlab-border)' }}>Close View</button>
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };



// // // src/components/views/CohortsView/QCTOCohortView.tsx

// // import React, { useMemo, useState, useEffect } from 'react';
// // import { useNavigate, useSearchParams } from 'react-router-dom';
// // import { createPortal } from 'react-dom';
// // import {
// //     Users, Calendar, ChevronLeft, DownloadCloud,
// //     FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
// //     UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
// //     Layers, ChevronUp, ChevronDown, Sparkles,
// //     Edit3, X, PenTool, FileText, CheckCircle,
// //     Loader2, RefreshCcw, BookOpen, Filter,
// //     ChevronRight,
// //     History,
// //     Award,
// //     ShieldCheck
// // } from 'lucide-react';
// // import * as XLSX from 'xlsx';
// // import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, getDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// // import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
// // import type { DashboardLearner } from '../../../types';

// // import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
// // import { LearnerDropoutModal } from './LearnerDropoutModal';
// // import { AILessonPlanModal } from './AILessonPlanModal';
// // import { StipendExportModal } from '../../common/StipendExportModal/StipendExportModal';
// // import moment from 'moment';

// // const formatQCTODate = (d?: string) => {
// //     if (!d) return '';
// //     const dt = new Date(d);
// //     if (isNaN(dt.getTime())) return '';
// //     return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
// // };

// // const getDOBFromID = (id: string) => {
// //     const clean = String(id || '').replace(/\s/g, '');
// //     if (clean.length !== 13) return '';
// //     try {
// //         let y = parseInt(clean.substring(0, 2), 10);
// //         const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
// //         y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
// //         return `${y}${m}${d2}`;
// //     } catch { return ''; }
// // };

// // const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

// // // Helper to convert Firestore Timestamps, ISO strings, or numbers safely to milliseconds
// // const getTimestampMs = (val: any): number => {
// //     if (!val) return 0;
// //     if (typeof val?.toDate === 'function') return val.toDate().getTime();
// //     if (val?.seconds) return val.seconds * 1000;
// //     const t = new Date(val).getTime();
// //     return isNaN(t) ? 0 : t;
// // };

// // // Formats timestamp into a clean, human-readable South African date & time
// // const formatLastLogin = (lastLoginAt: any): string => {
// //     const ms = getTimestampMs(lastLoginAt);
// //     if (!ms) return 'Never';

// //     const date = new Date(ms);
// //     return date.toLocaleString('en-ZA', {
// //         day: '2-digit',
// //         month: 'short',
// //         year: 'numeric',
// //         hour: '2-digit',
// //         minute: '2-digit',
// //     });
// // };

// // export const ModuleChip: React.FC<{label: string, count: number, variant: 'k'|'p'|'w'}> = ({ label, count, variant }) => (
// //     <span className={`cdp-chip cdp-chip--${variant}`} style={{ borderRadius: 0 }}>{label}: {count}</span>
// // );

// // // ─── QCTO COHORT VIEW COMPONENT ─────────────────────────────────────────────

// // export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
// //     const navigate = useNavigate();
// //     const [searchParams, setSearchParams] = useSearchParams();
// //     const toast = useToast();

// //     const { user, learners, staff, employers, settings, programmes } = useStore();

// //     // 🚀 OPTIMIZED: Sync Active Tab with URL Params
// //     const urlTab = searchParams.get('tab');
// //     const activeTab = (urlTab === 'curriculum' || urlTab === 'calendar' || urlTab === 'attendance') 
// //         ? urlTab 
// //         : 'learners'; 

// //     const setActiveTab = (tab: 'learners' | 'curriculum' | 'calendar' | 'attendance') => {
// //         setSearchParams((prev) => {
// //             prev.set('tab', tab);
// //             prev.delete('expanded'); // Clear expanded accordions when switching tabs
// //             return prev;
// //         }, { replace: true });
// //     };

// //     const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

// //     const [isSyncing, setIsSyncing] = useState(false);
// //     const [isExporting, setIsExporting] = useState(false);
// //     const [isGrantingTime, setIsGrantingTime] = useState(false);
// //     const [isLogging, setIsLogging] = useState(false);
// //     const [showAIModal, setShowAIModal] = useState(false);
// //     const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    
// //     // State to toggle KPI visibility (Defaults to true)
// //     const [showKPIs, setShowKPIs] = useState(true);

// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
// //     const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

// //     const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
// //     const [ledgerDates, setLedgerDates] = useState<string[]>([]);

// //     const [submissions, setSubmissions] = useState<any[]>([]);
// //     const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
// //     const [sessionReports, setSessionReports] = useState<any[]>([]);
// //     const [editingReport, setEditingReport] = useState<any | null>(null);

// //     // Sync Expanded Modules with URL Params
// //     const urlExpanded = searchParams.get('expanded');
// //     const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

// //     const toggleModuleAccordion = (moduleCode: string) => {
// //         setSearchParams((prev) => {
// //             const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);
// //             if (current.has(moduleCode)) current.delete(moduleCode);
// //             else current.add(moduleCode);
            
// //             if (current.size > 0) prev.set('expanded', Array.from(current).join(','));
// //             else prev.delete('expanded');
            
// //             return prev;
// //         }, { replace: true });
// //     };

// //     const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
// //     const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
// //     const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

// //     const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);

// //     // Calendar State Variables
// //     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);
// //     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
// //     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
// //     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

// //     const [holidays, setHolidays] = useState<string[]>([]);
// //     const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

// //     // Fetch Holidays for Calendar
// //     useEffect(() => {
// //         const fetchHolidays = async () => {
// //             const currentYear = new Date().getFullYear();
// //             const cacheKey = `holidays_za_${currentYear}`;
// //             const cached = localStorage.getItem(cacheKey);

// //             if (cached) {
// //                 setHolidays(JSON.parse(cached));
// //             } else {
// //                 try {
// //                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
// //                     if (res.ok) {
// //                         const data = await res.json();
// //                         const dateList = data.map((h: any) => h.date);
// //                         setHolidays(dateList);
// //                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
// //                     }
// //                 } catch (e) {
// //                     console.warn("Holiday API unreachable for analytics.");
// //                 }
// //             }
// //         };
// //         fetchHolidays();
// //     }, []);

// //     // Fetch Leaves for Calendar
// //     useEffect(() => {
// //         if (!cohort?.id) return;
// //         const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
// //         const unsub = onSnapshot(q, snap => {
// //             setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //         });
// //         return () => unsub();
// //     }, [cohort?.id]);

// //     useEffect(() => {
// //         if (!cohort?.id) return;
// //         const q = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //             setLiveEnrollments(results);
// //         });
// //         return () => unsubscribe();
// //     }, [cohort.id]);

// //     const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
// //     const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
// //     const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

// //     const toggleAssessmentAccordion = (id: string) => {
// //         setExpandedAssessments(prev => {
// //             const next = new Set(prev);
// //             next.has(id) ? next.delete(id) : next.add(id);
// //             return next;
// //         });
// //     };

// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
// //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);
// //     const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

// //     const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

// //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin === true;
// //     const isFacilitator = user?.role === 'facilitator';

// //     const handleBack = () => {
// //         if (isAdmin) {
// //             navigate('/admin', { state: { activeTab: 'cohorts' } });
// //         } else {
// //             navigate(-1);
// //         }
// //     };

// //     const activeProgramme = useMemo(() => {
// //         if (!cohort || !programmes.length) return null;
// //         const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
// //         if (!templateId) return null;
// //         return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
// //     }, [cohort, programmes]);

// //     const groupedCurriculum = useMemo(() => {
// //         if (!activeProgramme) return {};
// //         const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
// //         const extractItems = (modules: any[], type: string) => {
// //             (modules || []).forEach(mod => {
// //                 const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
// //                 const modCode = mod.code || 'General';
// //                 if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
// //                 subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
// //             });
// //         };
// //         extractItems(activeProgramme.knowledgeModules, 'Knowledge');
// //         extractItems(activeProgramme.practicalModules, 'Practical');
// //         extractItems(activeProgramme.workExperienceModules, 'Workplace');
// //         return groups;
// //     }, [activeProgramme]);

// //     const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

// //     const groupedHistoryLogs = useMemo(() => {
// //         const groups: Record<string, any[]> = {};
// //         curriculumLogs.forEach(log => {
// //             const modCode = log.moduleCode || 'Uncategorized';
// //             if (!groups[modCode]) groups[modCode] = [];
// //             groups[modCode].push(log);
// //         });
// //         return groups;
// //     }, [curriculumLogs]);

// //     const moduleProgress = useMemo(() => {
// //         const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
// //         Object.values(groupedCurriculum).forEach(group => {
// //             const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
// //             if (stats[type]) {
// //                 stats[type].total += group.items.length;
// //                 stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// //             }
// //         });
// //         return stats;
// //     }, [groupedCurriculum, curriculumLogs]);

// //     const enrolledLearners = useMemo(() => {
// //         const merged: DashboardLearner[] = [];

// //         liveEnrollments.forEach(enrollment => {
// //             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
// //             if (profile?.fullName && profile?.idNumber) {
// //                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
// //             }
// //         });

// //         learners.forEach(profile => {
// //             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
// //                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
// //             }
// //         });
// //         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
// //     }, [learners, liveEnrollments, cohort.id]);

// //     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

// //     useEffect(() => {
// //         if (!cohort?.id) return;
// //         const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //             regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
// //             setDailyRegisters(regs);
// //         });
// //         return () => unsubscribe();
// //     }, [cohort.id]);

// //     const rosterAttendanceMap = useMemo(() => {
// //         const map = new Map<string, { attended: number; total: number; pct: number }>();
// //         const totalSessions = dailyRegisters.length;

// //         enrolledLearners.forEach(l => {
// //             if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
// //         });

// //         dailyRegisters.forEach(reg => {
// //             const present = reg.presentLearners || [];
// //             present.forEach((idNum: string) => {
// //                 if (map.has(idNum)) {
// //                     map.get(idNum)!.attended += 1;
// //                 }
// //             });
// //         });

// //         map.forEach(value => {
// //             value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
// //         });

// //         return map;
// //     }, [dailyRegisters, enrolledLearners]);

// //     // ─── COHORT-SPECIFIC METRICS CALCULATION ───
// //     const cohortDemographics = useMemo(() => {
// //         let blackCount = 0, colouredCount = 0, indianCount = 0, whiteCount = 0, otherCount = 0;
// //         let youthCount = 0;

// //         enrolledLearners.forEach(l => {
// //             const eq = ((l as any).equityGroup || l.demographics?.equityCode || '').trim().toLowerCase();
// //             if (eq.includes('african') || eq === 'black' || eq === 'ba') blackCount++;
// //             else if (eq.includes('coloured') || eq === 'bc') colouredCount++;
// //             else if (eq.includes('indian') || eq === 'bi') indianCount++;
// //             else if (eq.includes('white') || eq === 'wh') whiteCount++;
// //             else otherCount++;

// //             let isYouth = true;
// //             if (l.idNumber && l.idNumber.length >= 6) {
// //                 const yearNum = parseInt(l.idNumber.substring(0, 2), 10);
// //                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// //                 const age = new Date().getFullYear() - birthYear;
// //                 if (age > 35) isYouth = false;
// //             } else if ((l.demographics as any)?.youthStatus === 'N') {
// //                 isYouth = false;
// //             }
// //             if (isYouth) youthCount++;
// //         });

// //         return { blackCount, colouredCount, indianCount, whiteCount, otherCount, youthCount, total: enrolledLearners.length };
// //     }, [enrolledLearners]);

// //     const attendanceHealth = useMemo(() => {
// //         let high = 0, mid = 0, low = 0;
// //         enrolledLearners.forEach(l => {
// //             const stats = rosterAttendanceMap.get(l.idNumber || '');
// //             const pct = stats ? stats.pct : 0;
// //             if (pct >= 75) high++;
// //             else if (pct >= 40) mid++;
// //             else low++;
// //         });
// //         return { high, mid, low, total: enrolledLearners.length };
// //     }, [enrolledLearners, rosterAttendanceMap]);


// //     const filteredLearners = useMemo(() => {
// //         return enrolledLearners.filter(learner => {
// //             const searchLower = searchTerm.toLowerCase().trim();
// //             const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
// //             const matchesSearch = !searchLower ||
// //                 learner.fullName.toLowerCase().includes(searchLower) ||
// //                 learner.idNumber.includes(searchLower) ||
// //                 dbEmail.includes(searchLower);

// //             const matchesStatus = statusFilter === 'all' ||
// //                 (statusFilter === 'active' && learner.status !== 'dropped') ||
// //                 (statusFilter === 'dropped' && learner.status === 'dropped');

// //             const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
// //             let matchesAttendance = true;
// //             if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
// //             else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
// //             else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

// //             return matchesSearch && matchesStatus && matchesAttendance;
// //         });
// //     }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

// //     const filteredDailyRegisters = useMemo(() => {
// //         if (ledgerDates.length === 0) return dailyRegisters;
// //         return dailyRegisters.filter(reg => {
// //             return ledgerDates.includes(reg.date);
// //         });
// //     }, [dailyRegisters, ledgerDates]);

// //     const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const date = e.target.value;
// //         if (date && !ledgerDates.includes(date)) {
// //             setLedgerDates([...ledgerDates, date]);
// //         }
// //     };

// //     const removeLedgerDate = (dateToRemove: string) => {
// //         setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
// //     };

// //     const fetchSubmissions = async () => {
// //         try {
// //             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
// //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //         } catch (e) { console.error('Error fetching submissions:', e); }
// //     };

// //     useEffect(() => {
// //         fetchSubmissions();
// //         const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
// //         const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
// //         const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
// //         const unsubReports = onSnapshot(reportsQ, (snap) => {
// //             const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
// //             reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
// //             setSessionReports(reps);
// //         });
// //         return () => { unsubLogs(); unsubReports(); };
// //     }, [cohort.id]);

// //     const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
// //     const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
// //     const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
// //     const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

// //     const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string, sessionDateStr?: string) => {
// //         const finalDate = sessionDateStr || new Date().toISOString().split('T')[0];
// //         const finalTimestamp = `${finalDate}T12:00:00.000Z`;

// //         if (isEdit && reportId) {
// //             setIsLogging(true);
// //             try {
// //                 const batch = writeBatch(db);

// //                 batch.update(doc(db, 'session_reports', reportId), {
// //                     reportHtml: planHtml,
// //                     evidenceLinks,
// //                     dateLogged: finalTimestamp,
// //                     sessionDate: finalDate,
// //                     lastEditedAt: new Date().toISOString(),
// //                     lastEditedBy: user?.uid
// //                 });

// //                 const logsQ = query(collection(db, 'curriculum_logs'), where('sessionReportId', '==', reportId));
// //                 const logsSnap = await getDocs(logsQ);
// //                 logsSnap.forEach(logDoc => {
// //                     batch.update(logDoc.ref, {
// //                         coveredAt: finalDate
// //                     });
// //                 });

// //                 await batch.commit();
// //                 toast.success("Session report updated successfully.");
// //                 setShowAIModal(false);
// //                 setEditingReport(null);
// //             } catch (error) {
// //                 toast.error("Failed to update report.");
// //             } finally {
// //                 setIsLogging(false);
// //             }
// //         } else {
// //             const selectedTopicIds = Object.keys(selectedTopics);
// //             if (selectedTopicIds.length === 0) return;
// //             setShowAIModal(false);
// //             setIsLogging(true);
// //             try {
// //                 const batch = writeBatch(db);
// //                 const now = new Date();
// //                 const reportRef = doc(collection(db, 'session_reports'));

// //                 batch.set(reportRef, {
// //                     cohortId: cohort.id,
// //                     facilitatorId: user?.uid,
// //                     facilitatorName: user?.fullName,
// //                     facilitatorSignatureUrl: user?.signatureUrl || null,
// //                     dateLogged: finalTimestamp,
// //                     sessionDate: finalDate,
// //                     reportHtml: planHtml,
// //                     evidenceLinks,
// //                     topicsCovered: selectedTopicIds
// //                 });

// //                 selectedTopicIds.forEach(topicId => {
// //                     const itemDef = curriculumItems.find(i => i.id === topicId);
// //                     if (!itemDef) return;
// //                     const coveredDateStr = selectedTopics[topicId] || finalDate;

// //                     batch.set(doc(collection(db, 'curriculum_logs')), {
// //                         cohortId: cohort.id,
// //                         topicId: itemDef.id,
// //                         topicCode: itemDef.code,
// //                         topicTitle: itemDef.title,
// //                         moduleCode: itemDef.moduleCode,
// //                         moduleName: itemDef.moduleName,
// //                         moduleType: itemDef.moduleType,
// //                         coveredAt: coveredDateStr,
// //                         loggedAt: now.toISOString(),
// //                         deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
// //                         loggedBy: user?.uid,
// //                         loggedByName: user?.fullName,
// //                         sessionReportId: reportRef.id,
// //                         acknowledgedBy: [],
// //                         penalizeLearners: []
// //                     });
// //                 });

// //                 await batch.commit();
// //                 setSelectedTopics({});
// //                 showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
// //             } catch (error) {
// //                 showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
// //             } finally {
// //                 setIsLogging(false);
// //             }
// //         }
// //     };

// //     const assessmentStatsMap = useMemo(() => {
// //         const map = new Map<string, {
// //             assessmentId: string,
// //             title: string,
// //             writing: any[],
// //             pending: any[],
// //             graded: any[],
// //             learnerNamesWriting: string[]
// //         }>();

// //         submissions.forEach(s => {
// //             if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

// //             if (!map.has(s.assessmentId)) {
// //                 map.set(s.assessmentId, {
// //                     assessmentId: s.assessmentId,
// //                     title: s.title || 'Unknown Assessment',
// //                     writing: [], pending: [], graded: [], learnerNamesWriting: []
// //                 });
// //             }

// //             const entry = map.get(s.assessmentId)!;

// //             if (s.status === 'in_progress') {
// //                 entry.writing.push(s);
// //                 const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
// //                 if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
// //             } else if (s.status === 'submitted') {
// //                 entry.pending.push(s);
// //             } else if (s.status === 'graded' || s.status === 'moderated') {
// //                 entry.graded.push(s);
// //             }
// //         });

// //         return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
// //     }, [submissions, enrolledLearners]);

// //     const filteredAssessments = useMemo(() => {
// //         if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
// //         if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
// //         return assessmentStatsMap;
// //     }, [assessmentStatsMap, assessmentFilter]);

// //     const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
// //     const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

// //     const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
// //         if (subsToUpdate.length === 0) return;
// //         if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

// //         setIsGrantingTime(true);
// //         try {
// //             const batch = writeBatch(db);
// //             subsToUpdate.forEach(sub => {
// //                 batch.update(doc(db, 'learner_submissions', sub.id), {
// //                     extraTimeGranted: increment(minutes),
// //                     lastStaffEditAt: new Date().toISOString()
// //                 });
// //             });
// //             await batch.commit();
// //             toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
// //             await fetchSubmissions();
// //         } catch (error) {
// //             toast.error("Failed to grant extra time.");
// //         } finally {
// //             setIsGrantingTime(false);
// //         }
// //     };

// //     const handleQCTOExport = async () => {
// //         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
// //         setIsExporting(true);
// //         try {
// //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
// //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// //             const todayQCTO = formatQCTODate(new Date().toISOString());

// //             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

// //             const dataRows = [headers.map(createTextCell)];
// //             enrolledLearners.forEach(learner => {
// //                 const d = learner.demographics || {};
// //                 const names = (learner.fullName || '').trim().split(' ');
// //                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
// //                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
// //             });

// //             const wb = XLSX.utils.book_new();
// //             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
// //             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
// //             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
// //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// //             XLSX.writeFile(wb, fileName);
// //             toast.success(`Export successful: ${fileName}`);
// //         } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
// //     };

// //     const syncLearnerWorkbooks = async () => {
// //         setIsSyncing(true);
// //         try {
// //             const batch = writeBatch(db);
// //             const aRef = collection(db, 'assessments');
// //             const [snapA, snapS] = await Promise.all([
// //                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// //                 getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// //             ]);
// //             const allAssessments = new Map<string, any>();
// //             snapA.docs.forEach(d => allAssessments.set(d.id, d));
// //             snapS.docs.forEach(d => allAssessments.set(d.id, d));

// //             if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

// //             const activeLearnersToSync = enrolledLearners.filter(l => l.status !== 'dropped');

// //             let count = 0;
// //             for (const learner of activeLearnersToSync) {
// //                 const enrolId = learner.enrollmentId || learner.id;
// //                 const humanId = learner.learnerId || learner.id;
// //                 for (const [astId, astDoc] of allAssessments.entries()) {
// //                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.learnerId === humanId));
// //                     if (!exists) {
// //                         const data = astDoc.data();
// //                         batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
// //                         count++;
// //                     }
// //                 }
// //             }
// //             if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
// //             else toast.success('All active learners are synced.');
// //         } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
// //     };

// //     const getStaffName = async (id: string) => {
// //         const cachedStaff = useStore.getState().staff;
// //         const match = cachedStaff.find(s => s.id === id);
// //         if (match) return match.fullName;

// //         try {
// //             const userSnap = await getDoc(doc(db, 'users', id));
// //             if (userSnap.exists()) return userSnap.data().fullName;
// //         } catch { }

// //         return 'Unassigned';
// //     };

// //     const [facName, setFacName] = useState('Loading...');
// //     const [assName, setAssName] = useState('Loading...');
// //     const [modName, setModName] = useState('Loading...');

// //     useEffect(() => {
// //         if (!cohort) return;
// //         getStaffName(cohort.facilitatorId).then(setFacName);
// //         getStaffName(cohort.assessorId).then(setAssName);
// //         getStaffName(cohort.moderatorId).then(setModName);
// //     }, [cohort]);


// // const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
// //     if (!learnerToDrop) return;
// //     try {
// //         const batch = writeBatch(db);

// //         const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
// //         const enrollRef = doc(db, 'enrollments', routingId);

// //         batch.update(enrollRef, {
// //             status: 'dropped',
// //             exitDate: data.date,
// //             exitReasonCategory: data.reason,
// //             exitNotes: data.notes,
// //             exitEvidenceUrl: data.evidenceUrl,
// //             resignationLetterUrl: data.resignationUrl,
// //             updatedAt: new Date().toISOString()
// //         });

// //         const learnersRef = collection(db, 'learners');
// //         const q = query(learnersRef, where("idNumber", "==", learnerToDrop.idNumber));
// //         const snapshot = await getDocs(q);

// //         if (!snapshot.empty) {
// //             const actualLearnerDoc = snapshot.docs[0];
// //             const learnerRef = doc(db, 'learners', actualLearnerDoc.id);

// //             batch.update(learnerRef, {
// //                 status: 'dropped',
// //                 updatedAt: new Date().toISOString()
// //             });
// //         } else {
// //             console.warn(`Could not find base learner document for ID: ${learnerToDrop.idNumber}. Continuing with enrollment update.`);
// //         }

// //         await batch.commit();

// //         toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);

// //         if (useStore.getState().fetchLearners) {
// //             useStore.getState().fetchLearners(true);
// //         }

// //         setLearnerToDrop(null); 
// //     } catch (err: any) {
// //         console.error("Error in handleConfirmDrop:", err);
// //         toast.error(err.message || 'Failed to complete withdrawal process.');
// //         throw err;
// //     }
// // };

// //     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
// //     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
// //     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
// //     const selectedTopicCount = Object.keys(selectedTopics).length;

// //     // ─── CALENDAR GENERATOR LOGIC ───
// //     const calendarGrid = useMemo(() => {
// //         const startDay = calendarMonth.day();
// //         const diff = startDay === 0 ? 6 : startDay - 1;
// //         const startGrid = calendarMonth.clone().subtract(diff, 'days');

// //         const endOfMonth = calendarMonth.clone().endOf('month');
// //         const endDay = endOfMonth.day();
// //         const endDiff = endDay === 0 ? 0 : 7 - endDay;
// //         const endGrid = endOfMonth.clone().add(endDiff, 'days');

// //         const grid = [];
// //         let curr = startGrid.clone();
// //         while (curr.isSameOrBefore(endGrid)) {
// //             grid.push(curr.clone());
// //             curr.add(1, 'day');
// //         }
// //         return grid;
// //     }, [calendarMonth]);

// //     const calendarDataMap = useMemo(() => {
// //         const map = new Map();

// //         holidays.forEach(h => map.set(h, { isHoliday: true }));

// //         if (cohort?.recessPeriods) {
// //             cohort.recessPeriods.forEach((p: any) => {
// //                 let curr = moment(p.start);
// //                 const end = moment(p.end);
// //                 if (!curr.isValid() || !end.isValid()) return;
// //                 let failsafe = 0;
// //                 while (curr.isSameOrBefore(end) && failsafe < 60) {
// //                     const dStr = curr.format('YYYY-MM-DD');
// //                     map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
// //                     curr.add(1, 'day');
// //                     failsafe++;
// //                 }
// //             });
// //         }
        
// //         dailyRegisters.forEach(h => {
// //             if (!h.date) return;
// //             const dStr = moment(h.date).format('YYYY-MM-DD');
// //             const existing = map.get(dStr) || {};
// //             existing.hasRegister = true;
// //             existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
// //             existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
// //             map.set(dStr, existing);
// //         });

// //         cohortLeaves.forEach(l => {
// //             if (!l.startDate && !l.dateAffected) return;
// //             let curr = moment(l.startDate || l.dateAffected);
// //             const end = moment(l.endDate || l.dateAffected);
// //             if (!curr.isValid() || !end.isValid()) return;
// //             let failsafe = 0;
// //             while(curr.isSameOrBefore(end) && failsafe < 60) {
// //                 const dStr = curr.format('YYYY-MM-DD');
// //                 const existing = map.get(dStr) || {};
// //                 existing.leaves = (existing.leaves || 0) + 1;
// //                 if(l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
// //                 map.set(dStr, existing);
// //                 curr.add(1, 'day');
// //                 failsafe++;
// //             }
// //         });
        
// //         return map;
// //     }, [dailyRegisters, holidays, cohort, cohortLeaves]);

// //     return (
// //         <div className="cdp-layout">

// //             {/* SVG DEFINITIONS FOR PROGRESS CARD GRADIENTS */}
// //             <svg width="0" height="0" style={{ position: 'absolute' }}>
// //                 <defs>
// //                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
// //                         <stop offset="0%" stopColor="var(--mlab-green)" />
// //                         <stop offset="100%" stopColor="var(--mlab-green-dark)" />
// //                     </linearGradient>
// //                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
// //                         <stop offset="0%" stopColor="#38bdf8" />
// //                         <stop offset="100%" stopColor="#0284c7" />
// //                     </linearGradient>
// //                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
// //                         <stop offset="0%" stopColor="#f59e0b" />
// //                         <stop offset="100%" stopColor="#d97706" />
// //                     </linearGradient>
// //                     <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
// //                         <stop offset="0%" stopColor="#38bdf8" />
// //                         <stop offset="100%" stopColor="#0284c7" />
// //                     </linearGradient>
// //                     <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
// //                         <stop offset="0%" stopColor="#94a3b8" />
// //                         <stop offset="100%" stopColor="#475569" />
// //                     </linearGradient>
// //                 </defs>
// //             </svg>

// //             {/* STRICT MLAB STYLING OVERRIDES FOR CARDS & MODULES */}
// //             <style>{`
// //                 .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
// //                 .mc:hover { transform: translateY(-4px); }
// //                 .mc-orb { display: none; }
                
// //                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
// //                 .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
// //                 .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
// //                 .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
// //                 .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
// //                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem 0; }
// //                 .mc-ring-svg { transform: rotate(-90deg); }
// //                 .mc-ring-track { fill: none; stroke: var(--mlab-border); stroke-width: 8px; }
// //                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: butt; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
// //                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
// //                 .mc-ring-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--mlab-blue); }
// //                 .mc-ring-denom { font-family: var(--font-heading); text-transform: uppercase; font-size: 0.65rem; font-weight: 700; color: var(--mlab-grey); }
                
// //                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
// //                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
// //                 .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
// //                 .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
// //                 .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
// //                 .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                
// //                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
// //                 .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
// //                 .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
// //                 .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
// //                 .mc-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; background: var(--mlab-blue); }
                
// //                 .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background: var(--mlab-green); } .mc-k .mc-fill-secondary { background: var(--mlab-green-bg); }
// //                 .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background: #0ea5e9; } .mc-p .mc-fill-secondary { background: #e0f2fe; }
// //                 .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background: #d97706; } .mc-w .mc-fill-secondary { background: #fef3c7; }
// //                 .mc-a .mc-ring-fill { stroke: url(#gA); } .mc-a .mc-fill-primary { background: #0ea5e9; } .mc-a .mc-fill-secondary { background: #e0f2fe; }
// //                 .mc-d .mc-ring-fill { stroke: url(#gD); } .mc-d .mc-fill-primary { background: #64748b; } .mc-d .mc-fill-secondary { background: #f1f5f9; }

// //                 .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
// //             `}</style>

// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {modalConfig.isOpen && createPortal(
// //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// //                     <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
// //                 </div>,
// //                 document.body
// //             )}

// //             {learnerToPlace && createPortal(
// //                 <WorkplacePlacementModal
// //                     learner={learnerToPlace}
// //                     // @ts-ignore
// //                     cohort={cohort}
// //                     onClose={() => setLearnerToPlace(null)}
// //                 />,
// //                 document.body
// //             )}

// //             {learnerToDrop && (
// //                 <LearnerDropoutModal
// //                     learner={learnerToDrop}
// //                     onClose={() => setLearnerToDrop(null)}
// //                     onConfirm={handleConfirmDrop}
// //                 />
// //             )}

// //             <AILessonPlanModal
// //                 isOpen={showAIModal || !!editingReport}
// //                 onClose={() => { setShowAIModal(false); setEditingReport(null); }}
// //                 onSave={handleSaveReport}
// //                 onShowStatus={showStatusPopup}
// //                 selectedTopics={selectedTopics}
// //                 curriculumItems={activeProgramme ? curriculumItems : []}
// //                 activeProgramme={activeProgramme}
// //                 cohort={cohort}
// //                 user={user}
// //                 existingReport={editingReport}
// //             />

// //             <StipendExportModal 
// //                 isOpen={isStipendModalOpen}
// //                 onClose={() => setIsStipendModalOpen(false)}
// //                 cohortId={cohort?.id || ''}
// //                 cohortName={cohort?.name || 'Cohort'}
// //                 learners={enrolledLearners.filter(l => l.status !== 'dropped')}
// //                 attendanceMode="qcto"
// //                 initialMonth={calendarMonth.format('YYYY-MM')}
// //             />

// //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// //             <main className="cdp-main">
// //                 <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
// //                     <div className="cdp-header__left">
// //                         <button className="lfm-btn lfm-btn--ghost" onClick={handleBack} style={{ padding: '4px 10px', fontSize: '0.7rem', marginBottom: '10px' }}>
// //                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
// //                         </button>
// //                         <div style={{ fontFamily: 'var(--font-heading)', color: 'whitesmoke', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={12} /> Cohort Overview</div>
// //                         <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '4px 0', textTransform: 'uppercase' }}>{cohort.name}</h1>
// //                         <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                             <Calendar size={12} /> {cohort.startDate} — {cohort.endDate}
// //                             <span style={{ display: 'inline-block', background: cohort.isArchived ? 'var(--mlab-bg)' : 'var(--mlab-green-bg)', color: cohort.isArchived ? 'var(--mlab-grey)' : 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', border: `1px solid ${cohort.isArchived ? 'var(--mlab-border)' : 'var(--mlab-green)'}`, textTransform: 'uppercase' }}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
// //                         </p>
// //                     </div>
// //                     <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                         {(isAdmin || isFacilitator) && (
// //                             <div style={{ display: 'flex', gap: '0.5rem' }}>
// //                                 <button className="lfm-btn lfm-btn--ghost" onClick={handleQCTOExport} disabled={isExporting}>
// //                                     {isExporting ? <Loader2 size={13} className="lfm-spin" /> : <DownloadCloud size={13} />} Export LEISA
// //                                 </button>
// //                                 <button className="lfm-btn lfm-btn--primary" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// //                                     {isSyncing ? <Loader2 size={13} className="lfm-spin" /> : <RefreshCcw size={13} />} Sync Workbooks
// //                                 </button>
// //                             </div>
// //                         )}
// //                         <NotificationBell />
// //                     </div>
// //                 </header>

// //                 <div className="cdp-content" style={{ padding: '2rem' }}>
                    
// //                     <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
// //                         <button 
// //                             onClick={() => setShowKPIs(!showKPIs)} 
// //                             style={{ 
// //                                 display: 'flex', alignItems: 'center', gap: '6px', 
// //                                 background: 'transparent', border: 'none', color: 'var(--mlab-grey)', 
// //                                 fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, 
// //                                 textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s' 
// //                             }}
// //                             onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
// //                             onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
// //                         >
// //                             {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
// //                         </button>
// //                     </div>

// //                     {/* TOP KPIs CONVERTED TO PROGRESS CARDS (COLLAPSIBLE) */}
// //                     {showKPIs && (
// //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }} className="animate-slide-down">
// //                             <ModuleProgressCard 
// //                                 type="Active Learners" 
// //                                 data={{ total: cohortDemographics.total, logged: activeCount }} 
// //                             />
                            
// //                             <ModuleProgressCard 
// //                                 type="Active Attendance" 
// //                                 data={{ 
// //                                     total: attendanceHealth.total, 
// //                                     logged: attendanceHealth.high,
// //                                     segments: [
// //                                         { label: 'High (75%+)', value: attendanceHealth.high, color: '#16a34a' },
// //                                         { label: 'At-Risk (40-74%)', value: attendanceHealth.mid, color: '#f59e0b' },
// //                                         { label: 'Critical (<40%)', value: attendanceHealth.low, color: '#dc2626' }
// //                                     ]
// //                                 }} 
// //                             />
                            
// //                             <ModuleProgressCard 
// //                                 type="ACI Demographics" 
// //                                 data={{ 
// //                                     total: cohortDemographics.total, 
// //                                     logged: cohortDemographics.blackCount + cohortDemographics.colouredCount + cohortDemographics.indianCount,
// //                                     segments: [
// //                                         { label: 'Black African', value: cohortDemographics.blackCount, color: '#16a34a' },
// //                                         { label: 'Coloured', value: cohortDemographics.colouredCount, color: '#0ea5e9' },
// //                                         { label: 'Indian/Asian', value: cohortDemographics.indianCount, color: '#d97706' },
// //                                         { label: 'White', value: cohortDemographics.whiteCount, color: '#94a3b8' },
// //                                         { label: 'Other', value: cohortDemographics.otherCount, color: '#cbd5e1' }
// //                                     ]
// //                                 }} 
// //                             />
                            
// //                             <ModuleProgressCard 
// //                                 type="Youth Representation" 
// //                                 data={{ 
// //                                     total: cohortDemographics.total, 
// //                                     logged: cohortDemographics.youthCount,
// //                                     lines: [
// //                                         { label: 'Youth (< 35 Years)', value: cohortDemographics.youthCount, total: cohortDemographics.total, color: '#4d7c0f', bg: '#ecfccb' },
// //                                         { label: 'Adults (35+ Years)', value: cohortDemographics.total - cohortDemographics.youthCount, total: cohortDemographics.total, color: '#ca8a04', bg: '#fef3c7' }
// //                                     ]
// //                                 }} 
// //                             />
                            
// //                             <ModuleProgressCard 
// //                                 type="Workplace Placements" 
// //                                 data={{ total: activeCount > 0 ? activeCount : 1, logged: placedCount }} 
// //                             />
// //                             <ModuleProgressCard 
// //                                 type="Pending Marking" 
// //                                 data={{ total: submissions.length > 0 ? submissions.length : 1, logged: pendingTotal }} 
// //                             />
// //                         </div>
// //                     )}

// //                     {/* PERMANENTLY VISIBLE COHORT META DATA */}
// //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        
// //                         {/* Timeline Card */}
// //                         <div className="mc">
// //                             <div className="mc-hdr">
// //                                 <div>
// //                                     <div className="mc-label">Duration</div>
// //                                     <div className="mc-title">Cohort Timeline</div>
// //                                 </div>
// //                                 <Calendar size={20} color="var(--mlab-blue)" />
// //                             </div>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
// //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
// //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
// //                                 </div>
// //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
// //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {/* Facilitator Card */}
// //                         <div className="mc">
// //                             <div className="mc-hdr">
// //                                 <div>
// //                                     <div className="mc-label">Assigned Staff</div>
// //                                     <div className="mc-title">Facilitator</div>
// //                                 </div>
// //                                 <Users size={20} color="var(--mlab-blue)" />
// //                             </div>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// //                                     {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
// //                                 </div>
// //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
// //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {/* Assessor Card */}
// //                         <div className="mc">
// //                             <div className="mc-hdr">
// //                                 <div>
// //                                     <div className="mc-label">Assigned Staff</div>
// //                                     <div className="mc-title">Assessor</div>
// //                                 </div>
// //                                 <Award size={20} color="var(--mlab-blue)" />
// //                             </div>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// //                                     {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
// //                                 </div>
// //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
// //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {/* Moderator Card */}
// //                         <div className="mc">
// //                             <div className="mc-hdr">
// //                                 <div>
// //                                     <div className="mc-label">Assigned Staff</div>
// //                                     <div className="mc-title">Moderator</div>
// //                                 </div>
// //                                 <ShieldCheck size={20} color="var(--mlab-blue)" />
// //                             </div>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// //                                     {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
// //                                 </div>
// //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
// //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     {/* MASTER ASSESSMENTS ACCORDION */}
// //                     {assessmentStatsMap.length > 0 && (
// //                         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>
// //                             <div className="lfm-header" style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }} onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}>
// //                                 <h2 className="lfm-header__title"><BookOpen size={16} /> Assessment Operations Center</h2>
                                
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
// //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-white)', color: 'var(--mlab-red)', padding: '4px 10px', border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
// //                                             {totalWriting > 0 && <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />}
// //                                             {totalWriting} Writing
// //                                         </span>
// //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// //                                             <Clock size={10} /> {totalPending} Pending Marking
// //                                         </span>
// //                                     </div>
// //                                     <div style={{ color: 'var(--mlab-white)' }}>
// //                                         {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// //                                     </div>
// //                                 </div>
// //                             </div>
                            
// //                             {isAssessmentsExpanded && (
// //                                 <div className="lfm-body animate-slide-down">
// //                                     <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
// //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
// //                                         <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
// //                                         <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
// //                                         <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
// //                                     </div>
// //                                     {filteredAssessments.length === 0 ? (
// //                                         <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-bg)' }}>
// //                                             No assessments match this filter.
// //                                         </div>
// //                                     ) : (
// //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                                             {filteredAssessments.map(exam => {
// //                                                 const isExpanded = expandedAssessments.has(exam.assessmentId);
// //                                                 const isLive = exam.writing.length > 0;
// //                                                 const hasPending = exam.pending.length > 0;
// //                                                 return (
// //                                                     <div key={exam.assessmentId} className="animate-fade-in" style={{
// //                                                         background: 'var(--mlab-white)',
// //                                                         border: isLive ? '2px solid var(--mlab-red)' : hasPending ? '2px solid #f59e0b' : '2px solid var(--mlab-border)',
// //                                                     }}>
// //                                                         <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
// //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
// //                                                                 <div style={{ color: 'var(--mlab-blue)' }}>
// //                                                                     <BookOpen size={20} />
// //                                                                 </div>
// //                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// //                                                                     <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
// //                                                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// //                                                                         {isLive && (
// //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', border: '1px solid #fca5a5', textTransform: 'uppercase' }}>
// //                                                                                 <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// //                                                                                 {exam.writing.length} Writing
// //                                                                             </span>
// //                                                                         )}
// //                                                                         {hasPending && (
// //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// //                                                                                 <Clock size={10} /> {exam.pending.length} Awaiting Marking
// //                                                                             </span>
// //                                                                         )}
// //                                                                         {exam.graded.length > 0 && (
// //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', border: '1px solid var(--mlab-green)', textTransform: 'uppercase' }}>
// //                                                                                 <CheckCircle2 size={10} /> {exam.graded.length} Graded
// //                                                                             </span>
// //                                                                         )}
// //                                                                     </div>
// //                                                                 </div>
// //                                                             </div>
// //                                                             <div style={{ color: 'var(--mlab-blue)' }}>
// //                                                                 {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// //                                                             </div>
// //                                                         </div>
// //                                                         {isExpanded && (
// //                                                             <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                                                                 {isLive && (
// //                                                                     <div style={{ border: '2px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// //                                                                         <div>
// //                                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                                                                 <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// //                                                                                 Currently Live ({exam.writing.length})
// //                                                                             </span>
// //                                                                             <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
// //                                                                                 {exam.learnerNamesWriting.join(', ')}
// //                                                                             </p>
// //                                                                         </div>
// //                                                                         <div style={{ display: 'flex', gap: '8px' }}>
// //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
// //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
// //                                                                             </button>
// //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
// //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
// //                                                                             </button>
// //                                                                         </div>
// //                                                                     </div>
// //                                                                 )}
// //                                                                 {hasPending && (
// //                                                                     <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// //                                                                         <div>
// //                                                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
// //                                                                             <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
// //                                                                                 <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
// //                                                                             </p>
// //                                                                         </div>
// //                                                                         <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
// //                                                                             <PenTool size={14} /> Go to Grading Queue
// //                                                                         </button>
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         )}
// //                                                     </div>
// //                                                 );
// //                                             })}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}

// //                     {/* TAB NAVIGATION */}
// //                     <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
// //                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
// //                             <Users size={16} /> Learner Roster
// //                         </button>
// //                         <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
// //                             <LayoutList size={16} /> Curriculum Tracker
// //                         </button>
// //                         <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
// //                             <Calendar size={16} /> Calendar View
// //                         </button>
// //                         <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
// //                             <UserCheck size={16} /> Attendance Tracker
// //                         </button>
// //                     </div>

// //                     {/* ─── TAB 1: LEARNER ROSTER ─── */}
// //                     {activeTab === 'learners' && (
// //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// //                             <div className="lfm-header">
// //                                 <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
// //                             </div>

// //                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '2px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
// //                                 <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
// //                                     <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
// //                                     <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px' }} />
// //                                 </div>

// //                                 <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// //                                         <label>Status:</label>
// //                                         <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ minWidth: '150px' }}>
// //                                             <option value="all">All Applicants</option>
// //                                             <option value="active">Active Only</option>
// //                                             <option value="dropped">Withdrawn Only</option>
// //                                         </select>
// //                                     </div>

// //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// //                                         <label>Attendance:</label>
// //                                         <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ minWidth: '180px' }}>
// //                                             <option value="all">All Attendance Bands</option>
// //                                             <option value="high">High Compliance (75%+)</option>
// //                                             <option value="mid">Average Compliance (40% - 74%)</option>
// //                                             <option value="low">Critical Risk (&lt; 40%)</option>
// //                                         </select>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="lfm-body" style={{ padding: 0 }}>
// //                                 <div className="mlab-table-wrap">
// //                                     <table className="mlab-table" style={{ margin: 0 }}>
// //                                         <thead style={{ background: 'var(--mlab-light-blue)' }}>
// //                                             <tr>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Learner</th>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Workplace</th>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Module Progress</th>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Attendance</th>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Last Active</th>
// //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Status</th>
// //                                                 <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
// //                                             </tr>
// //                                         </thead>
// //                                         <tbody>
// //                                             {filteredLearners.length === 0 ? (
// //                                                 <tr>
// //                                                     <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// //                                                         <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
// //                                                         <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
// //                                                     </td>
// //                                                 </tr>
// //                                             ) : (
// //                                                 filteredLearners.map(learner => {
// //                                                     const isDropped = learner.status === 'dropped';
// //                                                     const routingId = learner.enrollmentId || learner.id;
// //                                                     const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// //                                                     const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
// //                                                     const isPlaced = !!learner.employerId;

// //                                                     const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
// //                                                     const learnerLogin = learner.lastLoginAt || (learner as any).lastLoginAt || null;

// //                                                     return (
// //                                                         <tr key={learner.id} style={{ opacity: isDropped ? 0.6 : 1, background: isDropped ? 'var(--mlab-bg)' : 'transparent' }}>
// //                                                             <td>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                                                     <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)' }}>
// //                                                                         {learner.fullName.charAt(0)}
// //                                                                     </div>
// //                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// //                                                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{learner.fullName}</span>
// //                                                                         <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
// //                                                                         {!isDropped && pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', marginTop: '4px' }}><Clock size={10} /> {pendingCount} marking pending</span>}
// //                                                                     </div>
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td>{isPlaced ? <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{employers.find(e => e.id === learner.employerId)?.name}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}><AlertCircle size={12} /> Pending</span>}</td>
// //                                                             <td>
// //                                                                 <div style={{ display: 'flex', gap: '6px' }}>
// //                                                                     <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
// //                                                                     <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', border: '1px solid #bae6fd', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
// //                                                                     <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', border: '1px solid #fed7aa', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                                                     <span style={{
// //                                                                         display: 'inline-flex', alignItems: 'center', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
// //                                                                         background: stats.pct >= 75 ? 'var(--mlab-green-bg)' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
// //                                                                         color: stats.pct >= 75 ? 'var(--mlab-green-dark)' : stats.pct >= 40 ? '#b45309' : '#991b1b',
// //                                                                         border: `1px solid ${stats.pct >= 75 ? 'var(--mlab-green)' : stats.pct >= 40 ? '#fde68a' : '#fca5a5'}`
// //                                                                     }}>{stats.pct}%</span>
// //                                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{stats.attended} / {stats.total}</span>
// //                                                                 </div>
// //                                                             </td>

// //                                                             {/* 🚀 LAST ACTIVE COLUMN */}
// //                                                             <td>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: learnerLogin ? 'var(--mlab-midnight)' : 'var(--mlab-grey-light)' }}>
// //                                                                     <Clock size={12} color={learnerLogin ? "var(--mlab-blue)" : "var(--mlab-grey-light)"} />
// //                                                                     <span style={{ fontFamily: 'var(--font-body)', fontWeight: learnerLogin ? 500 : 400 }}>
// //                                                                         {formatLastLogin(learnerLogin)}
// //                                                                     </span>
// //                                                                 </div>
// //                                                             </td>

// //                                                             <td>
// //                                                                 <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: isDropped ? 'var(--mlab-bg)' : 'var(--mlab-light-blue)', color: isDropped ? 'var(--mlab-grey)' : 'var(--mlab-blue)', border: `1px solid ${isDropped ? 'var(--mlab-border)' : 'var(--mlab-blue)'}` }}>
// //                                                                     {isDropped ? 'Dropped' : 'Active'}
// //                                                                 </span>
// //                                                             </td>

// //                                                             <td style={{ textAlign: 'right' }}>
// //                                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
// //                                                                     {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
// //                                                                     <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>

// //                                                                     {isDropped ? (
// //                                                                         <button 
// //                                                                             onClick={() => setLearnerToDrop(learner)} 
// //                                                                             title="View Withdrawal Details" 
// //                                                                             className="lfm-btn lfm-btn--ghost" 
// //                                                                             style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}
// //                                                                         >
// //                                                                             <FileText size={12} /> View Exit
// //                                                                         </button>
// //                                                                     ) : (
// //                                                                         <button
// //                                                                             onClick={() => setLearnerToDrop(learner)}
// //                                                                             title="Process Withdrawal / Dropout"
// //                                                                             className="lfm-btn"
// //                                                                             style={{
// //                                                                                 background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem'
// //                                                                             }}
// //                                                                             onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
// //                                                                             onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
// //                                                                         >
// //                                                                             <UserMinus size={12} /> Withdraw
// //                                                                         </button>
// //                                                                     )}
// //                                                                 </div>
// //                                                             </td>
                                                            
// //                                                         </tr>
// //                                                     );
// //                                                 })
// //                                             )}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ─── TAB 2: CURRICULUM TRACKER ─── */}
// //                     {activeTab === 'curriculum' && (
// //                         <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
// //                             {activeProgramme && (
// //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
// //                                     <ModuleProgressCard type="Knowledge" data={moduleProgress.Knowledge} />
// //                                     <ModuleProgressCard type="Practical" data={moduleProgress.Practical} />
// //                                     <ModuleProgressCard type="Workplace" data={moduleProgress.Workplace} />
// //                                 </div>
// //                             )}

// //                             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
// //                                 <div style={{ background: 'var(--mlab-white)', display: 'inline-flex', border: '2px solid var(--mlab-blue)' }}>
// //                                     <button onClick={() => setCurriculumViewMode('blueprint')} className={`lfm-btn ${curriculumViewMode === 'blueprint' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none' }}><CheckSquare size={14} /> Log New Topics</button>
// //                                     <button onClick={() => setCurriculumViewMode('history')} className={`lfm-btn ${curriculumViewMode === 'history' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none', borderLeft: '2px solid var(--mlab-blue)' }}><Clock size={14} /> View Past Sessions</button>
// //                                 </div>
// //                             </div>

// //                             <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// //                                 <div className="lfm-header">
// //                                     <h2 className="lfm-header__title"><BookOpen size={16} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2>
// //                                 </div>
// //                                 <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'var(--mlab-white)' : 'var(--mlab-bg)', padding: '1.5rem' }}>
// //                                     {!activeProgramme ? (
// //                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No formal Qualification Blueprint is linked to this cohort.</p></div>
// //                                     ) : (
// //                                         <>
// //                                             {curriculumViewMode === 'blueprint' && (
// //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                                                     {Object.keys(groupedCurriculum).map(modCode => {
// //                                                         const group = groupedCurriculum[modCode];
// //                                                         const isOpen = expandedModules.has(modCode);
// //                                                         const totalItems = group.items.length;
// //                                                         const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// //                                                         const isComplete = loggedItems === totalItems && totalItems > 0;

// //                                                         return (
// //                                                             <div key={modCode}>
// //                                                                 <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
// //                                                                     <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
// //                                                                     <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
// //                                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', border: `1px solid ${isComplete ? 'var(--mlab-green)' : 'transparent'}` }}>{loggedItems} / {totalItems} COVERED</span>
// //                                                                     {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// //                                                                 </div>
// //                                                                 {isOpen && (
// //                                                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
// //                                                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
// //                                                                             <table className="mlab-table" style={{ margin: '0', border: 'none' }}>
// //                                                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// //                                                                                     <tr>
// //                                                                                         <th style={{ width: '50px', color: 'var(--mlab-grey)', textAlign: 'center', borderRight: '1px solid var(--mlab-border)', borderRadius: 0 }}>Log</th>
// //                                                                                         <th style={{ color: 'var(--mlab-grey)', borderRadius: 0 }}>Topic / Activity</th>
// //                                                                                         <th style={{ width: '280px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Status / Session Report</th>
// //                                                                                         <th style={{ width: '180px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Engagement</th>
// //                                                                                     </tr>
// //                                                                                 </thead>
// //                                                                                 <tbody>
// //                                                                                     {group.items.map(item => {
// //                                                                                         const logRecord = curriculumLogs.find(log => log.topicId === item.id);
// //                                                                                         const isLogged = !!logRecord;
// //                                                                                         const isSelected = selectedTopics.hasOwnProperty(item.id);
// //                                                                                         const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
// //                                                                                         const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

// //                                                                                         return (
// //                                                                                             <tr key={item.id} style={{ background: isLogged ? 'var(--mlab-green-bg)' : (isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)') }}>
// //                                                                                                 <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
// //                                                                                                     {isLogged ? <CheckCircle size={18} color="var(--mlab-green-dark)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                                                                                                         <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', color: isLogged ? 'var(--mlab-green-dark)' : 'var(--mlab-blue)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
// //                                                                                                         <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
// //                                                                                                     </div>
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     {isLogged ? (
// //                                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                                                                             <span style={{ display: 'inline-block', background: 'var(--mlab-white)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
// //                                                                                                             {associatedReport && <button className="lfm-btn lfm-btn--ghost" onClick={() => setEditingReport(associatedReport)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}><Edit3 size={12} /> Edit Report</button>}
// //                                                                                                         </div>
// //                                                                                                     ) : isSelected ? (
// //                                                                                                         <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
// //                                                                                                     ) : <span style={{ display: 'inline-block', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
// //                                                                                                 </td>
// //                                                                                                 <td>
// //                                                                                                     {isLogged ? (
// //                                                                                                         <div className="cdp-progress-col" style={{ width: '100%' }}>
// //                                                                                                             <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green-dark)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)'), fontSize: '0.85rem' }}>{ackPct}%</span></div>
// //                                                                                                             <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0', background: 'var(--mlab-border)', width: '100%' }}><div className="cdp-progress-fill" style={{ height: '100%', width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)') }} /></div>
// //                                                                                                         </div>
// //                                                                                                     ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)' }}>—</span>}
// //                                                                                                 </td>
// //                                                                                             </tr>
// //                                                                                         );
// //                                                                                     })}
// //                                                                                 </tbody>
// //                                                                             </table>
// //                                                                         </div>
// //                                                                     </div>
// //                                                                 )}
// //                                                             </div>
// //                                                         );
// //                                                     })
// //                                                     }
// //                                                 </div>
// //                                             )}

// //                                             {curriculumViewMode === 'history' && (
// //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                                                     {curriculumLogs.length === 0 ? (
// //                                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No topics have been logged for this cohort yet.</p></div>
// //                                                     ) : (
// //                                                         Object.keys(groupedHistoryLogs).sort().map(modCode => {
// //                                                             const logsInModule = groupedHistoryLogs[modCode];
// //                                                             const isOpen = expandedHistoryModules.has(modCode);
// //                                                             const moduleName = groupedCurriculum[modCode]?.moduleName || '';

// //                                                             return (
// //                                                                 <div key={`hist-${modCode}`}>
// //                                                                     <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
// //                                                                         <Layers size={16} color="var(--mlab-blue)" />
// //                                                                         <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
// //                                                                         <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: 'var(--mlab-light-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
// //                                                                         {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// //                                                                     </div>
// //                                                                     {isOpen && (
// //                                                                         <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
// //                                                                             {logsInModule.map(log => {
// //                                                                                 const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
// //                                                                                 return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
// //                                                                             })}
// //                                                                         </div>
// //                                                                     )}
// //                                                                 </div>
// //                                                             );
// //                                                         })
// //                                                     )}
// //                                                 </div>
// //                                             )}
// //                                         </>
// //                                     )}
// //                                 </div>
// //                             </div>

// //                             {selectedTopicCount > 0 && createPortal(
// //                                 <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
// //                                         <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
// //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
// //                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
// //                                         </div>
// //                                     </div>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
// //                                             <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
// //                                             <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
// //                                         </div>
// //                                         <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
// //                                         <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
// //                                             {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
// //                                         </button>
// //                                     </div>
// //                                 </div>,
// //                                 document.body
// //                             )}
// //                         </div>
// //                     )}

// //                     {/* ─── TAB 3: CALENDAR VIEW WITH STIPEND EXPORT ─── */}
// //                     {activeTab === 'calendar' && (
// //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
// //                             <div className="lfm-header">
// //                                 <h2 className="lfm-header__title">
// //                                     <Calendar size={18} /> Cohort Attendance Calendar
// //                                 </h2>

// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                     {cohort?.id && (
// //                                         <button 
// //                                             className="lfm-btn"
// //                                             onClick={() => setIsStipendModalOpen(true)}
// //                                             style={{ background: 'var(--mlab-green)', border: 'none' }}
// //                                         >
// //                                             <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
// //                                         </button>
// //                                     )}

// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
// //                                         <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
// //                                         <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
// //                                         <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
// //                                 <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
// //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
// //                                         {dailyRegisters.length} Total Sessions
// //                                     </span>
// //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// //                                         {cohortLeaves.filter(l => l.status === 'Pending').length} Pending Leaves
// //                                     </span>
// //                                 </div>

// //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
// //                                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
// //                                         <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
// //                                     ))}
// //                                 </div>

// //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
// //                                     {calendarGrid.map((day) => {
// //                                         const dateStr = day.format('YYYY-MM-DD');
// //                                         const isCurrentMonth = day.month() === calendarMonth.month();
// //                                         const isToday = dateStr === moment().format('YYYY-MM-DD');
// //                                         const data = calendarDataMap.get(dateStr);

// //                                         return (
// //                                             <div 
// //                                                 key={dateStr} 
// //                                                 onClick={() => {
// //                                                     if (data?.hasRegister && cohort?.id) {
// //                                                         navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
// //                                                     } else {
// //                                                         setLedgerDates(prev => prev.includes(dateStr) ? prev : [...prev, dateStr]);
// //                                                         setActiveTab('attendance');
// //                                                     }
// //                                                 }}
// //                                                 style={{ 
// //                                                     border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', 
// //                                                     borderRadius: 0, 
// //                                                     minHeight: '110px', 
// //                                                     padding: '10px', 
// //                                                     backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', 
// //                                                     opacity: isCurrentMonth ? 1 : 0.6,
// //                                                     cursor: data?.hasRegister ? 'pointer' : 'default',
// //                                                     transition: 'all 0.2s',
// //                                                     boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
// //                                                 }}
// //                                                 onMouseOver={e => { if (data?.hasRegister) { e.currentTarget.style.borderColor = 'var(--mlab-green)' } }}
// //                                                 onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)' }}
// //                                             >
// //                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                                     <span style={{ 
// //                                                         fontWeight: '700',
// //                                                         fontFamily: 'var(--font-heading)',
// //                                                         color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', 
// //                                                         background: isToday ? 'var(--mlab-blue)' : 'transparent',
// //                                                         width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
// //                                                     }}>{day.format('D')}</span>
// //                                                 </div>
                                                
// //                                                 {data && (
// //                                                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                                         {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
// //                                                         {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}
                                                        
// //                                                         {data.hasRegister && (
// //                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
// //                                                                 <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>{data.present} Present</span>
// //                                                                 {data.absent > 0 && <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>{data.absent} Absent</span>}
// //                                                             </div>
// //                                                         )}

// //                                                         {data.leaves > 0 && (
// //                                                             <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
// //                                                                 <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
// //                                                             </span>
// //                                                         )}
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         )
// //                                     })}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ─── TAB 4: ATTENDANCE ─── */}
// //                     {activeTab === 'attendance' && (
// //                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
// //                             <div style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
// //                                 <div className="lfm-header">
// //                                     <h2 className="lfm-header__title">
// //                                         <History size={18} /> Historical Session Ledger
// //                                     </h2>

// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px' }}>
// //                                             <Calendar size={14} color="var(--mlab-blue)" />
// //                                             <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
// //                                             <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
// //                                         </div>
// //                                         <button className="lfm-btn lfm-btn--primary" onClick={() => setIsDropZoneOpen(true)} style={{ border: '1px solid var(--mlab-white)' }}>
// //                                             <UploadCloud size={14} /> Upload Zoom CSV
// //                                         </button>
// //                                     </div>
// //                                 </div>

// //                                 {ledgerDates.length > 0 && (
// //                                     <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
// //                                         <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
// //                                         {ledgerDates.map(date => (
// //                                             <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
// //                                                 {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
// //                                                 <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
// //                                             </span>
// //                                         ))}
// //                                         <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                             <XCircle size={12} /> Clear All
// //                                         </button>
// //                                     </div>
// //                                 )}

// //                                 <div className="lfm-body" style={{ padding: 0 }}>
// //                                     <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
// //                                         {filteredDailyRegisters.length === 0 ? (
// //                                             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// //                                                 <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// //                                                 <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}</p>
// //                                             </div>
// //                                         ) : (
// //                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
// //                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// //                                                     <tr>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Expected Duration</th>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Captured</th>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Present (80%+)</th>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Short Hours</th>
// //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Absent</th>
// //                                                     </tr>
// //                                                 </thead>
// //                                                 <tbody>
// //                                                     {filteredDailyRegisters.map((reg) => {
// //                                                         const presentCount = reg.presentLearners?.length || 0;
// //                                                         const absentCount = reg.absentLearners?.length || 0;
// //                                                         const partialCount = reg.partialLearners?.length || 0;
// //                                                         const totalCaptured = presentCount + absentCount + partialCount;

// //                                                         return (
// //                                                             <tr key={reg.id}>
// //                                                                 <td style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
// //                                                                     {reg.date ? new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
// //                                                                 </td>
// //                                                                 <td>
// //                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// //                                                                         <Clock size={14} /> {reg.expectedDuration || 0} mins
// //                                                                     </span>
// //                                                                 </td>
// //                                                                 <td style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{totalCaptured} Learners</td>
// //                                                                 <td>
// //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--mlab-green)' }}>
// //                                                                         <CheckCircle2 size={12} /> {presentCount}
// //                                                                     </span>
// //                                                                 </td>
// //                                                                 <td>
// //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fcd34d' }}>
// //                                                                         <AlertCircle size={12} /> {partialCount}
// //                                                                     </span>
// //                                                                 </td>
// //                                                                 <td>
// //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
// //                                                                         <XCircle size={12} /> {absentCount}
// //                                                                     </span>
// //                                                                 </td>
// //                                                             </tr>
// //                                                         );
// //                                                     })}
// //                                                 </tbody>
// //                                             </table>
// //                                         )}
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };



// // // // src/components/views/CohortsView/QCTOCohortView.tsx
// // // // (Replace the contents of the file that contains QCTOCohortView)

// // // import React, { useMemo, useState, useEffect } from 'react';
// // // import { useNavigate, useSearchParams } from 'react-router-dom';
// // // import { createPortal } from 'react-dom';
// // // import {
// // //     Users, Calendar, ChevronLeft, DownloadCloud,
// // //     FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
// // //     UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
// // //     Layers, ChevronUp, ChevronDown, Sparkles,
// // //     Edit3, X, PenTool, FileText, CheckCircle,
// // //     Loader2, RefreshCcw, BookOpen, Filter,
// // //     ChevronRight,
// // //     History,
// // //     Award,
// // //     ShieldCheck
// // // } from 'lucide-react';
// // // import * as XLSX from 'xlsx';
// // // import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, getDoc } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // // import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// // // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// // // import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
// // // import type { DashboardLearner } from '../../../types';

// // // import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
// // // import { LearnerDropoutModal } from './LearnerDropoutModal';
// // // import { AILessonPlanModal } from './AILessonPlanModal';
// // // import { StipendExportModal } from '../../common/StipendExportModal/StipendExportModal';
// // // import moment from 'moment';

// // // const formatQCTODate = (d?: string) => {
// // //     if (!d) return '';
// // //     const dt = new Date(d);
// // //     if (isNaN(dt.getTime())) return '';
// // //     return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
// // // };

// // // const getDOBFromID = (id: string) => {
// // //     const clean = String(id || '').replace(/\s/g, '');
// // //     if (clean.length !== 13) return '';
// // //     try {
// // //         let y = parseInt(clean.substring(0, 2), 10);
// // //         const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
// // //         y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
// // //         return `${y}${m}${d2}`;
// // //     } catch { return ''; }
// // // };

// // // const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

// // // export const ModuleChip: React.FC<{label: string, count: number, variant: 'k'|'p'|'w'}> = ({ label, count, variant }) => (
// // //     <span className={`cdp-chip cdp-chip--${variant}`} style={{ borderRadius: 0 }}>{label}: {count}</span>
// // // );

// // // // ─── QCTO COHORT VIEW COMPONENT ─────────────────────────────────────────────

// // // export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
// // //     const navigate = useNavigate();
// // //     const [searchParams, setSearchParams] = useSearchParams();
// // //     const toast = useToast();

// // //     const { user, learners, staff, employers, settings, programmes } = useStore();

// // //     // 🚀 OPTIMIZED: Sync Active Tab with URL Params
// // //     const urlTab = searchParams.get('tab');
// // //     const activeTab = (urlTab === 'curriculum' || urlTab === 'calendar' || urlTab === 'attendance') 
// // //         ? urlTab 
// // //         : 'learners'; 

// // //     const setActiveTab = (tab: 'learners' | 'curriculum' | 'calendar' | 'attendance') => {
// // //         setSearchParams((prev) => {
// // //             prev.set('tab', tab);
// // //             prev.delete('expanded'); // Clear expanded accordions when switching tabs
// // //             return prev;
// // //         }, { replace: true });
// // //     };

// // //     const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

// // //     const [isSyncing, setIsSyncing] = useState(false);
// // //     const [isExporting, setIsExporting] = useState(false);
// // //     const [isGrantingTime, setIsGrantingTime] = useState(false);
// // //     const [isLogging, setIsLogging] = useState(false);
// // //     const [showAIModal, setShowAIModal] = useState(false);
// // //     const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    
// // //     // 🚀 State to toggle KPI visibility (Defaults to true)
// // //     const [showKPIs, setShowKPIs] = useState(true);

// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
// // //     const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

// // //     const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
// // //     const [ledgerDates, setLedgerDates] = useState<string[]>([]);

// // //     const [submissions, setSubmissions] = useState<any[]>([]);
// // //     const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
// // //     const [sessionReports, setSessionReports] = useState<any[]>([]);
// // //     const [editingReport, setEditingReport] = useState<any | null>(null);

// // //     // 🚀 OPTIMIZED: Sync Expanded Modules with URL Params for consistency
// // //     const urlExpanded = searchParams.get('expanded');
// // //     const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

// // //     const toggleModuleAccordion = (moduleCode: string) => {
// // //         setSearchParams((prev) => {
// // //             const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);
// // //             if (current.has(moduleCode)) current.delete(moduleCode);
// // //             else current.add(moduleCode);
            
// // //             if (current.size > 0) prev.set('expanded', Array.from(current).join(','));
// // //             else prev.delete('expanded');
            
// // //             return prev;
// // //         }, { replace: true });
// // //     };

// // //     const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
// // //     const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
// // //     const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

// // //     const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);

// // //     // Calendar State Variables
// // //     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);
// // //     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
// // //     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
// // //     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

// // //     const [holidays, setHolidays] = useState<string[]>([]);
// // //     const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

// // //     // Fetch Holidays for Calendar
// // //     useEffect(() => {
// // //         const fetchHolidays = async () => {
// // //             const currentYear = new Date().getFullYear();
// // //             const cacheKey = `holidays_za_${currentYear}`;
// // //             const cached = localStorage.getItem(cacheKey);

// // //             if (cached) {
// // //                 setHolidays(JSON.parse(cached));
// // //             } else {
// // //                 try {
// // //                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
// // //                     if (res.ok) {
// // //                         const data = await res.json();
// // //                         const dateList = data.map((h: any) => h.date);
// // //                         setHolidays(dateList);
// // //                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
// // //                     }
// // //                 } catch (e) {
// // //                     console.warn("Holiday API unreachable for analytics.");
// // //                 }
// // //             }
// // //         };
// // //         fetchHolidays();
// // //     }, []);

// // //     // Fetch Leaves for Calendar
// // //     useEffect(() => {
// // //         if (!cohort?.id) return;
// // //         const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
// // //         const unsub = onSnapshot(q, snap => {
// // //             setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // //         });
// // //         return () => unsub();
// // //     }, [cohort?.id]);

// // //     useEffect(() => {
// // //         if (!cohort?.id) return;
// // //         const q = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
// // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // //             const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //             setLiveEnrollments(results);
// // //         });
// // //         return () => unsubscribe();
// // //     }, [cohort.id]);

// // //     const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
// // //     const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
// // //     const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

// // //     const toggleAssessmentAccordion = (id: string) => {
// // //         setExpandedAssessments(prev => {
// // //             const next = new Set(prev);
// // //             next.has(id) ? next.delete(id) : next.add(id);
// // //             return next;
// // //         });
// // //     };

// // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
// // //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);
// // //     const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

// // //     const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

// // //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin === true;
// // //     const isFacilitator = user?.role === 'facilitator';

// // //     const handleBack = () => {
// // //         if (isAdmin) {
// // //             navigate('/admin', { state: { activeTab: 'cohorts' } });
// // //         } else {
// // //             navigate(-1);
// // //         }
// // //     };

// // //     const activeProgramme = useMemo(() => {
// // //         if (!cohort || !programmes.length) return null;
// // //         const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
// // //         if (!templateId) return null;
// // //         return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
// // //     }, [cohort, programmes]);

// // //     const groupedCurriculum = useMemo(() => {
// // //         if (!activeProgramme) return {};
// // //         const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
// // //         const extractItems = (modules: any[], type: string) => {
// // //             (modules || []).forEach(mod => {
// // //                 const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
// // //                 const modCode = mod.code || 'General';
// // //                 if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
// // //                 subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
// // //             });
// // //         };
// // //         extractItems(activeProgramme.knowledgeModules, 'Knowledge');
// // //         extractItems(activeProgramme.practicalModules, 'Practical');
// // //         extractItems(activeProgramme.workExperienceModules, 'Workplace');
// // //         return groups;
// // //     }, [activeProgramme]);

// // //     const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

// // //     const groupedHistoryLogs = useMemo(() => {
// // //         const groups: Record<string, any[]> = {};
// // //         curriculumLogs.forEach(log => {
// // //             const modCode = log.moduleCode || 'Uncategorized';
// // //             if (!groups[modCode]) groups[modCode] = [];
// // //             groups[modCode].push(log);
// // //         });
// // //         return groups;
// // //     }, [curriculumLogs]);

// // //     const moduleProgress = useMemo(() => {
// // //         const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
// // //         Object.values(groupedCurriculum).forEach(group => {
// // //             const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
// // //             if (stats[type]) {
// // //                 stats[type].total += group.items.length;
// // //                 stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// // //             }
// // //         });
// // //         return stats;
// // //     }, [groupedCurriculum, curriculumLogs]);

// // //     const enrolledLearners = useMemo(() => {
// // //         const merged: DashboardLearner[] = [];

// // //         liveEnrollments.forEach(enrollment => {
// // //             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
// // //             if (profile?.fullName && profile?.idNumber) {
// // //                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
// // //             }
// // //         });

// // //         learners.forEach(profile => {
// // //             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
// // //                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
// // //             }
// // //         });
// // //         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
// // //     }, [learners, liveEnrollments, cohort.id]);

// // //     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

// // //     useEffect(() => {
// // //         if (!cohort?.id) return;
// // //         const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
// // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // //             const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //             regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
// // //             setDailyRegisters(regs);
// // //         });
// // //         return () => unsubscribe();
// // //     }, [cohort.id]);

// // //     const rosterAttendanceMap = useMemo(() => {
// // //         const map = new Map<string, { attended: number; total: number; pct: number }>();
// // //         const totalSessions = dailyRegisters.length;

// // //         enrolledLearners.forEach(l => {
// // //             if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
// // //         });

// // //         dailyRegisters.forEach(reg => {
// // //             const present = reg.presentLearners || [];
// // //             present.forEach((idNum: string) => {
// // //                 if (map.has(idNum)) {
// // //                     map.get(idNum)!.attended += 1;
// // //                 }
// // //             });
// // //         });

// // //         map.forEach(value => {
// // //             value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
// // //         });

// // //         return map;
// // //     }, [dailyRegisters, enrolledLearners]);

// // //     // ─── COHORT-SPECIFIC METRICS CALCULATION FOR ROBUST CARDS ───
// // //     const cohortDemographics = useMemo(() => {
// // //         let blackCount = 0, colouredCount = 0, indianCount = 0, whiteCount = 0, otherCount = 0;
// // //         let youthCount = 0;

// // //         enrolledLearners.forEach(l => {
// // //             const eq = ((l as any).equityGroup || l.demographics?.equityCode || '').trim().toLowerCase();
// // //             if (eq.includes('african') || eq === 'black' || eq === 'ba') blackCount++;
// // //             else if (eq.includes('coloured') || eq === 'bc') colouredCount++;
// // //             else if (eq.includes('indian') || eq === 'bi') indianCount++;
// // //             else if (eq.includes('white') || eq === 'wh') whiteCount++;
// // //             else otherCount++;

// // //             let isYouth = true;
// // //             if (l.idNumber && l.idNumber.length >= 6) {
// // //                 const yearNum = parseInt(l.idNumber.substring(0, 2), 10);
// // //                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // //                 const age = new Date().getFullYear() - birthYear;
// // //                 if (age > 35) isYouth = false;
// // //             } else if ((l.demographics as any)?.youthStatus === 'N') {
// // //                 isYouth = false;
// // //             }
// // //             if (isYouth) youthCount++;
// // //         });

// // //         return { blackCount, colouredCount, indianCount, whiteCount, otherCount, youthCount, total: enrolledLearners.length };
// // //     }, [enrolledLearners]);

// // //     const attendanceHealth = useMemo(() => {
// // //         let high = 0, mid = 0, low = 0;
// // //         enrolledLearners.forEach(l => {
// // //             const stats = rosterAttendanceMap.get(l.idNumber || '');
// // //             const pct = stats ? stats.pct : 0;
// // //             if (pct >= 75) high++;
// // //             else if (pct >= 40) mid++;
// // //             else low++;
// // //         });
// // //         return { high, mid, low, total: enrolledLearners.length };
// // //     }, [enrolledLearners, rosterAttendanceMap]);


// // //     const filteredLearners = useMemo(() => {
// // //         return enrolledLearners.filter(learner => {
// // //             const searchLower = searchTerm.toLowerCase().trim();
// // //             const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
// // //             const matchesSearch = !searchLower ||
// // //                 learner.fullName.toLowerCase().includes(searchLower) ||
// // //                 learner.idNumber.includes(searchLower) ||
// // //                 dbEmail.includes(searchLower);

// // //             const matchesStatus = statusFilter === 'all' ||
// // //                 (statusFilter === 'active' && learner.status !== 'dropped') ||
// // //                 (statusFilter === 'dropped' && learner.status === 'dropped');

// // //             const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
// // //             let matchesAttendance = true;
// // //             if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
// // //             else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
// // //             else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

// // //             return matchesSearch && matchesStatus && matchesAttendance;
// // //         });
// // //     }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

// // //     const filteredDailyRegisters = useMemo(() => {
// // //         if (ledgerDates.length === 0) return dailyRegisters;
// // //         return dailyRegisters.filter(reg => {
// // //             return ledgerDates.includes(reg.date);
// // //         });
// // //     }, [dailyRegisters, ledgerDates]);

// // //     const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const date = e.target.value;
// // //         if (date && !ledgerDates.includes(date)) {
// // //             setLedgerDates([...ledgerDates, date]);
// // //         }
// // //     };

// // //     const removeLedgerDate = (dateToRemove: string) => {
// // //         setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
// // //     };

// // //     const fetchSubmissions = async () => {
// // //         try {
// // //             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
// // //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // //         } catch (e) { console.error('Error fetching submissions:', e); }
// // //     };

// // //     useEffect(() => {
// // //         fetchSubmissions();
// // //         const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
// // //         const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
// // //         const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
// // //         const unsubReports = onSnapshot(reportsQ, (snap) => {
// // //             const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
// // //             reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
// // //             setSessionReports(reps);
// // //         });
// // //         return () => { unsubLogs(); unsubReports(); };
// // //     }, [cohort.id]);

// // //     const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
// // //     const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
// // //     const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
// // //     const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

// // //     const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string, sessionDateStr?: string) => {
// // //         const finalDate = sessionDateStr || new Date().toISOString().split('T')[0];
// // //         const finalTimestamp = `${finalDate}T12:00:00.000Z`;

// // //         if (isEdit && reportId) {
// // //             setIsLogging(true);
// // //             try {
// // //                 const batch = writeBatch(db);

// // //                 batch.update(doc(db, 'session_reports', reportId), {
// // //                     reportHtml: planHtml,
// // //                     evidenceLinks,
// // //                     dateLogged: finalTimestamp,
// // //                     sessionDate: finalDate,
// // //                     lastEditedAt: new Date().toISOString(),
// // //                     lastEditedBy: user?.uid
// // //                 });

// // //                 const logsQ = query(collection(db, 'curriculum_logs'), where('sessionReportId', '==', reportId));
// // //                 const logsSnap = await getDocs(logsQ);
// // //                 logsSnap.forEach(logDoc => {
// // //                     batch.update(logDoc.ref, {
// // //                         coveredAt: finalDate
// // //                     });
// // //                 });

// // //                 await batch.commit();
// // //                 toast.success("Session report updated successfully.");
// // //                 setShowAIModal(false);
// // //                 setEditingReport(null);
// // //             } catch (error) {
// // //                 toast.error("Failed to update report.");
// // //             } finally {
// // //                 setIsLogging(false);
// // //             }
// // //         } else {
// // //             const selectedTopicIds = Object.keys(selectedTopics);
// // //             if (selectedTopicIds.length === 0) return;
// // //             setShowAIModal(false);
// // //             setIsLogging(true);
// // //             try {
// // //                 const batch = writeBatch(db);
// // //                 const now = new Date();
// // //                 const reportRef = doc(collection(db, 'session_reports'));

// // //                 batch.set(reportRef, {
// // //                     cohortId: cohort.id,
// // //                     facilitatorId: user?.uid,
// // //                     facilitatorName: user?.fullName,
// // //                     facilitatorSignatureUrl: user?.signatureUrl || null,
// // //                     dateLogged: finalTimestamp,
// // //                     sessionDate: finalDate,
// // //                     reportHtml: planHtml,
// // //                     evidenceLinks,
// // //                     topicsCovered: selectedTopicIds
// // //                 });

// // //                 selectedTopicIds.forEach(topicId => {
// // //                     const itemDef = curriculumItems.find(i => i.id === topicId);
// // //                     if (!itemDef) return;
// // //                     const coveredDateStr = selectedTopics[topicId] || finalDate;

// // //                     batch.set(doc(collection(db, 'curriculum_logs')), {
// // //                         cohortId: cohort.id,
// // //                         topicId: itemDef.id,
// // //                         topicCode: itemDef.code,
// // //                         topicTitle: itemDef.title,
// // //                         moduleCode: itemDef.moduleCode,
// // //                         moduleName: itemDef.moduleName,
// // //                         moduleType: itemDef.moduleType,
// // //                         coveredAt: coveredDateStr,
// // //                         loggedAt: now.toISOString(),
// // //                         deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
// // //                         loggedBy: user?.uid,
// // //                         loggedByName: user?.fullName,
// // //                         sessionReportId: reportRef.id,
// // //                         acknowledgedBy: [],
// // //                         penalizeLearners: []
// // //                     });
// // //                 });

// // //                 await batch.commit();
// // //                 setSelectedTopics({});
// // //                 showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
// // //             } catch (error) {
// // //                 showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
// // //             } finally {
// // //                 setIsLogging(false);
// // //             }
// // //         }
// // //     };

// // //     const assessmentStatsMap = useMemo(() => {
// // //         const map = new Map<string, {
// // //             assessmentId: string,
// // //             title: string,
// // //             writing: any[],
// // //             pending: any[],
// // //             graded: any[],
// // //             learnerNamesWriting: string[]
// // //         }>();

// // //         submissions.forEach(s => {
// // //             if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

// // //             if (!map.has(s.assessmentId)) {
// // //                 map.set(s.assessmentId, {
// // //                     assessmentId: s.assessmentId,
// // //                     title: s.title || 'Unknown Assessment',
// // //                     writing: [], pending: [], graded: [], learnerNamesWriting: []
// // //                 });
// // //             }

// // //             const entry = map.get(s.assessmentId)!;

// // //             if (s.status === 'in_progress') {
// // //                 entry.writing.push(s);
// // //                 const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
// // //                 if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
// // //             } else if (s.status === 'submitted') {
// // //                 entry.pending.push(s);
// // //             } else if (s.status === 'graded' || s.status === 'moderated') {
// // //                 entry.graded.push(s);
// // //             }
// // //         });

// // //         return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
// // //     }, [submissions, enrolledLearners]);

// // //     const filteredAssessments = useMemo(() => {
// // //         if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
// // //         if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
// // //         return assessmentStatsMap;
// // //     }, [assessmentStatsMap, assessmentFilter]);

// // //     const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
// // //     const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

// // //     const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
// // //         if (subsToUpdate.length === 0) return;
// // //         if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

// // //         setIsGrantingTime(true);
// // //         try {
// // //             const batch = writeBatch(db);
// // //             subsToUpdate.forEach(sub => {
// // //                 batch.update(doc(db, 'learner_submissions', sub.id), {
// // //                     extraTimeGranted: increment(minutes),
// // //                     lastStaffEditAt: new Date().toISOString()
// // //                 });
// // //             });
// // //             await batch.commit();
// // //             toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
// // //             await fetchSubmissions();
// // //         } catch (error) {
// // //             toast.error("Failed to grant extra time.");
// // //         } finally {
// // //             setIsGrantingTime(false);
// // //         }
// // //     };

// // //     const handleQCTOExport = async () => {
// // //         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
// // //         setIsExporting(true);
// // //         try {
// // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// // //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// // //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// // //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// // //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
// // //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// // //             const todayQCTO = formatQCTODate(new Date().toISOString());

// // //             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

// // //             const dataRows = [headers.map(createTextCell)];
// // //             enrolledLearners.forEach(learner => {
// // //                 const d = learner.demographics || {};
// // //                 const names = (learner.fullName || '').trim().split(' ');
// // //                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
// // //                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
// // //             });

// // //             const wb = XLSX.utils.book_new();
// // //             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
// // //             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
// // //             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
// // //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// // //             XLSX.writeFile(wb, fileName);
// // //             toast.success(`Export successful: ${fileName}`);
// // //         } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
// // //     };

// // //     const syncLearnerWorkbooks = async () => {
// // //         setIsSyncing(true);
// // //         try {
// // //             const batch = writeBatch(db);
// // //             const aRef = collection(db, 'assessments');
// // //             const [snapA, snapS] = await Promise.all([
// // //                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// // //                 getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// // //             ]);
// // //             const allAssessments = new Map<string, any>();
// // //             snapA.docs.forEach(d => allAssessments.set(d.id, d));
// // //             snapS.docs.forEach(d => allAssessments.set(d.id, d));

// // //             if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

// // //             const activeLearnersToSync = enrolledLearners.filter(l => l.status !== 'dropped');

// // //             let count = 0;
// // //             for (const learner of activeLearnersToSync) {
// // //                 const enrolId = learner.enrollmentId || learner.id;
// // //                 const humanId = learner.learnerId || learner.id;
// // //                 for (const [astId, astDoc] of allAssessments.entries()) {
// // //                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.learnerId === humanId));
// // //                     if (!exists) {
// // //                         const data = astDoc.data();
// // //                         batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
// // //                         count++;
// // //                     }
// // //                 }
// // //             }
// // //             if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
// // //             else toast.success('All active learners are synced.');
// // //         } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
// // //     };

// // //     const getStaffName = async (id: string) => {
// // //         const cachedStaff = useStore.getState().staff;
// // //         const match = cachedStaff.find(s => s.id === id);
// // //         if (match) return match.fullName;

// // //         try {
// // //             const userSnap = await getDoc(doc(db, 'users', id));
// // //             if (userSnap.exists()) return userSnap.data().fullName;
// // //         } catch { }

// // //         return 'Unassigned';
// // //     };

// // //     const [facName, setFacName] = useState('Loading...');
// // //     const [assName, setAssName] = useState('Loading...');
// // //     const [modName, setModName] = useState('Loading...');

// // //     useEffect(() => {
// // //         if (!cohort) return;
// // //         getStaffName(cohort.facilitatorId).then(setFacName);
// // //         getStaffName(cohort.assessorId).then(setAssName);
// // //         getStaffName(cohort.moderatorId).then(setModName);
// // //     }, [cohort]);


// // // const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
// // //     if (!learnerToDrop) return;
// // //     try {
// // //         const batch = writeBatch(db);

// // //         // 1. Update the Enrollment record (Uses the composite ID)
// // //         const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
// // //         const enrollRef = doc(db, 'enrollments', routingId);

// // //         batch.update(enrollRef, {
// // //             status: 'dropped',
// // //             exitDate: data.date,
// // //             exitReasonCategory: data.reason,
// // //             exitNotes: data.notes,
// // //             exitEvidenceUrl: data.evidenceUrl,
// // //             resignationLetterUrl: data.resignationUrl,
// // //             updatedAt: new Date().toISOString()
// // //         });

// // //         // 2. Find the ACTUAL Learner record safely via Query
// // //         const learnersRef = collection(db, 'learners');
// // //         const q = query(learnersRef, where("idNumber", "==", learnerToDrop.idNumber));
// // //         const snapshot = await getDocs(q);

// // //         if (!snapshot.empty) {
// // //             // Found the real learner document!
// // //             const actualLearnerDoc = snapshot.docs[0];
// // //             const learnerRef = doc(db, 'learners', actualLearnerDoc.id);

// // //             batch.update(learnerRef, {
// // //                 status: 'dropped',
// // //                 updatedAt: new Date().toISOString()
// // //             });
// // //         } else {
// // //             console.warn(`Could not find base learner document for ID: ${learnerToDrop.idNumber}. Continuing with enrollment update.`);
// // //         }

// // //         // 3. Commit both updates together
// // //         await batch.commit();

// // //         toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);

// // //         // 4. Refresh State
// // //         if (useStore.getState().fetchLearners) {
// // //             useStore.getState().fetchLearners(true);
// // //         }

// // //         setLearnerToDrop(null); 
// // //     } catch (err: any) {
// // //         console.error("Error in handleConfirmDrop:", err);
// // //         toast.error(err.message || 'Failed to complete withdrawal process.');
// // //         throw err;
// // //     }
// // // };

// // //     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
// // //     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
// // //     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
// // //     const selectedTopicCount = Object.keys(selectedTopics).length;

// // //     // ─── 🚀 CALENDAR GENERATOR LOGIC ───
// // //     const calendarGrid = useMemo(() => {
// // //         const startDay = calendarMonth.day();
// // //         const diff = startDay === 0 ? 6 : startDay - 1;
// // //         const startGrid = calendarMonth.clone().subtract(diff, 'days');

// // //         const endOfMonth = calendarMonth.clone().endOf('month');
// // //         const endDay = endOfMonth.day();
// // //         const endDiff = endDay === 0 ? 0 : 7 - endDay;
// // //         const endGrid = endOfMonth.clone().add(endDiff, 'days');

// // //         const grid = [];
// // //         let curr = startGrid.clone();
// // //         while (curr.isSameOrBefore(endGrid)) {
// // //             grid.push(curr.clone());
// // //             curr.add(1, 'day');
// // //         }
// // //         return grid;
// // //     }, [calendarMonth]);

// // //     const calendarDataMap = useMemo(() => {
// // //         const map = new Map();

// // //         holidays.forEach(h => map.set(h, { isHoliday: true }));

// // //         if (cohort?.recessPeriods) {
// // //             cohort.recessPeriods.forEach((p: any) => {
// // //                 let curr = moment(p.start);
// // //                 const end = moment(p.end);
// // //                 if (!curr.isValid() || !end.isValid()) return;
// // //                 let failsafe = 0;
// // //                 while (curr.isSameOrBefore(end) && failsafe < 60) {
// // //                     const dStr = curr.format('YYYY-MM-DD');
// // //                     map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
// // //                     curr.add(1, 'day');
// // //                     failsafe++;
// // //                 }
// // //             });
// // //         }
        
// // //         dailyRegisters.forEach(h => {
// // //             if (!h.date) return;
// // //             const dStr = moment(h.date).format('YYYY-MM-DD');
// // //             const existing = map.get(dStr) || {};
// // //             existing.hasRegister = true;
// // //             existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
// // //             existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
// // //             map.set(dStr, existing);
// // //         });

// // //         cohortLeaves.forEach(l => {
// // //             if (!l.startDate && !l.dateAffected) return;
// // //             let curr = moment(l.startDate || l.dateAffected);
// // //             const end = moment(l.endDate || l.dateAffected);
// // //             if (!curr.isValid() || !end.isValid()) return;
// // //             let failsafe = 0;
// // //             while(curr.isSameOrBefore(end) && failsafe < 60) {
// // //                 const dStr = curr.format('YYYY-MM-DD');
// // //                 const existing = map.get(dStr) || {};
// // //                 existing.leaves = (existing.leaves || 0) + 1;
// // //                 if(l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
// // //                 map.set(dStr, existing);
// // //                 curr.add(1, 'day');
// // //                 failsafe++;
// // //             }
// // //         });
        
// // //         return map;
// // //     }, [dailyRegisters, holidays, cohort, cohortLeaves]);

// // //     return (
// // //         <div className="cdp-layout">

// // //             {/* 🚀 SVG DEFINITIONS FOR PROGRESS CARD GRADIENTS */}
// // //             <svg width="0" height="0" style={{ position: 'absolute' }}>
// // //                 <defs>
// // //                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
// // //                         <stop offset="0%" stopColor="var(--mlab-green)" />
// // //                         <stop offset="100%" stopColor="var(--mlab-green-dark)" />
// // //                     </linearGradient>
// // //                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
// // //                         <stop offset="0%" stopColor="#38bdf8" />
// // //                         <stop offset="100%" stopColor="#0284c7" />
// // //                     </linearGradient>
// // //                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
// // //                         <stop offset="0%" stopColor="#f59e0b" />
// // //                         <stop offset="100%" stopColor="#d97706" />
// // //                     </linearGradient>
// // //                     {/* NEW GRADIENTS FOR KPI CARDS */}
// // //                     <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
// // //                         <stop offset="0%" stopColor="#38bdf8" />
// // //                         <stop offset="100%" stopColor="#0284c7" />
// // //                     </linearGradient>
// // //                     <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
// // //                         <stop offset="0%" stopColor="#94a3b8" />
// // //                         <stop offset="100%" stopColor="#475569" />
// // //                     </linearGradient>
// // //                 </defs>
// // //             </svg>

// // //             {/* 🚀 STRICT MLAB STYLING OVERRIDES FOR CARDS & MODULES */}
// // //             <style>{`
// // //                 /* Removed .mc-cards-wrapper since we use inline flex/grid with minmax for better responsiveness */
                
// // //                 /* Squared mLab Cards */
// // //                 .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
// // //                 .mc:hover { transform: translateY(-4px); }
// // //                 .mc-orb { display: none; /* Removed for flat UI consistency */ }
                
// // //                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
// // //                 .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
// // //                 .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
// // //                 .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
// // //                 .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
// // //                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem 0; }
// // //                 .mc-ring-svg { transform: rotate(-90deg); }
// // //                 .mc-ring-track { fill: none; stroke: var(--mlab-border); stroke-width: 8px; }
// // //                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: butt; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
// // //                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
// // //                 .mc-ring-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--mlab-blue); }
// // //                 .mc-ring-denom { font-family: var(--font-heading); text-transform: uppercase; font-size: 0.65rem; font-weight: 700; color: var(--mlab-grey); }
                
// // //                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
// // //                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
// // //                 .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
// // //                 .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
// // //                 .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
// // //                 .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                
// // //                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
// // //                 .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
// // //                 .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
// // //                 .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
// // //                 .mc-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; background: var(--mlab-blue); }
                
// // //                 /* Match colors strictly to mLab palette or explicit variants */
// // //                 .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background: var(--mlab-green); } .mc-k .mc-fill-secondary { background: var(--mlab-green-bg); }
// // //                 .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background: #0ea5e9; } .mc-p .mc-fill-secondary { background: #e0f2fe; }
// // //                 .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background: #d97706; } .mc-w .mc-fill-secondary { background: #fef3c7; }
// // //                 .mc-a .mc-ring-fill { stroke: url(#gA); } .mc-a .mc-fill-primary { background: #0ea5e9; } .mc-a .mc-fill-secondary { background: #e0f2fe; }
// // //                 .mc-d .mc-ring-fill { stroke: url(#gD); } .mc-d .mc-fill-primary { background: #64748b; } .mc-d .mc-fill-secondary { background: #f1f5f9; }

// // //                 /* Standardize all basic wrappers to remove round corners */
// // //                 .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
// // //             `}</style>

// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {modalConfig.isOpen && createPortal(
// // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // //                     <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
// // //                 </div>,
// // //                 document.body
// // //             )}

// // //             {learnerToPlace && createPortal(
// // //                 <WorkplacePlacementModal
// // //                     learner={learnerToPlace}
// // //                     // @ts-ignore
// // //                     cohort={cohort}
// // //                     onClose={() => setLearnerToPlace(null)}
// // //                 />,
// // //                 document.body
// // //             )}

// // //             {learnerToDrop && (
// // //                 <LearnerDropoutModal
// // //                     learner={learnerToDrop}
// // //                     onClose={() => setLearnerToDrop(null)}
// // //                     onConfirm={handleConfirmDrop}
// // //                 />
// // //             )}

// // //             <AILessonPlanModal
// // //                 isOpen={showAIModal || !!editingReport}
// // //                 onClose={() => { setShowAIModal(false); setEditingReport(null); }}
// // //                 onSave={handleSaveReport}
// // //                 onShowStatus={showStatusPopup}
// // //                 selectedTopics={selectedTopics}
// // //                 curriculumItems={activeProgramme ? curriculumItems : []}
// // //                 activeProgramme={activeProgramme}
// // //                 cohort={cohort}
// // //                 user={user}
// // //                 existingReport={editingReport}
// // //             />

// // //             <StipendExportModal 
// // //                 isOpen={isStipendModalOpen}
// // //                 onClose={() => setIsStipendModalOpen(false)}
// // //                 cohortId={cohort?.id || ''}
// // //                 cohortName={cohort?.name || 'Cohort'}
// // //                 learners={enrolledLearners.filter(l => l.status !== 'dropped')}
// // //                 attendanceMode="qcto"
// // //                 initialMonth={calendarMonth.format('YYYY-MM')}
// // //             />

// // //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// // //             <main className="cdp-main">
// // //                 <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
// // //                     <div className="cdp-header__left">
// // //                         <button className="lfm-btn lfm-btn--ghost" onClick={handleBack} style={{ padding: '4px 10px', fontSize: '0.7rem', marginBottom: '10px' }}>
// // //                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
// // //                         </button>
// // //                         <div style={{ fontFamily: 'var(--font-heading)', color: 'whitesmoke', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={12} /> Cohort Overview</div>
// // //                         <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '4px 0', textTransform: 'uppercase' }}>{cohort.name}</h1>
// // //                         <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                             <Calendar size={12} /> {cohort.startDate} — {cohort.endDate}
// // //                             <span style={{ display: 'inline-block', background: cohort.isArchived ? 'var(--mlab-bg)' : 'var(--mlab-green-bg)', color: cohort.isArchived ? 'var(--mlab-grey)' : 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', border: `1px solid ${cohort.isArchived ? 'var(--mlab-border)' : 'var(--mlab-green)'}`, textTransform: 'uppercase' }}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
// // //                         </p>
// // //                     </div>
// // //                     <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                         {(isAdmin || isFacilitator) && (
// // //                             <div style={{ display: 'flex', gap: '0.5rem' }}>
// // //                                 <button className="lfm-btn lfm-btn--ghost" onClick={handleQCTOExport} disabled={isExporting}>
// // //                                     {isExporting ? <Loader2 size={13} className="lfm-spin" /> : <DownloadCloud size={13} />} Export LEISA
// // //                                 </button>
// // //                                 <button className="lfm-btn lfm-btn--primary" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// // //                                     {isSyncing ? <Loader2 size={13} className="lfm-spin" /> : <RefreshCcw size={13} />} Sync Workbooks
// // //                                 </button>
// // //                             </div>
// // //                         )}
// // //                         <NotificationBell />
// // //                     </div>
// // //                 </header>

// // //                 <div className="cdp-content" style={{ padding: '2rem' }}>
                    
// // //                     <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
// // //                         <button 
// // //                             onClick={() => setShowKPIs(!showKPIs)} 
// // //                             style={{ 
// // //                                 display: 'flex', alignItems: 'center', gap: '6px', 
// // //                                 background: 'transparent', border: 'none', color: 'var(--mlab-grey)', 
// // //                                 fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, 
// // //                                 textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s' 
// // //                             }}
// // //                             onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
// // //                             onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
// // //                         >
// // //                             {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
// // //                         </button>
// // //                     </div>

// // //                     {/* TOP KPIs CONVERTED TO PROGRESS CARDS (COLLAPSIBLE) */}
// // //                     {showKPIs && (
// // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }} className="animate-slide-down">
// // //                             <ModuleProgressCard 
// // //                                 type="Active Learners" 
// // //                                 data={{ total: cohortDemographics.total, logged: activeCount }} 
// // //                             />
                            
// // //                             {/* 🚀 ROBUST ATTENDANCE HEALTH CARD USING STAGGERED SEGMENTS */}
// // //                             <ModuleProgressCard 
// // //                                 type="Active Attendance" 
// // //                                 data={{ 
// // //                                     total: attendanceHealth.total, 
// // //                                     logged: attendanceHealth.high, // We emphasize the "healthy" high attendance number
// // //                                     segments: [
// // //                                         { label: 'High (75%+)', value: attendanceHealth.high, color: '#16a34a' },
// // //                                         { label: 'At-Risk (40-74%)', value: attendanceHealth.mid, color: '#f59e0b' },
// // //                                         { label: 'Critical (<40%)', value: attendanceHealth.low, color: '#dc2626' }
// // //                                     ]
// // //                                 }} 
// // //                             />
                            
// // //                             {/* 🚀 ROBUST DEMOGRAPHICS CARD USING STAGGERED SEGMENTS */}
// // //                             <ModuleProgressCard 
// // //                                 type="ACI Demographics" 
// // //                                 data={{ 
// // //                                     total: cohortDemographics.total, 
// // //                                     logged: cohortDemographics.blackCount + cohortDemographics.colouredCount + cohortDemographics.indianCount,
// // //                                     segments: [
// // //                                         { label: 'Black African', value: cohortDemographics.blackCount, color: '#16a34a' },
// // //                                         { label: 'Coloured', value: cohortDemographics.colouredCount, color: '#0ea5e9' },
// // //                                         { label: 'Indian/Asian', value: cohortDemographics.indianCount, color: '#d97706' },
// // //                                         { label: 'White', value: cohortDemographics.whiteCount, color: '#94a3b8' },
// // //                                         { label: 'Other', value: cohortDemographics.otherCount, color: '#cbd5e1' }
// // //                                     ]
// // //                                 }} 
// // //                             />
                            
// // //                             {/* 🚀 ROBUST YOUTH CARD USING MULTIPLE LINES */}
// // //                             <ModuleProgressCard 
// // //                                 type="Youth Representation" 
// // //                                 data={{ 
// // //                                     total: cohortDemographics.total, 
// // //                                     logged: cohortDemographics.youthCount,
// // //                                     lines: [
// // //                                         { label: 'Youth (< 35 Years)', value: cohortDemographics.youthCount, total: cohortDemographics.total, color: '#4d7c0f', bg: '#ecfccb' },
// // //                                         { label: 'Adults (35+ Years)', value: cohortDemographics.total - cohortDemographics.youthCount, total: cohortDemographics.total, color: '#ca8a04', bg: '#fef3c7' }
// // //                                     ]
// // //                                 }} 
// // //                             />
                            
// // //                             <ModuleProgressCard 
// // //                                 type="Workplace Placements" 
// // //                                 data={{ total: activeCount > 0 ? activeCount : 1, logged: placedCount }} 
// // //                             />
// // //                             <ModuleProgressCard 
// // //                                 type="Pending Marking" 
// // //                                 data={{ total: submissions.length > 0 ? submissions.length : 1, logged: pendingTotal }} 
// // //                             />
// // //                         </div>
// // //                     )}

// // //                     {/* PERMANENTLY VISIBLE COHORT META DATA */}
// // //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        
// // //                         {/* Timeline Card */}
// // //                         <div className="mc">
// // //                             <div className="mc-hdr">
// // //                                 <div>
// // //                                     <div className="mc-label">Duration</div>
// // //                                     <div className="mc-title">Cohort Timeline</div>
// // //                                 </div>
// // //                                 <Calendar size={20} color="var(--mlab-blue)" />
// // //                             </div>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
// // //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// // //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
// // //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
// // //                                 </div>
// // //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// // //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
// // //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                         {/* Facilitator Card */}
// // //                         <div className="mc">
// // //                             <div className="mc-hdr">
// // //                                 <div>
// // //                                     <div className="mc-label">Assigned Staff</div>
// // //                                     <div className="mc-title">Facilitator</div>
// // //                                 </div>
// // //                                 <Users size={20} color="var(--mlab-blue)" />
// // //                             </div>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // //                                     {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
// // //                                 </div>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
// // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                         {/* Assessor Card */}
// // //                         <div className="mc">
// // //                             <div className="mc-hdr">
// // //                                 <div>
// // //                                     <div className="mc-label">Assigned Staff</div>
// // //                                     <div className="mc-title">Assessor</div>
// // //                                 </div>
// // //                                 <Award size={20} color="var(--mlab-blue)" />
// // //                             </div>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // //                                     {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
// // //                                 </div>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
// // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                         {/* Moderator Card */}
// // //                         <div className="mc">
// // //                             <div className="mc-hdr">
// // //                                 <div>
// // //                                     <div className="mc-label">Assigned Staff</div>
// // //                                     <div className="mc-title">Moderator</div>
// // //                                 </div>
// // //                                 <ShieldCheck size={20} color="var(--mlab-blue)" />
// // //                             </div>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // //                                     {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
// // //                                 </div>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
// // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     {/* MASTER ASSESSMENTS ACCORDION */}
// // //                     {assessmentStatsMap.length > 0 && (
// // //                         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>
// // //                             <div className="lfm-header" style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }} onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}>
// // //                                 <h2 className="lfm-header__title"><BookOpen size={16} /> Assessment Operations Center</h2>
                                
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
// // //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-white)', color: 'var(--mlab-red)', padding: '4px 10px', border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
// // //                                             {totalWriting > 0 && <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />}
// // //                                             {totalWriting} Writing
// // //                                         </span>
// // //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // //                                             <Clock size={10} /> {totalPending} Pending Marking
// // //                                         </span>
// // //                                     </div>
// // //                                     <div style={{ color: 'var(--mlab-white)' }}>
// // //                                         {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
                            
// // //                             {isAssessmentsExpanded && (
// // //                                 <div className="lfm-body animate-slide-down">
// // //                                     <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
// // //                                         <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
// // //                                         <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
// // //                                         <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
// // //                                     </div>
// // //                                     {filteredAssessments.length === 0 ? (
// // //                                         <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-bg)' }}>
// // //                                             No assessments match this filter.
// // //                                         </div>
// // //                                     ) : (
// // //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // //                                             {filteredAssessments.map(exam => {
// // //                                                 const isExpanded = expandedAssessments.has(exam.assessmentId);
// // //                                                 const isLive = exam.writing.length > 0;
// // //                                                 const hasPending = exam.pending.length > 0;
// // //                                                 return (
// // //                                                     <div key={exam.assessmentId} className="animate-fade-in" style={{
// // //                                                         background: 'var(--mlab-white)',
// // //                                                         border: isLive ? '2px solid var(--mlab-red)' : hasPending ? '2px solid #f59e0b' : '2px solid var(--mlab-border)',
// // //                                                     }}>
// // //                                                         <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
// // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
// // //                                                                 <div style={{ color: 'var(--mlab-blue)' }}>
// // //                                                                     <BookOpen size={20} />
// // //                                                                 </div>
// // //                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                                                     <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
// // //                                                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// // //                                                                         {isLive && (
// // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', border: '1px solid #fca5a5', textTransform: 'uppercase' }}>
// // //                                                                                 <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// // //                                                                                 {exam.writing.length} Writing
// // //                                                                             </span>
// // //                                                                         )}
// // //                                                                         {hasPending && (
// // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // //                                                                                 <Clock size={10} /> {exam.pending.length} Awaiting Marking
// // //                                                                             </span>
// // //                                                                         )}
// // //                                                                         {exam.graded.length > 0 && (
// // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', border: '1px solid var(--mlab-green)', textTransform: 'uppercase' }}>
// // //                                                                                 <CheckCircle2 size={10} /> {exam.graded.length} Graded
// // //                                                                             </span>
// // //                                                                         )}
// // //                                                                     </div>
// // //                                                                 </div>
// // //                                                             </div>
// // //                                                             <div style={{ color: 'var(--mlab-blue)' }}>
// // //                                                                 {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// // //                                                             </div>
// // //                                                         </div>
// // //                                                         {isExpanded && (
// // //                                                             <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // //                                                                 {isLive && (
// // //                                                                     <div style={{ border: '2px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// // //                                                                         <div>
// // //                                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                                                                                 <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// // //                                                                                 Currently Live ({exam.writing.length})
// // //                                                                             </span>
// // //                                                                             <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
// // //                                                                                 {exam.learnerNamesWriting.join(', ')}
// // //                                                                             </p>
// // //                                                                         </div>
// // //                                                                         <div style={{ display: 'flex', gap: '8px' }}>
// // //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
// // //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
// // //                                                                             </button>
// // //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
// // //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
// // //                                                                             </button>
// // //                                                                         </div>
// // //                                                                     </div>
// // //                                                                 )}
// // //                                                                 {hasPending && (
// // //                                                                     <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// // //                                                                         <div>
// // //                                                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
// // //                                                                             <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
// // //                                                                                 <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
// // //                                                                             </p>
// // //                                                                         </div>
// // //                                                                         <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
// // //                                                                             <PenTool size={14} /> Go to Grading Queue
// // //                                                                         </button>
// // //                                                                     </div>
// // //                                                                 )}
// // //                                                             </div>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 );
// // //                                             })}
// // //                                         </div>
// // //                                     )}
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     {/* 🚀 TAB NAVIGATION */}
// // //                     <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
// // //                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
// // //                             <Users size={16} /> Learner Roster
// // //                         </button>
// // //                         <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
// // //                             <LayoutList size={16} /> Curriculum Tracker
// // //                         </button>
// // //                         <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
// // //                             <Calendar size={16} /> Calendar View
// // //                         </button>
// // //                         <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
// // //                             <UserCheck size={16} /> Attendance Tracker
// // //                         </button>
// // //                     </div>

// // //                     {/* ─── TAB 1: LEARNER ROSTER ─── */}
// // //                     {activeTab === 'learners' && (
// // //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// // //                             <div className="lfm-header">
// // //                                 <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
// // //                             </div>

// // //                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '2px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
// // //                                 <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
// // //                                     <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
// // //                                     <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px' }} />
// // //                                 </div>

// // //                                 <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// // //                                         <label>Status:</label>
// // //                                         <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ minWidth: '150px' }}>
// // //                                             <option value="all">All Applicants</option>
// // //                                             <option value="active">Active Only</option>
// // //                                             <option value="dropped">Withdrawn Only</option>
// // //                                         </select>
// // //                                     </div>

// // //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// // //                                         <label>Attendance:</label>
// // //                                         <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ minWidth: '180px' }}>
// // //                                             <option value="all">All Attendance Bands</option>
// // //                                             <option value="high">High Compliance (75%+)</option>
// // //                                             <option value="mid">Average Compliance (40% - 74%)</option>
// // //                                             <option value="low">Critical Risk (&lt; 40%)</option>
// // //                                         </select>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="lfm-body" style={{ padding: 0 }}>
// // //                                 <div className="mlab-table-wrap">
// // //                                     <table className="mlab-table" style={{ margin: 0 }}>
// // //                                         <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // //                                             <tr>
// // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Learner</th>
// // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Workplace</th>
// // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Module Progress</th>
// // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Attendance</th>
// // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Status</th>
// // //                                                 <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
// // //                                             </tr>
// // //                                         </thead>
// // //                                         <tbody>
// // //                                             {filteredLearners.length === 0 ? (
// // //                                                 <tr>
// // //                                                     <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // //                                                         <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
// // //                                                         <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
// // //                                                     </td>
// // //                                                 </tr>
// // //                                             ) : (
// // //                                                 filteredLearners.map(learner => {
// // //                                                     const isDropped = learner.status === 'dropped';
// // //                                                     const routingId = learner.enrollmentId || learner.id;
// // //                                                     const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// // //                                                     const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
// // //                                                     const isPlaced = !!learner.employerId;

// // //                                                     const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };

// // //                                                     return (
// // //                                                         <tr key={learner.id} style={{ opacity: isDropped ? 0.6 : 1, background: isDropped ? 'var(--mlab-bg)' : 'transparent' }}>
// // //                                                             <td>
// // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                                                     <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)' }}>
// // //                                                                         {learner.fullName.charAt(0)}
// // //                                                                     </div>
// // //                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// // //                                                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{learner.fullName}</span>
// // //                                                                         <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
// // //                                                                         {!isDropped && pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', marginTop: '4px' }}><Clock size={10} /> {pendingCount} marking pending</span>}
// // //                                                                     </div>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>{isPlaced ? <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{employers.find(e => e.id === learner.employerId)?.name}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}><AlertCircle size={12} /> Pending</span>}</td>
// // //                                                             <td>
// // //                                                                 <div style={{ display: 'flex', gap: '6px' }}>
// // //                                                                     <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
// // //                                                                     <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', border: '1px solid #bae6fd', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
// // //                                                                     <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', border: '1px solid #fed7aa', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>
// // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                                                     <span style={{
// // //                                                                         display: 'inline-flex', alignItems: 'center', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
// // //                                                                         background: stats.pct >= 75 ? 'var(--mlab-green-bg)' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
// // //                                                                         color: stats.pct >= 75 ? 'var(--mlab-green-dark)' : stats.pct >= 40 ? '#b45309' : '#991b1b',
// // //                                                                         border: `1px solid ${stats.pct >= 75 ? 'var(--mlab-green)' : stats.pct >= 40 ? '#fde68a' : '#fca5a5'}`
// // //                                                                     }}>{stats.pct}%</span>
// // //                                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{stats.attended} / {stats.total}</span>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>
// // //                                                                 <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: isDropped ? 'var(--mlab-bg)' : 'var(--mlab-light-blue)', color: isDropped ? 'var(--mlab-grey)' : 'var(--mlab-blue)', border: `1px solid ${isDropped ? 'var(--mlab-border)' : 'var(--mlab-blue)'}` }}>
// // //                                                                     {isDropped ? 'Dropped' : 'Active'}
// // //                                                                 </span>
// // //                                                             </td>

// // //                                                             <td style={{ textAlign: 'right' }}>
// // //                                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
// // //                                                                     {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
// // //                                                                     <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>

// // //                                                                     {isDropped ? (
// // //                                                                         <button 
// // //                                                                             onClick={() => setLearnerToDrop(learner)} 
// // //                                                                             title="View Withdrawal Details" 
// // //                                                                             className="lfm-btn lfm-btn--ghost" 
// // //                                                                             style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}
// // //                                                                         >
// // //                                                                             <FileText size={12} /> View Exit
// // //                                                                         </button>
// // //                                                                     ) : (
// // //                                                                         <button
// // //                                                                             onClick={() => setLearnerToDrop(learner)}
// // //                                                                             title="Process Withdrawal / Dropout"
// // //                                                                             className="lfm-btn"
// // //                                                                             style={{
// // //                                                                                 background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem'
// // //                                                                             }}
// // //                                                                             onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
// // //                                                                             onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
// // //                                                                         >
// // //                                                                             <UserMinus size={12} /> Withdraw
// // //                                                                         </button>
// // //                                                                     )}
// // //                                                                 </div>
// // //                                                             </td>
                                                            
// // //                                                         </tr>
// // //                                                     );
// // //                                                 })
// // //                                             )}
// // //                                         </tbody>
// // //                                     </table>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 2: CURRICULUM TRACKER ─── */}
// // //                     {activeTab === 'curriculum' && (
// // //                         <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
// // //                             {activeProgramme && (
// // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
// // //                                     <ModuleProgressCard type="Knowledge" data={moduleProgress.Knowledge} />
// // //                                     <ModuleProgressCard type="Practical" data={moduleProgress.Practical} />
// // //                                     <ModuleProgressCard type="Workplace" data={moduleProgress.Workplace} />
// // //                                 </div>
// // //                             )}

// // //                             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
// // //                                 <div style={{ background: 'var(--mlab-white)', display: 'inline-flex', border: '2px solid var(--mlab-blue)' }}>
// // //                                     <button onClick={() => setCurriculumViewMode('blueprint')} className={`lfm-btn ${curriculumViewMode === 'blueprint' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none' }}><CheckSquare size={14} /> Log New Topics</button>
// // //                                     <button onClick={() => setCurriculumViewMode('history')} className={`lfm-btn ${curriculumViewMode === 'history' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none', borderLeft: '2px solid var(--mlab-blue)' }}><Clock size={14} /> View Past Sessions</button>
// // //                                 </div>
// // //                             </div>

// // //                             <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// // //                                 <div className="lfm-header">
// // //                                     <h2 className="lfm-header__title"><BookOpen size={16} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2>
// // //                                 </div>
// // //                                 <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'var(--mlab-white)' : 'var(--mlab-bg)', padding: '1.5rem' }}>
// // //                                     {!activeProgramme ? (
// // //                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No formal Qualification Blueprint is linked to this cohort.</p></div>
// // //                                     ) : (
// // //                                         <>
// // //                                             {curriculumViewMode === 'blueprint' && (
// // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // //                                                     {Object.keys(groupedCurriculum).map(modCode => {
// // //                                                         const group = groupedCurriculum[modCode];
// // //                                                         const isOpen = expandedModules.has(modCode);
// // //                                                         const totalItems = group.items.length;
// // //                                                         const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// // //                                                         const isComplete = loggedItems === totalItems && totalItems > 0;

// // //                                                         return (
// // //                                                             <div key={modCode}>
// // //                                                                 <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
// // //                                                                     <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
// // //                                                                     <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
// // //                                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', border: `1px solid ${isComplete ? 'var(--mlab-green)' : 'transparent'}` }}>{loggedItems} / {totalItems} COVERED</span>
// // //                                                                     {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// // //                                                                 </div>
// // //                                                                 {isOpen && (
// // //                                                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
// // //                                                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
// // //                                                                             <table className="mlab-table" style={{ margin: '0', border: 'none' }}>
// // //                                                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // //                                                                                     <tr>
// // //                                                                                         <th style={{ width: '50px', color: 'var(--mlab-grey)', textAlign: 'center', borderRight: '1px solid var(--mlab-border)', borderRadius: 0 }}>Log</th>
// // //                                                                                         <th style={{ color: 'var(--mlab-grey)', borderRadius: 0 }}>Topic / Activity</th>
// // //                                                                                         <th style={{ width: '280px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Status / Session Report</th>
// // //                                                                                         <th style={{ width: '180px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Engagement</th>
// // //                                                                                     </tr>
// // //                                                                                 </thead>
// // //                                                                                 <tbody>
// // //                                                                                     {group.items.map(item => {
// // //                                                                                         const logRecord = curriculumLogs.find(log => log.topicId === item.id);
// // //                                                                                         const isLogged = !!logRecord;
// // //                                                                                         const isSelected = selectedTopics.hasOwnProperty(item.id);
// // //                                                                                         const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
// // //                                                                                         const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

// // //                                                                                         return (
// // //                                                                                             <tr key={item.id} style={{ background: isLogged ? 'var(--mlab-green-bg)' : (isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)') }}>
// // //                                                                                                 <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
// // //                                                                                                     {isLogged ? <CheckCircle size={18} color="var(--mlab-green-dark)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
// // //                                                                                                 </td>
// // //                                                                                                 <td>
// // //                                                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                                                                                                         <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', color: isLogged ? 'var(--mlab-green-dark)' : 'var(--mlab-blue)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
// // //                                                                                                         <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
// // //                                                                                                     </div>
// // //                                                                                                 </td>
// // //                                                                                                 <td>
// // //                                                                                                     {isLogged ? (
// // //                                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                                                                             <span style={{ display: 'inline-block', background: 'var(--mlab-white)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
// // //                                                                                                             {associatedReport && <button className="lfm-btn lfm-btn--ghost" onClick={() => setEditingReport(associatedReport)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}><Edit3 size={12} /> Edit Report</button>}
// // //                                                                                                         </div>
// // //                                                                                                     ) : isSelected ? (
// // //                                                                                                         <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
// // //                                                                                                     ) : <span style={{ display: 'inline-block', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
// // //                                                                                                 </td>
// // //                                                                                                 <td>
// // //                                                                                                     {isLogged ? (
// // //                                                                                                         <div className="cdp-progress-col" style={{ width: '100%' }}>
// // //                                                                                                             <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green-dark)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)'), fontSize: '0.85rem' }}>{ackPct}%</span></div>
// // //                                                                                                             <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0', background: 'var(--mlab-border)', width: '100%' }}><div className="cdp-progress-fill" style={{ height: '100%', width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)') }} /></div>
// // //                                                                                                         </div>
// // //                                                                                                     ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)' }}>—</span>}
// // //                                                                                                 </td>
// // //                                                                                             </tr>
// // //                                                                                         );
// // //                                                                                     })}
// // //                                                                                 </tbody>
// // //                                                                             </table>
// // //                                                                         </div>
// // //                                                                     </div>
// // //                                                                 )}
// // //                                                             </div>
// // //                                                         );
// // //                                                     })
// // //                                                     }
// // //                                                 </div>
// // //                                             )}

// // //                                             {curriculumViewMode === 'history' && (
// // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // //                                                     {curriculumLogs.length === 0 ? (
// // //                                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No topics have been logged for this cohort yet.</p></div>
// // //                                                     ) : (
// // //                                                         Object.keys(groupedHistoryLogs).sort().map(modCode => {
// // //                                                             const logsInModule = groupedHistoryLogs[modCode];
// // //                                                             const isOpen = expandedHistoryModules.has(modCode);
// // //                                                             const moduleName = groupedCurriculum[modCode]?.moduleName || '';

// // //                                                             return (
// // //                                                                 <div key={`hist-${modCode}`}>
// // //                                                                     <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
// // //                                                                         <Layers size={16} color="var(--mlab-blue)" />
// // //                                                                         <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
// // //                                                                         <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: 'var(--mlab-light-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
// // //                                                                         {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// // //                                                                     </div>
// // //                                                                     {isOpen && (
// // //                                                                         <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
// // //                                                                             {logsInModule.map(log => {
// // //                                                                                 const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
// // //                                                                                 return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
// // //                                                                             })}
// // //                                                                         </div>
// // //                                                                     )}
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })
// // //                                                     )}
// // //                                                 </div>
// // //                                             )}
// // //                                         </>
// // //                                     )}
// // //                                 </div>
// // //                             </div>

// // //                             {selectedTopicCount > 0 && createPortal(
// // //                                 <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
// // //                                         <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
// // //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
// // //                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
// // //                                         </div>
// // //                                     </div>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
// // //                                             <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
// // //                                             <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
// // //                                         </div>
// // //                                         <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
// // //                                         <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
// // //                                             {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
// // //                                         </button>
// // //                                     </div>
// // //                                 </div>,
// // //                                 document.body
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 3: CALENDAR VIEW WITH STIPEND EXPORT ─── */}
// // //                     {activeTab === 'calendar' && (
// // //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
// // //                             <div className="lfm-header">
// // //                                 <h2 className="lfm-header__title">
// // //                                     <Calendar size={18} /> Cohort Attendance Calendar
// // //                                 </h2>

// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                     {cohort?.id && (
// // //                                         <button 
// // //                                             className="lfm-btn"
// // //                                             onClick={() => setIsStipendModalOpen(true)}
// // //                                             style={{ background: 'var(--mlab-green)', border: 'none' }}
// // //                                         >
// // //                                             <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
// // //                                         </button>
// // //                                     )}

// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
// // //                                         <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
// // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
// // //                                         <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
// // //                                 <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
// // //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
// // //                                         {dailyRegisters.length} Total Sessions
// // //                                     </span>
// // //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // //                                         {cohortLeaves.filter(l => l.status === 'Pending').length} Pending Leaves
// // //                                     </span>
// // //                                 </div>

// // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
// // //                                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
// // //                                         <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
// // //                                     ))}
// // //                                 </div>

// // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
// // //                                     {calendarGrid.map((day) => {
// // //                                         const dateStr = day.format('YYYY-MM-DD');
// // //                                         const isCurrentMonth = day.month() === calendarMonth.month();
// // //                                         const isToday = dateStr === moment().format('YYYY-MM-DD');
// // //                                         const data = calendarDataMap.get(dateStr);

// // //                                         return (
// // //                                             <div 
// // //                                                 key={dateStr} 
// // //                                                 onClick={() => {
// // //                                                     if (data?.hasRegister && cohort?.id) {
// // //                                                         navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
// // //                                                     } else {
// // //                                                         setLedgerDates(prev => prev.includes(dateStr) ? prev : [...prev, dateStr]);
// // //                                                         setActiveTab('attendance');
// // //                                                     }
// // //                                                 }}
// // //                                                 style={{ 
// // //                                                     border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', 
// // //                                                     borderRadius: 0, 
// // //                                                     minHeight: '110px', 
// // //                                                     padding: '10px', 
// // //                                                     backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', 
// // //                                                     opacity: isCurrentMonth ? 1 : 0.6,
// // //                                                     cursor: data?.hasRegister ? 'pointer' : 'default',
// // //                                                     transition: 'all 0.2s',
// // //                                                     boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
// // //                                                 }}
// // //                                                 onMouseOver={e => { if (data?.hasRegister) { e.currentTarget.style.borderColor = 'var(--mlab-green)' } }}
// // //                                                 onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)' }}
// // //                                             >
// // //                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                                     <span style={{ 
// // //                                                         fontWeight: '700',
// // //                                                         fontFamily: 'var(--font-heading)',
// // //                                                         color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', 
// // //                                                         background: isToday ? 'var(--mlab-blue)' : 'transparent',
// // //                                                         width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
// // //                                                     }}>{day.format('D')}</span>
// // //                                                 </div>
                                                
// // //                                                 {data && (
// // //                                                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // //                                                         {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
// // //                                                         {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}
                                                        
// // //                                                         {data.hasRegister && (
// // //                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
// // //                                                                 <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>{data.present} Present</span>
// // //                                                                 {data.absent > 0 && <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>{data.absent} Absent</span>}
// // //                                                             </div>
// // //                                                         )}

// // //                                                         {data.leaves > 0 && (
// // //                                                             <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
// // //                                                                 <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
// // //                                                             </span>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>
// // //                                         )
// // //                                     })}
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ─── TAB 4: ATTENDANCE ─── */}
// // //                     {activeTab === 'attendance' && (
// // //                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
// // //                             <div style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
// // //                                 <div className="lfm-header">
// // //                                     <h2 className="lfm-header__title">
// // //                                         <History size={18} /> Historical Session Ledger
// // //                                     </h2>

// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px' }}>
// // //                                             <Calendar size={14} color="var(--mlab-blue)" />
// // //                                             <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
// // //                                             <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
// // //                                         </div>
// // //                                         <button className="lfm-btn lfm-btn--primary" onClick={() => setIsDropZoneOpen(true)} style={{ border: '1px solid var(--mlab-white)' }}>
// // //                                             <UploadCloud size={14} /> Upload Zoom CSV
// // //                                         </button>
// // //                                     </div>
// // //                                 </div>

// // //                                 {ledgerDates.length > 0 && (
// // //                                     <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
// // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
// // //                                         {ledgerDates.map(date => (
// // //                                             <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
// // //                                                 {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
// // //                                                 <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
// // //                                             </span>
// // //                                         ))}
// // //                                         <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                             <XCircle size={12} /> Clear All
// // //                                         </button>
// // //                                     </div>
// // //                                 )}

// // //                                 <div className="lfm-body" style={{ padding: 0 }}>
// // //                                     <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
// // //                                         {filteredDailyRegisters.length === 0 ? (
// // //                                             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // //                                                 <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// // //                                                 <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}</p>
// // //                                             </div>
// // //                                         ) : (
// // //                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
// // //                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // //                                                     <tr>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Expected Duration</th>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Captured</th>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Present (80%+)</th>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Short Hours</th>
// // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Absent</th>
// // //                                                     </tr>
// // //                                                 </thead>
// // //                                                 <tbody>
// // //                                                     {filteredDailyRegisters.map((reg) => {
// // //                                                         const presentCount = reg.presentLearners?.length || 0;
// // //                                                         const absentCount = reg.absentLearners?.length || 0;
// // //                                                         const partialCount = reg.partialLearners?.length || 0;
// // //                                                         const totalCaptured = presentCount + absentCount + partialCount;

// // //                                                         return (
// // //                                                             <tr key={reg.id}>
// // //                                                                 <td style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
// // //                                                                     {reg.date ? new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
// // //                                                                 </td>
// // //                                                                 <td>
// // //                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// // //                                                                         <Clock size={14} /> {reg.expectedDuration || 0} mins
// // //                                                                     </span>
// // //                                                                 </td>
// // //                                                                 <td style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{totalCaptured} Learners</td>
// // //                                                                 <td>
// // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--mlab-green)' }}>
// // //                                                                         <CheckCircle2 size={12} /> {presentCount}
// // //                                                                     </span>
// // //                                                                 </td>
// // //                                                                 <td>
// // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fcd34d' }}>
// // //                                                                         <AlertCircle size={12} /> {partialCount}
// // //                                                                     </span>
// // //                                                                 </td>
// // //                                                                 <td>
// // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
// // //                                                                         <XCircle size={12} /> {absentCount}
// // //                                                                     </span>
// // //                                                                 </td>
// // //                                                             </tr>
// // //                                                         );
// // //                                                     })}
// // //                                                 </tbody>
// // //                                             </table>
// // //                                         )}
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };



// // // // import React, { useMemo, useState, useEffect } from 'react';
// // // // import { useNavigate, useSearchParams } from 'react-router-dom';
// // // // import { createPortal } from 'react-dom';
// // // // import {
// // // //     Users, Calendar, ChevronLeft, DownloadCloud,
// // // //     FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
// // // //     UploadCloud, Search, Briefcase, UserMinus, Timer, LayoutList, CheckSquare,
// // // //     Layers, ChevronUp, ChevronDown, Sparkles,
// // // //     Edit3, X, PenTool, FileText, CheckCircle,
// // // //     Loader2, RefreshCcw, BookOpen, Filter,
// // // //     ChevronRight,
// // // //     History,
// // // //     Award,
// // // //     ShieldCheck
// // // // } from 'lucide-react';
// // // // import * as XLSX from 'xlsx';
// // // // import { collection, query, where, onSnapshot, doc, getDocs, writeBatch, increment, getDoc } from 'firebase/firestore';
// // // // import { db } from '../../../lib/firebase';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // // // import { WorkplacePlacementModal } from '../../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// // // // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// // // // import { CurriculumTraceabilityCard } from '../../../components/admin/facilitator/CurriculumTraceabilityCard';
// // // // import type { DashboardLearner } from '../../../types';

// // // // import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
// // // // import { LearnerDropoutModal } from './LearnerDropoutModal';
// // // // import { AILessonPlanModal } from './AILessonPlanModal';
// // // // import { StipendExportModal } from '../../common/StipendExportModal/StipendExportModal';
// // // // import moment from 'moment';

// // // // const formatQCTODate = (d?: string) => {
// // // //     if (!d) return '';
// // // //     const dt = new Date(d);
// // // //     if (isNaN(dt.getTime())) return '';
// // // //     return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
// // // // };

// // // // const getDOBFromID = (id: string) => {
// // // //     const clean = String(id || '').replace(/\s/g, '');
// // // //     if (clean.length !== 13) return '';
// // // //     try {
// // // //         let y = parseInt(clean.substring(0, 2), 10);
// // // //         const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
// // // //         y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
// // // //         return `${y}${m}${d2}`;
// // // //     } catch { return ''; }
// // // // };

// // // // const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

// // // // export const ModuleChip: React.FC<{label: string, count: number, variant: 'k'|'p'|'w'}> = ({ label, count, variant }) => (
// // // //     <span className={`cdp-chip cdp-chip--${variant}`} style={{ borderRadius: 0 }}>{label}: {count}</span>
// // // // );

// // // // // ─── 2. QCTO COHORT VIEW COMPONENT ─────────────────────────────────────────────

// // // // export const QCTOCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
// // // //     const navigate = useNavigate();
// // // //     const [searchParams, setSearchParams] = useSearchParams();
// // // //     const toast = useToast();

// // // //     const { user, learners, staff, employers, settings, programmes } = useStore();

// // // //     // 🚀 OPTIMIZED: Sync Active Tab with URL Params
// // // //     const urlTab = searchParams.get('tab');
// // // //     const activeTab = (urlTab === 'curriculum' || urlTab === 'calendar' || urlTab === 'attendance') 
// // // //         ? urlTab 
// // // //         : 'learners'; 

// // // //     const setActiveTab = (tab: 'learners' | 'curriculum' | 'calendar' | 'attendance') => {
// // // //         setSearchParams((prev) => {
// // // //             prev.set('tab', tab);
// // // //             prev.delete('expanded'); // Clear expanded accordions when switching tabs
// // // //             return prev;
// // // //         }, { replace: true });
// // // //     };

// // // //     const [curriculumViewMode, setCurriculumViewMode] = useState<'blueprint' | 'history'>('blueprint');

// // // //     const [isSyncing, setIsSyncing] = useState(false);
// // // //     const [isExporting, setIsExporting] = useState(false);
// // // //     const [isGrantingTime, setIsGrantingTime] = useState(false);
// // // //     const [isLogging, setIsLogging] = useState(false);
// // // //     const [showAIModal, setShowAIModal] = useState(false);
// // // //     const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    
// // // //     // 🚀 State to toggle KPI visibility (Defaults to true)
// // // //     const [showKPIs, setShowKPIs] = useState(true);

// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
// // // //     const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

// // // //     const [dailyRegisters, setDailyRegisters] = useState<any[]>([]);
// // // //     const [ledgerDates, setLedgerDates] = useState<string[]>([]);

// // // //     const [submissions, setSubmissions] = useState<any[]>([]);
// // // //     const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
// // // //     const [sessionReports, setSessionReports] = useState<any[]>([]);
// // // //     const [editingReport, setEditingReport] = useState<any | null>(null);

// // // //     // 🚀 OPTIMIZED: Sync Expanded Modules with URL Params for consistency
// // // //     const urlExpanded = searchParams.get('expanded');
// // // //     const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

// // // //     const toggleModuleAccordion = (moduleCode: string) => {
// // // //         setSearchParams((prev) => {
// // // //             const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);
// // // //             if (current.has(moduleCode)) current.delete(moduleCode);
// // // //             else current.add(moduleCode);
            
// // // //             if (current.size > 0) prev.set('expanded', Array.from(current).join(','));
// // // //             else prev.delete('expanded');
            
// // // //             return prev;
// // // //         }, { replace: true });
// // // //     };

// // // //     const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
// // // //     const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);
// // // //     const [expandedHistoryModules, setExpandedHistoryModules] = useState<Set<string>>(new Set());

// // // //     const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);

// // // //     // Calendar State Variables
// // // //     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);
// // // //     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
// // // //     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
// // // //     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

// // // //     const [holidays, setHolidays] = useState<string[]>([]);
// // // //     const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

// // // //     // Fetch Holidays for Calendar
// // // //     useEffect(() => {
// // // //         const fetchHolidays = async () => {
// // // //             const currentYear = new Date().getFullYear();
// // // //             const cacheKey = `holidays_za_${currentYear}`;
// // // //             const cached = localStorage.getItem(cacheKey);

// // // //             if (cached) {
// // // //                 setHolidays(JSON.parse(cached));
// // // //             } else {
// // // //                 try {
// // // //                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
// // // //                     if (res.ok) {
// // // //                         const data = await res.json();
// // // //                         const dateList = data.map((h: any) => h.date);
// // // //                         setHolidays(dateList);
// // // //                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
// // // //                     }
// // // //                 } catch (e) {
// // // //                     console.warn("Holiday API unreachable for analytics.");
// // // //                 }
// // // //             }
// // // //         };
// // // //         fetchHolidays();
// // // //     }, []);

// // // //     // Fetch Leaves for Calendar
// // // //     useEffect(() => {
// // // //         if (!cohort?.id) return;
// // // //         const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
// // // //         const unsub = onSnapshot(q, snap => {
// // // //             setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // //         });
// // // //         return () => unsub();
// // // //     }, [cohort?.id]);

// // // //     useEffect(() => {
// // // //         if (!cohort?.id) return;
// // // //         const q = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
// // // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // // //             const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // //             setLiveEnrollments(results);
// // // //         });
// // // //         return () => unsubscribe();
// // // //     }, [cohort.id]);

// // // //     const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
// // // //     const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
// // // //     const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

// // // //     const toggleAssessmentAccordion = (id: string) => {
// // // //         setExpandedAssessments(prev => {
// // // //             const next = new Set(prev);
// // // //             next.has(id) ? next.delete(id) : next.add(id);
// // // //             return next;
// // // //         });
// // // //     };

// // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
// // // //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);
// // // //     const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

// // // //     const showStatusPopup = (type: StatusType, title: string, message: string) => { setModalConfig({ isOpen: true, type, title, message }); };

// // // //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin === true;
// // // //     const isFacilitator = user?.role === 'facilitator';

// // // //     const handleBack = () => {
// // // //         if (isAdmin) {
// // // //             navigate('/admin', { state: { activeTab: 'cohorts' } });
// // // //         } else {
// // // //             navigate(-1);
// // // //         }
// // // //     };

// // // //     const activeProgramme = useMemo(() => {
// // // //         if (!cohort || !programmes.length) return null;
// // // //         const templateId = String(cohort.programmeId || cohort.qualificationId || '').trim();
// // // //         if (!templateId) return null;
// // // //         return programmes.find(p => p.id === templateId || (p as any).saqaId === templateId || (p as any).curriculumCode === templateId) || null;
// // // //     }, [cohort, programmes]);

// // // //     const groupedCurriculum = useMemo(() => {
// // // //         if (!activeProgramme) return {};
// // // //         const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};
// // // //         const extractItems = (modules: any[], type: string) => {
// // // //             (modules || []).forEach(mod => {
// // // //                 const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
// // // //                 const modCode = mod.code || 'General';
// // // //                 if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };
// // // //                 subElements.forEach((sub: any) => groups[modCode].items.push({ id: sub.id || sub.code || Math.random().toString(36).substring(7), code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item', moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || '' }));
// // // //             });
// // // //         };
// // // //         extractItems(activeProgramme.knowledgeModules, 'Knowledge');
// // // //         extractItems(activeProgramme.practicalModules, 'Practical');
// // // //         extractItems(activeProgramme.workExperienceModules, 'Workplace');
// // // //         return groups;
// // // //     }, [activeProgramme]);

// // // //     const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

// // // //     const groupedHistoryLogs = useMemo(() => {
// // // //         const groups: Record<string, any[]> = {};
// // // //         curriculumLogs.forEach(log => {
// // // //             const modCode = log.moduleCode || 'Uncategorized';
// // // //             if (!groups[modCode]) groups[modCode] = [];
// // // //             groups[modCode].push(log);
// // // //         });
// // // //         return groups;
// // // //     }, [curriculumLogs]);

// // // //     const moduleProgress = useMemo(() => {
// // // //         const stats = { Knowledge: { total: 0, logged: 0 }, Practical: { total: 0, logged: 0 }, Workplace: { total: 0, logged: 0 } };
// // // //         Object.values(groupedCurriculum).forEach(group => {
// // // //             const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
// // // //             if (stats[type]) {
// // // //                 stats[type].total += group.items.length;
// // // //                 stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// // // //             }
// // // //         });
// // // //         return stats;
// // // //     }, [groupedCurriculum, curriculumLogs]);

// // // //     const enrolledLearners = useMemo(() => {
// // // //         const merged: DashboardLearner[] = [];

// // // //         liveEnrollments.forEach(enrollment => {
// // // //             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
// // // //             if (profile?.fullName && profile?.idNumber) {
// // // //                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
// // // //             }
// // // //         });

// // // //         learners.forEach(profile => {
// // // //             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
// // // //                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
// // // //             }
// // // //         });
// // // //         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
// // // //     }, [learners, liveEnrollments, cohort.id]);

// // // //     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

// // // //     useEffect(() => {
// // // //         if (!cohort?.id) return;
// // // //         const q = query(collection(db, 'attendance'), where('cohortId', '==', cohort.id));
// // // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // // //             const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // //             regs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
// // // //             setDailyRegisters(regs);
// // // //         });
// // // //         return () => unsubscribe();
// // // //     }, [cohort.id]);

// // // //     const rosterAttendanceMap = useMemo(() => {
// // // //         const map = new Map<string, { attended: number; total: number; pct: number }>();
// // // //         const totalSessions = dailyRegisters.length;

// // // //         enrolledLearners.forEach(l => {
// // // //             if (l.idNumber) map.set(l.idNumber, { attended: 0, total: totalSessions, pct: 0 });
// // // //         });

// // // //         dailyRegisters.forEach(reg => {
// // // //             const present = reg.presentLearners || [];
// // // //             present.forEach((idNum: string) => {
// // // //                 if (map.has(idNum)) {
// // // //                     map.get(idNum)!.attended += 1;
// // // //                 }
// // // //             });
// // // //         });

// // // //         map.forEach(value => {
// // // //             value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
// // // //         });

// // // //         return map;
// // // //     }, [dailyRegisters, enrolledLearners]);

// // // //     const filteredLearners = useMemo(() => {
// // // //         return enrolledLearners.filter(learner => {
// // // //             const searchLower = searchTerm.toLowerCase().trim();
// // // //             const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
// // // //             const matchesSearch = !searchLower ||
// // // //                 learner.fullName.toLowerCase().includes(searchLower) ||
// // // //                 learner.idNumber.includes(searchLower) ||
// // // //                 dbEmail.includes(searchLower);

// // // //             const matchesStatus = statusFilter === 'all' ||
// // // //                 (statusFilter === 'active' && learner.status !== 'dropped') ||
// // // //                 (statusFilter === 'dropped' && learner.status === 'dropped');

// // // //             const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };
// // // //             let matchesAttendance = true;
// // // //             if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
// // // //             else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
// // // //             else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

// // // //             return matchesSearch && matchesStatus && matchesAttendance;
// // // //         });
// // // //     }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, dailyRegisters.length]);

// // // //     const filteredDailyRegisters = useMemo(() => {
// // // //         if (ledgerDates.length === 0) return dailyRegisters;
// // // //         return dailyRegisters.filter(reg => {
// // // //             return ledgerDates.includes(reg.date);
// // // //         });
// // // //     }, [dailyRegisters, ledgerDates]);

// // // //     const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // //         const date = e.target.value;
// // // //         if (date && !ledgerDates.includes(date)) {
// // // //             setLedgerDates([...ledgerDates, date]);
// // // //         }
// // // //     };

// // // //     const removeLedgerDate = (dateToRemove: string) => {
// // // //         setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
// // // //     };

// // // //     const fetchSubmissions = async () => {
// // // //         try {
// // // //             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id)));
// // // //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // //         } catch (e) { console.error('Error fetching submissions:', e); }
// // // //     };

// // // //     useEffect(() => {
// // // //         fetchSubmissions();
// // // //         const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohort.id));
// // // //         const unsubLogs = onSnapshot(logsQ, (snap) => setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
// // // //         const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohort.id));
// // // //         const unsubReports = onSnapshot(reportsQ, (snap) => {
// // // //             const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
// // // //             reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
// // // //             setSessionReports(reps);
// // // //         });
// // // //         return () => { unsubLogs(); unsubReports(); };
// // // //     }, [cohort.id]);

// // // //     const toggleHistoryAccordion = (moduleCode: string) => { setExpandedHistoryModules(prev => { const next = new Set(prev); next.has(moduleCode) ? next.delete(moduleCode) : next.add(moduleCode); return next; }); };
// // // //     const toggleTopicSelection = (topicId: string) => { setSelectedTopics(prev => { const next = { ...prev }; next[topicId] ? delete next[topicId] : next[topicId] = globalCoveredDate; return next; }); };
// // // //     const handleIndividualDateChange = (topicId: string, newDate: string) => { setSelectedTopics(prev => ({ ...prev, [topicId]: newDate })); };
// // // //     const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newDate = e.target.value; setGlobalCoveredDate(newDate); setSelectedTopics(prev => { const next = { ...prev }; Object.keys(next).forEach(key => { next[key] = newDate; }); return next; }); };

// // // //     const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string, sessionDateStr?: string) => {
// // // //         const finalDate = sessionDateStr || new Date().toISOString().split('T')[0];
// // // //         const finalTimestamp = `${finalDate}T12:00:00.000Z`;

// // // //         if (isEdit && reportId) {
// // // //             setIsLogging(true);
// // // //             try {
// // // //                 const batch = writeBatch(db);

// // // //                 batch.update(doc(db, 'session_reports', reportId), {
// // // //                     reportHtml: planHtml,
// // // //                     evidenceLinks,
// // // //                     dateLogged: finalTimestamp,
// // // //                     sessionDate: finalDate,
// // // //                     lastEditedAt: new Date().toISOString(),
// // // //                     lastEditedBy: user?.uid
// // // //                 });

// // // //                 const logsQ = query(collection(db, 'curriculum_logs'), where('sessionReportId', '==', reportId));
// // // //                 const logsSnap = await getDocs(logsQ);
// // // //                 logsSnap.forEach(logDoc => {
// // // //                     batch.update(logDoc.ref, {
// // // //                         coveredAt: finalDate
// // // //                     });
// // // //                 });

// // // //                 await batch.commit();
// // // //                 toast.success("Session report updated successfully.");
// // // //                 setShowAIModal(false);
// // // //                 setEditingReport(null);
// // // //             } catch (error) {
// // // //                 toast.error("Failed to update report.");
// // // //             } finally {
// // // //                 setIsLogging(false);
// // // //             }
// // // //         } else {
// // // //             const selectedTopicIds = Object.keys(selectedTopics);
// // // //             if (selectedTopicIds.length === 0) return;
// // // //             setShowAIModal(false);
// // // //             setIsLogging(true);
// // // //             try {
// // // //                 const batch = writeBatch(db);
// // // //                 const now = new Date();
// // // //                 const reportRef = doc(collection(db, 'session_reports'));

// // // //                 batch.set(reportRef, {
// // // //                     cohortId: cohort.id,
// // // //                     facilitatorId: user?.uid,
// // // //                     facilitatorName: user?.fullName,
// // // //                     facilitatorSignatureUrl: user?.signatureUrl || null,
// // // //                     dateLogged: finalTimestamp,
// // // //                     sessionDate: finalDate,
// // // //                     reportHtml: planHtml,
// // // //                     evidenceLinks,
// // // //                     topicsCovered: selectedTopicIds
// // // //                 });

// // // //                 selectedTopicIds.forEach(topicId => {
// // // //                     const itemDef = curriculumItems.find(i => i.id === topicId);
// // // //                     if (!itemDef) return;
// // // //                     const coveredDateStr = selectedTopics[topicId] || finalDate;

// // // //                     batch.set(doc(collection(db, 'curriculum_logs')), {
// // // //                         cohortId: cohort.id,
// // // //                         topicId: itemDef.id,
// // // //                         topicCode: itemDef.code,
// // // //                         topicTitle: itemDef.title,
// // // //                         moduleCode: itemDef.moduleCode,
// // // //                         moduleName: itemDef.moduleName,
// // // //                         moduleType: itemDef.moduleType,
// // // //                         coveredAt: coveredDateStr,
// // // //                         loggedAt: now.toISOString(),
// // // //                         deadlineAt: new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString(),
// // // //                         loggedBy: user?.uid,
// // // //                         loggedByName: user?.fullName,
// // // //                         sessionReportId: reportRef.id,
// // // //                         acknowledgedBy: [],
// // // //                         penalizeLearners: []
// // // //                     });
// // // //                 });

// // // //                 await batch.commit();
// // // //                 setSelectedTopics({});
// // // //                 showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);
// // // //             } catch (error) {
// // // //                 showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
// // // //             } finally {
// // // //                 setIsLogging(false);
// // // //             }
// // // //         }
// // // //     };

// // // //     const assessmentStatsMap = useMemo(() => {
// // // //         const map = new Map<string, {
// // // //             assessmentId: string,
// // // //             title: string,
// // // //             writing: any[],
// // // //             pending: any[],
// // // //             graded: any[],
// // // //             learnerNamesWriting: string[]
// // // //         }>();

// // // //         submissions.forEach(s => {
// // // //             if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

// // // //             if (!map.has(s.assessmentId)) {
// // // //                 map.set(s.assessmentId, {
// // // //                     assessmentId: s.assessmentId,
// // // //                     title: s.title || 'Unknown Assessment',
// // // //                     writing: [], pending: [], graded: [], learnerNamesWriting: []
// // // //                 });
// // // //             }

// // // //             const entry = map.get(s.assessmentId)!;

// // // //             if (s.status === 'in_progress') {
// // // //                 entry.writing.push(s);
// // // //                 const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
// // // //                 if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
// // // //             } else if (s.status === 'submitted') {
// // // //                 entry.pending.push(s);
// // // //             } else if (s.status === 'graded' || s.status === 'moderated') {
// // // //                 entry.graded.push(s);
// // // //             }
// // // //         });

// // // //         return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
// // // //     }, [submissions, enrolledLearners]);

// // // //     const filteredAssessments = useMemo(() => {
// // // //         if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
// // // //         if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
// // // //         return assessmentStatsMap;
// // // //     }, [assessmentStatsMap, assessmentFilter]);

// // // //     const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
// // // //     const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

// // // //     const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
// // // //         if (subsToUpdate.length === 0) return;
// // // //         if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

// // // //         setIsGrantingTime(true);
// // // //         try {
// // // //             const batch = writeBatch(db);
// // // //             subsToUpdate.forEach(sub => {
// // // //                 batch.update(doc(db, 'learner_submissions', sub.id), {
// // // //                     extraTimeGranted: increment(minutes),
// // // //                     lastStaffEditAt: new Date().toISOString()
// // // //                 });
// // // //             });
// // // //             await batch.commit();
// // // //             toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
// // // //             await fetchSubmissions();
// // // //         } catch (error) {
// // // //             toast.error("Failed to grant extra time.");
// // // //         } finally {
// // // //             setIsGrantingTime(false);
// // // //         }
// // // //     };

// // // //     const handleQCTOExport = async () => {
// // // //         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
// // // //         setIsExporting(true);
// // // //         try {
// // // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
// // // //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// // // //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
// // // //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// // // //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
// // // //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// // // //             const todayQCTO = formatQCTODate(new Date().toISOString());

// // // //             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

// // // //             const dataRows = [headers.map(createTextCell)];
// // // //             enrolledLearners.forEach(learner => {
// // // //                 const d = learner.demographics || {};
// // // //                 const names = (learner.fullName || '').trim().split(' ');
// // // //                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
// // // //                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', names.length > 1 ? names.pop() : '', names.join(' '), d.learnerMiddleName || '', d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr'), getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || formatQCTODate(cohort.endDate), d.statementOfResultsStatus || '02', (d.statementOfResultsStatus === '01') ? cleanDate(d.statementOfResultsIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || '1', d.flc || '06', String(d.flcStatementOfResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
// // // //             });

// // // //             const wb = XLSX.utils.book_new();
// // // //             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Institution:", mainInstitutionName], ["Qualification:", String(qualObj?.name || 'Qualification Name Missing')], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
// // // //             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
// // // //             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
// // // //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// // // //             XLSX.writeFile(wb, fileName);
// // // //             toast.success(`Export successful: ${fileName}`);
// // // //         } catch (e) { toast.error('Export failed. Check console for details.'); } finally { setIsExporting(false); }
// // // //     };

// // // //     const syncLearnerWorkbooks = async () => {
// // // //         setIsSyncing(true);
// // // //         try {
// // // //             const batch = writeBatch(db);
// // // //             const aRef = collection(db, 'assessments');
// // // //             const [snapA, snapS] = await Promise.all([
// // // //                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// // // //                 getDocs(query(aRef, where('cohortId', '==', cohort.id), where('status', 'in', ['active', 'scheduled']))),
// // // //             ]);
// // // //             const allAssessments = new Map<string, any>();
// // // //             snapA.docs.forEach(d => allAssessments.set(d.id, d));
// // // //             snapS.docs.forEach(d => allAssessments.set(d.id, d));

// // // //             if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

// // // //             const activeLearnersToSync = enrolledLearners.filter(l => l.status !== 'dropped');

// // // //             let count = 0;
// // // //             for (const learner of activeLearnersToSync) {
// // // //                 const enrolId = learner.enrollmentId || learner.id;
// // // //                 const humanId = learner.learnerId || learner.id;
// // // //                 for (const [astId, astDoc] of allAssessments.entries()) {
// // // //                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohort.id && (s.learnerId === humanId));
// // // //                     if (!exists) {
// // // //                         const data = astDoc.data();
// // // //                         batch.set(doc(db, 'learner_submissions', `${cohort.id}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid: learner.authUid || learner.idNumber || humanId, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId: cohort.id, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
// // // //                         count++;
// // // //                     }
// // // //                 }
// // // //             }
// // // //             if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
// // // //             else toast.success('All active learners are synced.');
// // // //         } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
// // // //     };

// // // //     const getStaffName = async (id: string) => {
// // // //         const cachedStaff = useStore.getState().staff;
// // // //         const match = cachedStaff.find(s => s.id === id);
// // // //         if (match) return match.fullName;

// // // //         try {
// // // //             const userSnap = await getDoc(doc(db, 'users', id));
// // // //             if (userSnap.exists()) return userSnap.data().fullName;
// // // //         } catch { }

// // // //         return 'Unassigned';
// // // //     };

// // // //     const [facName, setFacName] = useState('Loading...');
// // // //     const [assName, setAssName] = useState('Loading...');
// // // //     const [modName, setModName] = useState('Loading...');

// // // //     useEffect(() => {
// // // //         if (!cohort) return;
// // // //         getStaffName(cohort.facilitatorId).then(setFacName);
// // // //         getStaffName(cohort.assessorId).then(setAssName);
// // // //         getStaffName(cohort.moderatorId).then(setModName);
// // // //     }, [cohort]);


// // // // const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
// // // //     if (!learnerToDrop) return;
// // // //     try {
// // // //         const batch = writeBatch(db);

// // // //         // 1. Update the Enrollment record (Uses the composite ID)
// // // //         const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
// // // //         const enrollRef = doc(db, 'enrollments', routingId);

// // // //         batch.update(enrollRef, {
// // // //             status: 'dropped',
// // // //             exitDate: data.date,
// // // //             exitReasonCategory: data.reason,
// // // //             exitNotes: data.notes,
// // // //             exitEvidenceUrl: data.evidenceUrl,
// // // //             resignationLetterUrl: data.resignationUrl,
// // // //             updatedAt: new Date().toISOString()
// // // //         });

// // // //         // 2. Find the ACTUAL Learner record safely via Query
// // // //         const learnersRef = collection(db, 'learners');
// // // //         const q = query(learnersRef, where("idNumber", "==", learnerToDrop.idNumber));
// // // //         const snapshot = await getDocs(q);

// // // //         if (!snapshot.empty) {
// // // //             // Found the real learner document!
// // // //             const actualLearnerDoc = snapshot.docs[0];
// // // //             const learnerRef = doc(db, 'learners', actualLearnerDoc.id);

// // // //             batch.update(learnerRef, {
// // // //                 status: 'dropped',
// // // //                 updatedAt: new Date().toISOString()
// // // //             });
// // // //         } else {
// // // //             console.warn(`Could not find base learner document for ID: ${learnerToDrop.idNumber}. Continuing with enrollment update.`);
// // // //         }

// // // //         // 3. Commit both updates together
// // // //         await batch.commit();

// // // //         toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);

// // // //         // 4. Refresh State
// // // //         if (useStore.getState().fetchLearners) {
// // // //             useStore.getState().fetchLearners(true);
// // // //         }

// // // //         setLearnerToDrop(null); 
// // // //     } catch (err: any) {
// // // //         console.error("Error in handleConfirmDrop:", err);
// // // //         toast.error(err.message || 'Failed to complete withdrawal process.');
// // // //         throw err;
// // // //     }
// // // // };

// // // //     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
// // // //     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
// // // //     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
// // // //     const selectedTopicCount = Object.keys(selectedTopics).length;

// // // //     // ─── 🚀 CALENDAR GENERATOR LOGIC ───
// // // //     const calendarGrid = useMemo(() => {
// // // //         const startDay = calendarMonth.day();
// // // //         const diff = startDay === 0 ? 6 : startDay - 1;
// // // //         const startGrid = calendarMonth.clone().subtract(diff, 'days');

// // // //         const endOfMonth = calendarMonth.clone().endOf('month');
// // // //         const endDay = endOfMonth.day();
// // // //         const endDiff = endDay === 0 ? 0 : 7 - endDay;
// // // //         const endGrid = endOfMonth.clone().add(endDiff, 'days');

// // // //         const grid = [];
// // // //         let curr = startGrid.clone();
// // // //         while (curr.isSameOrBefore(endGrid)) {
// // // //             grid.push(curr.clone());
// // // //             curr.add(1, 'day');
// // // //         }
// // // //         return grid;
// // // //     }, [calendarMonth]);

// // // //     const calendarDataMap = useMemo(() => {
// // // //         const map = new Map();

// // // //         holidays.forEach(h => map.set(h, { isHoliday: true }));

// // // //         if (cohort?.recessPeriods) {
// // // //             cohort.recessPeriods.forEach((p: any) => {
// // // //                 let curr = moment(p.start);
// // // //                 const end = moment(p.end);
// // // //                 if (!curr.isValid() || !end.isValid()) return;
// // // //                 let failsafe = 0;
// // // //                 while (curr.isSameOrBefore(end) && failsafe < 60) {
// // // //                     const dStr = curr.format('YYYY-MM-DD');
// // // //                     map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
// // // //                     curr.add(1, 'day');
// // // //                     failsafe++;
// // // //                 }
// // // //             });
// // // //         }
        
// // // //         dailyRegisters.forEach(h => {
// // // //             if (!h.date) return;
// // // //             const dStr = moment(h.date).format('YYYY-MM-DD');
// // // //             const existing = map.get(dStr) || {};
// // // //             existing.hasRegister = true;
// // // //             existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
// // // //             existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
// // // //             map.set(dStr, existing);
// // // //         });

// // // //         cohortLeaves.forEach(l => {
// // // //             if (!l.startDate && !l.dateAffected) return;
// // // //             let curr = moment(l.startDate || l.dateAffected);
// // // //             const end = moment(l.endDate || l.dateAffected);
// // // //             if (!curr.isValid() || !end.isValid()) return;
// // // //             let failsafe = 0;
// // // //             while(curr.isSameOrBefore(end) && failsafe < 60) {
// // // //                 const dStr = curr.format('YYYY-MM-DD');
// // // //                 const existing = map.get(dStr) || {};
// // // //                 existing.leaves = (existing.leaves || 0) + 1;
// // // //                 if(l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
// // // //                 map.set(dStr, existing);
// // // //                 curr.add(1, 'day');
// // // //                 failsafe++;
// // // //             }
// // // //         });
        
// // // //         return map;
// // // //     }, [dailyRegisters, holidays, cohort, cohortLeaves]);

// // // //     return (
// // // //         <div className="cdp-layout">

// // // //             {/* 🚀 SVG DEFINITIONS FOR PROGRESS CARD GRADIENTS */}
// // // //             <svg width="0" height="0" style={{ position: 'absolute' }}>
// // // //                 <defs>
// // // //                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
// // // //                         <stop offset="0%" stopColor="var(--mlab-green)" />
// // // //                         <stop offset="100%" stopColor="var(--mlab-green-dark)" />
// // // //                     </linearGradient>
// // // //                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
// // // //                         <stop offset="0%" stopColor="#38bdf8" />
// // // //                         <stop offset="100%" stopColor="#0284c7" />
// // // //                     </linearGradient>
// // // //                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
// // // //                         <stop offset="0%" stopColor="#f59e0b" />
// // // //                         <stop offset="100%" stopColor="#d97706" />
// // // //                     </linearGradient>
// // // //                     {/* NEW GRADIENTS FOR KPI CARDS */}
// // // //                     <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
// // // //                         <stop offset="0%" stopColor="#38bdf8" />
// // // //                         <stop offset="100%" stopColor="#0284c7" />
// // // //                     </linearGradient>
// // // //                     <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
// // // //                         <stop offset="0%" stopColor="#94a3b8" />
// // // //                         <stop offset="100%" stopColor="#475569" />
// // // //                     </linearGradient>
// // // //                 </defs>
// // // //             </svg>

// // // //             {/* 🚀 STRICT MLAB STYLING OVERRIDES FOR CARDS & MODULES */}
// // // //             <style>{`
// // // //                 .mc-cards-wrapper {
// // // //                     display: grid;
// // // //                     grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
// // // //                     gap: 1.5rem;
// // // //                     margin-bottom: 2rem;
// // // //                 }/* Squared mLab Cards */
// // // //                 .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
// // // //                 .mc:hover { transform: translateY(-4px); }
// // // //                 .mc-orb { display: none; /* Removed for flat UI consistency */ }
                
// // // //                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
// // // //                 .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
// // // //                 .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
// // // //                 .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
// // // //                 .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
// // // //                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem 0; }
// // // //                 .mc-ring-svg { transform: rotate(-90deg); }
// // // //                 .mc-ring-track { fill: none; stroke: var(--mlab-border); stroke-width: 8px; }
// // // //                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: butt; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
// // // //                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
// // // //                 .mc-ring-num { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--mlab-blue); }
// // // //                 .mc-ring-denom { font-family: var(--font-heading); text-transform: uppercase; font-size: 0.65rem; font-weight: 700; color: var(--mlab-grey); }
                
// // // //                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
// // // //                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
// // // //                 .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
// // // //                 .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
// // // //                 .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
// // // //                 .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                
// // // //                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
// // // //                 .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
// // // //                 .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
// // // //                 .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
// // // //                 .mc-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; background: var(--mlab-blue); }
                
// // // //                 /* Match colors strictly to mLab palette or explicit variants */
// // // //                 .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background: var(--mlab-green); } .mc-k .mc-fill-secondary { background: var(--mlab-green-bg); }
// // // //                 .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background: #0ea5e9; } .mc-p .mc-fill-secondary { background: #e0f2fe; }
// // // //                 .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background: #d97706; } .mc-w .mc-fill-secondary { background: #fef3c7; }
// // // //                 .mc-a .mc-ring-fill { stroke: url(#gA); } .mc-a .mc-fill-primary { background: #0ea5e9; } .mc-a .mc-fill-secondary { background: #e0f2fe; }
// // // //                 .mc-d .mc-ring-fill { stroke: url(#gD); } .mc-d .mc-fill-primary { background: #64748b; } .mc-d .mc-fill-secondary { background: #f1f5f9; }

// // // //                 /* Standardize all basic wrappers to remove round corners */
// // // //                 .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
// // // //             `}</style>

// // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // //             {modalConfig.isOpen && createPortal(
// // // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // // //                     <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
// // // //                 </div>,
// // // //                 document.body
// // // //             )}

// // // //             {learnerToPlace && createPortal(
// // // //                 <WorkplacePlacementModal
// // // //                     learner={learnerToPlace}
// // // //                     // @ts-ignore
// // // //                     cohort={cohort}
// // // //                     onClose={() => setLearnerToPlace(null)}
// // // //                 />,
// // // //                 document.body
// // // //             )}

// // // //             {learnerToDrop && (
// // // //                 <LearnerDropoutModal
// // // //                     learner={learnerToDrop}
// // // //                     onClose={() => setLearnerToDrop(null)}
// // // //                     onConfirm={handleConfirmDrop}
// // // //                 />
// // // //             )}

// // // //             <AILessonPlanModal
// // // //                 isOpen={showAIModal || !!editingReport}
// // // //                 onClose={() => { setShowAIModal(false); setEditingReport(null); }}
// // // //                 onSave={handleSaveReport}
// // // //                 onShowStatus={showStatusPopup}
// // // //                 selectedTopics={selectedTopics}
// // // //                 curriculumItems={activeProgramme ? curriculumItems : []}
// // // //                 activeProgramme={activeProgramme}
// // // //                 cohort={cohort}
// // // //                 user={user}
// // // //                 existingReport={editingReport}
// // // //             />

// // // //             <StipendExportModal 
// // // //                 isOpen={isStipendModalOpen}
// // // //                 onClose={() => setIsStipendModalOpen(false)}
// // // //                 cohortId={cohort?.id || ''}
// // // //                 cohortName={cohort?.name || 'Cohort'}
// // // //                 learners={enrolledLearners.filter(l => l.status !== 'dropped')}
// // // //                 attendanceMode="qcto"
// // // //                 initialMonth={calendarMonth.format('YYYY-MM')}
// // // //             />

// // // //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// // // //             <main className="cdp-main">
// // // //                 <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
// // // //                     <div className="cdp-header__left">
// // // //                         <button className="lfm-btn lfm-btn--ghost" onClick={handleBack} style={{ padding: '4px 10px', fontSize: '0.7rem', marginBottom: '10px' }}>
// // // //                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
// // // //                         </button>
// // // //                         <div style={{ fontFamily: 'var(--font-heading)', color: 'whitesmoke', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={12} /> Cohort Overview</div>
// // // //                         <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '4px 0', textTransform: 'uppercase' }}>{cohort.name}</h1>
// // // //                         <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                             <Calendar size={12} /> {cohort.startDate} — {cohort.endDate}
// // // //                             <span style={{ display: 'inline-block', background: cohort.isArchived ? 'var(--mlab-bg)' : 'var(--mlab-green-bg)', color: cohort.isArchived ? 'var(--mlab-grey)' : 'var(--mlab-green-dark)', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 'bold', border: `1px solid ${cohort.isArchived ? 'var(--mlab-border)' : 'var(--mlab-green)'}`, textTransform: 'uppercase' }}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
// // // //                         </p>
// // // //                     </div>
// // // //                     <div className="cdp-header__right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // //                         {(isAdmin || isFacilitator) && (
// // // //                             <div style={{ display: 'flex', gap: '0.5rem' }}>
// // // //                                 <button className="lfm-btn lfm-btn--ghost" onClick={handleQCTOExport} disabled={isExporting}>
// // // //                                     {isExporting ? <Loader2 size={13} className="lfm-spin" /> : <DownloadCloud size={13} />} Export LEISA
// // // //                                 </button>
// // // //                                 <button className="lfm-btn lfm-btn--primary" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// // // //                                     {isSyncing ? <Loader2 size={13} className="lfm-spin" /> : <RefreshCcw size={13} />} Sync Workbooks
// // // //                                 </button>
// // // //                             </div>
// // // //                         )}
// // // //                         <NotificationBell />
// // // //                     </div>
// // // //                 </header>

// // // //                 <div className="cdp-content" style={{ padding: '2rem' }}>
                    
// // // //                     <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
// // // //                         <button 
// // // //                             onClick={() => setShowKPIs(!showKPIs)} 
// // // //                             style={{ 
// // // //                                 display: 'flex', alignItems: 'center', gap: '6px', 
// // // //                                 background: 'transparent', border: 'none', color: 'var(--mlab-grey)', 
// // // //                                 fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, 
// // // //                                 textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s' 
// // // //                             }}
// // // //                             onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
// // // //                             onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
// // // //                         >
// // // //                             {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
// // // //                         </button>
// // // //                     </div>

// // // //                     {/* TOP KPIs CONVERTED TO PROGRESS CARDS (COLLAPSIBLE) */}
// // // //                     {showKPIs && (
// // // //                         <div className="mc-cards-wrapper animate-slide-down">
// // // //                             <ModuleProgressCard 
// // // //                                 type="Active Learners" 
// // // //                                 data={{ total: enrolledLearners.length, logged: activeCount }} 
// // // //                             />
// // // //                             <ModuleProgressCard 
// // // //                                 type="Workplace Placements" 
// // // //                                 data={{ total: activeCount > 0 ? activeCount : 1, logged: placedCount }} 
// // // //                             />
// // // //                             <ModuleProgressCard 
// // // //                                 type="Pending Marking" 
// // // //                                 data={{ total: submissions.length > 0 ? submissions.length : 1, logged: pendingTotal }} 
// // // //                             />
// // // //                             <ModuleProgressCard 
// // // //                                 type="Dropped / Exited" 
// // // //                                 data={{ total: enrolledLearners.length, logged: droppedCount }} 
// // // //                             />
// // // //                         </div>
// // // //                     )}

// // // //                     {/* PERMANENTLY VISIBLE COHORT META DATA */}
// // // //                     <div className="mc-cards-wrapper">
                        
// // // //                         {/* Timeline Card */}
// // // //                         <div className="mc">
// // // //                             <div className="mc-hdr">
// // // //                                 <div>
// // // //                                     <div className="mc-label">Duration</div>
// // // //                                     <div className="mc-title">Cohort Timeline</div>
// // // //                                 </div>
// // // //                                 <Calendar size={20} color="var(--mlab-blue)" />
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
// // // //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// // // //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
// // // //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
// // // //                                 </div>
// // // //                                 <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
// // // //                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
// // // //                                     <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* Facilitator Card */}
// // // //                         <div className="mc">
// // // //                             <div className="mc-hdr">
// // // //                                 <div>
// // // //                                     <div className="mc-label">Assigned Staff</div>
// // // //                                     <div className="mc-title">Facilitator</div>
// // // //                                 </div>
// // // //                                 <Users size={20} color="var(--mlab-blue)" />
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // // //                                     {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
// // // //                                 </div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
// // // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* Assessor Card */}
// // // //                         <div className="mc">
// // // //                             <div className="mc-hdr">
// // // //                                 <div>
// // // //                                     <div className="mc-label">Assigned Staff</div>
// // // //                                     <div className="mc-title">Assessor</div>
// // // //                                 </div>
// // // //                                 <Award size={20} color="var(--mlab-blue)" />
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // // //                                     {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
// // // //                                 </div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
// // // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* Moderator Card */}
// // // //                         <div className="mc">
// // // //                             <div className="mc-hdr">
// // // //                                 <div>
// // // //                                     <div className="mc-label">Assigned Staff</div>
// // // //                                     <div className="mc-title">Moderator</div>
// // // //                                 </div>
// // // //                                 <ShieldCheck size={20} color="var(--mlab-blue)" />
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
// // // //                                 <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)', flexShrink: 0 }}>
// // // //                                     {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
// // // //                                 </div>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                     <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
// // // //                                     <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* MASTER ASSESSMENTS ACCORDION */}
// // // //                     {assessmentStatsMap.length > 0 && (
// // // //                         <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem' }}>
// // // //                             <div className="lfm-header" style={{ cursor: 'pointer', borderBottom: isAssessmentsExpanded ? '2px solid var(--mlab-border)' : 'none' }} onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}>
// // // //                                 <h2 className="lfm-header__title"><BookOpen size={16} /> Assessment Operations Center</h2>
                                
// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // //                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// // // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
// // // //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'var(--mlab-white)', color: 'var(--mlab-red)', padding: '4px 10px', border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
// // // //                                             {totalWriting > 0 && <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />}
// // // //                                             {totalWriting} Writing
// // // //                                         </span>
// // // //                                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // // //                                             <Clock size={10} /> {totalPending} Pending Marking
// // // //                                         </span>
// // // //                                     </div>
// // // //                                     <div style={{ color: 'var(--mlab-white)' }}>
// // // //                                         {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
                            
// // // //                             {isAssessmentsExpanded && (
// // // //                                 <div className="lfm-body animate-slide-down">
// // // //                                     <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
// // // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
// // // //                                         <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
// // // //                                         <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
// // // //                                         <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
// // // //                                     </div>
// // // //                                     {filteredAssessments.length === 0 ? (
// // // //                                         <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', border: '1px dashed var(--mlab-border)', background: 'var(--mlab-bg)' }}>
// // // //                                             No assessments match this filter.
// // // //                                         </div>
// // // //                                     ) : (
// // // //                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // // //                                             {filteredAssessments.map(exam => {
// // // //                                                 const isExpanded = expandedAssessments.has(exam.assessmentId);
// // // //                                                 const isLive = exam.writing.length > 0;
// // // //                                                 const hasPending = exam.pending.length > 0;
// // // //                                                 return (
// // // //                                                     <div key={exam.assessmentId} className="animate-fade-in" style={{
// // // //                                                         background: 'var(--mlab-white)',
// // // //                                                         border: isLive ? '2px solid var(--mlab-red)' : hasPending ? '2px solid #f59e0b' : '2px solid var(--mlab-border)',
// // // //                                                     }}>
// // // //                                                         <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
// // // //                                                                 <div style={{ color: 'var(--mlab-blue)' }}>
// // // //                                                                     <BookOpen size={20} />
// // // //                                                                 </div>
// // // //                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // //                                                                     <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
// // // //                                                                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// // // //                                                                         {isLive && (
// // // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', border: '1px solid #fca5a5', textTransform: 'uppercase' }}>
// // // //                                                                                 <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// // // //                                                                                 {exam.writing.length} Writing
// // // //                                                                             </span>
// // // //                                                                         )}
// // // //                                                                         {hasPending && (
// // // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // // //                                                                                 <Clock size={10} /> {exam.pending.length} Awaiting Marking
// // // //                                                                             </span>
// // // //                                                                         )}
// // // //                                                                         {exam.graded.length > 0 && (
// // // //                                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', border: '1px solid var(--mlab-green)', textTransform: 'uppercase' }}>
// // // //                                                                                 <CheckCircle2 size={10} /> {exam.graded.length} Graded
// // // //                                                                             </span>
// // // //                                                                         )}
// // // //                                                                     </div>
// // // //                                                                 </div>
// // // //                                                             </div>
// // // //                                                             <div style={{ color: 'var(--mlab-blue)' }}>
// // // //                                                                 {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                         {isExpanded && (
// // // //                                                             <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// // // //                                                                 {isLive && (
// // // //                                                                     <div style={{ border: '2px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
// // // //                                                                         <div>
// // // //                                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                                                                                 <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '0', animation: 'live-dot-ping 1.5s infinite' }} />
// // // //                                                                                 Currently Live ({exam.writing.length})
// // // //                                                                             </span>
// // // //                                                                             <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
// // // //                                                                                 {exam.learnerNamesWriting.join(', ')}
// // // //                                                                             </p>
// // // //                                                                         </div>
// // // //                                                                         <div style={{ display: 'flex', gap: '8px' }}>
// // // //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
// // // //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
// // // //                                                                             </button>
// // // //                                                                             <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '2px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
// // // //                                                                                 {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
// // // //                                                                             </button>
// // // //                                                                         </div>
// // // //                                                                     </div>
// // // //                                                                 )}
// // // //                                                                 {hasPending && (
// // // //                                                                     <div style={{ border: '2px solid #f59e0b', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
// // // //                                                                         <div>
// // // //                                                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
// // // //                                                                             <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
// // // //                                                                                 <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
// // // //                                                                             </p>
// // // //                                                                         </div>
// // // //                                                                         <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
// // // //                                                                             <PenTool size={14} /> Go to Grading Queue
// // // //                                                                         </button>
// // // //                                                                     </div>
// // // //                                                                 )}
// // // //                                                             </div>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 );
// // // //                                             })}
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     {/* 🚀 TAB NAVIGATION */}
// // // //                     <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
// // // //                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
// // // //                             <Users size={16} /> Learner Roster
// // // //                         </button>
// // // //                         <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
// // // //                             <LayoutList size={16} /> Curriculum Tracker
// // // //                         </button>
// // // //                         <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
// // // //                             <Calendar size={16} /> Calendar View
// // // //                         </button>
// // // //                         <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
// // // //                             <UserCheck size={16} /> Attendance Tracker
// // // //                         </button>
// // // //                     </div>

// // // //                     {/* ─── TAB 1: LEARNER ROSTER ─── */}
// // // //                     {activeTab === 'learners' && (
// // // //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// // // //                             <div className="lfm-header">
// // // //                                 <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
// // // //                             </div>

// // // //                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '2px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
// // // //                                 <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
// // // //                                     <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
// // // //                                     <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '36px' }} />
// // // //                                 </div>

// // // //                                 <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // // //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// // // //                                         <label>Status:</label>
// // // //                                         <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ minWidth: '150px' }}>
// // // //                                             <option value="all">All Applicants</option>
// // // //                                             <option value="active">Active Only</option>
// // // //                                             <option value="dropped">Withdrawn Only</option>
// // // //                                         </select>
// // // //                                     </div>

// // // //                                     <div className="lfm-fg" style={{ gap: '4px' }}>
// // // //                                         <label>Attendance:</label>
// // // //                                         <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} style={{ minWidth: '180px' }}>
// // // //                                             <option value="all">All Attendance Bands</option>
// // // //                                             <option value="high">High Compliance (75%+)</option>
// // // //                                             <option value="mid">Average Compliance (40% - 74%)</option>
// // // //                                             <option value="low">Critical Risk (&lt; 40%)</option>
// // // //                                         </select>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="lfm-body" style={{ padding: 0 }}>
// // // //                                 <div className="mlab-table-wrap">
// // // //                                     <table className="mlab-table" style={{ margin: 0 }}>
// // // //                                         <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // // //                                             <tr>
// // // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Learner</th>
// // // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Workplace</th>
// // // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Module Progress</th>
// // // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Attendance</th>
// // // //                                                 <th style={{ color: 'var(--mlab-grey)' }}>Status</th>
// // // //                                                 <th style={{ textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
// // // //                                             </tr>
// // // //                                         </thead>
// // // //                                         <tbody>
// // // //                                             {filteredLearners.length === 0 ? (
// // // //                                                 <tr>
// // // //                                                     <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // //                                                         <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
// // // //                                                         <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
// // // //                                                     </td>
// // // //                                                 </tr>
// // // //                                             ) : (
// // // //                                                 filteredLearners.map(learner => {
// // // //                                                     const isDropped = learner.status === 'dropped';
// // // //                                                     const routingId = learner.enrollmentId || learner.id;
// // // //                                                     const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// // // //                                                     const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
// // // //                                                     const isPlaced = !!learner.employerId;

// // // //                                                     const stats = rosterAttendanceMap.get(learner.idNumber || '') || { attended: 0, total: dailyRegisters.length, pct: 0 };

// // // //                                                     return (
// // // //                                                         <tr key={learner.id} style={{ opacity: isDropped ? 0.6 : 1, background: isDropped ? 'var(--mlab-bg)' : 'transparent' }}>
// // // //                                                             <td>
// // // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // //                                                                     <div style={{ width: '36px', height: '36px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '2px solid var(--mlab-blue)' }}>
// // // //                                                                         {learner.fullName.charAt(0)}
// // // //                                                                     </div>
// // // //                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// // // //                                                                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>{learner.fullName}</span>
// // // //                                                                         <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
// // // //                                                                         {!isDropped && pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', marginTop: '4px' }}><Clock size={10} /> {pendingCount} marking pending</span>}
// // // //                                                                     </div>
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>{isPlaced ? <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{employers.find(e => e.id === learner.employerId)?.name}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}><AlertCircle size={12} /> Pending</span>}</td>
// // // //                                                             <td>
// // // //                                                                 <div style={{ display: 'flex', gap: '6px' }}>
// // // //                                                                     <span style={{ background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 6px', border: '1px solid var(--mlab-green)', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
// // // //                                                                     <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', border: '1px solid #bae6fd', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
// // // //                                                                     <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', border: '1px solid #fed7aa', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700 }}>W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>
// // // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // //                                                                     <span style={{
// // // //                                                                         display: 'inline-flex', alignItems: 'center', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
// // // //                                                                         background: stats.pct >= 75 ? 'var(--mlab-green-bg)' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
// // // //                                                                         color: stats.pct >= 75 ? 'var(--mlab-green-dark)' : stats.pct >= 40 ? '#b45309' : '#991b1b',
// // // //                                                                         border: `1px solid ${stats.pct >= 75 ? 'var(--mlab-green)' : stats.pct >= 40 ? '#fde68a' : '#fca5a5'}`
// // // //                                                                     }}>{stats.pct}%</span>
// // // //                                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{stats.attended} / {stats.total}</span>
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>
// // // //                                                                 <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: isDropped ? 'var(--mlab-bg)' : 'var(--mlab-light-blue)', color: isDropped ? 'var(--mlab-grey)' : 'var(--mlab-blue)', border: `1px solid ${isDropped ? 'var(--mlab-border)' : 'var(--mlab-blue)'}` }}>
// // // //                                                                     {isDropped ? 'Dropped' : 'Active'}
// // // //                                                                 </span>
// // // //                                                             </td>

// // // //                                                             <td style={{ textAlign: 'right' }}>
// // // //                                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
// // // //                                                                     {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
// // // //                                                                     <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>

// // // //                                                                     {isDropped ? (
// // // //                                                                         <button 
// // // //                                                                             onClick={() => setLearnerToDrop(learner)} 
// // // //                                                                             title="View Withdrawal Details" 
// // // //                                                                             className="lfm-btn lfm-btn--ghost" 
// // // //                                                                             style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}
// // // //                                                                         >
// // // //                                                                             <FileText size={12} /> View Exit
// // // //                                                                         </button>
// // // //                                                                     ) : (
// // // //                                                                         <button
// // // //                                                                             onClick={() => setLearnerToDrop(learner)}
// // // //                                                                             title="Process Withdrawal / Dropout"
// // // //                                                                             className="lfm-btn"
// // // //                                                                             style={{
// // // //                                                                                 background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem'
// // // //                                                                             }}
// // // //                                                                             onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
// // // //                                                                             onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
// // // //                                                                         >
// // // //                                                                             <UserMinus size={12} /> Withdraw
// // // //                                                                         </button>
// // // //                                                                     )}
// // // //                                                                 </div>
// // // //                                                             </td>
                                                            
// // // //                                                         </tr>
// // // //                                                     );
// // // //                                                 })
// // // //                                             )}
// // // //                                         </tbody>
// // // //                                     </table>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ─── TAB 2: CURRICULUM TRACKER ─── */}
// // // //                     {activeTab === 'curriculum' && (
// // // //                         <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>
// // // //                             {activeProgramme && (
// // // //                                 <div className="mc-cards-wrapper">
// // // //                                     <ModuleProgressCard type="Knowledge" data={moduleProgress.Knowledge} />
// // // //                                     <ModuleProgressCard type="Practical" data={moduleProgress.Practical} />
// // // //                                     <ModuleProgressCard type="Workplace" data={moduleProgress.Workplace} />
// // // //                                 </div>
// // // //                             )}

// // // //                             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
// // // //                                 <div style={{ background: 'var(--mlab-white)', display: 'inline-flex', border: '2px solid var(--mlab-blue)' }}>
// // // //                                     <button onClick={() => setCurriculumViewMode('blueprint')} className={`lfm-btn ${curriculumViewMode === 'blueprint' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none' }}><CheckSquare size={14} /> Log New Topics</button>
// // // //                                     <button onClick={() => setCurriculumViewMode('history')} className={`lfm-btn ${curriculumViewMode === 'history' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`} style={{ border: 'none', borderLeft: '2px solid var(--mlab-blue)' }}><Clock size={14} /> View Past Sessions</button>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
// // // //                                 <div className="lfm-header">
// // // //                                     <h2 className="lfm-header__title"><BookOpen size={16} /> {curriculumViewMode === 'blueprint' ? 'Curriculum Blueprint Tracker' : 'Past Session Reports & Traceability'}</h2>
// // // //                                 </div>
// // // //                                 <div className="lfm-body" style={{ background: curriculumViewMode === 'blueprint' ? 'var(--mlab-white)' : 'var(--mlab-bg)', padding: '1.5rem' }}>
// // // //                                     {!activeProgramme ? (
// // // //                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No formal Qualification Blueprint is linked to this cohort.</p></div>
// // // //                                     ) : (
// // // //                                         <>
// // // //                                             {curriculumViewMode === 'blueprint' && (
// // // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // // //                                                     {Object.keys(groupedCurriculum).map(modCode => {
// // // //                                                         const group = groupedCurriculum[modCode];
// // // //                                                         const isOpen = expandedModules.has(modCode);
// // // //                                                         const totalItems = group.items.length;
// // // //                                                         const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
// // // //                                                         const isComplete = loggedItems === totalItems && totalItems > 0;

// // // //                                                         return (
// // // //                                                             <div key={modCode}>
// // // //                                                                 <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
// // // //                                                                     <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
// // // //                                                                     <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
// // // //                                                                     <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', border: `1px solid ${isComplete ? 'var(--mlab-green)' : 'transparent'}` }}>{loggedItems} / {totalItems} COVERED</span>
// // // //                                                                     {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// // // //                                                                 </div>
// // // //                                                                 {isOpen && (
// // // //                                                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
// // // //                                                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
// // // //                                                                             <table className="mlab-table" style={{ margin: '0', border: 'none' }}>
// // // //                                                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // // //                                                                                     <tr>
// // // //                                                                                         <th style={{ width: '50px', color: 'var(--mlab-grey)', textAlign: 'center', borderRight: '1px solid var(--mlab-border)', borderRadius: 0 }}>Log</th>
// // // //                                                                                         <th style={{ color: 'var(--mlab-grey)', borderRadius: 0 }}>Topic / Activity</th>
// // // //                                                                                         <th style={{ width: '280px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Status / Session Report</th>
// // // //                                                                                         <th style={{ width: '180px', color: 'var(--mlab-grey)', borderRadius: 0 }}>Engagement</th>
// // // //                                                                                     </tr>
// // // //                                                                                 </thead>
// // // //                                                                                 <tbody>
// // // //                                                                                     {group.items.map(item => {
// // // //                                                                                         const logRecord = curriculumLogs.find(log => log.topicId === item.id);
// // // //                                                                                         const isLogged = !!logRecord;
// // // //                                                                                         const isSelected = selectedTopics.hasOwnProperty(item.id);
// // // //                                                                                         const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;
// // // //                                                                                         const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

// // // //                                                                                         return (
// // // //                                                                                             <tr key={item.id} style={{ background: isLogged ? 'var(--mlab-green-bg)' : (isSelected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)') }}>
// // // //                                                                                                 <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
// // // //                                                                                                     {isLogged ? <CheckCircle size={18} color="var(--mlab-green-dark)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
// // // //                                                                                                 </td>
// // // //                                                                                                 <td>
// // // //                                                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
// // // //                                                                                                         <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', color: isLogged ? 'var(--mlab-green-dark)' : 'var(--mlab-blue)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
// // // //                                                                                                         <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
// // // //                                                                                                     </div>
// // // //                                                                                                 </td>
// // // //                                                                                                 <td>
// // // //                                                                                                     {isLogged ? (
// // // //                                                                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                                                                                             <span style={{ display: 'inline-block', background: 'var(--mlab-white)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
// // // //                                                                                                             {associatedReport && <button className="lfm-btn lfm-btn--ghost" onClick={() => setEditingReport(associatedReport)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}><Edit3 size={12} /> Edit Report</button>}
// // // //                                                                                                         </div>
// // // //                                                                                                     ) : isSelected ? (
// // // //                                                                                                         <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
// // // //                                                                                                     ) : <span style={{ display: 'inline-block', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
// // // //                                                                                                 </td>
// // // //                                                                                                 <td>
// // // //                                                                                                     {isLogged ? (
// // // //                                                                                                         <div className="cdp-progress-col" style={{ width: '100%' }}>
// // // //                                                                                                             <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green-dark)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)'), fontSize: '0.85rem' }}>{ackPct}%</span></div>
// // // //                                                                                                             <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0', background: 'var(--mlab-border)', width: '100%' }}><div className="cdp-progress-fill" style={{ height: '100%', width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : 'var(--mlab-red)') }} /></div>
// // // //                                                                                                         </div>
// // // //                                                                                                     ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)' }}>—</span>}
// // // //                                                                                                 </td>
// // // //                                                                                             </tr>
// // // //                                                                                         );
// // // //                                                                                     })}
// // // //                                                                                 </tbody>
// // // //                                                                             </table>
// // // //                                                                         </div>
// // // //                                                                     </div>
// // // //                                                                 )}
// // // //                                                             </div>
// // // //                                                         );
// // // //                                                     })
// // // //                                                     }
// // // //                                                 </div>
// // // //                                             )}

// // // //                                             {curriculumViewMode === 'history' && (
// // // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // // //                                                     {curriculumLogs.length === 0 ? (
// // // //                                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)' }}>No topics have been logged for this cohort yet.</p></div>
// // // //                                                     ) : (
// // // //                                                         Object.keys(groupedHistoryLogs).sort().map(modCode => {
// // // //                                                             const logsInModule = groupedHistoryLogs[modCode];
// // // //                                                             const isOpen = expandedHistoryModules.has(modCode);
// // // //                                                             const moduleName = groupedCurriculum[modCode]?.moduleName || '';

// // // //                                                             return (
// // // //                                                                 <div key={`hist-${modCode}`}>
// // // //                                                                     <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleHistoryAccordion(modCode)}>
// // // //                                                                         <Layers size={16} color="var(--mlab-blue)" />
// // // //                                                                         <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{moduleName}</span></span>
// // // //                                                                         <span style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', letterSpacing: '0.1em', fontWeight: 700, background: 'var(--mlab-light-blue)', padding: '2px 8px', border: '1px solid var(--mlab-border)' }}>{logsInModule.length} TOPIC{logsInModule.length !== 1 ? 's' : ''} LOGGED</span>
// // // //                                                                         {isOpen ? <ChevronUp size={16} color="var(--mlab-blue)" /> : <ChevronDown size={16} color="var(--mlab-blue)" />}
// // // //                                                                     </div>
// // // //                                                                     {isOpen && (
// // // //                                                                         <div className="animate-fade-in" style={{ borderTop: '2px solid var(--mlab-blue)', paddingTop: '15px', marginTop: '-0.75rem' }}>
// // // //                                                                             {logsInModule.map(log => {
// // // //                                                                                 const mappedLog = { id: log.id, title: log.topicTitle, moduleCode: log.moduleCode, dateLogged: log.coveredAt || log.dateLogged, notes: log.systemNote || "Session details available in full report.", presentLearnerIds: log.presentLearnerIds, absentLearnerIds: log.absentLearnerIds, acknowledgedBy: log.acknowledgedBy };
// // // //                                                                                 return <CurriculumTraceabilityCard key={log.id} log={mappedLog} roster={enrolledLearners} />;
// // // //                                                                             })}
// // // //                                                                         </div>
// // // //                                                                     )}
// // // //                                                                 </div>
// // // //                                                             );
// // // //                                                         })
// // // //                                                     )}
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </>
// // // //                                     )}
// // // //                                 </div>
// // // //                             </div>

// // // //                             {selectedTopicCount > 0 && createPortal(
// // // //                                 <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // //                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
// // // //                                         <div style={{ display: 'flex', flex: 'none', flexDirection: 'column' }}>
// // // //                                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
// // // //                                             <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
// // // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
// // // //                                             <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
// // // //                                             <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
// // // //                                         </div>
// // // //                                         <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
// // // //                                         <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
// // // //                                             {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 </div>,
// // // //                                 document.body
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ─── TAB 3: CALENDAR VIEW WITH STIPEND EXPORT ─── */}
// // // //                     {activeTab === 'calendar' && (
// // // //                         <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
// // // //                             <div className="lfm-header">
// // // //                                 <h2 className="lfm-header__title">
// // // //                                     <Calendar size={18} /> Cohort Attendance Calendar
// // // //                                 </h2>

// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // //                                     {cohort?.id && (
// // // //                                         <button 
// // // //                                             className="lfm-btn"
// // // //                                             onClick={() => setIsStipendModalOpen(true)}
// // // //                                             style={{ background: 'var(--mlab-green)', border: 'none' }}
// // // //                                         >
// // // //                                             <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
// // // //                                         </button>
// // // //                                     )}

// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
// // // //                                         <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
// // // //                                         <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
// // // //                                         <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
// // // //                                 <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
// // // //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
// // // //                                         {dailyRegisters.length} Total Sessions
// // // //                                     </span>
// // // //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
// // // //                                         {cohortLeaves.filter(l => l.status === 'Pending').length} Pending Leaves
// // // //                                     </span>
// // // //                                 </div>

// // // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
// // // //                                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
// // // //                                         <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
// // // //                                     ))}
// // // //                                 </div>

// // // //                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
// // // //                                     {calendarGrid.map((day) => {
// // // //                                         const dateStr = day.format('YYYY-MM-DD');
// // // //                                         const isCurrentMonth = day.month() === calendarMonth.month();
// // // //                                         const isToday = dateStr === moment().format('YYYY-MM-DD');
// // // //                                         const data = calendarDataMap.get(dateStr);

// // // //                                         return (
// // // //                                             <div 
// // // //                                                 key={dateStr} 
// // // //                                                 onClick={() => {
// // // //                                                     if (data?.hasRegister && cohort?.id) {
// // // //                                                         navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
// // // //                                                     } else {
// // // //                                                         setLedgerDates(prev => prev.includes(dateStr) ? prev : [...prev, dateStr]);
// // // //                                                         setActiveTab('attendance');
// // // //                                                     }
// // // //                                                 }}
// // // //                                                 style={{ 
// // // //                                                     border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', 
// // // //                                                     borderRadius: 0, 
// // // //                                                     minHeight: '110px', 
// // // //                                                     padding: '10px', 
// // // //                                                     backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', 
// // // //                                                     opacity: isCurrentMonth ? 1 : 0.6,
// // // //                                                     cursor: data?.hasRegister ? 'pointer' : 'default',
// // // //                                                     transition: 'all 0.2s',
// // // //                                                     boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
// // // //                                                 }}
// // // //                                                 onMouseOver={e => { if (data?.hasRegister) { e.currentTarget.style.borderColor = 'var(--mlab-green)' } }}
// // // //                                                 onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)' }}
// // // //                                             >
// // // //                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                                     <span style={{ 
// // // //                                                         fontWeight: '700',
// // // //                                                         fontFamily: 'var(--font-heading)',
// // // //                                                         color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', 
// // // //                                                         background: isToday ? 'var(--mlab-blue)' : 'transparent',
// // // //                                                         width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
// // // //                                                     }}>{day.format('D')}</span>
// // // //                                                 </div>
                                                
// // // //                                                 {data && (
// // // //                                                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // //                                                         {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
// // // //                                                         {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}
                                                        
// // // //                                                         {data.hasRegister && (
// // // //                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
// // // //                                                                 <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>{data.present} Present</span>
// // // //                                                                 {data.absent > 0 && <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>{data.absent} Absent</span>}
// // // //                                                             </div>
// // // //                                                         )}

// // // //                                                         {data.leaves > 0 && (
// // // //                                                             <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
// // // //                                                                 <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
// // // //                                                             </span>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         )
// // // //                                     })}
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {/* ─── TAB 4: ATTENDANCE ─── */}
// // // //                     {activeTab === 'attendance' && (
// // // //                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
// // // //                             <div style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
// // // //                                 <div className="lfm-header">
// // // //                                     <h2 className="lfm-header__title">
// // // //                                         <History size={18} /> Historical Session Ledger
// // // //                                     </h2>

// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
// // // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px' }}>
// // // //                                             <Calendar size={14} color="var(--mlab-blue)" />
// // // //                                             <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
// // // //                                             <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
// // // //                                         </div>
// // // //                                         <button className="lfm-btn lfm-btn--primary" onClick={() => setIsDropZoneOpen(true)} style={{ border: '1px solid var(--mlab-white)' }}>
// // // //                                             <UploadCloud size={14} /> Upload Zoom CSV
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 {ledgerDates.length > 0 && (
// // // //                                     <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
// // // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
// // // //                                         {ledgerDates.map(date => (
// // // //                                             <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>
// // // //                                                 {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
// // // //                                                 <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
// // // //                                             </span>
// // // //                                         ))}
// // // //                                         <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                             <XCircle size={12} /> Clear All
// // // //                                         </button>
// // // //                                     </div>
// // // //                                 )}

// // // //                                 <div className="lfm-body" style={{ padding: 0 }}>
// // // //                                     <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
// // // //                                         {filteredDailyRegisters.length === 0 ? (
// // // //                                             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // //                                                 <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// // // //                                                 <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance registers have been finalized for this cohort yet.'}</p>
// // // //                                             </div>
// // // //                                         ) : (
// // // //                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
// // // //                                                 <thead style={{ background: 'var(--mlab-light-blue)' }}>
// // // //                                                     <tr>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Expected Duration</th>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Captured</th>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Present (80%+)</th>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Short Hours</th>
// // // //                                                         <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Absent</th>
// // // //                                                     </tr>
// // // //                                                 </thead>
// // // //                                                 <tbody>
// // // //                                                     {filteredDailyRegisters.map((reg) => {
// // // //                                                         const presentCount = reg.presentLearners?.length || 0;
// // // //                                                         const absentCount = reg.absentLearners?.length || 0;
// // // //                                                         const partialCount = reg.partialLearners?.length || 0;
// // // //                                                         const totalCaptured = presentCount + absentCount + partialCount;

// // // //                                                         return (
// // // //                                                             <tr key={reg.id}>
// // // //                                                                 <td style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
// // // //                                                                     {reg.date ? new Date(reg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
// // // //                                                                 </td>
// // // //                                                                 <td>
// // // //                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// // // //                                                                         <Clock size={14} /> {reg.expectedDuration || 0} mins
// // // //                                                                     </span>
// // // //                                                                 </td>
// // // //                                                                 <td style={{ color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{totalCaptured} Learners</td>
// // // //                                                                 <td>
// // // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--mlab-green)' }}>
// // // //                                                                         <CheckCircle2 size={12} /> {presentCount}
// // // //                                                                     </span>
// // // //                                                                 </td>
// // // //                                                                 <td>
// // // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fcd34d' }}>
// // // //                                                                         <AlertCircle size={12} /> {partialCount}
// // // //                                                                     </span>
// // // //                                                                 </td>
// // // //                                                                 <td>
// // // //                                                                     <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
// // // //                                                                         <XCircle size={12} /> {absentCount}
// // // //                                                                     </span>
// // // //                                                                 </td>
// // // //                                                             </tr>
// // // //                                                         );
// // // //                                                     })}
// // // //                                                 </tbody>
// // // //                                             </table>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     )}
// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };

