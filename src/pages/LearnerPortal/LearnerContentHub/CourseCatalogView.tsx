// src/pages/LearnerPortal/LearnerContentHub/CourseCatalogView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import {
    Play, Clock, Star, Bookmark, ChevronRight, Search, Filter,
    Layers, Award, Zap, ShieldCheck, PlayCircle, HelpCircle, Send, Loader2,
    GraduationCap, BookOpen
} from 'lucide-react';
import moment from 'moment';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import Tooltip from '../../../components/common/Tooltip/Tooltip';
import {
    CourseIllustrationGraphic,
    getThemeStyles,
    type CoursePackage,
    type LearnerUnitProgress
} from './types';

interface ExtendedCatalogCourse extends CoursePackage {
    checkpointMetadata?: {
        timeBoundConfig?: Record<string, unknown>;
        [key: string]: unknown;
    };
    timelineStartDate?: string;
    runStartDate?: string;
    applicationStartDate?: string;
    start?: string;
    timelineEndDate?: string;
    runEndDate?: string;
    applicationEndDate?: string;
    end?: string;
    totalHours?: number;
    totalNotionalHours?: number;
    timelineId?: string;
    placementId?: string;
    status?: string;
    isBookmarked?: boolean;
}

interface LiveCohortRunDoc {
    id: string;
    containerId?: string;
    timeBoundConfig?: Record<string, unknown>;
    startDate?: string;
    endDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
    themeColor?: string;
    illustrationType?: string;
    [key: string]: unknown;
}

interface CourseCatalogViewProps {
    courses: CoursePackage[];
    continueLearningCourse: CoursePackage | null;
    continueLearningUnit: LearnerUnitProgress | null;
    onSelectCourse: (course: CoursePackage) => void;
    onContinueLearning: () => void;
}

// Robust Timeline Duration Calculator
export const calculateDurationWeeks = (course: CoursePackage | ExtendedCatalogCourse): number => {
    if (!course) return 1;

    const extCourse = course as ExtendedCatalogCourse;
    const timeConfig: Record<string, unknown> = extCourse.timeBoundConfig || extCourse.checkpointMetadata?.timeBoundConfig || {};

    const startStr = (course.startDate ||
        timeConfig.startDate ||
        extCourse.timelineStartDate ||
        extCourse.runStartDate ||
        extCourse.applicationStartDate ||
        extCourse.start) as string | undefined;

    const endStr = (course.endDate ||
        timeConfig.endDate ||
        extCourse.timelineEndDate ||
        extCourse.runEndDate ||
        extCourse.applicationEndDate ||
        extCourse.end) as string | undefined;

    if (startStr && endStr) {
        const start = moment(startStr);
        const end = moment(endStr);

        if (start.isValid() && end.isValid() && end.isAfter(start)) {
            const diffDays = Math.abs(end.diff(start, 'days'));
            const weeks = Math.round(diffDays / 7);
            return Math.max(1, weeks);
        }
    }

    const totalHours = Number(course.estimatedTotalHours || extCourse.totalHours || extCourse.totalNotionalHours) ||
        (Number(course.contentHours || 0) + Number(course.courseworkHours || 0));

    if (totalHours > 0) {
        return Math.max(1, Math.ceil(totalHours / 10));
    }

    return 1;
};

export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
    courses,
    continueLearningCourse,
    continueLearningUnit,
    onSelectCourse,
    onContinueLearning
}) => {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('ALL');
    const [durationFilter, setDurationFilter] = useState<string>('ALL');
    const [levelFilter, setLevelFilter] = useState<string>('ALL');

    const [savingCourseIds, setSavingCourseIds] = useState<Set<string>>(new Set());
    const [liveCohortRunsMap, setLiveCohortRunsMap] = useState<Map<string, LiveCohortRunDoc>>(new Map());
    const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const q = collection(db, 'cohort_runs');
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const map = new Map<string, LiveCohortRunDoc>();
            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const runData: LiveCohortRunDoc = { id: docSnap.id, ...data };
                map.set(docSnap.id, runData);
                if (data.containerId) {
                    map.set(`container_${data.containerId}`, runData);
                }
            });
            setLiveCohortRunsMap(map);
        }, (err) => {
            console.warn('[CourseCatalogView] cohort_runs listener notice:', err);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser?.uid) return;

        const q = query(
            collection(db, 'learnerBookmarks'),
            where('userId', '==', currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ids = new Set<string>();
            const prefix = `${currentUser.uid}_`;

            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (data.targetId) ids.add(data.targetId);
                if (data.cohortRunId) ids.add(data.cohortRunId);

                if (docSnap.id.startsWith(prefix)) {
                    ids.add(docSnap.id.substring(prefix.length));
                }
            });
            setSavedCourseIds(ids);
        }, (err) => {
            console.warn('[CourseCatalogView] Bookmarks listener notice:', err);
        });

        return () => unsubscribe();
    }, []);

    const enrichedCourses = useMemo((): CoursePackage[] => {
        return courses.map((course): CoursePackage => {
            const extCourse = course as ExtendedCatalogCourse;
            const runId = course.cohortRunId || extCourse.timelineId || extCourse.placementId || course.id;
            const liveRun = liveCohortRunsMap.get(runId) || liveCohortRunsMap.get(`container_${course.id}`);

            if (!liveRun) return course;

            const timeConfig: Record<string, unknown> = liveRun.timeBoundConfig || {};
            const startDate = (timeConfig.startDate || liveRun.startDate || liveRun.applicationStartDate || course.startDate) as string | undefined;
            const endDate = (timeConfig.endDate || liveRun.endDate || liveRun.applicationEndDate || course.endDate) as string | undefined;

            const pacingModel: 'cohort_scheduled' | 'individual_self_paced' =
                timeConfig.isTimeBound === false
                    ? 'individual_self_paced'
                    : (startDate ? 'cohort_scheduled' : 'individual_self_paced');

            return {
                ...course,
                startDate,
                endDate,
                themeColor: liveRun.themeColor || course.themeColor,
                illustrationType: liveRun.illustrationType || course.illustrationType,
                timeBoundConfig: timeConfig as unknown as CoursePackage['timeBoundConfig'],
                pacingModel
            };
        });
    }, [courses, liveCohortRunsMap]);

    const secamCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'secam').length, [enrichedCourses]);
    const qctoCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'qcto').length, [enrichedCourses]);
    const openCount = useMemo(() => enrichedCourses.filter(c => {
        const ext = c as ExtendedCatalogCourse;
        const status = String(c.runStatus || c.status || ext.status || '').toLowerCase();
        const appEnd = c.applicationEndDate || ext.applicationEndDate;
        const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
        return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
    }).length, [enrichedCourses]);

    const savedCount = useMemo(() => enrichedCourses.filter(c => {
        const ext = c as ExtendedCatalogCourse;
        const uniqueKey = c.cohortRunId || ext.timelineId || c.id;
        return savedCourseIds.has(uniqueKey);
    }).length, [enrichedCourses, savedCourseIds]);

    const filteredCourses = useMemo(() => {
        let filtered = enrichedCourses;

        if (searchQuery.trim()) {
            const lowerQ = searchQuery.toLowerCase();
            filtered = filtered.filter(c =>
                c.title.toLowerCase().includes(lowerQ) ||
                (c.tags || []).some(t => t.toLowerCase().includes(lowerQ))
            );
        }

        if (activeCategory !== 'ALL') {
            if (activeCategory === 'SECAM') {
                filtered = filtered.filter(c => c.framework === 'secam');
            } else if (activeCategory === 'QCTO') {
                filtered = filtered.filter(c => c.framework === 'qcto');
            } else if (activeCategory === 'OPEN') {
                filtered = filtered.filter(c => {
                    const ext = c as ExtendedCatalogCourse;
                    const status = String(c.runStatus || c.status || ext.status || '').toLowerCase();
                    const appEnd = c.applicationEndDate || ext.applicationEndDate;
                    const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
                    return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
                });
            } else if (activeCategory === 'SAVED') {
                filtered = filtered.filter(c => {
                    const ext = c as ExtendedCatalogCourse;
                    const uniqueKey = c.cohortRunId || ext.timelineId || c.id;
                    return savedCourseIds.has(uniqueKey);
                });
            }
        }

        if (durationFilter !== 'ALL') {
            filtered = filtered.filter(c => {
                const w = calculateDurationWeeks(c);
                if (durationFilter === 'LESS_THAN_4') return w < 4;
                if (durationFilter === '1_TO_3_MONTHS') return w >= 4 && w <= 12;
                if (durationFilter === '3_PLUS_MONTHS') return w > 12;
                return true;
            });
        }

        if (levelFilter !== 'ALL') {
            filtered = filtered.filter(c =>
                String(c.level || 'beginner').toLowerCase() === levelFilter.toLowerCase()
            );
        }

        return filtered.sort((a, b) => {
            const aProgress = a.completedUnitsCount ? 1 : 0;
            const bProgress = b.completedUnitsCount ? 1 : 0;
            return bProgress - aProgress;
        });
    }, [enrichedCourses, searchQuery, activeCategory, durationFilter, levelFilter, savedCourseIds]);

    const handleToggleBookmark = async (e: React.MouseEvent, course: CoursePackage) => {
        e.stopPropagation();
        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
            toast.warning("Please sign in to bookmark courses.");
            return;
        }

        const extCourse = course as ExtendedCatalogCourse;
        const uniqueKey = course.cohortRunId || extCourse.timelineId || course.id;

        setSavingCourseIds(prev => new Set(prev).add(uniqueKey));

        const isSaved = savedCourseIds.has(uniqueKey);
        const docId = `${currentUser.uid}_${uniqueKey}`;
        const bookmarkRef = doc(db, 'learnerBookmarks', docId);

        try {
            if (isSaved) {
                await deleteDoc(bookmarkRef);
                toast.info(`Removed "${course.title}" from saved courses.`);
            } else {
                await setDoc(bookmarkRef, {
                    userId: currentUser.uid,
                    targetId: uniqueKey,
                    courseId: course.id,
                    cohortRunId: course.cohortRunId || null,
                    unitTitle: course.title,
                    createdAt: serverTimestamp()
                });
                toast.success(`Saved "${course.title}" to bookmarks!`);
            }
        } catch (err) {
            console.error('[CourseCatalogView] Error toggling bookmark:', err);
            toast.error("Failed to update saved course.");
        } finally {
            setSavingCourseIds(prev => {
                const next = new Set(prev);
                next.delete(uniqueKey);
                return next;
            });
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* CONTINUE LEARNING BANNER */}
            {continueLearningCourse && continueLearningUnit && (
                <div style={{
                    background: 'linear-gradient(135deg, var(--mlab-midnight) 0%, #064e3b 100%)',
                    borderRadius: '0px',
                    padding: '24px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    borderLeft: '6px solid var(--mlab-green)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PlayCircle size={32} color="var(--mlab-green)" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: 'var(--font-heading)' }}>
                                ⟳ Continue Active Lesson
                            </div>
                            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                {continueLearningCourse.title}
                            </h2>
                            <div style={{ fontSize: '0.85rem', color: '#bae6fd', fontWeight: 600 }}>
                                {continueLearningUnit.title}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#dcfce7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={14} /> ~{continueLearningUnit.estimatedMinutes || 15} min left
                        </div>
                        <Tooltip content="Jump straight into your current active lesson in the player." placement="left">
                            <button
                                onClick={onContinueLearning}
                                className="lfm-btn lfm-btn--green"
                                style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '0px' }}
                            >
                                RESUME NOW <ChevronRight size={16} />
                            </button>
                        </Tooltip>
                    </div>
                </div>
            )}

            {/* DASHBOARD SUMMARY WIDGETS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <Tooltip content="Agile bootcamp tracks featuring practical coding sprints and peer dialogue." placement="top">
                    <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #6366f1' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} /> Agile Sprint Track
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            SECAM CODETRIBE BOOTCAMP
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>120 Notional Hours</div>
                    </div>
                </Tooltip>

                <Tooltip content="Formal SETA/QCTO occupational qualifications linked to registered SAQA logbooks." placement="top">
                    <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #16a34a' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Award size={14} /> QCTO Qualification
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            MICT SETA NQF 5 SYSTEMS DEV
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Accredited Logbook Track</div>
                    </div>
                </Tooltip>

                <Tooltip content="Active intake batches scheduled across specific calendar timeline windows." placement="top">
                    <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #f59e0b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Layers size={14} /> Cohort Runs
                                </div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                    ACTIVE & OPEN BATCHES
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Enrollment & Intake Windows</div>
                            </div>
                            <span style={{ fontSize: '0.65rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>
                                Scheduled
                            </span>
                        </div>
                    </div>
                </Tooltip>

                <Tooltip content="Interactive Spot-the-Bug and AI Oral Defense verification gates protecting lesson completion." placement="top">
                    <div style={{ background: 'var(--mlab-midnight)', border: '1px solid #0f172a', padding: '16px', borderTop: '3px solid #0ea5e9' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck size={14} /> AI Verification Sandbox
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            SPOT-THE-BUG & DEFENSE
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Active Completion Gates</div>
                    </div>
                </Tooltip>
            </div>

            {/* SEARCH AND FILTER BAR */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                    <Tooltip content="Search course titles or tags." placement="top">
                        <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', padding: '0 12px', width: '100%' }}>
                            <Search size={16} color="#64748b" />
                            <input
                                type="text"
                                placeholder="Search cohort batches by title or tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '12px', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}
                            />
                        </div>
                    </Tooltip>
                </div>
                {(activeCategory !== 'ALL' || durationFilter !== 'ALL' || levelFilter !== 'ALL' || searchQuery !== '') && (
                    <Tooltip content="Clear search and reset all active filter criteria." placement="top">
                        <button
                            onClick={() => {
                                setActiveCategory('ALL');
                                setDurationFilter('ALL');
                                setLevelFilter('ALL');
                                setSearchQuery('');
                            }}
                            className="lfm-btn lfm-btn--ghost"
                            style={{ borderRadius: '0px', padding: '10px 18px', fontSize: '0.8rem', color: '#ef4444' }}
                        >
                            RESET FILTERS
                        </button>
                    </Tooltip>
                )}
            </div>

            {/* MAIN CATALOG GRID + SIDEBAR */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

                {/* COURSE CARDS GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                    {filteredCourses.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #cbd5e1', padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
                            <Layers size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
                            <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                No Courses Match Your Filter
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.82rem' }}>Try switching categories or resetting your filter controls.</p>
                        </div>
                    ) : (
                        filteredCourses.map(course => {
                            const extCourse = course as ExtendedCatalogCourse;
                            const uniqueKey = course.cohortRunId || extCourse.timelineId || course.id;
                            const isSecam = course.framework === 'secam';
                            const totalUnits = course.totalUnitsCount || 0;
                            const completedUnits = course.completedUnitsCount || 0;
                            const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
                            const hasStarted = progressPct > 0 || course.hasStarted;
                            const durationWeeks = calculateDurationWeeks(course);

                            const theme = getThemeStyles(course.themeColor, course.framework);
                            const accentColor = course.themeColor || theme.borderTopColor || '#0284c7';

                            const isSaved = savedCourseIds.has(uniqueKey);
                            const isSaving = savingCourseIds.has(uniqueKey);

                            return (
                                <div
                                    key={uniqueKey}
                                    style={{
                                        background: 'white',
                                        border: '1px solid #cbd5e1',
                                        borderTop: `4px solid ${accentColor}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                        e.currentTarget.style.boxShadow = '0 12px 20px -4px rgba(0, 0, 0, 0.12)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                    onClick={() => onSelectCourse(course)}
                                >
                                    {/* CARD TOP STATUS BAR */}
                                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <div style={{ width: '6px', height: '6px', background: '#16a34a', borderRadius: '50%' }} />
                                            Active Batch
                                        </span>

                                        <Tooltip content={isSaved ? "Remove from bookmarked courses." : "Bookmark this course for quick access."} placement="left">
                                            <button
                                                type="button"
                                                onClick={(e) => handleToggleBookmark(e, course)}
                                                disabled={isSaving}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    padding: '2px',
                                                    cursor: isSaving ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    opacity: isSaving ? 0.6 : 1
                                                }}
                                            >
                                                {isSaving ? (
                                                    <Loader2 size={18} className="lfm-spin" color={accentColor} />
                                                ) : (
                                                    <Bookmark
                                                        size={18}
                                                        fill={isSaved ? accentColor : 'none'}
                                                        color={isSaved ? accentColor : '#94a3b8'}
                                                    />
                                                )}
                                            </button>
                                        </Tooltip>
                                    </div>

                                    {/* ARTWORK CONTAINER */}
                                    <div style={{
                                        height: '145px',
                                        background: theme.gradient || 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            opacity: 0.35,
                                            backgroundImage: `radial-gradient(${accentColor} 1.5px, transparent 1.5px)`,
                                            backgroundSize: '16px 16px'
                                        }} />

                                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(15, 23, 42, 0.45) 100%)' }} />

                                        <div style={{ position: 'relative', zIndex: 2, transform: 'scale(1.15)', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
                                            <CourseIllustrationGraphic
                                                type={course.illustrationType || 'code'}
                                                themeColor={accentColor}
                                                framework={course.framework}
                                                size={48}
                                            />
                                        </div>
                                    </div>

                                    {/* CARD BODY */}
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>

                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: accentColor, background: theme.badgeBg || '#f0f9ff', border: `1px solid ${accentColor}40`, padding: '2px 8px', textTransform: 'uppercase' }}>
                                                {isSecam ? 'SECAM Agile' : 'QCTO Accredited'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={10} /> ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', textTransform: 'uppercase' }}>
                                                {course.level || 'Beginner'}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                                            Blueprint: {isSecam ? 'CODETRIBE ACADEMY - REACTJS' : 'QCTO Standard Specification'}
                                        </div>

                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', lineHeight: 1.25 }}>
                                            {course.title}
                                        </h3>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, marginBottom: '12px' }}>
                                            <Star size={14} fill="#f59e0b" /> 4.9 <span style={{ color: '#94a3b8', fontWeight: 500 }}>(0 enrolled)</span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                            {(course.tags || ['JAVASCRIPT', 'NODE.JS', 'HTML & CSS']).slice(0, 4).map(tag => (
                                                <span key={tag} style={{ fontSize: '0.65rem', color: accentColor, background: '#f8fafc', border: `1px solid ${accentColor}30`, fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase' }}>
                                                    #{tag.replace(/\s+/g, '')}
                                                </span>
                                            ))}
                                        </div>

                                        <div style={{ marginTop: 'auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-green)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                <span>{completedUnits} OF {totalUnits} LESSONS</span>
                                                <span>{progressPct}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden' }}>
                                                <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--mlab-green)', transition: 'width 0.3s ease' }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* CARD FOOTER */}
                                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#334155', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={12} color="#64748b" />
                                            ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'} • {course.contentHours || 0}h content + {course.courseworkHours || 0}h projects
                                        </div>
                                        <Tooltip content={hasStarted ? "Resume learning where you left off." : "Open course overview and start lesson sequence."} placement="top">
                                            <button
                                                className={`lfm-btn ${hasStarted ? 'lfm-btn--green' : 'lfm-btn--primary'}`}
                                                style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '0px' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectCourse(course);
                                                }}
                                            >
                                                <Play size={12} /> {hasStarted ? 'RESUME' : 'LAUNCH'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* RIGHT SIDEBAR (Categories & Filters) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
                        <div style={{ background: 'var(--mlab-blue)', borderBottom: '3px solid var(--mlab-green)', color: 'white', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                            Curriculum Categories
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Tooltip content="Show all active course batches across all frameworks." placement="left">
                                <button
                                    onClick={() => setActiveCategory('ALL')}
                                    style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'ALL' ? 'var(--mlab-light-blue)' : 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'ALL' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
                                >
                                    <BookOpen size={16} /> ALL COHORT BATCHES ({enrichedCourses.length})
                                </button>
                            </Tooltip>

                            <Tooltip content="Filter specifically to SECAM Agile Bootcamp tracks." placement="left">
                                <button
                                    onClick={() => setActiveCategory('SECAM')}
                                    style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SECAM' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SECAM' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'SECAM' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
                                >
                                    <Zap size={16} /> SECAM BOOTCAMPS ({secamCount})
                                </button>
                            </Tooltip>

                            <Tooltip content="Filter to QCTO / SETA occupational qualification courses." placement="left">
                                <button
                                    onClick={() => setActiveCategory('QCTO')}
                                    style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'QCTO' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'QCTO' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'QCTO' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
                                >
                                    <GraduationCap size={16} /> QCTO QUALIFICATIONS ({qctoCount})
                                </button>
                            </Tooltip>

                            <Tooltip content="Show courses with open registration windows." placement="left">
                                <button
                                    onClick={() => setActiveCategory('OPEN')}
                                    style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'OPEN' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'OPEN' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'OPEN' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Send size={16} /> APPLICATIONS OPEN</span>
                                    <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', fontWeight: 800 }}>{openCount} OPEN</span>
                                </button>
                            </Tooltip>

                            <Tooltip content="Filter to courses you have bookmarked." placement="left">
                                <button
                                    onClick={() => setActiveCategory('SAVED')}
                                    style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SAVED' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SAVED' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'SAVED' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={16} /> SAVED COURSES</span>
                                    <span style={{ fontSize: '0.6rem', background: savedCount > 0 ? '#dcfce7' : '#f1f5f9', color: savedCount > 0 ? '#15803d' : '#64748b', padding: '2px 6px', fontWeight: 800 }}>{savedCount}</span>
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
                        <div style={{ background: 'var(--mlab-blue)', color: 'white', borderBottom: '3px solid var(--mlab-green)', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><Filter size={14} style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> Filter Controls</span>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <Tooltip content="Filter courses by estimated weeks or months to completion." placement="top">
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Duration Range</label>
                                </Tooltip>
                                <select
                                    value={durationFilter}
                                    onChange={(e) => setDurationFilter(e.target.value)}
                                    className="pfm-input"
                                    style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
                                >
                                    <option value="ALL">Any Duration</option>
                                    <option value="LESS_THAN_4">&lt; 4 Weeks</option>
                                    <option value="1_TO_3_MONTHS">1 - 3 Months (4-12 wks)</option>
                                    <option value="3_PLUS_MONTHS">3+ Months (&gt; 12 wks)</option>
                                </select>
                            </div>
                            <div>
                                <Tooltip content="Filter courses by target experience level." placement="top">
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Target Level</label>
                                </Tooltip>
                                <select
                                    value={levelFilter}
                                    onChange={(e) => setLevelFilter(e.target.value)}
                                    className="pfm-input"
                                    style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
                                >
                                    <option value="ALL">All Levels</option>
                                    <option value="BEGINNER">Beginner</option>
                                    <option value="INTERMEDIATE">Intermediate</option>
                                    <option value="ADVANCED">Advanced</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--mlab-blue)', borderLeft: '3px solid var(--mlab-green)', color: 'white', padding: '24px', textAlign: 'center', border: '1px solid var(--mlab-midnight)' }}>
                        <HelpCircle size={24} color="var(--mlab-green)" style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Need Help With a Lesson?
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#bae6fd', lineHeight: 1.5 }}>
                            Contact your assigned facilitator directly or use the AI Sandbox module embedded in your lessons for immediate debugging assistance.
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};



// // src/pages/LearnerPortal/LearnerContentHub/CourseCatalogView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import {
//     Play, Clock, Star, Bookmark, ChevronRight, Search, Filter,
//     Layers, Award, Zap, ShieldCheck, PlayCircle, HelpCircle, Send, Loader2,
//     GraduationCap, BookOpen
// } from 'lucide-react';
// import moment from 'moment';
// import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
// import { auth, db } from '../../../lib/firebase';
// import { useToast } from '../../../components/common/Toast/Toast';
// import Tooltip from '../../../components/common/Tooltip/Tooltip';
// import {
//     CourseIllustrationGraphic,
//     getThemeStyles,
//     type CoursePackage,
//     type LearnerUnitProgress
// } from './types';

// interface CourseCatalogViewProps {
//     courses: CoursePackage[];
//     continueLearningCourse: CoursePackage | null;
//     continueLearningUnit: LearnerUnitProgress | null;
//     onSelectCourse: (course: CoursePackage) => void;
//     onContinueLearning: () => void;
// }

// // Robust Timeline Duration Calculator
// export const calculateDurationWeeks = (course: CoursePackage): number => {
//     if (!course) return 1;

//     const timeConfig: Record<string, any> = course.timeBoundConfig || course.checkpointMetadata?.timeBoundConfig || {};

//     const startStr = course.startDate ||
//         timeConfig.startDate ||
//         course.timelineStartDate ||
//         course.runStartDate ||
//         course.applicationStartDate ||
//         course.start;

//     const endStr = course.endDate ||
//         timeConfig.endDate ||
//         course.timelineEndDate ||
//         course.runEndDate ||
//         course.applicationEndDate ||
//         course.end;

//     if (startStr && endStr) {
//         const start = moment(startStr);
//         const end = moment(endStr);

//         if (start.isValid() && end.isValid() && end.isAfter(start)) {
//             const diffDays = Math.abs(end.diff(start, 'days'));
//             const weeks = Math.round(diffDays / 7);
//             return Math.max(1, weeks);
//         }
//     }

//     const totalHours = Number(course.estimatedTotalHours || course.totalHours || course.totalNotionalHours) ||
//         (Number(course.contentHours || 0) + Number(course.courseworkHours || 0));

//     if (totalHours > 0) {
//         return Math.max(1, Math.ceil(totalHours / 10));
//     }

//     return 1;
// };

// export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
//     courses,
//     continueLearningCourse,
//     continueLearningUnit,
//     onSelectCourse,
//     onContinueLearning
// }) => {
//     const toast = useToast();
//     const [searchQuery, setSearchQuery] = useState('');
//     const [activeCategory, setActiveCategory] = useState<string>('ALL');
//     const [durationFilter, setDurationFilter] = useState<string>('ALL');
//     const [levelFilter, setLevelFilter] = useState<string>('ALL');

//     const [savingCourseIds, setSavingCourseIds] = useState<Set<string>>(new Set());
//     const [liveCohortRunsMap, setLiveCohortRunsMap] = useState<Map<string, any>>(new Map());
//     const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());

//     useEffect(() => {
//         const q = collection(db, 'cohort_runs');
//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const map = new Map<string, any>();
//             snapshot.docs.forEach(docSnap => {
//                 const data = docSnap.data();
//                 const runData = { id: docSnap.id, ...data };
//                 map.set(docSnap.id, runData);
//                 if (data.containerId) {
//                     map.set(`container_${data.containerId}`, runData);
//                 }
//             });
//             setLiveCohortRunsMap(map);
//         }, (err) => {
//             console.warn('[CourseCatalogView] cohort_runs listener notice:', err);
//         });

//         return () => unsubscribe();
//     }, []);

//     useEffect(() => {
//         const currentUser = auth.currentUser;
//         if (!currentUser?.uid) return;

//         const q = query(
//             collection(db, 'learnerBookmarks'),
//             where('userId', '==', currentUser.uid)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const ids = new Set<string>();
//             const prefix = `${currentUser.uid}_`;

//             snapshot.docs.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.targetId) ids.add(data.targetId);
//                 if (data.cohortRunId) ids.add(data.cohortRunId);

//                 if (docSnap.id.startsWith(prefix)) {
//                     ids.add(docSnap.id.substring(prefix.length));
//                 }
//             });
//             setSavedCourseIds(ids);
//         }, (err) => {
//             console.warn('[CourseCatalogView] Bookmarks listener notice:', err);
//         });

//         return () => unsubscribe();
//     }, []);

//     const enrichedCourses = useMemo((): CoursePackage[] => {
//         return courses.map((course): CoursePackage => {
//             const runId = course.cohortRunId || course.timelineId || course.placementId || course.id;
//             const liveRun = liveCohortRunsMap.get(runId) || liveCohortRunsMap.get(`container_${course.id}`);

//             if (!liveRun) return course;

//             const timeConfig: Record<string, any> = liveRun.timeBoundConfig || {};
//             const startDate = timeConfig.startDate || liveRun.startDate || liveRun.applicationStartDate || course.startDate;
//             const endDate = timeConfig.endDate || liveRun.endDate || liveRun.applicationEndDate || course.endDate;

//             const pacingModel: 'cohort_scheduled' | 'individual_self_paced' =
//                 timeConfig.isTimeBound === false
//                     ? 'individual_self_paced'
//                     : (startDate ? 'cohort_scheduled' : 'individual_self_paced');

//             return {
//                 ...course,
//                 startDate,
//                 endDate,
//                 themeColor: liveRun.themeColor || course.themeColor,
//                 illustrationType: liveRun.illustrationType || course.illustrationType,
//                 timeBoundConfig: timeConfig,
//                 pacingModel
//             };
//         });
//     }, [courses, liveCohortRunsMap]);

//     const secamCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'secam').length, [enrichedCourses]);
//     const qctoCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'qcto').length, [enrichedCourses]);
//     const openCount = useMemo(() => enrichedCourses.filter(c => {
//         const status = String(c.runStatus || c.status || '').toLowerCase();
//         const appEnd = c.applicationEndDate;
//         const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
//         return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
//     }).length, [enrichedCourses]);

//     const savedCount = useMemo(() => enrichedCourses.filter(c => {
//         const uniqueKey = c.cohortRunId || c.timelineId || c.id;
//         return savedCourseIds.has(uniqueKey);
//     }).length, [enrichedCourses, savedCourseIds]);

//     const filteredCourses = useMemo(() => {
//         let filtered = enrichedCourses;

//         if (searchQuery.trim()) {
//             const lowerQ = searchQuery.toLowerCase();
//             filtered = filtered.filter(c =>
//                 c.title.toLowerCase().includes(lowerQ) ||
//                 (c.tags || []).some(t => t.toLowerCase().includes(lowerQ))
//             );
//         }

//         if (activeCategory !== 'ALL') {
//             if (activeCategory === 'SECAM') {
//                 filtered = filtered.filter(c => c.framework === 'secam');
//             } else if (activeCategory === 'QCTO') {
//                 filtered = filtered.filter(c => c.framework === 'qcto');
//             } else if (activeCategory === 'OPEN') {
//                 filtered = filtered.filter(c => {
//                     const status = String(c.runStatus || c.status || '').toLowerCase();
//                     const appEnd = c.applicationEndDate;
//                     const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
//                     return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
//                 });
//             } else if (activeCategory === 'SAVED') {
//                 filtered = filtered.filter(c => {
//                     const uniqueKey = c.cohortRunId || c.timelineId || c.id;
//                     return savedCourseIds.has(uniqueKey);
//                 });
//             }
//         }

//         if (durationFilter !== 'ALL') {
//             filtered = filtered.filter(c => {
//                 const w = calculateDurationWeeks(c);
//                 if (durationFilter === 'LESS_THAN_4') return w < 4;
//                 if (durationFilter === '1_TO_3_MONTHS') return w >= 4 && w <= 12;
//                 if (durationFilter === '3_PLUS_MONTHS') return w > 12;
//                 return true;
//             });
//         }

//         if (levelFilter !== 'ALL') {
//             filtered = filtered.filter(c =>
//                 String(c.level || 'beginner').toLowerCase() === levelFilter.toLowerCase()
//             );
//         }

//         return filtered.sort((a, b) => {
//             const aProgress = a.completedUnitsCount ? 1 : 0;
//             const bProgress = b.completedUnitsCount ? 1 : 0;
//             return bProgress - aProgress;
//         });
//     }, [enrichedCourses, searchQuery, activeCategory, durationFilter, levelFilter, savedCourseIds]);

//     const handleToggleBookmark = async (e: React.MouseEvent, course: CoursePackage) => {
//         e.stopPropagation();
//         const currentUser = auth.currentUser;
//         if (!currentUser?.uid) {
//             toast.warning("Please sign in to bookmark courses.");
//             return;
//         }

//         const uniqueKey = course.cohortRunId || course.timelineId || course.id;

//         setSavingCourseIds(prev => new Set(prev).add(uniqueKey));

//         const isSaved = savedCourseIds.has(uniqueKey);
//         const docId = `${currentUser.uid}_${uniqueKey}`;
//         const bookmarkRef = doc(db, 'learnerBookmarks', docId);

//         try {
//             if (isSaved) {
//                 await deleteDoc(bookmarkRef);
//                 toast.info(`Removed "${course.title}" from saved courses.`);
//             } else {
//                 await setDoc(bookmarkRef, {
//                     userId: currentUser.uid,
//                     targetId: uniqueKey,
//                     courseId: course.id,
//                     cohortRunId: course.cohortRunId || null,
//                     unitTitle: course.title,
//                     createdAt: serverTimestamp()
//                 });
//                 toast.success(`Saved "${course.title}" to bookmarks!`);
//             }
//         } catch (err) {
//             console.error('[CourseCatalogView] Error toggling bookmark:', err);
//             toast.error("Failed to update saved course.");
//         } finally {
//             setSavingCourseIds(prev => {
//                 const next = new Set(prev);
//                 next.delete(uniqueKey);
//                 return next;
//             });
//         }
//     };

//     return (
//         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

//             {/* CONTINUE LEARNING BANNER */}
//             {continueLearningCourse && continueLearningUnit && (
//                 <div style={{
//                     background: 'linear-gradient(135deg, var(--mlab-midnight) 0%, #064e3b 100%)',
//                     borderRadius: '0px',
//                     padding: '24px',
//                     color: 'white',
//                     display: 'flex',
//                     alignItems: 'center',
//                     justifyContent: 'space-between',
//                     boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
//                     borderLeft: '6px solid var(--mlab-green)'
//                 }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
//                         <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                             <PlayCircle size={32} color="var(--mlab-green)" />
//                         </div>
//                         <div>
//                             <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: 'var(--font-heading)' }}>
//                                 ⟳ Continue Active Lesson
//                             </div>
//                             <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 {continueLearningCourse.title}
//                             </h2>
//                             <div style={{ fontSize: '0.85rem', color: '#bae6fd', fontWeight: 600 }}>
//                                 {continueLearningUnit.title}
//                             </div>
//                         </div>
//                     </div>
//                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
//                         <div style={{ fontSize: '0.75rem', color: '#dcfce7', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                             <Clock size={14} /> ~{continueLearningUnit.estimatedMinutes || 15} min left
//                         </div>
//                         <Tooltip content="Jump straight into your current active lesson in the player." placement="left">
//                             <button
//                                 onClick={onContinueLearning}
//                                 className="lfm-btn lfm-btn--green"
//                                 style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '0px' }}
//                             >
//                                 RESUME NOW <ChevronRight size={16} />
//                             </button>
//                         </Tooltip>
//                     </div>
//                 </div>
//             )}

//             {/* DASHBOARD SUMMARY WIDGETS */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
//                 <Tooltip content="Agile bootcamp tracks featuring practical coding sprints and peer dialogue." placement="top">
//                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #6366f1' }}>
//                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Zap size={14} /> Agile Sprint Track
//                         </div>
//                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             SECAM CODETRIBE BOOTCAMP
//                         </div>
//                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>120 Notional Hours</div>
//                     </div>
//                 </Tooltip>

//                 <Tooltip content="Formal SETA/QCTO occupational qualifications linked to registered SAQA logbooks." placement="top">
//                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #16a34a' }}>
//                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Award size={14} /> QCTO Qualification
//                         </div>
//                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             MICT SETA NQF 5 SYSTEMS DEV
//                         </div>
//                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Accredited Logbook Track</div>
//                     </div>
//                 </Tooltip>

//                 <Tooltip content="Active intake batches scheduled across specific calendar timeline windows." placement="top">
//                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #f59e0b' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                             <div>
//                                 <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <Layers size={14} /> Cohort Runs
//                                 </div>
//                                 <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                     ACTIVE & OPEN BATCHES
//                                 </div>
//                                 <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Enrollment & Intake Windows</div>
//                             </div>
//                             <span style={{ fontSize: '0.65rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>
//                                 Scheduled
//                             </span>
//                         </div>
//                     </div>
//                 </Tooltip>

//                 <Tooltip content="Interactive Spot-the-Bug and AI Oral Defense verification gates protecting lesson completion." placement="top">
//                     <div style={{ background: 'var(--mlab-midnight)', border: '1px solid #0f172a', padding: '16px', borderTop: '3px solid #0ea5e9' }}>
//                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <ShieldCheck size={14} /> AI Verification Sandbox
//                         </div>
//                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             SPOT-THE-BUG & DEFENSE
//                         </div>
//                         <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Active Completion Gates</div>
//                     </div>
//                 </Tooltip>
//             </div>

//             {/* SEARCH AND FILTER BAR */}
//             <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
//                 <div style={{ flex: 1 }}>
//                     <Tooltip content="Search course titles or tags." placement="top">
//                         <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', padding: '0 12px', width: '100%' }}>
//                             <Search size={16} color="#64748b" />
//                             <input
//                                 type="text"
//                                 placeholder="Search cohort batches by title or tags..."
//                                 value={searchQuery}
//                                 onChange={(e) => setSearchQuery(e.target.value)}
//                                 style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '12px', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}
//                             />
//                         </div>
//                     </Tooltip>
//                 </div>
//                 {(activeCategory !== 'ALL' || durationFilter !== 'ALL' || levelFilter !== 'ALL' || searchQuery !== '') && (
//                     <Tooltip content="Clear search and reset all active filter criteria." placement="top">
//                         <button
//                             onClick={() => {
//                                 setActiveCategory('ALL');
//                                 setDurationFilter('ALL');
//                                 setLevelFilter('ALL');
//                                 setSearchQuery('');
//                             }}
//                             className="lfm-btn lfm-btn--ghost"
//                             style={{ borderRadius: '0px', padding: '10px 18px', fontSize: '0.8rem', color: '#ef4444' }}
//                         >
//                             RESET FILTERS
//                         </button>
//                     </Tooltip>
//                 )}
//             </div>

//             {/* MAIN CATALOG GRID + SIDEBAR */}
//             <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

//                 {/* COURSE CARDS GRID */}
//                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
//                     {filteredCourses.length === 0 ? (
//                         <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #cbd5e1', padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
//                             <Layers size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
//                             <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 No Courses Match Your Filter
//                             </h3>
//                             <p style={{ margin: 0, fontSize: '0.82rem' }}>Try switching categories or resetting your filter controls.</p>
//                         </div>
//                     ) : (
//                         filteredCourses.map(course => {
//                             const uniqueKey = course.cohortRunId || course.timelineId || course.id;
//                             const isSecam = course.framework === 'secam';
//                             const totalUnits = course.totalUnitsCount || 0;
//                             const completedUnits = course.completedUnitsCount || 0;
//                             const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
//                             const hasStarted = progressPct > 0 || course.hasStarted;
//                             const durationWeeks = calculateDurationWeeks(course);

//                             const theme = getThemeStyles(course.themeColor, course.framework);
//                             const accentColor = course.themeColor || theme.borderTopColor || '#0284c7';

//                             const isSaved = savedCourseIds.has(uniqueKey);
//                             const isSaving = savingCourseIds.has(uniqueKey);

//                             return (
//                                 <div
//                                     key={uniqueKey}
//                                     style={{
//                                         background: 'white',
//                                         border: '1px solid #cbd5e1',
//                                         borderTop: `4px solid ${accentColor}`,
//                                         display: 'flex',
//                                         flexDirection: 'column',
//                                         transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
//                                         cursor: 'pointer',
//                                         position: 'relative',
//                                         overflow: 'hidden'
//                                     }}
//                                     onMouseEnter={(e) => {
//                                         e.currentTarget.style.transform = 'translateY(-3px)';
//                                         e.currentTarget.style.boxShadow = '0 12px 20px -4px rgba(0, 0, 0, 0.12)';
//                                     }}
//                                     onMouseLeave={(e) => {
//                                         e.currentTarget.style.transform = 'none';
//                                         e.currentTarget.style.boxShadow = 'none';
//                                     }}
//                                     onClick={() => onSelectCourse(course)}
//                                 >
//                                     {/* CARD TOP STATUS BAR */}
//                                     <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
//                                         <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
//                                             <div style={{ width: '6px', height: '6px', background: '#16a34a', borderRadius: '50%' }} />
//                                             Active Batch
//                                         </span>

//                                         <Tooltip content={isSaved ? "Remove from bookmarked courses." : "Bookmark this course for quick access."} placement="left">
//                                             <button
//                                                 type="button"
//                                                 onClick={(e) => handleToggleBookmark(e, course)}
//                                                 disabled={isSaving}
//                                                 style={{
//                                                     background: 'transparent',
//                                                     border: 'none',
//                                                     padding: '2px',
//                                                     cursor: isSaving ? 'not-allowed' : 'pointer',
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     justifyContent: 'center',
//                                                     opacity: isSaving ? 0.6 : 1
//                                                 }}
//                                             >
//                                                 {isSaving ? (
//                                                     <Loader2 size={18} className="lfm-spin" color={accentColor} />
//                                                 ) : (
//                                                     <Bookmark
//                                                         size={18}
//                                                         fill={isSaved ? accentColor : 'none'}
//                                                         color={isSaved ? accentColor : '#94a3b8'}
//                                                     />
//                                                 )}
//                                             </button>
//                                         </Tooltip>
//                                     </div>

//                                     {/* ARTWORK CONTAINER */}
//                                     <div style={{
//                                         height: '145px',
//                                         background: theme.gradient || 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'center',
//                                         position: 'relative',
//                                         overflow: 'hidden'
//                                     }}>
//                                         <div style={{
//                                             position: 'absolute',
//                                             inset: 0,
//                                             opacity: 0.35,
//                                             backgroundImage: `radial-gradient(${accentColor} 1.5px, transparent 1.5px)`,
//                                             backgroundSize: '16px 16px'
//                                         }} />

//                                         <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(15, 23, 42, 0.45) 100%)' }} />

//                                         <div style={{ position: 'relative', zIndex: 2, transform: 'scale(1.15)', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
//                                             <CourseIllustrationGraphic
//                                                 type={course.illustrationType || 'code'}
//                                                 themeColor={accentColor}
//                                                 framework={course.framework}
//                                                 size={48}
//                                             />
//                                         </div>
//                                     </div>

//                                     {/* CARD BODY */}
//                                     <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>

//                                         <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
//                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: accentColor, background: theme.badgeBg || '#f0f9ff', border: `1px solid ${accentColor}40`, padding: '2px 8px', textTransform: 'uppercase' }}>
//                                                 {isSecam ? 'SECAM Agile' : 'QCTO Accredited'}
//                                             </span>
//                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <Clock size={10} /> ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'}
//                                             </span>
//                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', textTransform: 'uppercase' }}>
//                                                 {course.level || 'Beginner'}
//                                             </span>
//                                         </div>

//                                         <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
//                                             Blueprint: {isSecam ? 'CODETRIBE ACADEMY - REACTJS' : 'QCTO Standard Specification'}
//                                         </div>

//                                         <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', lineHeight: 1.25 }}>
//                                             {course.title}
//                                         </h3>

//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, marginBottom: '12px' }}>
//                                             <Star size={14} fill="#f59e0b" /> 4.9 <span style={{ color: '#94a3b8', fontWeight: 500 }}>(0 enrolled)</span>
//                                         </div>

//                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
//                                             {(course.tags || ['JAVASCRIPT', 'NODE.JS', 'HTML & CSS']).slice(0, 4).map(tag => (
//                                                 <span key={tag} style={{ fontSize: '0.65rem', color: accentColor, background: '#f8fafc', border: `1px solid ${accentColor}30`, fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase' }}>
//                                                     #{tag.replace(/\s+/g, '')}
//                                                 </span>
//                                             ))}
//                                         </div>

//                                         <div style={{ marginTop: 'auto' }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-green)', marginBottom: '4px', textTransform: 'uppercase' }}>
//                                                 <span>{completedUnits} OF {totalUnits} LESSONS</span>
//                                                 <span>{progressPct}%</span>
//                                             </div>
//                                             <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden' }}>
//                                                 <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--mlab-green)', transition: 'width 0.3s ease' }} />
//                                             </div>
//                                         </div>
//                                     </div>

//                                     {/* CARD FOOTER */}
//                                     <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                         <div style={{ fontSize: '0.65rem', color: '#334155', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                             <Clock size={12} color="#64748b" />
//                                             ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'} • {course.contentHours || 0}h content + {course.courseworkHours || 0}h projects
//                                         </div>
//                                         <Tooltip content={hasStarted ? "Resume learning where you left off." : "Open course overview and start lesson sequence."} placement="top">
//                                             <button
//                                                 className={`lfm-btn ${hasStarted ? 'lfm-btn--green' : 'lfm-btn--primary'}`}
//                                                 style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '0px' }}
//                                                 onClick={(e) => {
//                                                     e.stopPropagation();
//                                                     onSelectCourse(course);
//                                                 }}
//                                             >
//                                                 <Play size={12} /> {hasStarted ? 'RESUME' : 'LAUNCH'}
//                                             </button>
//                                         </Tooltip>
//                                     </div>
//                                 </div>
//                             );
//                         })
//                     )}
//                 </div>

//                 {/* RIGHT SIDEBAR (Categories & Filters) */}
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
//                         <div style={{ background: 'var(--mlab-blue)', borderBottom: '3px solid var(--mlab-green)', color: 'white', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                             Curriculum Categories
//                         </div>
//                         <div style={{ display: 'flex', flexDirection: 'column' }}>
//                             <Tooltip content="Show all active course batches across all frameworks." placement="left">
//                                 <button
//                                     onClick={() => setActiveCategory('ALL')}
//                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'ALL' ? 'var(--mlab-light-blue)' : 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'ALL' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
//                                 >
//                                     <BookOpen size={16} /> ALL COHORT BATCHES ({enrichedCourses.length})
//                                 </button>
//                             </Tooltip>

//                             <Tooltip content="Filter specifically to SECAM Agile Bootcamp tracks." placement="left">
//                                 <button
//                                     onClick={() => setActiveCategory('SECAM')}
//                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SECAM' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SECAM' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'SECAM' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
//                                 >
//                                     <Zap size={16} /> SECAM BOOTCAMPS ({secamCount})
//                                 </button>
//                             </Tooltip>

//                             <Tooltip content="Filter to QCTO / SETA occupational qualification courses." placement="left">
//                                 <button
//                                     onClick={() => setActiveCategory('QCTO')}
//                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'QCTO' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'QCTO' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'QCTO' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
//                                 >
//                                     <GraduationCap size={16} /> QCTO QUALIFICATIONS ({qctoCount})
//                                 </button>
//                             </Tooltip>

//                             <Tooltip content="Show courses with open registration windows." placement="left">
//                                 <button
//                                     onClick={() => setActiveCategory('OPEN')}
//                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'OPEN' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'OPEN' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'OPEN' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
//                                 >
//                                     <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Send size={16} /> APPLICATIONS OPEN</span>
//                                     <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', fontWeight: 800 }}>{openCount} OPEN</span>
//                                 </button>
//                             </Tooltip>

//                             <Tooltip content="Filter to courses you have bookmarked." placement="left">
//                                 <button
//                                     onClick={() => setActiveCategory('SAVED')}
//                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SAVED' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SAVED' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'SAVED' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
//                                 >
//                                     <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={16} /> SAVED COURSES</span>
//                                     <span style={{ fontSize: '0.6rem', background: savedCount > 0 ? '#dcfce7' : '#f1f5f9', color: savedCount > 0 ? '#15803d' : '#64748b', padding: '2px 6px', fontWeight: 800 }}>{savedCount}</span>
//                                 </button>
//                             </Tooltip>
//                         </div>
//                     </div>

//                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
//                         <div style={{ background: 'var(--mlab-blue)', color: 'white', borderBottom: '3px solid var(--mlab-green)', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                             <span><Filter size={14} style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> Filter Controls</span>
//                         </div>
//                         <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                             <div>
//                                 <Tooltip content="Filter courses by estimated weeks or months to completion." placement="top">
//                                     <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Duration Range</label>
//                                 </Tooltip>
//                                 <select
//                                     value={durationFilter}
//                                     onChange={(e) => setDurationFilter(e.target.value)}
//                                     className="pfm-input"
//                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
//                                 >
//                                     <option value="ALL">Any Duration</option>
//                                     <option value="LESS_THAN_4">&lt; 4 Weeks</option>
//                                     <option value="1_TO_3_MONTHS">1 - 3 Months (4-12 wks)</option>
//                                     <option value="3_PLUS_MONTHS">3+ Months (&gt; 12 wks)</option>
//                                 </select>
//                             </div>
//                             <div>
//                                 <Tooltip content="Filter courses by target experience level." placement="top">
//                                     <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Target Level</label>
//                                 </Tooltip>
//                                 <select
//                                     value={levelFilter}
//                                     onChange={(e) => setLevelFilter(e.target.value)}
//                                     className="pfm-input"
//                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
//                                 >
//                                     <option value="ALL">All Levels</option>
//                                     <option value="BEGINNER">Beginner</option>
//                                     <option value="INTERMEDIATE">Intermediate</option>
//                                     <option value="ADVANCED">Advanced</option>
//                                 </select>
//                             </div>
//                         </div>
//                     </div>

//                     <div style={{ background: 'var(--mlab-blue)', borderLeft: '3px solid var(--mlab-green)', color: 'white', padding: '24px', textAlign: 'center', border: '1px solid var(--mlab-midnight)' }}>
//                         <HelpCircle size={24} color="var(--mlab-green)" style={{ margin: '0 auto 12px' }} />
//                         <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px' }}>
//                             Need Help With a Lesson?
//                         </div>
//                         <div style={{ fontSize: '0.75rem', color: '#bae6fd', lineHeight: 1.5 }}>
//                             Contact your assigned facilitator directly or use the AI Sandbox module embedded in your lessons for immediate debugging assistance.
//                         </div>
//                     </div>
//                 </div>

//             </div>
//         </div>
//     );
// };



// // // src/pages/LearnerPortal/LearnerContentHub/CourseCatalogView.tsx

// // import React, { useState, useMemo, useEffect } from 'react';
// // import {
// //     Play, Clock, Star, Bookmark, ChevronRight, Search, Filter,
// //     Layers, Award, Zap, ShieldCheck, PlayCircle, HelpCircle, Send, Loader2,
// //     GraduationCap, BookOpen
// // } from 'lucide-react';
// // import moment from 'moment';
// // import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
// // import { auth, db } from '../../../lib/firebase';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import Tooltip from '../../../components/common/Tooltip/Tooltip';
// // import {
// //     CourseIllustrationGraphic,
// //     getThemeStyles,
// //     type CoursePackage,
// //     type LearnerUnitProgress
// // } from './types';

// // interface CourseCatalogViewProps {
// //     courses: CoursePackage[];
// //     continueLearningCourse: CoursePackage | null;
// //     continueLearningUnit: LearnerUnitProgress | null;
// //     onSelectCourse: (course: CoursePackage) => void;
// //     onContinueLearning: () => void;
// // }

// // // 🚀 HELPER: Robust Timeline Duration Calculator
// // export const calculateDurationWeeks = (course: any): number => {
// //     if (!course) return 1;

// //     // 1. Extract dates from all possible Firestore field locations across legacy and new structures
// //     const timeConfig = course.timeBoundConfig || course.checkpointMetadata?.timeBoundConfig || {};

// //     const startStr = course.startDate ||
// //         timeConfig.startDate ||
// //         course.timelineStartDate ||
// //         course.runStartDate ||
// //         course.applicationStartDate ||
// //         course.start;

// //     const endStr = course.endDate ||
// //         timeConfig.endDate ||
// //         course.timelineEndDate ||
// //         course.runEndDate ||
// //         course.applicationEndDate ||
// //         course.end;

// //     // 2. If both dates exist, calculate the positive difference between end and start
// //     if (startStr && endStr) {
// //         const start = moment(startStr);
// //         const end = moment(endStr);

// //         if (start.isValid() && end.isValid() && end.isAfter(start)) {
// //             const diffDays = Math.abs(end.diff(start, 'days'));
// //             const weeks = Math.round(diffDays / 7);
// //             return Math.max(1, weeks);
// //         }
// //     }

// //     // 3. Fallback: Estimate weeks based on total course hours (~10 hours/week pace)
// //     const totalHours = Number(course.estimatedTotalHours || course.totalHours || course.totalNotionalHours) ||
// //         (Number(course.contentHours || 0) + Number(course.courseworkHours || 0));

// //     if (totalHours > 0) {
// //         return Math.max(1, Math.ceil(totalHours / 10));
// //     }

// //     return 1;
// // };

// // export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
// //     courses,
// //     continueLearningCourse,
// //     continueLearningUnit,
// //     onSelectCourse,
// //     onContinueLearning
// // }) => {
// //     const toast = useToast();
// //     const [searchQuery, setSearchQuery] = useState('');
// //     const [activeCategory, setActiveCategory] = useState<string>('ALL');
// //     const [durationFilter, setDurationFilter] = useState<string>('ALL');
// //     const [levelFilter, setLevelFilter] = useState<string>('ALL');

// //     // 🚀 PER-CARD BOOKMARK LOADING STATE
// //     const [savingCourseIds, setSavingCourseIds] = useState<Set<string>>(new Set());

// //     // 🚀 DIRECT REAL-TIME FIREBASE LISTENER FOR COHORT RUNS / TIMELINES
// //     const [liveCohortRunsMap, setLiveCohortRunsMap] = useState<Map<string, any>>(new Map());

// //     // 🚀 REAL-TIME SAVED COURSES / BOOKMARKS LISTENER
// //     const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());

// //     useEffect(() => {
// //         const q = collection(db, 'cohort_runs');
// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const map = new Map<string, any>();
// //             snapshot.docs.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 const runData = { id: docSnap.id, ...data };
// //                 map.set(docSnap.id, runData);
// //                 if (data.containerId) {
// //                     map.set(`container_${data.containerId}`, runData);
// //                 }
// //             });
// //             setLiveCohortRunsMap(map);
// //         }, (err) => {
// //             console.warn('[CourseCatalogView] cohort_runs listener notice:', err);
// //         });

// //         return () => unsubscribe();
// //     }, []);

// //     // 🚀 LISTEN TO SAVED BOOKMARKS USING EXPLICIT INSTANCE IDs
// //     useEffect(() => {
// //         const currentUser = auth.currentUser;
// //         if (!currentUser?.uid) return;

// //         const q = query(
// //             collection(db, 'learnerBookmarks'),
// //             where('userId', '==', currentUser.uid)
// //         );

// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const ids = new Set<string>();
// //             const prefix = `${currentUser.uid}_`;

// //             snapshot.docs.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 if (data.targetId) ids.add(data.targetId);
// //                 if (data.cohortRunId) ids.add(data.cohortRunId);

// //                 if (docSnap.id.startsWith(prefix)) {
// //                     ids.add(docSnap.id.substring(prefix.length));
// //                 }
// //             });
// //             setSavedCourseIds(ids);
// //         }, (err) => {
// //             console.warn('[CourseCatalogView] Bookmarks listener notice:', err);
// //         });

// //         return () => unsubscribe();
// //     }, []);

// //     // 🚀 ENRICH COURSES WITH DIRECT FIREBASE TIMELINE DATA
// //     const enrichedCourses = useMemo(() => {
// //         return courses.map(course => {
// //             const runId = course.cohortRunId || (course as any).timelineId || (course as any).placementId || course.id;
// //             const liveRun = liveCohortRunsMap.get(runId) || liveCohortRunsMap.get(`container_${course.id}`);

// //             if (!liveRun) return course;

// //             const timeConfig = liveRun.timeBoundConfig || {};
// //             const startDate = timeConfig.startDate || liveRun.startDate || liveRun.applicationStartDate || course.startDate;
// //             const endDate = timeConfig.endDate || liveRun.endDate || liveRun.applicationEndDate || course.endDate;

// //             return {
// //                 ...course,
// //                 startDate,
// //                 endDate,
// //                 themeColor: liveRun.themeColor || course.themeColor,
// //                 illustrationType: liveRun.illustrationType || course.illustrationType,
// //                 timeBoundConfig: timeConfig,
// //                 pacingModel: timeConfig.isTimeBound === false ? 'individual_self_paced' : (startDate ? 'cohort_scheduled' : 'individual_self_paced')
// //             };
// //         });
// //     }, [courses, liveCohortRunsMap]);

// //     // 🚀 CATEGORY COUNTS
// //     const secamCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'secam').length, [enrichedCourses]);
// //     const qctoCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'qcto').length, [enrichedCourses]);
// //     const openCount = useMemo(() => enrichedCourses.filter(c => {
// //         const status = String(c.runStatus || c.status || '').toLowerCase();
// //         const appEnd = (c as any).applicationEndDate;
// //         const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
// //         return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
// //     }).length, [enrichedCourses]);

// //     const savedCount = useMemo(() => enrichedCourses.filter(c => {
// //         const uniqueKey = c.cohortRunId || (c as any).timelineId || c.id;
// //         return savedCourseIds.has(uniqueKey);
// //     }).length, [enrichedCourses, savedCourseIds]);

// //     // 🚀 FILTER & SORT COURSES
// //     const filteredCourses = useMemo(() => {
// //         let filtered = enrichedCourses;

// //         // Search Filter
// //         if (searchQuery.trim()) {
// //             const lowerQ = searchQuery.toLowerCase();
// //             filtered = filtered.filter(c =>
// //                 c.title.toLowerCase().includes(lowerQ) ||
// //                 (c.tags || []).some(t => t.toLowerCase().includes(lowerQ))
// //             );
// //         }

// //         // Category Filter
// //         if (activeCategory !== 'ALL') {
// //             if (activeCategory === 'SECAM') {
// //                 filtered = filtered.filter(c => c.framework === 'secam');
// //             } else if (activeCategory === 'QCTO') {
// //                 filtered = filtered.filter(c => c.framework === 'qcto');
// //             } else if (activeCategory === 'OPEN') {
// //                 filtered = filtered.filter(c => {
// //                     const status = String(c.runStatus || c.status || '').toLowerCase();
// //                     const appEnd = (c as any).applicationEndDate;
// //                     const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
// //                     return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
// //                 });
// //             } else if (activeCategory === 'SAVED') {
// //                 filtered = filtered.filter(c => {
// //                     const uniqueKey = c.cohortRunId || (c as any).timelineId || c.id;
// //                     return savedCourseIds.has(uniqueKey);
// //                 });
// //             }
// //         }

// //         // Duration Range Filter
// //         if (durationFilter !== 'ALL') {
// //             filtered = filtered.filter(c => {
// //                 const w = calculateDurationWeeks(c);
// //                 if (durationFilter === 'LESS_THAN_4') return w < 4;
// //                 if (durationFilter === '1_TO_3_MONTHS') return w >= 4 && w <= 12;
// //                 if (durationFilter === '3_PLUS_MONTHS') return w > 12;
// //                 return true;
// //             });
// //         }

// //         // Level Filter
// //         if (levelFilter !== 'ALL') {
// //             filtered = filtered.filter(c =>
// //                 String(c.level || 'beginner').toLowerCase() === levelFilter.toLowerCase()
// //             );
// //         }

// //         return filtered.sort((a, b) => {
// //             const aProgress = a.completedUnitsCount ? 1 : 0;
// //             const bProgress = b.completedUnitsCount ? 1 : 0;
// //             return bProgress - aProgress;
// //         });
// //     }, [enrichedCourses, searchQuery, activeCategory, durationFilter, levelFilter, savedCourseIds]);

// //     // 🚀 ISOLATED PER-CARD BOOKMARK TOGGLE HANDLER
// //     const handleToggleBookmark = async (e: React.MouseEvent, course: CoursePackage) => {
// //         e.stopPropagation();
// //         const currentUser = auth.currentUser;
// //         if (!currentUser?.uid) {
// //             toast.warning("Please sign in to bookmark courses.");
// //             return;
// //         }

// //         const uniqueKey = course.cohortRunId || (course as any).timelineId || course.id;

// //         setSavingCourseIds(prev => new Set(prev).add(uniqueKey));

// //         const isSaved = savedCourseIds.has(uniqueKey);
// //         const docId = `${currentUser.uid}_${uniqueKey}`;
// //         const bookmarkRef = doc(db, 'learnerBookmarks', docId);

// //         try {
// //             if (isSaved) {
// //                 await deleteDoc(bookmarkRef);
// //                 toast.info(`Removed "${course.title}" from saved courses.`);
// //             } else {
// //                 await setDoc(bookmarkRef, {
// //                     userId: currentUser.uid,
// //                     targetId: uniqueKey,
// //                     courseId: course.id,
// //                     cohortRunId: course.cohortRunId || null,
// //                     unitTitle: course.title,
// //                     createdAt: serverTimestamp()
// //                 });
// //                 toast.success(`Saved "${course.title}" to bookmarks!`);
// //             }
// //         } catch (err) {
// //             console.error('[CourseCatalogView] Error toggling bookmark:', err);
// //             toast.error("Failed to update saved course.");
// //         } finally {
// //             setSavingCourseIds(prev => {
// //                 const next = new Set(prev);
// //                 next.delete(uniqueKey);
// //                 return next;
// //             });
// //         }
// //     };

// //     return (
// //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

// //             {/* CONTINUE LEARNING BANNER */}
// //             {continueLearningCourse && continueLearningUnit && (
// //                 <div style={{
// //                     background: 'linear-gradient(135deg, var(--mlab-midnight) 0%, #064e3b 100%)',
// //                     borderRadius: '0px',
// //                     padding: '24px',
// //                     color: 'white',
// //                     display: 'flex',
// //                     alignItems: 'center',
// //                     justifyContent: 'space-between',
// //                     boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
// //                     borderLeft: '6px solid var(--mlab-green)'
// //                 }}>
// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
// //                         <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                             <PlayCircle size={32} color="var(--mlab-green)" />
// //                         </div>
// //                         <div>
// //                             <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: 'var(--font-heading)' }}>
// //                                 ⟳ Continue Active Lesson
// //                             </div>
// //                             <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                 {continueLearningCourse.title}
// //                             </h2>
// //                             <div style={{ fontSize: '0.85rem', color: '#bae6fd', fontWeight: 600 }}>
// //                                 {continueLearningUnit.title}
// //                             </div>
// //                         </div>
// //                     </div>
// //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
// //                         <div style={{ fontSize: '0.75rem', color: '#dcfce7', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                             <Clock size={14} /> ~{continueLearningUnit.estimatedMinutes || 15} min left
// //                         </div>
// //                         <Tooltip content="Jump straight into your current active lesson in the player." placement="left">
// //                             <button
// //                                 onClick={onContinueLearning}
// //                                 className="lfm-btn lfm-btn--green"
// //                                 style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '0px' }}
// //                             >
// //                                 RESUME NOW <ChevronRight size={16} />
// //                             </button>
// //                         </Tooltip>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* DASHBOARD SUMMARY WIDGETS */}
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
// //                 <Tooltip content="Agile bootcamp tracks featuring practical coding sprints and peer dialogue." placement="top">
// //                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #6366f1' }}>
// //                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <Zap size={14} /> Agile Sprint Track
// //                         </div>
// //                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                             SECAM CODETRIBE BOOTCAMP
// //                         </div>
// //                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>120 Notional Hours</div>
// //                     </div>
// //                 </Tooltip>

// //                 <Tooltip content="Formal SETA/QCTO occupational qualifications linked to registered SAQA logbooks." placement="top">
// //                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #16a34a' }}>
// //                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <Award size={14} /> QCTO Qualification
// //                         </div>
// //                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                             MICT SETA NQF 5 SYSTEMS DEV
// //                         </div>
// //                         <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Accredited Logbook Track</div>
// //                     </div>
// //                 </Tooltip>

// //                 <Tooltip content="Active intake batches scheduled across specific calendar timeline windows." placement="top">
// //                     <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #f59e0b' }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// //                             <div>
// //                                 <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <Layers size={14} /> Cohort Runs
// //                                 </div>
// //                                 <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                     ACTIVE & OPEN BATCHES
// //                                 </div>
// //                                 <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Enrollment & Intake Windows</div>
// //                             </div>
// //                             <span style={{ fontSize: '0.65rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>
// //                                 Scheduled
// //                             </span>
// //                         </div>
// //                     </div>
// //                 </Tooltip>

// //                 <Tooltip content="Interactive Spot-the-Bug and AI Oral Defense verification gates protecting lesson completion." placement="top">
// //                     <div style={{ background: 'var(--mlab-midnight)', border: '1px solid #0f172a', padding: '16px', borderTop: '3px solid #0ea5e9' }}>
// //                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <ShieldCheck size={14} /> AI Verification Sandbox
// //                         </div>
// //                         <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                             SPOT-THE-BUG & DEFENSE
// //                         </div>
// //                         <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Active Completion Gates</div>
// //                     </div>
// //                 </Tooltip>
// //             </div>

// //             {/* SEARCH AND FILTER BAR */}
// //             <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
// //                 <Tooltip content="Search course titles or tags." placement="top" style={{ flex: 1 }}>
// //                     <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', padding: '0 12px', width: '100%' }}>
// //                         <Search size={16} color="#64748b" />
// //                         <input
// //                             type="text"
// //                             placeholder="Search cohort batches by title or tags..."
// //                             value={searchQuery}
// //                             onChange={(e) => setSearchQuery(e.target.value)}
// //                             style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '12px', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}
// //                         />
// //                     </div>
// //                 </Tooltip>
// //                 {(activeCategory !== 'ALL' || durationFilter !== 'ALL' || levelFilter !== 'ALL' || searchQuery !== '') && (
// //                     <Tooltip content="Clear search and reset all active filter criteria." placement="top">
// //                         <button
// //                             onClick={() => {
// //                                 setActiveCategory('ALL');
// //                                 setDurationFilter('ALL');
// //                                 setLevelFilter('ALL');
// //                                 setSearchQuery('');
// //                             }}
// //                             className="lfm-btn lfm-btn--ghost"
// //                             style={{ borderRadius: '0px', padding: '10px 18px', fontSize: '0.8rem', color: '#ef4444' }}
// //                         >
// //                             RESET FILTERS
// //                         </button>
// //                     </Tooltip>
// //                 )}
// //             </div>

// //             {/* MAIN CATALOG GRID + SIDEBAR */}
// //             <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

// //                 {/* COURSE CARDS GRID */}
// //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
// //                     {filteredCourses.length === 0 ? (
// //                         <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #cbd5e1', padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
// //                             <Layers size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
// //                             <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                 No Courses Match Your Filter
// //                             </h3>
// //                             <p style={{ margin: 0, fontSize: '0.82rem' }}>Try switching categories or resetting your filter controls.</p>
// //                         </div>
// //                     ) : (
// //                         filteredCourses.map(course => {
// //                             const uniqueKey = course.cohortRunId || (course as any).timelineId || course.id;
// //                             const isSecam = course.framework === 'secam';
// //                             const totalUnits = course.totalUnitsCount || 0;
// //                             const completedUnits = course.completedUnitsCount || 0;
// //                             const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
// //                             const hasStarted = progressPct > 0 || (course as any).hasStarted;
// //                             const durationWeeks = calculateDurationWeeks(course);

// //                             const theme = getThemeStyles(course.themeColor, course.framework);
// //                             const accentColor = course.themeColor || theme.borderTopColor || '#0284c7';

// //                             const isSaved = savedCourseIds.has(uniqueKey);
// //                             const isSaving = savingCourseIds.has(uniqueKey);

// //                             return (
// //                                 <div
// //                                     key={uniqueKey}
// //                                     style={{
// //                                         background: 'white',
// //                                         border: '1px solid #cbd5e1',
// //                                         borderTop: `4px solid ${accentColor}`,
// //                                         display: 'flex',
// //                                         flexDirection: 'column',
// //                                         transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
// //                                         cursor: 'pointer',
// //                                         position: 'relative',
// //                                         overflow: 'hidden'
// //                                     }}
// //                                     onMouseEnter={(e) => {
// //                                         e.currentTarget.style.transform = 'translateY(-3px)';
// //                                         e.currentTarget.style.boxShadow = '0 12px 20px -4px rgba(0, 0, 0, 0.12)';
// //                                     }}
// //                                     onMouseLeave={(e) => {
// //                                         e.currentTarget.style.transform = 'none';
// //                                         e.currentTarget.style.boxShadow = 'none';
// //                                     }}
// //                                     onClick={() => onSelectCourse(course)}
// //                                 >
// //                                     {/* CARD TOP STATUS BAR */}
// //                                     <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
// //                                         <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
// //                                             <div style={{ width: '6px', height: '6px', background: '#16a34a', borderRadius: '50%' }} />
// //                                             Active Batch
// //                                         </span>

// //                                         <Tooltip content={isSaved ? "Remove from bookmarked courses." : "Bookmark this course for quick access."} placement="left">
// //                                             <button
// //                                                 type="button"
// //                                                 onClick={(e) => handleToggleBookmark(e, course)}
// //                                                 disabled={isSaving}
// //                                                 style={{
// //                                                     background: 'transparent',
// //                                                     border: 'none',
// //                                                     padding: '2px',
// //                                                     cursor: isSaving ? 'not-allowed' : 'pointer',
// //                                                     display: 'flex',
// //                                                     alignItems: 'center',
// //                                                     justifyContent: 'center',
// //                                                     opacity: isSaving ? 0.6 : 1
// //                                                 }}
// //                                             >
// //                                                 {isSaving ? (
// //                                                     <Loader2 size={18} className="lfm-spin" color={accentColor} />
// //                                                 ) : (
// //                                                     <Bookmark
// //                                                         size={18}
// //                                                         fill={isSaved ? accentColor : 'none'}
// //                                                         color={isSaved ? accentColor : '#94a3b8'}
// //                                                     />
// //                                                 )}
// //                                             </button>
// //                                         </Tooltip>
// //                                     </div>

// //                                     {/* ARTWORK & THEME-INHERITING DOT MATRIX CONTAINER */}
// //                                     <div style={{
// //                                         height: '145px',
// //                                         background: theme.gradient || 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         justifyContent: 'center',
// //                                         position: 'relative',
// //                                         overflow: 'hidden'
// //                                     }}>
// //                                         <div style={{
// //                                             position: 'absolute',
// //                                             inset: 0,
// //                                             opacity: 0.35,
// //                                             backgroundImage: `radial-gradient(${accentColor} 1.5px, transparent 1.5px)`,
// //                                             backgroundSize: '16px 16px'
// //                                         }} />

// //                                         <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(15, 23, 42, 0.45) 100%)' }} />

// //                                         <div style={{ position: 'relative', zIndex: 2, transform: 'scale(1.15)', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
// //                                             <CourseIllustrationGraphic
// //                                                 type={course.illustrationType || 'code'}
// //                                                 themeColor={accentColor}
// //                                                 framework={course.framework}
// //                                                 size={48}
// //                                             />
// //                                         </div>
// //                                     </div>

// //                                     {/* CARD BODY */}
// //                                     <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>

// //                                         <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
// //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: accentColor, background: theme.badgeBg || '#f0f9ff', border: `1px solid ${accentColor}40`, padding: '2px 8px', textTransform: 'uppercase' }}>
// //                                                 {isSecam ? 'SECAM Agile' : 'QCTO Accredited'}
// //                                             </span>
// //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                 <Clock size={10} /> ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'}
// //                                             </span>
// //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', textTransform: 'uppercase' }}>
// //                                                 {course.level || 'Beginner'}
// //                                             </span>
// //                                         </div>

// //                                         <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
// //                                             Blueprint: {isSecam ? 'CODETRIBE ACADEMY - REACTJS' : 'QCTO Standard Specification'}
// //                                         </div>

// //                                         <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', lineHeight: 1.25 }}>
// //                                             {course.title}
// //                                         </h3>

// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, marginBottom: '12px' }}>
// //                                             <Star size={14} fill="#f59e0b" /> 4.9 <span style={{ color: '#94a3b8', fontWeight: 500 }}>(0 enrolled)</span>
// //                                         </div>

// //                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
// //                                             {(course.tags || ['JAVASCRIPT', 'NODE.JS', 'HTML & CSS']).slice(0, 4).map(tag => (
// //                                                 <span key={tag} style={{ fontSize: '0.65rem', color: accentColor, background: '#f8fafc', border: `1px solid ${accentColor}30`, fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase' }}>
// //                                                     #{tag.replace(/\s+/g, '')}
// //                                                 </span>
// //                                             ))}
// //                                         </div>

// //                                         <div style={{ marginTop: 'auto' }}>
// //                                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-green)', marginBottom: '4px', textTransform: 'uppercase' }}>
// //                                                 <span>{completedUnits} OF {totalUnits} LESSONS</span>
// //                                                 <span>{progressPct}%</span>
// //                                             </div>
// //                                             <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden' }}>
// //                                                 <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--mlab-green)', transition: 'width 0.3s ease' }} />
// //                                             </div>
// //                                         </div>
// //                                     </div>

// //                                     {/* CARD FOOTER */}
// //                                     <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                         <div style={{ fontSize: '0.65rem', color: '#334155', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                             <Clock size={12} color="#64748b" />
// //                                             ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'} • {course.contentHours || 0}h content + {course.courseworkHours || 0}h projects
// //                                         </div>
// //                                         <Tooltip content={hasStarted ? "Resume learning where you left off." : "Open course overview and start lesson sequence."} placement="top">
// //                                             <button
// //                                                 className={`lfm-btn ${hasStarted ? 'lfm-btn--green' : 'lfm-btn--primary'}`}
// //                                                 style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '0px' }}
// //                                                 onClick={(e) => {
// //                                                     e.stopPropagation();
// //                                                     onSelectCourse(course);
// //                                                 }}
// //                                             >
// //                                                 <Play size={12} /> {hasStarted ? 'RESUME' : 'LAUNCH'}
// //                                             </button>
// //                                         </Tooltip>
// //                                     </div>
// //                                 </div>
// //                             );
// //                         })
// //                     )}
// //                 </div>

// //                 {/* RIGHT SIDEBAR (Categories & Filters) */}
// //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// //                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
// //                         <div style={{ background: 'var(--mlab-blue)', borderBottom: '3px solid var(--mlab-green)', color: 'white', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                             Curriculum Categories
// //                         </div>
// //                         <div style={{ display: 'flex', flexDirection: 'column' }}>
// //                             <Tooltip content="Show all active course batches across all frameworks." placement="left">
// //                                 <button
// //                                     onClick={() => setActiveCategory('ALL')}
// //                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'ALL' ? 'var(--mlab-light-blue)' : 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'ALL' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// //                                 >
// //                                     <BookOpen size={16} /> ALL COHORT BATCHES ({enrichedCourses.length})
// //                                 </button>
// //                             </Tooltip>

// //                             <Tooltip content="Filter specifically to SECAM Agile Bootcamp tracks." placement="left">
// //                                 <button
// //                                     onClick={() => setActiveCategory('SECAM')}
// //                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SECAM' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SECAM' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'SECAM' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// //                                 >
// //                                     <Zap size={16} /> SECAM BOOTCAMPS ({secamCount})
// //                                 </button>
// //                             </Tooltip>

// //                             <Tooltip content="Filter to QCTO / SETA occupational qualification courses." placement="left">
// //                                 <button
// //                                     onClick={() => setActiveCategory('QCTO')}
// //                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'QCTO' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'QCTO' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'QCTO' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// //                                 >
// //                                     <GraduationCap size={16} /> QCTO QUALIFICATIONS ({qctoCount})
// //                                 </button>
// //                             </Tooltip>

// //                             <Tooltip content="Show courses with open registration windows." placement="left">
// //                                 <button
// //                                     onClick={() => setActiveCategory('OPEN')}
// //                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'OPEN' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'OPEN' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'OPEN' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// //                                 >
// //                                     <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Send size={16} /> APPLICATIONS OPEN</span>
// //                                     <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', fontWeight: 800 }}>{openCount} OPEN</span>
// //                                 </button>
// //                             </Tooltip>

// //                             <Tooltip content="Filter to courses you have bookmarked." placement="left">
// //                                 <button
// //                                     onClick={() => setActiveCategory('SAVED')}
// //                                     style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SAVED' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SAVED' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'SAVED' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// //                                 >
// //                                     <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={16} /> SAVED COURSES</span>
// //                                     <span style={{ fontSize: '0.6rem', background: savedCount > 0 ? '#dcfce7' : '#f1f5f9', color: savedCount > 0 ? '#15803d' : '#64748b', padding: '2px 6px', fontWeight: 800 }}>{savedCount}</span>
// //                                 </button>
// //                             </Tooltip>
// //                         </div>
// //                     </div>

// //                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
// //                         <div style={{ background: 'var(--mlab-blue)', color: 'white', borderBottom: '3px solid var(--mlab-green)', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                             <span><Filter size={14} style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> Filter Controls</span>
// //                         </div>
// //                         <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
// //                             <div>
// //                                 <Tooltip content="Filter courses by estimated weeks or months to completion." placement="top">
// //                                     <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Duration Range</label>
// //                                 </Tooltip>
// //                                 <select
// //                                     value={durationFilter}
// //                                     onChange={(e) => setDurationFilter(e.target.value)}
// //                                     className="pfm-input"
// //                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
// //                                 >
// //                                     <option value="ALL">Any Duration</option>
// //                                     <option value="LESS_THAN_4">&lt; 4 Weeks</option>
// //                                     <option value="1_TO_3_MONTHS">1 - 3 Months (4-12 wks)</option>
// //                                     <option value="3_PLUS_MONTHS">3+ Months (&gt; 12 wks)</option>
// //                                 </select>
// //                             </div>
// //                             <div>
// //                                 <Tooltip content="Filter courses by target experience level." placement="top">
// //                                     <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Target Level</label>
// //                                 </Tooltip>
// //                                 <select
// //                                     value={levelFilter}
// //                                     onChange={(e) => setLevelFilter(e.target.value)}
// //                                     className="pfm-input"
// //                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
// //                                 >
// //                                     <option value="ALL">All Levels</option>
// //                                     <option value="BEGINNER">Beginner</option>
// //                                     <option value="INTERMEDIATE">Intermediate</option>
// //                                     <option value="ADVANCED">Advanced</option>
// //                                 </select>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div style={{ background: 'var(--mlab-blue)', borderLeft: '3px solid var(--mlab-green)', color: 'white', padding: '24px', textAlign: 'center', border: '1px solid var(--mlab-midnight)' }}>
// //                         <HelpCircle size={24} color="var(--mlab-green)" style={{ margin: '0 auto 12px' }} />
// //                         <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px' }}>
// //                             Need Help With a Lesson?
// //                         </div>
// //                         <div style={{ fontSize: '0.75rem', color: '#bae6fd', lineHeight: 1.5 }}>
// //                             Contact your assigned facilitator directly or use the AI Sandbox module embedded in your lessons for immediate debugging assistance.
// //                         </div>
// //                     </div>
// //                 </div>

// //             </div>
// //         </div>
// //     );
// // };


// // // // src/pages/LearnerPortal/LearnerContentHub/CourseCatalogView.tsx

// // // import React, { useState, useMemo, useEffect } from 'react';
// // // import {
// // //     Play, Clock, Star, Users, Bookmark, ChevronRight, Search, Filter,
// // //     Layers, Award, Zap, ShieldCheck, PlayCircle, HelpCircle, Send, Loader2,
// // //     GraduationCap
// // // } from 'lucide-react';
// // // import moment from 'moment';
// // // import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
// // // import { auth, db } from '../../../lib/firebase';
// // // import { useToast } from '../../../components/common/Toast/Toast';
// // // import {
// // //     CourseIllustrationGraphic,
// // //     getThemeStyles,
// // //     type CoursePackage,
// // //     type LearnerUnitProgress
// // // } from './types';

// // // interface CourseCatalogViewProps {
// // //     courses: CoursePackage[];
// // //     continueLearningCourse: CoursePackage | null;
// // //     continueLearningUnit: LearnerUnitProgress | null;
// // //     onSelectCourse: (course: CoursePackage) => void;
// // //     onContinueLearning: () => void;
// // // }

// // // // 🚀 HELPER: Robust Timeline Duration Calculator
// // // export const calculateDurationWeeks = (course: any): number => {
// // //     if (!course) return 1;

// // //     // 1. Extract dates from all possible Firestore field locations across legacy and new structures
// // //     const timeConfig = course.timeBoundConfig || course.checkpointMetadata?.timeBoundConfig || {};

// // //     const startStr = course.startDate ||
// // //         timeConfig.startDate ||
// // //         course.timelineStartDate ||
// // //         course.runStartDate ||
// // //         course.applicationStartDate ||
// // //         course.start;

// // //     const endStr = course.endDate ||
// // //         timeConfig.endDate ||
// // //         course.timelineEndDate ||
// // //         course.runEndDate ||
// // //         course.applicationEndDate ||
// // //         course.end;

// // //     // 2. If both dates exist, calculate the positive difference between end and start
// // //     if (startStr && endStr) {
// // //         const start = moment(startStr);
// // //         const end = moment(endStr);

// // //         if (start.isValid() && end.isValid() && end.isAfter(start)) {
// // //             const diffDays = Math.abs(end.diff(start, 'days'));
// // //             const weeks = Math.round(diffDays / 7);
// // //             return Math.max(1, weeks);
// // //         }
// // //     }

// // //     // 3. Fallback: Estimate weeks based on total course hours (~10 hours/week pace)
// // //     const totalHours = Number(course.estimatedTotalHours || course.totalHours || course.totalNotionalHours) ||
// // //         (Number(course.contentHours || 0) + Number(course.courseworkHours || 0));

// // //     if (totalHours > 0) {
// // //         return Math.max(1, Math.ceil(totalHours / 10));
// // //     }

// // //     return 1;
// // // };

// // // export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
// // //     courses,
// // //     continueLearningCourse,
// // //     continueLearningUnit,
// // //     onSelectCourse,
// // //     onContinueLearning
// // // }) => {
// // //     const toast = useToast();
// // //     const [searchQuery, setSearchQuery] = useState('');
// // //     const [activeCategory, setActiveCategory] = useState<string>('ALL');
// // //     const [durationFilter, setDurationFilter] = useState<string>('ALL');
// // //     const [levelFilter, setLevelFilter] = useState<string>('ALL');

// // //     // 🚀 PER-CARD BOOKMARK LOADING STATE
// // //     const [savingCourseIds, setSavingCourseIds] = useState<Set<string>>(new Set());

// // //     // 🚀 DIRECT REAL-TIME FIREBASE LISTENER FOR COHORT RUNS / TIMELINES
// // //     const [liveCohortRunsMap, setLiveCohortRunsMap] = useState<Map<string, any>>(new Map());

// // //     // 🚀 REAL-TIME SAVED COURSES / BOOKMARKS LISTENER
// // //     const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());

// // //     useEffect(() => {
// // //         const q = collection(db, 'cohort_runs');
// // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // //             const map = new Map<string, any>();
// // //             snapshot.docs.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 const runData = { id: docSnap.id, ...data };
// // //                 map.set(docSnap.id, runData);
// // //                 if (data.containerId) {
// // //                     map.set(`container_${data.containerId}`, runData);
// // //                 }
// // //             });
// // //             setLiveCohortRunsMap(map);
// // //         }, (err) => {
// // //             console.warn('[CourseCatalogView] cohort_runs listener notice:', err);
// // //         });

// // //         return () => unsubscribe();
// // //     }, []);

// // //     // 🚀 LISTEN TO SAVED BOOKMARKS USING EXPLICIT INSTANCE IDs
// // //     useEffect(() => {
// // //         const currentUser = auth.currentUser;
// // //         if (!currentUser?.uid) return;

// // //         const q = query(
// // //             collection(db, 'learnerBookmarks'),
// // //             where('userId', '==', currentUser.uid)
// // //         );

// // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // //             const ids = new Set<string>();
// // //             const prefix = `${currentUser.uid}_`;

// // //             snapshot.docs.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 if (data.targetId) ids.add(data.targetId);
// // //                 if (data.cohortRunId) ids.add(data.cohortRunId);

// // //                 // Extract instance ID directly from document ID format: `${userId}_${uniqueKey}`
// // //                 if (docSnap.id.startsWith(prefix)) {
// // //                     ids.add(docSnap.id.substring(prefix.length));
// // //                 }
// // //             });
// // //             setSavedCourseIds(ids);
// // //         }, (err) => {
// // //             console.warn('[CourseCatalogView] Bookmarks listener notice:', err);
// // //         });

// // //         return () => unsubscribe();
// // //     }, []);

// // //     // 🚀 ENRICH COURSES WITH DIRECT FIREBASE TIMELINE DATA
// // //     const enrichedCourses = useMemo(() => {
// // //         return courses.map(course => {
// // //             const runId = course.cohortRunId || (course as any).timelineId || (course as any).placementId || course.id;
// // //             const liveRun = liveCohortRunsMap.get(runId) || liveCohortRunsMap.get(`container_${course.id}`);

// // //             if (!liveRun) return course;

// // //             const timeConfig = liveRun.timeBoundConfig || {};
// // //             const startDate = timeConfig.startDate || liveRun.startDate || liveRun.applicationStartDate || course.startDate;
// // //             const endDate = timeConfig.endDate || liveRun.endDate || liveRun.applicationEndDate || course.endDate;

// // //             return {
// // //                 ...course,
// // //                 startDate,
// // //                 endDate,
// // //                 themeColor: liveRun.themeColor || course.themeColor,
// // //                 illustrationType: liveRun.illustrationType || course.illustrationType,
// // //                 timeBoundConfig: timeConfig,
// // //                 pacingModel: timeConfig.isTimeBound === false ? 'individual_self_paced' : (startDate ? 'cohort_scheduled' : 'individual_self_paced')
// // //             };
// // //         });
// // //     }, [courses, liveCohortRunsMap]);

// // //     // 🚀 CATEGORY COUNTS
// // //     const secamCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'secam').length, [enrichedCourses]);
// // //     const qctoCount = useMemo(() => enrichedCourses.filter(c => c.framework === 'qcto').length, [enrichedCourses]);
// // //     const openCount = useMemo(() => enrichedCourses.filter(c => {
// // //         const status = String(c.runStatus || c.status || '').toLowerCase();
// // //         const appEnd = (c as any).applicationEndDate;
// // //         const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
// // //         return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
// // //     }).length, [enrichedCourses]);

// // //     const savedCount = useMemo(() => enrichedCourses.filter(c => {
// // //         const uniqueKey = c.cohortRunId || (c as any).timelineId || c.id;
// // //         return savedCourseIds.has(uniqueKey);
// // //     }).length, [enrichedCourses, savedCourseIds]);

// // //     // 🚀 FILTER & SORT COURSES
// // //     const filteredCourses = useMemo(() => {
// // //         let filtered = enrichedCourses;

// // //         // Search Filter
// // //         if (searchQuery.trim()) {
// // //             const lowerQ = searchQuery.toLowerCase();
// // //             filtered = filtered.filter(c =>
// // //                 c.title.toLowerCase().includes(lowerQ) ||
// // //                 (c.tags || []).some(t => t.toLowerCase().includes(lowerQ))
// // //             );
// // //         }

// // //         // Category Filter
// // //         if (activeCategory !== 'ALL') {
// // //             if (activeCategory === 'SECAM') {
// // //                 filtered = filtered.filter(c => c.framework === 'secam');
// // //             } else if (activeCategory === 'QCTO') {
// // //                 filtered = filtered.filter(c => c.framework === 'qcto');
// // //             } else if (activeCategory === 'OPEN') {
// // //                 filtered = filtered.filter(c => {
// // //                     const status = String(c.runStatus || c.status || '').toLowerCase();
// // //                     const appEnd = (c as any).applicationEndDate;
// // //                     const isNotExpired = !appEnd || moment().isBefore(moment(appEnd));
// // //                     return (status === 'active' || status === 'draft' || status === '') && isNotExpired;
// // //                 });
// // //             } else if (activeCategory === 'SAVED') {
// // //                 filtered = filtered.filter(c => {
// // //                     const uniqueKey = c.cohortRunId || (c as any).timelineId || c.id;
// // //                     return savedCourseIds.has(uniqueKey);
// // //                 });
// // //             }
// // //         }

// // //         // Duration Range Filter
// // //         if (durationFilter !== 'ALL') {
// // //             filtered = filtered.filter(c => {
// // //                 const w = calculateDurationWeeks(c);
// // //                 if (durationFilter === 'LESS_THAN_4') return w < 4;
// // //                 if (durationFilter === '1_TO_3_MONTHS') return w >= 4 && w <= 12;
// // //                 if (durationFilter === '3_PLUS_MONTHS') return w > 12;
// // //                 return true;
// // //             });
// // //         }

// // //         // Level Filter
// // //         if (levelFilter !== 'ALL') {
// // //             filtered = filtered.filter(c =>
// // //                 String(c.level || 'beginner').toLowerCase() === levelFilter.toLowerCase()
// // //             );
// // //         }

// // //         return filtered.sort((a, b) => {
// // //             const aProgress = a.completedUnitsCount ? 1 : 0;
// // //             const bProgress = b.completedUnitsCount ? 1 : 0;
// // //             return bProgress - aProgress;
// // //         });
// // //     }, [enrichedCourses, searchQuery, activeCategory, durationFilter, levelFilter, savedCourseIds]);

// // //     // 🚀 ISOLATED PER-CARD BOOKMARK TOGGLE HANDLER
// // //     const handleToggleBookmark = async (e: React.MouseEvent, course: CoursePackage) => {
// // //         e.stopPropagation();
// // //         const currentUser = auth.currentUser;
// // //         if (!currentUser?.uid) {
// // //             toast.warning("Please sign in to bookmark courses.");
// // //             return;
// // //         }

// // //         // Strictly use the unique instance key for this specific card
// // //         const uniqueKey = course.cohortRunId || (course as any).timelineId || course.id;

// // //         setSavingCourseIds(prev => new Set(prev).add(uniqueKey));

// // //         const isSaved = savedCourseIds.has(uniqueKey);
// // //         const docId = `${currentUser.uid}_${uniqueKey}`;
// // //         const bookmarkRef = doc(db, 'learnerBookmarks', docId);

// // //         try {
// // //             if (isSaved) {
// // //                 await deleteDoc(bookmarkRef);
// // //                 toast.info(`Removed "${course.title}" from saved courses.`);
// // //             } else {
// // //                 await setDoc(bookmarkRef, {
// // //                     userId: currentUser.uid,
// // //                     targetId: uniqueKey,
// // //                     courseId: course.id,
// // //                     cohortRunId: course.cohortRunId || null,
// // //                     unitTitle: course.title,
// // //                     createdAt: serverTimestamp()
// // //                 });
// // //                 toast.success(`Saved "${course.title}" to bookmarks!`);
// // //             }
// // //         } catch (err) {
// // //             console.error('[CourseCatalogView] Error toggling bookmark:', err);
// // //             toast.error("Failed to update saved course.");
// // //         } finally {
// // //             setSavingCourseIds(prev => {
// // //                 const next = new Set(prev);
// // //                 next.delete(uniqueKey);
// // //                 return next;
// // //             });
// // //         }
// // //     };

// // //     return (
// // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

// // //             {/* CONTINUE LEARNING BANNER */}
// // //             {continueLearningCourse && continueLearningUnit && (
// // //                 <div style={{
// // //                     background: 'linear-gradient(135deg, var(--mlab-midnight) 0%, #064e3b 100%)',
// // //                     borderRadius: '0px',
// // //                     padding: '24px',
// // //                     color: 'white',
// // //                     display: 'flex',
// // //                     alignItems: 'center',
// // //                     justifyContent: 'space-between',
// // //                     boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
// // //                     borderLeft: '6px solid var(--mlab-green)'
// // //                 }}>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
// // //                         <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                             <PlayCircle size={32} color="var(--mlab-green)" />
// // //                         </div>
// // //                         <div>
// // //                             <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: 'var(--font-heading)' }}>
// // //                                 ⟳ Continue Active Lesson
// // //                             </div>
// // //                             <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                                 {continueLearningCourse.title}
// // //                             </h2>
// // //                             <div style={{ fontSize: '0.85rem', color: '#bae6fd', fontWeight: 600 }}>
// // //                                 {continueLearningUnit.title}
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
// // //                         <div style={{ fontSize: '0.75rem', color: '#dcfce7', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                             <Clock size={14} /> ~{continueLearningUnit.estimatedMinutes || 15} min left
// // //                         </div>
// // //                         <button
// // //                             onClick={onContinueLearning}
// // //                             className="lfm-btn lfm-btn--green"
// // //                             style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '0px' }}
// // //                         >
// // //                             RESUME NOW <ChevronRight size={16} />
// // //                         </button>
// // //                     </div>
// // //                 </div>
// // //             )}

// // //             {/* DASHBOARD SUMMARY WIDGETS */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
// // //                 <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #6366f1' }}>
// // //                     <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <Zap size={14} /> Agile Sprint Track
// // //                     </div>
// // //                     <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                         SECAM CODETRIBE BOOTCAMP
// // //                     </div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>120 Notional Hours</div>
// // //                 </div>

// // //                 <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #16a34a' }}>
// // //                     <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <Award size={14} /> QCTO Qualification
// // //                     </div>
// // //                     <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                         MICT SETA NQF 5 SYSTEMS DEV
// // //                     </div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Accredited Logbook Track</div>
// // //                 </div>

// // //                 <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '16px', borderTop: '3px solid #f59e0b' }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// // //                         <div>
// // //                             <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                 <Layers size={14} /> Cohort Runs
// // //                             </div>
// // //                             <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                                 ACTIVE & OPEN BATCHES
// // //                             </div>
// // //                             <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Enrollment & Intake Windows</div>
// // //                         </div>
// // //                         <span style={{ fontSize: '0.65rem', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '2px 6px', fontWeight: 800, textTransform: 'uppercase' }}>
// // //                             Scheduled
// // //                         </span>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'var(--mlab-midnight)', border: '1px solid #0f172a', padding: '16px', borderTop: '3px solid #0ea5e9' }}>
// // //                     <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <ShieldCheck size={14} /> AI Verification Sandbox
// // //                     </div>
// // //                     <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                         SPOT-THE-BUG & DEFENSE
// // //                     </div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Active Completion Gates</div>
// // //                 </div>
// // //             </div>

// // //             {/* SEARCH AND FILTER BAR */}
// // //             <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
// // //                 <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', padding: '0 12px' }}>
// // //                     <Search size={16} color="#64748b" />
// // //                     <input
// // //                         type="text"
// // //                         placeholder="Search cohort batches by title or tags..."
// // //                         value={searchQuery}
// // //                         onChange={(e) => setSearchQuery(e.target.value)}
// // //                         style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '12px', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}
// // //                     />
// // //                 </div>
// // //                 {(activeCategory !== 'ALL' || durationFilter !== 'ALL' || levelFilter !== 'ALL' || searchQuery !== '') && (
// // //                     <button
// // //                         onClick={() => {
// // //                             setActiveCategory('ALL');
// // //                             setDurationFilter('ALL');
// // //                             setLevelFilter('ALL');
// // //                             setSearchQuery('');
// // //                         }}
// // //                         className="lfm-btn lfm-btn--ghost"
// // //                         style={{ borderRadius: '0px', padding: '10px 18px', fontSize: '0.8rem', color: '#ef4444' }}
// // //                     >
// // //                         RESET FILTERS
// // //                     </button>
// // //                 )}
// // //             </div>

// // //             {/* MAIN CATALOG GRID + SIDEBAR */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

// // //                 {/* COURSE CARDS GRID */}
// // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
// // //                     {filteredCourses.length === 0 ? (
// // //                         <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #cbd5e1', padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
// // //                             <Layers size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
// // //                             <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                                 No Courses Match Your Filter
// // //                             </h3>
// // //                             <p style={{ margin: 0, fontSize: '0.82rem' }}>Try switching categories or resetting your filter controls.</p>
// // //                         </div>
// // //                     ) : (
// // //                         filteredCourses.map(course => {
// // //                             const uniqueKey = course.cohortRunId || (course as any).timelineId || course.id;
// // //                             const isSecam = course.framework === 'secam';
// // //                             const totalUnits = course.totalUnitsCount || 0;
// // //                             const completedUnits = course.completedUnitsCount || 0;
// // //                             const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
// // //                             const hasStarted = progressPct > 0 || (course as any).hasStarted;
// // //                             const durationWeeks = calculateDurationWeeks(course);

// // //                             const theme = getThemeStyles(course.themeColor, course.framework);
// // //                             const accentColor = course.themeColor || theme.borderTopColor || '#0284c7';

// // //                             // Check bookmark state strictly for this card's unique key
// // //                             const isSaved = savedCourseIds.has(uniqueKey);
// // //                             const isSaving = savingCourseIds.has(uniqueKey);

// // //                             return (
// // //                                 <div
// // //                                     key={uniqueKey}
// // //                                     style={{
// // //                                         background: 'white',
// // //                                         border: '1px solid #cbd5e1',
// // //                                         borderTop: `4px solid ${accentColor}`,
// // //                                         display: 'flex',
// // //                                         flexDirection: 'column',
// // //                                         transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
// // //                                         cursor: 'pointer',
// // //                                         position: 'relative',
// // //                                         overflow: 'hidden'
// // //                                     }}
// // //                                     onMouseEnter={(e) => {
// // //                                         e.currentTarget.style.transform = 'translateY(-3px)';
// // //                                         e.currentTarget.style.boxShadow = '0 12px 20px -4px rgba(0, 0, 0, 0.12)';
// // //                                     }}
// // //                                     onMouseLeave={(e) => {
// // //                                         e.currentTarget.style.transform = 'none';
// // //                                         e.currentTarget.style.boxShadow = 'none';
// // //                                     }}
// // //                                     onClick={() => onSelectCourse(course)}
// // //                                 >
// // //                                     {/* CARD TOP STATUS BAR */}
// // //                                     <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
// // //                                         <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
// // //                                             <div style={{ width: '6px', height: '6px', background: '#16a34a', borderRadius: '50%' }} />
// // //                                             Active Batch
// // //                                         </span>

// // //                                         {/* 🚀 ISOLATED CARD BOOKMARK BUTTON WITH SPINNER */}
// // //                                         <button
// // //                                             type="button"
// // //                                             onClick={(e) => handleToggleBookmark(e, course)}
// // //                                             disabled={isSaving}
// // //                                             style={{
// // //                                                 background: 'transparent',
// // //                                                 border: 'none',
// // //                                                 padding: '2px',
// // //                                                 cursor: isSaving ? 'not-allowed' : 'pointer',
// // //                                                 display: 'flex',
// // //                                                 alignItems: 'center',
// // //                                                 justifyContent: 'center',
// // //                                                 opacity: isSaving ? 0.6 : 1
// // //                                             }}
// // //                                             title={isSaved ? 'Remove from Saved Courses' : 'Save Course'}
// // //                                         >
// // //                                             {isSaving ? (
// // //                                                 <Loader2 size={18} className="lfm-spin" color={accentColor} />
// // //                                             ) : (
// // //                                                 <Bookmark
// // //                                                     size={18}
// // //                                                     fill={isSaved ? accentColor : 'none'}
// // //                                                     color={isSaved ? accentColor : '#94a3b8'}
// // //                                                 />
// // //                                             )}
// // //                                         </button>
// // //                                     </div>

// // //                                     {/* ARTWORK & THEME-INHERITING DOT MATRIX CONTAINER */}
// // //                                     <div style={{
// // //                                         height: '145px',
// // //                                         background: theme.gradient || 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
// // //                                         display: 'flex',
// // //                                         alignItems: 'center',
// // //                                         justifyContent: 'center',
// // //                                         position: 'relative',
// // //                                         overflow: 'hidden'
// // //                                     }}>
// // //                                         <div style={{
// // //                                             position: 'absolute',
// // //                                             inset: 0,
// // //                                             opacity: 0.35,
// // //                                             backgroundImage: `radial-gradient(${accentColor} 1.5px, transparent 1.5px)`,
// // //                                             backgroundSize: '16px 16px'
// // //                                         }} />

// // //                                         <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(15, 23, 42, 0.45) 100%)' }} />

// // //                                         <div style={{ position: 'relative', zIndex: 2, transform: 'scale(1.15)', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
// // //                                             <CourseIllustrationGraphic
// // //                                                 type={course.illustrationType || 'code'}
// // //                                                 themeColor={accentColor}
// // //                                                 framework={course.framework}
// // //                                                 size={48}
// // //                                             />
// // //                                         </div>
// // //                                     </div>

// // //                                     {/* CARD BODY */}
// // //                                     <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>

// // //                                         <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
// // //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: accentColor, background: theme.badgeBg || '#f0f9ff', border: `1px solid ${accentColor}40`, padding: '2px 8px', textTransform: 'uppercase' }}>
// // //                                                 {isSecam ? 'SECAM Agile' : 'QCTO Accredited'}
// // //                                             </span>
// // //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <Clock size={10} /> ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'}
// // //                                             </span>
// // //                                             <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', textTransform: 'uppercase' }}>
// // //                                                 {course.level || 'Beginner'}
// // //                                             </span>
// // //                                         </div>

// // //                                         <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
// // //                                             Blueprint: {isSecam ? 'CODETRIBE ACADEMY - REACTJS' : 'QCTO Standard Specification'}
// // //                                         </div>

// // //                                         <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', lineHeight: 1.25 }}>
// // //                                             {course.title}
// // //                                         </h3>

// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, marginBottom: '12px' }}>
// // //                                             <Star size={14} fill="#f59e0b" /> 4.9 <span style={{ color: '#94a3b8', fontWeight: 500 }}>(0 enrolled)</span>
// // //                                         </div>

// // //                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
// // //                                             {(course.tags || ['JAVASCRIPT', 'NODE.JS', 'HTML & CSS']).slice(0, 4).map(tag => (
// // //                                                 <span key={tag} style={{ fontSize: '0.65rem', color: accentColor, background: '#f8fafc', border: `1px solid ${accentColor}30`, fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase' }}>
// // //                                                     #{tag.replace(/\s+/g, '')}
// // //                                                 </span>
// // //                                             ))}
// // //                                         </div>

// // //                                         <div style={{ marginTop: 'auto' }}>
// // //                                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 800, color: 'var(--mlab-green)', marginBottom: '4px', textTransform: 'uppercase' }}>
// // //                                                 <span>{completedUnits} OF {totalUnits} LESSONS</span>
// // //                                                 <span>{progressPct}%</span>
// // //                                             </div>
// // //                                             <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '0px', overflow: 'hidden' }}>
// // //                                                 <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--mlab-green)', transition: 'width 0.3s ease' }} />
// // //                                             </div>
// // //                                         </div>
// // //                                     </div>

// // //                                     {/* CARD FOOTER */}
// // //                                     <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                         <div style={{ fontSize: '0.65rem', color: '#334155', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                             <Clock size={12} color="#64748b" />
// // //                                             ~{durationWeeks} {durationWeeks === 1 ? 'Week' : 'Weeks'} • {course.contentHours || 0}h content + {course.courseworkHours || 0}h projects
// // //                                         </div>
// // //                                         <button
// // //                                             className={`lfm-btn ${hasStarted ? 'lfm-btn--green' : 'lfm-btn--primary'}`}
// // //                                             style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '0px' }}
// // //                                             onClick={(e) => {
// // //                                                 e.stopPropagation();
// // //                                                 onSelectCourse(course);
// // //                                             }}
// // //                                         >
// // //                                             <Play size={12} /> {hasStarted ? 'RESUME' : 'LAUNCH'}
// // //                                         </button>
// // //                                     </div>
// // //                                 </div>
// // //                             );
// // //                         })
// // //                     )}
// // //                 </div>

// // //                 {/* RIGHT SIDEBAR (Fully Functional Categories & Filters) */}
// // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // //                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
// // //                         <div style={{ background: 'var(--mlab-blue)', borderBottom: '3px solid var(--mlab-green)', color: 'white', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                             Curriculum Categories
// // //                         </div>
// // //                         <div style={{ display: 'flex', flexDirection: 'column' }}>
// // //                             <button
// // //                                 onClick={() => setActiveCategory('ALL')}
// // //                                 style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'ALL' ? 'var(--mlab-light-blue)' : 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'ALL' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// // //                             >
// // //                                 <BookOpen size={16} /> ALL COHORT BATCHES ({enrichedCourses.length})
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveCategory('SECAM')}
// // //                                 style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SECAM' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SECAM' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'SECAM' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// // //                             >
// // //                                 <Zap size={16} /> SECAM BOOTCAMPS ({secamCount})
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveCategory('QCTO')}
// // //                                 style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'QCTO' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'QCTO' ? 'var(--mlab-blue)' : 'var(--mlab-midnight)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: activeCategory === 'QCTO' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// // //                             >
// // //                                 <GraduationCap size={16} /> QCTO QUALIFICATIONS ({qctoCount})
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveCategory('OPEN')}
// // //                                 style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'OPEN' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'OPEN' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'OPEN' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// // //                             >
// // //                                 <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Send size={16} /> APPLICATIONS OPEN</span>
// // //                                 <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', fontWeight: 800 }}>{openCount} OPEN</span>
// // //                             </button>
// // //                             <button
// // //                                 onClick={() => setActiveCategory('SAVED')}
// // //                                 style={{ padding: '12px 16px', border: 'none', background: activeCategory === 'SAVED' ? 'var(--mlab-light-blue)' : 'transparent', color: activeCategory === 'SAVED' ? 'var(--mlab-blue)' : '#64748b', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: activeCategory === 'SAVED' ? '4px solid var(--mlab-blue)' : '4px solid transparent' }}
// // //                             >
// // //                                 <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={16} /> SAVED COURSES</span>
// // //                                 <span style={{ fontSize: '0.6rem', background: savedCount > 0 ? '#dcfce7' : '#f1f5f9', color: savedCount > 0 ? '#15803d' : '#64748b', padding: '2px 6px', fontWeight: 800 }}>{savedCount}</span>
// // //                             </button>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ border: '1px solid #cbd5e1', background: 'white' }}>
// // //                         <div style={{ background: 'var(--mlab-blue)', color: 'white', borderBottom: '3px solid var(--mlab-green)', padding: '12px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                             <span><Filter size={14} style={{ display: 'inline', marginRight: '6px', marginBottom: '-2px' }} /> Filter Controls</span>
// // //                         </div>
// // //                         <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // //                             <div>
// // //                                 <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Duration Range</label>
// // //                                 <select
// // //                                     value={durationFilter}
// // //                                     onChange={(e) => setDurationFilter(e.target.value)}
// // //                                     className="pfm-input"
// // //                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
// // //                                 >
// // //                                     <option value="ALL">Any Duration</option>
// // //                                     <option value="LESS_THAN_4">&lt; 4 Weeks</option>
// // //                                     <option value="1_TO_3_MONTHS">1 - 3 Months (4-12 wks)</option>
// // //                                     <option value="3_PLUS_MONTHS">3+ Months (&gt; 12 wks)</option>
// // //                                 </select>
// // //                             </div>
// // //                             <div>
// // //                                 <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Target Level</label>
// // //                                 <select
// // //                                     value={levelFilter}
// // //                                     onChange={(e) => setLevelFilter(e.target.value)}
// // //                                     className="pfm-input"
// // //                                     style={{ width: '100%', padding: '8px', fontSize: '0.8rem', borderRadius: '0px' }}
// // //                                 >
// // //                                     <option value="ALL">All Levels</option>
// // //                                     <option value="BEGINNER">Beginner</option>
// // //                                     <option value="INTERMEDIATE">Intermediate</option>
// // //                                     <option value="ADVANCED">Advanced</option>
// // //                                 </select>
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ background: 'var(--mlab-blue)', borderLeft: '3px solid var(--mlab-green)', color: 'white', padding: '24px', textAlign: 'center', border: '1px solid var(--mlab-midnight)' }}>
// // //                         <HelpCircle size={24} color="var(--mlab-green)" style={{ margin: '0 auto 12px' }} />
// // //                         <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '8px' }}>
// // //                             Need Help With a Lesson?
// // //                         </div>
// // //                         <div style={{ fontSize: '0.75rem', color: '#bae6fd', lineHeight: 1.5 }}>
// // //                             Contact your assigned facilitator directly or use the AI Sandbox module embedded in your lessons for immediate debugging assistance.
// // //                         </div>
// // //                     </div>
// // //                 </div>

// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // function BookOpen(props: any) {
// // //     return (
// // //         <svg
// // //             {...props}
// // //             xmlns="http://www.w3.org/2000/svg"
// // //             width="24"
// // //             height="24"
// // //             viewBox="0 0 24 24"
// // //             fill="none"
// // //             stroke="currentColor"
// // //             strokeWidth="2"
// // //             strokeLinecap="round"
// // //             strokeLinejoin="round"
// // //         >
// // //             <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
// // //             <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
// // //         </svg>
// // //     );
// // // }




// // // // // src/pages/LearnerPortal/LearnerContentHub/CourseCatalogView.tsx

// // // // import React, { useState, useMemo, useEffect, useRef } from 'react';
// // // // import {
// // // //     Search, Filter, Play, Clock, ChevronRight, Zap, GraduationCap,
// // // //     Bookmark, Star, Users, BookOpen, SlidersHorizontal, Flame,
// // // //     HelpCircle, Calendar, Send, Lock, CheckCircle
// // // // } from 'lucide-react';
// // // // import {
// // // //     CourseIllustrationGraphic, ProgressBar, getThemeStyles,
// // // //     type CoursePackage,
// // // //     type LearnerUnitProgress,
// // // //     type CohortRunStatus
// // // // } from './types';

// // // // interface CourseCatalogViewProps {
// // // //     courses: CoursePackage[];
// // // //     continueLearningCourse: CoursePackage | null;
// // // //     continueLearningUnit: LearnerUnitProgress | null;
// // // //     onSelectCourse: (course: CoursePackage) => void;
// // // //     onContinueLearning: () => void;
// // // // }

// // // // const getCourseInstanceId = (c?: CoursePackage | null) => {
// // // //     if (!c) return '';
// // // //     return c.cohortRunId || (c as any).timelineId || (c as any).placementId || c.id;
// // // // };

// // // // export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
// // // //     courses = [],
// // // //     continueLearningCourse,
// // // //     continueLearningUnit,
// // // //     onSelectCourse,
// // // //     onContinueLearning
// // // // }) => {
// // // //     const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'secam' | 'qcto' | 'applications' | 'bookmarked'>('all');
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [selectedLevel, setSelectedLevel] = useState<string>('all');
// // // //     const [durationFilter, setDurationFilter] = useState<'any' | 'short' | 'long'>('any');
// // // //     const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

// // // //     const [isSearchVisible, setIsSearchVisible] = useState(true);
// // // //     const scrollContainerRef = useRef<HTMLDivElement>(null);

// // // //     useEffect(() => {
// // // //         const container = scrollContainerRef.current;
// // // //         if (!container) return;
// // // //         let lastScrollTop = 0;

// // // //         const handleScroll = () => {
// // // //             const st = container.scrollTop;
// // // //             if (st > lastScrollTop && st > 50) {
// // // //                 setIsSearchVisible(false);
// // // //             } else {
// // // //                 setIsSearchVisible(true);
// // // //             }
// // // //             lastScrollTop = st <= 0 ? 0 : st;
// // // //         };

// // // //         container.addEventListener('scroll', handleScroll);
// // // //         return () => container.removeEventListener('scroll', handleScroll);
// // // //     }, []);

// // // //     const filteredCourses = useMemo(() => {
// // // //         return courses.filter(course => {
// // // //             const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //                 ((course as any).parentCourseTitle && (course as any).parentCourseTitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
// // // //                 course.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //                 course.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

// // // //             const matchesTab = activeTabFilter === 'all' ||
// // // //                 (activeTabFilter === 'secam' && course.framework === 'secam') ||
// // // //                 (activeTabFilter === 'qcto' && course.framework === 'qcto') ||
// // // //                 (activeTabFilter === 'applications' && (course.runStatus === 'open_for_applications' || course.runStatus === 'upcoming')) ||
// // // //                 (activeTabFilter === 'bookmarked' && course.isBookmarked);

// // // //             const matchesLevel = selectedLevel === 'all' || course.level.toLowerCase() === selectedLevel.toLowerCase();

// // // //             const matchesDuration = durationFilter === 'any' ||
// // // //                 (durationFilter === 'short' && course.estimatedTotalHours < 50) ||
// // // //                 (durationFilter === 'long' && course.estimatedTotalHours >= 100);

// // // //             return matchesSearch && matchesTab && matchesLevel && matchesDuration;
// // // //         });
// // // //     }, [courses, searchTerm, activeTabFilter, selectedLevel, durationFilter]);

// // // //     const renderStatusBadge = (status?: CohortRunStatus, statusLabel?: string) => {
// // // //         switch (status) {
// // // //             case 'active':
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#dcfce7', color: '#15803d', border: '1px solid #15803d', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
// // // //                         <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#15803d' }} /> ACTIVE BATCH
// // // //                     </span>
// // // //                 );
// // // //             case 'open_for_applications':
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#e0f2fe', color: '#0369a1', border: '1px solid #0284c7', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
// // // //                         <Send size={11} /> {statusLabel || 'APPLY NOW'}
// // // //                     </span>
// // // //                 );
// // // //             case 'applications_closed':
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
// // // //                         <Lock size={11} /> {statusLabel || 'APPLICATIONS CLOSED'}
// // // //                     </span>
// // // //                 );
// // // //             case 'upcoming':
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #c4b5fd', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
// // // //                         <Calendar size={11} /> {statusLabel || 'COMING SOON'}
// // // //                     </span>
// // // //                 );
// // // //             case 'ended':
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontFamily: 'var(--font-heading)', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
// // // //                         <CheckCircle size={11} /> {statusLabel || 'ENDED'}
// // // //                     </span>
// // // //                 );
// // // //             default:
// // // //                 return (
// // // //                     <span style={{ fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', textTransform: 'uppercase', background: '#ffffff', color: '#0f172a', border: '1px solid #0f172a', fontFamily: 'var(--font-heading)', whiteSpace: 'nowrap' }}>
// // // //                         PUBLISHED
// // // //                     </span>
// // // //                 );
// // // //         }
// // // //     };

// // // //     return (
// // // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }} className="animate-fade-in">

// // // //             {/* CONTINUE LEARNING HERO BANNER */}
// // // //             {continueLearningCourse && continueLearningUnit && (() => {
// // // //                 const heroTheme = getThemeStyles(continueLearningCourse.themeColor, continueLearningCourse.framework);

// // // //                 return (
// // // //                     <div
// // // //                         onClick={onContinueLearning}
// // // //                         style={{
// // // //                             background: 'var(--mlab-blue)',
// // // //                             border: '2px solid var(--mlab-blue)',
// // // //                             borderLeft: '6px solid var(--mlab-green)',
// // // //                             display: 'flex',
// // // //                             alignItems: 'stretch',
// // // //                             overflow: 'hidden',
// // // //                             cursor: 'pointer',
// // // //                             borderRadius: '0px'
// // // //                         }}
// // // //                         className="mlab-card-hover"
// // // //                     >
// // // //                         <div style={{
// // // //                             width: '150px',
// // // //                             flexShrink: 0,
// // // //                             background: heroTheme.gradient,
// // // //                             display: 'flex',
// // // //                             alignItems: 'center',
// // // //                             justifyContent: 'center',
// // // //                             position: 'relative'
// // // //                         }}>
// // // //                             <CourseIllustrationGraphic
// // // //                                 type={continueLearningCourse.illustrationType}
// // // //                                 themeColor={continueLearningCourse.themeColor}
// // // //                                 framework={continueLearningCourse.framework}
// // // //                                 size={42}
// // // //                             />
// // // //                             <div style={{
// // // //                                 position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
// // // //                                 background: 'rgba(7,63,78,0.25)'
// // // //                             }}>
// // // //                                 <div style={{ width: '40px', height: '40px', borderRadius: '0px', background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // //                                     <Play size={18} fill="var(--mlab-blue)" color="var(--mlab-blue)" style={{ marginLeft: '2px' }} />
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div style={{ flex: 1, padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', minWidth: 0 }}>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mlab-green)', fontFamily: 'var(--font-heading)' }}>
// // // //                                 <Flame size={13} /> Continue Active Lesson
// // // //                             </div>
// // // //                             <div style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                 {continueLearningCourse.title}
// // // //                             </div>
// // // //                             <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                 {continueLearningUnit.title}
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
// // // //                                 <span style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // //                                     <Clock size={12} color="var(--mlab-green)" /> ~{continueLearningUnit.estimatedMinutes} min left
// // // //                                 </span>
// // // //                                 <span style={{ fontSize: '0.75rem', color: 'var(--mlab-green)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                     Resume Now <ChevronRight size={13} />
// // // //                                 </span>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 );
// // // //             })()}

// // // //             {/* TOP HIGHLIGHT CARDS */}
// // // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
// // // //                 <div style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)', borderTop: '4px solid var(--mlab-blue)', color: 'var(--mlab-blue)', padding: '16px', borderRadius: '0px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
// // // //                     <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
// // // //                         <Zap size={13} color="var(--mlab-blue)" /> Agile Sprint Track
// // // //                     </div>
// // // //                     <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>SECAM CodeTribe Bootcamp</div>
// // // //                     <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>120 Notional Hours</span>
// // // //                 </div>

// // // //                 <div style={{ background: 'var(--mlab-white)', border: '2px solid var(--mlab-green-dark)', borderTop: '4px solid var(--mlab-green-dark)', color: 'var(--mlab-green-dark)', padding: '16px', borderRadius: '0px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
// // // //                     <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
// // // //                         <GraduationCap size={13} color="var(--mlab-green-dark)" /> QCTO Qualification
// // // //                     </div>
// // // //                     <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>MICT SETA NQF 5 Systems Dev</div>
// // // //                     <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>Accredited Logbook Track</span>
// // // //                 </div>

// // // //                 <div style={{ background: 'var(--mlab-white)', border: '2px solid #b45309', borderTop: '4px solid #b45309', color: '#b45309', padding: '16px', borderRadius: '0px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
// // // //                     <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-heading)' }}>
// // // //                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={13} /> Cohort Runs</span>
// // // //                         <span style={{ fontSize: '0.6rem', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 5px', fontWeight: 900 }}>SCHEDULED</span>
// // // //                     </div>
// // // //                     <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Active &amp; Open Batches</div>
// // // //                     <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>Enrollment &amp; Intake Windows</span>
// // // //                 </div>

// // // //                 <div style={{ background: 'var(--mlab-blue)', border: '2px solid var(--mlab-blue)', borderLeft: '4px solid var(--mlab-green)', color: 'white', padding: '16px', borderRadius: '0px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
// // // //                     <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)' }}>
// // // //                         <Zap size={13} /> AI Verification Sandbox
// // // //                     </div>
// // // //                     <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Spot-the-Bug &amp; Defense</div>
// // // //                     <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>Active Completion Gates</span>
// // // //                 </div>
// // // //             </div>

// // // //             {/* 2-COLUMN WORKSPACE */}
// // // //             <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: '20px', alignItems: 'start' }}>

// // // //                 {/* LEFT COLUMN: CATALOG GRID */}
// // // //                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

// // // //                     {/* DYNAMIC SEARCH BAR */}
// // // //                     <div className={`qcto-card lch-search-wrapper ${isSearchVisible ? 'visible' : 'hidden'}`} style={{ padding: '14px 16px' }}>
// // // //                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
// // // //                             <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', padding: '0 10px' }}>
// // // //                                 <Search size={16} color="var(--mlab-grey)" />
// // // //                                 <input
// // // //                                     type="text"
// // // //                                     className="pfm-input"
// // // //                                     placeholder="Search cohort batches by title or tags..."
// // // //                                     value={searchTerm}
// // // //                                     onChange={e => setSearchTerm(e.target.value)}
// // // //                                     style={{ border: 'none', flex: 1, height: '36px' }}
// // // //                                 />
// // // //                             </div>
// // // //                             <button
// // // //                                 onClick={() => setIsFilterPanelOpen(prev => !prev)}
// // // //                                 className="lfm-btn lfm-btn--primary"
// // // //                             >
// // // //                                 <Filter size={14} /> Filter {isFilterPanelOpen ? '▲' : '▼'}
// // // //                             </button>
// // // //                         </div>

// // // //                         {/* INLINE EXPANDABLE FILTER PANEL */}
// // // //                         {isFilterPanelOpen && (
// // // //                             <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '12px', marginTop: '12px', borderTop: '1px solid var(--mlab-border)' }}>
// // // //                                 <div>
// // // //                                     <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Duration</label>
// // // //                                     <select
// // // //                                         className="pfm-input"
// // // //                                         value={durationFilter}
// // // //                                         onChange={e => setDurationFilter(e.target.value as 'any' | 'short' | 'long')}
// // // //                                     >
// // // //                                         <option value="any">Any Duration</option>
// // // //                                         <option value="short">&lt; 50 Hours</option>
// // // //                                         <option value="long">100+ Hours</option>
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 <div>
// // // //                                     <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mlab-grey)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Level</label>
// // // //                                     <select className="pfm-input" value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}>
// // // //                                         <option value="all">All Levels</option>
// // // //                                         <option value="beginner">Beginner</option>
// // // //                                         <option value="intermediate">Intermediate</option>
// // // //                                         <option value="advanced">Advanced</option>
// // // //                                         <option value="expert">Expert</option>
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 {(durationFilter !== 'any' || selectedLevel !== 'all') && (
// // // //                                     <button
// // // //                                         onClick={() => { setDurationFilter('any'); setSelectedLevel('all'); }}
// // // //                                         style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: 'var(--mlab-blue)', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                                     >
// // // //                                         Clear filters
// // // //                                     </button>
// // // //                                 )}
// // // //                             </div>
// // // //                         )}
// // // //                     </div>

// // // //                     {/* COURSE CARDS GRID */}
// // // //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
// // // //                         {filteredCourses.length === 0 && (
// // // //                             <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 20px', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', border: '1px dashed var(--mlab-border)' }}>
// // // //                                 <Search size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
// // // //                                 <p style={{ margin: 0, fontSize: '0.85rem' }}>No active or scheduled cohort batches match your criteria.</p>
// // // //                             </div>
// // // //                         )}
// // // //                         {filteredCourses.map(course => {
// // // //                             const theme = getThemeStyles(course.themeColor, course.framework);
// // // //                             const parentTitle = (course as any).parentCourseTitle;

// // // //                             const courseInstanceId = getCourseInstanceId(course);
// // // //                             const activeInstanceId = getCourseInstanceId(continueLearningCourse);

// // // //                             // 🚀 ACCURATE IN-PROGRESS EVALUATION
// // // //                             const hasCompletedUnits = course.completedUnitsCount !== undefined && course.completedUnitsCount > 0;
// // // //                             const matchesActiveBanner = activeInstanceId !== '' && activeInstanceId === courseInstanceId && Boolean(course.lastActiveUnitId);
// // // //                             const isInProgress = hasCompletedUnits || matchesActiveBanner;

// // // //                             const realCompletedCount = course.completedUnitsCount || 0;

// // // //                             console.log(`🔍 [CATALOG CARD DEBUG] Course "${course.title}" (${courseInstanceId}):`, {
// // // //                                 completedUnitsCount: course.completedUnitsCount,
// // // //                                 lastActiveUnitId: course.lastActiveUnitId,
// // // //                                 isInProgress
// // // //                             });

// // // //                             return (
// // // //                                 <div
// // // //                                     key={course.cohortRunId || course.id}
// // // //                                     onClick={() => onSelectCourse(course)}
// // // //                                     className="qcto-card mlab-card-hover"
// // // //                                     style={{
// // // //                                         cursor: 'pointer',
// // // //                                         border: '2px solid #0f172a',
// // // //                                         borderTop: `6px solid ${theme.borderTopColor}`,
// // // //                                         display: 'flex',
// // // //                                         flexDirection: 'column',
// // // //                                         borderRadius: '0px',
// // // //                                         overflow: 'hidden'
// // // //                                     }}
// // // //                                 >
// // // //                                     {/* Header Banner */}
// // // //                                     <div style={{
// // // //                                         background: theme.gradient,
// // // //                                         padding: '14px',
// // // //                                         position: 'relative',
// // // //                                         height: '135px',
// // // //                                         display: 'flex',
// // // //                                         flexDirection: 'column',
// // // //                                         justifyContent: 'space-between',
// // // //                                         borderBottom: '2px solid #0f172a'
// // // //                                     }}>
// // // //                                         <div style={{
// // // //                                             position: 'absolute',
// // // //                                             top: '12px',
// // // //                                             left: '10px',
// // // //                                             width: '60px',
// // // //                                             height: '24px',
// // // //                                             borderRadius: '12px',
// // // //                                             backgroundColor: 'rgba(255, 255, 255, 0.45)',
// // // //                                             pointerEvents: 'none'
// // // //                                         }} />

// // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
// // // //                                             {renderStatusBadge(course.runStatus, course.statusLabel)}

// // // //                                             <div
// // // //                                                 role="button"
// // // //                                                 tabIndex={0}
// // // //                                                 title={course.isBookmarked ? "Remove Bookmark" : "Bookmark Course"}
// // // //                                                 style={{
// // // //                                                     background: '#ffffff',
// // // //                                                     border: '2px solid #0f172a',
// // // //                                                     width: '30px',
// // // //                                                     height: '30px',
// // // //                                                     display: 'flex',
// // // //                                                     alignItems: 'center',
// // // //                                                     justifyContent: 'center',
// // // //                                                     cursor: 'pointer',
// // // //                                                     flexShrink: 0,
// // // //                                                     zIndex: 10,
// // // //                                                     boxShadow: '2px 2px 0px #0f172a',
// // // //                                                     transition: 'transform 0.1s ease'
// // // //                                                 }}
// // // //                                                 onClick={(e) => {
// // // //                                                     e.stopPropagation();
// // // //                                                 }}
// // // //                                             >
// // // //                                                 <Bookmark
// // // //                                                     size={16}
// // // //                                                     color="#0f172a"
// // // //                                                     stroke="#0f172a"
// // // //                                                     strokeWidth={2.2}
// // // //                                                     fill={course.isBookmarked ? '#f59e0b' : 'none'}
// // // //                                                     style={{
// // // //                                                         width: '16px',
// // // //                                                         height: '16px',
// // // //                                                         minWidth: '16px',
// // // //                                                         minHeight: '16px',
// // // //                                                         display: 'block'
// // // //                                                     }}
// // // //                                                 />
// // // //                                             </div>
// // // //                                         </div>

// // // //                                         <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2 }}>
// // // //                                             <CourseIllustrationGraphic
// // // //                                                 type={course.illustrationType}
// // // //                                                 themeColor={course.themeColor}
// // // //                                                 framework={course.framework}
// // // //                                             />
// // // //                                         </div>

// // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
// // // //                                             <span style={{ fontSize: '0.68rem', fontWeight: 800, color: theme.primaryBox, background: '#ffffff', padding: '1px 6px', border: '1px solid #0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
// // // //                                                 {course.framework.toUpperCase()}
// // // //                                             </span>

// // // //                                             <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
// // // //                                                 <span style={{
// // // //                                                     fontSize: '0.65rem',
// // // //                                                     fontWeight: 900,
// // // //                                                     color: '#0f172a',
// // // //                                                     background: '#fde68a',
// // // //                                                     padding: '1px 6px',
// // // //                                                     border: '1px solid #0f172a',
// // // //                                                     fontFamily: 'var(--font-heading)',
// // // //                                                     textTransform: 'uppercase',
// // // //                                                     display: 'inline-flex',
// // // //                                                     alignItems: 'center',
// // // //                                                     gap: '3px',
// // // //                                                     whiteSpace: 'nowrap'
// // // //                                                 }}>
// // // //                                                     <Clock size={10} color="#0f172a" /> {course.cohortDurationLabel || '8 WEEKS'}
// // // //                                                 </span>

// // // //                                                 <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0f172a', background: '#ffffff', padding: '1px 6px', border: '1px solid #0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
// // // //                                                     {course.level}
// // // //                                                 </span>
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     </div>

// // // //                                     {/* Card Body */}
// // // //                                     <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff' }}>
// // // //                                         <div>
// // // //                                             {parentTitle && parentTitle !== course.title && (
// // // //                                                 <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, marginBottom: '2px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                                     Blueprint: {parentTitle}
// // // //                                                 </div>
// // // //                                             )}

// // // //                                             <h4 style={{ margin: '0 0 8px 0', fontSize: '0.98rem', color: '#0f172a', fontWeight: 800, lineHeight: 1.3, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                                 {course.title}
// // // //                                             </h4>

// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', marginBottom: '10px' }}>
// // // //                                                 <Star size={13} fill="#f59e0b" color="#f59e0b" />
// // // //                                                 <strong style={{ color: '#0f172a' }}>{course.rating}</strong>
// // // //                                                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Users size={12} /> ({course.enrolledCount} enrolled)</span>
// // // //                                             </div>

// // // //                                             <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
// // // //                                                 {course.tags.map(tag => (
// // // //                                                     <span key={tag} style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#0369a1', padding: '2px 6px', fontWeight: 700, border: '1px solid #cbd5e1', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                                                         #{tag}
// // // //                                                     </span>
// // // //                                                 ))}
// // // //                                             </div>

// // // //                                             {/* 🚀 REAL UNTOUCHED PROGRESS BAR */}
// // // //                                             <div style={{ marginBottom: '14px' }}>
// // // //                                                 <ProgressBar completed={realCompletedCount} total={course.totalUnitsCount} />
// // // //                                             </div>
// // // //                                         </div>

// // // //                                         {/* Footer */}
// // // //                                         <div style={{
// // // //                                             borderTop: '1px solid #e2e8f0',
// // // //                                             paddingTop: '12px',
// // // //                                             display: 'flex',
// // // //                                             justifyContent: 'space-between',
// // // //                                             alignItems: 'center',
// // // //                                             gap: '8px',
// // // //                                             minWidth: 0
// // // //                                         }}>
// // // //                                             <span style={{
// // // //                                                 fontSize: '0.73rem',
// // // //                                                 fontWeight: 800,
// // // //                                                 color: 'var(--mlab-blue)',
// // // //                                                 display: 'inline-flex',
// // // //                                                 alignItems: 'center',
// // // //                                                 gap: '4px',
// // // //                                                 fontFamily: 'var(--font-heading)',
// // // //                                                 whiteSpace: 'nowrap',
// // // //                                                 overflow: 'hidden',
// // // //                                                 textOverflow: 'ellipsis',
// // // //                                                 flex: 1,
// // // //                                                 minWidth: 0
// // // //                                             }}>
// // // //                                                 <Clock size={12} color="var(--mlab-blue)" style={{ flexShrink: 0 }} />
// // // //                                                 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // //                                                     <strong style={{ color: '#0f172a' }}>{course.cohortDurationLabel}</strong>
// // // //                                                     {course.cohortDurationLabel ? ' • ' : ''}
// // // //                                                     {course.courseworkHours && course.courseworkHours > 0 ? (
// // // //                                                         <>{course.contentHours}h content + {course.courseworkHours}h projects</>
// // // //                                                     ) : (
// // // //                                                         <>{course.estimatedTotalHours} Hours</>
// // // //                                                     )}
// // // //                                                 </span>
// // // //                                             </span>

// // // //                                             <div style={{ flexShrink: 0 }}>
// // // //                                                 {course.runStatus === 'active' && (
// // // //                                                     <button className="lfm-btn lfm-btn--green" style={{ padding: '4px 10px', height: '28px', whiteSpace: 'nowrap' }}>
// // // //                                                         <Play size={12} fill="var(--mlab-blue)" /> {isInProgress ? 'Resume' : 'Launch'}
// // // //                                                     </button>
// // // //                                                 )}

// // // //                                                 {course.runStatus === 'open_for_applications' && (
// // // //                                                     <button className="lfm-btn lfm-btn--primary" style={{ padding: '4px 10px', height: '28px', whiteSpace: 'nowrap' }}>
// // // //                                                         <Send size={12} /> Apply Now
// // // //                                                     </button>
// // // //                                                 )}

// // // //                                                 {course.runStatus === 'applications_closed' && (
// // // //                                                     <button disabled className="lfm-btn" style={{ padding: '4px 10px', height: '28px', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
// // // //                                                         <Lock size={12} /> Closed
// // // //                                                     </button>
// // // //                                                 )}

// // // //                                                 {(course.runStatus === 'upcoming' || course.runStatus === 'draft') && (
// // // //                                                     <button className="lfm-btn" style={{ padding: '4px 10px', height: '28px', background: '#f3e8ff', color: '#6d28d9', border: '1px solid #c4b5fd', fontWeight: 800, whiteSpace: 'nowrap' }}>
// // // //                                                         Preview Syllabus
// // // //                                                     </button>
// // // //                                                 )}

// // // //                                                 {course.runStatus === 'ended' && (
// // // //                                                     <button className="lfm-btn lfm-btn--ghost" style={{ padding: '4px 10px', height: '28px', whiteSpace: 'nowrap' }}>
// // // //                                                         View Archives
// // // //                                                     </button>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             );
// // // //                         })}
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* STICKY RIGHT SIDEBAR */}
// // // //                 <div className="lch-sidebar-sticky">

// // // //                     <div className="qcto-card">
// // // //                         <div className="qcto-hdr" style={{ fontSize: '0.75rem' }}>
// // // //                             Curriculum Categories
// // // //                         </div>
// // // //                         <div style={{ display: 'flex', flexDirection: 'column', padding: '6px' }}>
// // // //                             <button
// // // //                                 onClick={() => setActiveTabFilter('all')}
// // // //                                 style={{ padding: '8px 12px', border: 'none', background: activeTabFilter === 'all' ? 'var(--mlab-blue)' : 'transparent', color: activeTabFilter === 'all' ? 'white' : 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                             >
// // // //                                 <BookOpen size={14} /> All Cohort Batches ({courses.length})
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTabFilter('secam')}
// // // //                                 style={{ padding: '8px 12px', border: 'none', background: activeTabFilter === 'secam' ? 'var(--mlab-blue)' : 'transparent', color: activeTabFilter === 'secam' ? 'white' : 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                             >
// // // //                                 <Zap size={14} /> SECAM Bootcamps
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTabFilter('qcto')}
// // // //                                 style={{ padding: '8px 12px', border: 'none', background: activeTabFilter === 'qcto' ? 'var(--mlab-blue)' : 'transparent', color: activeTabFilter === 'qcto' ? 'white' : 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                             >
// // // //                                 <GraduationCap size={14} /> QCTO Qualifications
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTabFilter('applications')}
// // // //                                 style={{ padding: '8px 12px', border: 'none', background: activeTabFilter === 'applications' ? '#0284c7' : 'transparent', color: activeTabFilter === 'applications' ? 'white' : '#0284c7', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                             >
// // // //                                 <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                     <Send size={14} /> Applications Open
// // // //                                 </span>
// // // //                                 <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 5px', fontWeight: 900 }}>OPEN</span>
// // // //                             </button>
// // // //                             <button
// // // //                                 onClick={() => setActiveTabFilter('bookmarked')}
// // // //                                 style={{ padding: '8px 12px', border: 'none', background: activeTabFilter === 'bookmarked' ? 'var(--mlab-blue)' : 'transparent', color: activeTabFilter === 'bookmarked' ? 'white' : 'var(--mlab-blue)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
// // // //                             >
// // // //                                 <Bookmark size={14} /> Saved Courses
// // // //                             </button>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="qcto-card">
// // // //                         <div className="qcto-hdr" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                             <SlidersHorizontal size={14} /> Filter Controls
// // // //                         </div>
// // // //                         <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // // //                             <div>
// // // //                                 <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-grey)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Duration Range</label>
// // // //                                 <select
// // // //                                     className="pfm-input"
// // // //                                     style={{ width: '100%' }}
// // // //                                     value={durationFilter}
// // // //                                     onChange={e => setDurationFilter(e.target.value as 'any' | 'short' | 'long')}
// // // //                                 >
// // // //                                     <option value="any">Any Duration</option>
// // // //                                     <option value="short">&lt; 50 Hours</option>
// // // //                                     <option value="long">100+ Hours</option>
// // // //                                 </select>
// // // //                             </div>
// // // //                             <div>
// // // //                                 <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-grey)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Target Level</label>
// // // //                                 <select className="pfm-input" style={{ width: '100%' }} value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}>
// // // //                                     <option value="all">All Levels</option>
// // // //                                     <option value="beginner">Beginner</option>
// // // //                                     <option value="intermediate">Intermediate</option>
// // // //                                     <option value="advanced">Advanced</option>
// // // //                                     <option value="expert">Expert</option>
// // // //                                 </select>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ background: 'var(--mlab-blue)', color: 'white', padding: '16px', borderRadius: '0px', borderLeft: '4px solid var(--mlab-green)', textAlign: 'center' }}>
// // // //                         <HelpCircle size={22} color="var(--mlab-green)" style={{ margin: '0 auto 6px' }} />
// // // //                         <strong style={{ fontSize: '0.82rem', display: 'block', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Need Help with a Lesson?</strong>
// // // //                         <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>Contact your assigned facilitator</span>
// // // //                     </div>

// // // //                 </div>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };