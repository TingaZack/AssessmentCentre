// src/pages/LearnerPortal/LearnerContentHub/LearnerContentHub.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import 'react-quill-new/dist/quill.snow.css';
import './LearnerContentHub.css';

import type { LearnerUnitProgress, CoursePackage } from './types';
import { CourseCatalogView } from './CourseCatalogView';
import { CourseOverviewView } from './CourseOverviewView';
import { CoursePlayerView } from './CoursePlayerView';
import { useCourseStore } from '../../../store/useCourseStore';
import Loader from '../../../components/common/Loader/Loader';

interface ExtendedCoursePackage extends CoursePackage {
    timelineId?: string;
    placementId?: string;
    hasStarted?: boolean;
}

interface ExtendedUnitProgress extends LearnerUnitProgress {
    cohortRunId?: string;
    linkedAssessmentId?: string | null;
    assessmentId?: string | null;
    formalAssessmentId?: string | null;
    unlinkedPolicy?: 'soft_gate' | 'hard_gate';
}

const getCourseInstanceId = (c?: CoursePackage | ExtendedCoursePackage | null) => {
    if (!c) return '';
    const ext = c as ExtendedCoursePackage;
    return ext.cohortRunId || ext.timelineId || ext.placementId || ext.id;
};

export const LearnerContentHub: React.FC = () => {
    const {
        courses,
        allUnits,
        loading,
        view,
        selectedCourse,
        selectedUnit,
        setView,
        setSelectedCourse,
        setSelectedUnit,
        initializeCourseSubscriptions
    } = useCourseStore();

    // 1A. STORE INITIALIZATION
    useEffect(() => {
        if (!initializeCourseSubscriptions) return;

        let unsubscribeStore: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, (authenticatedUser) => {
            if (unsubscribeStore) {
                unsubscribeStore();
                unsubscribeStore = undefined;
            }

            if (authenticatedUser?.uid) {
                unsubscribeStore = initializeCourseSubscriptions(authenticatedUser.uid);
            } else {
                unsubscribeStore = initializeCourseSubscriptions();
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeStore) unsubscribeStore();
        };
    }, [initializeCourseSubscriptions]);

    // 1B. REAL-TIME FIRESTORE LEARNER PROGRESS LISTENER
    const [userProgressMap, setUserProgressMap] = useState<Map<string, { isCompleted: boolean; watchPct: number; lastPlayedSeconds: number }>>(new Map());

    useEffect(() => {
        let unsubscribeProgress: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, (authenticatedUser) => {
            if (unsubscribeProgress) {
                unsubscribeProgress();
                unsubscribeProgress = undefined;
            }

            if (!authenticatedUser?.uid) {
                setUserProgressMap(new Map());
                return;
            }

            try {
                const q = query(
                    collection(db, 'learner_content_progress'),
                    where('userId', '==', authenticatedUser.uid)
                );

                unsubscribeProgress = onSnapshot(q, (snapshot) => {
                    const progMap = new Map<string, { isCompleted: boolean; watchPct: number; lastPlayedSeconds: number }>();
                    snapshot.docs.forEach(docSnap => {
                        const data = docSnap.data();
                        const unitId = data.unitId as string;
                        if (!unitId) return;

                        const existing = progMap.get(unitId);
                        const isComp = Boolean(data.isCompleted);
                        const pct = Number(data.watchPct) || 0;
                        const secs = Number(data.lastPlayedSeconds) || 0;

                        if (existing) {
                            progMap.set(unitId, {
                                isCompleted: existing.isCompleted || isComp,
                                watchPct: Math.max(existing.watchPct, pct),
                                lastPlayedSeconds: Math.max(existing.lastPlayedSeconds, secs)
                            });
                        } else {
                            progMap.set(unitId, {
                                isCompleted: isComp,
                                watchPct: pct,
                                lastPlayedSeconds: secs
                            });
                        }
                    });
                    setUserProgressMap(progMap);
                }, (err) => {
                    console.warn('[LearnerContentHub] Progress listener warning:', err);
                });
            } catch (e) {
                console.warn('[LearnerContentHub] Failed setting up progress listener:', e);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeProgress) unsubscribeProgress();
        };
    }, []);

    // 2A. BULLETPROOF URL HYDRATION ON HARD RELOAD
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated) return;

        const params = new URLSearchParams(window.location.search);
        const urlView = params.get('hubView');
        const courseId = params.get('courseId');
        const cohortRunId = params.get('cohortRunId') || params.get('timelineId');
        const unitId = params.get('unitId');

        const hasUrlParams = Boolean(urlView || courseId || cohortRunId || unitId);

        // 1. Wait if Zustand store is still fetching initial data
        if (loading) return;

        // 2. If URL parameters exist, WAIT until courses array arrives from Firestore
        if (hasUrlParams && courses.length === 0) return;

        // 3. If URL requests 'player' view or a specific 'unitId', WAIT until allUnits arrives
        if ((urlView === 'player' || unitId) && targetCourseUnitsLoading(courses, cohortRunId, courseId, allUnits)) return;

        // 4. If no URL params and courses are empty, default to catalog
        if (!hasUrlParams && courses.length === 0) {
            setView('catalog');
            setHydrated(true);
            return;
        }

        // Resolve requested course
        let targetCourse: CoursePackage | null = null;
        if (cohortRunId || courseId) {
            targetCourse = courses.find(c => {
                const instId = getCourseInstanceId(c);
                return instId === cohortRunId || c.id === courseId;
            }) || null;
        }

        let targetUnit: LearnerUnitProgress | null = null;
        if (unitId && allUnits.length > 0) {
            targetUnit = allUnits.find(u => u.id === unitId) || null;
        }

        if (urlView === 'player' && targetCourse) {
            setSelectedCourse(targetCourse);
            if (targetUnit) {
                setSelectedUnit(targetUnit);
            } else {
                const instId = getCourseInstanceId(targetCourse);
                const courseUnitsForTarget = allUnits.filter(u => u.containerId === instId || u.containerId === targetCourse?.id);
                if (courseUnitsForTarget.length > 0) {
                    setSelectedUnit(courseUnitsForTarget[0]);
                }
            }
            setView('player');
        } else if (urlView === 'overview' && targetCourse) {
            setSelectedCourse(targetCourse);
            setView('overview');
        } else {
            setView('catalog');
        }

        setHydrated(true);
    }, [loading, hydrated, courses, allUnits, setSelectedCourse, setSelectedUnit, setView]);

    // Helper to check if unit data for target course is still fetching
    function targetCourseUnitsLoading(courseList: CoursePackage[], cohortRunId: string | null, courseId: string | null, unitsList: LearnerUnitProgress[]): boolean {
        if (unitsList.length > 0) return false;
        const matched = courseList.find(c => getCourseInstanceId(c) === cohortRunId || c.id === courseId);
        return Boolean(matched);
    }

    // 2B. DEVICE / BROWSER BACK BUTTON (POPSTATE LISTENER)
    useEffect(() => {
        const handlePopState = () => {
            if (courses.length === 0) return;

            const params = new URLSearchParams(window.location.search);
            const urlView = params.get('hubView');
            const courseId = params.get('courseId');
            const cohortRunId = params.get('cohortRunId') || params.get('timelineId');
            const unitId = params.get('unitId');

            const targetCourse = courses.find(c => {
                const instId = getCourseInstanceId(c);
                return instId === cohortRunId || c.id === courseId;
            }) || null;
            const targetUnit = unitId ? allUnits.find(u => u.id === unitId) || null : null;

            setSelectedCourse(targetCourse);
            setSelectedUnit(targetUnit);

            if (urlView === 'player' && targetCourse && targetUnit) {
                setView('player');
            } else if (urlView === 'overview' && targetCourse) {
                setView('overview');
            } else {
                setView('catalog');
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [courses, allUnits, setSelectedCourse, setSelectedUnit, setView]);

    // 2C. URL SYNC (REPLACE STATE TO PREVENT HISTORY CLOGGING)
    useEffect(() => {
        if (!hydrated) return;

        const params = new URLSearchParams(window.location.search);

        if (view === 'overview' && selectedCourse) {
            params.set('hubView', 'overview');
            params.set('courseId', selectedCourse.id);
            if (selectedCourse.cohortRunId) params.set('cohortRunId', selectedCourse.cohortRunId);
            const extCourse = selectedCourse as ExtendedCoursePackage;
            if (extCourse.timelineId) params.set('timelineId', extCourse.timelineId);
            params.delete('unitId');
            params.delete('quiz');
        } else if (view === 'player' && selectedCourse && selectedUnit) {
            params.set('hubView', 'player');
            params.set('courseId', selectedCourse.id);
            if (selectedCourse.cohortRunId) params.set('cohortRunId', selectedCourse.cohortRunId);
            const extCourse = selectedCourse as ExtendedCoursePackage;
            if (extCourse.timelineId) params.set('timelineId', extCourse.timelineId);
            params.set('unitId', selectedUnit.id);
        } else if (view === 'catalog') {
            params.delete('hubView');
            params.delete('courseId');
            params.delete('cohortRunId');
            params.delete('timelineId');
            params.delete('unitId');
            params.delete('quiz');
        }

        const queryString = params.toString();
        const targetSearch = queryString ? `?${queryString}` : '';
        const currentSearch = window.location.search;

        if (targetSearch !== currentSearch) {
            const newUrl = `${window.location.pathname}${targetSearch}`;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    }, [view, selectedCourse, selectedUnit, hydrated]);

    // 3. ENRICHED PER-LESSON PREREQUISITE & HARD-GATE ASSESSMENT LOCKING
    const courseUnits = useMemo(() => {
        if (!selectedCourse) return [];
        const activeInstId = getCourseInstanceId(selectedCourse);

        const rawUnits = (allUnits as ExtendedUnitProgress[])
            .filter(u => u.containerId === activeInstId || u.containerId === selectedCourse.id || u.cohortRunId === activeInstId)
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        let activeLockEnforced = false;

        return rawUnits.map((unit) => {
            const userProg = userProgressMap.get(unit.id);
            const isCompleted = userProg ? userProg.isCompleted : Boolean(unit.isCompleted);
            const watchPct = userProg ? userProg.watchPct : (unit.watchPercentage || unit.progressPercent || 0);

            // MULTI-FIELD LINKED ASSESSMENT RESOLUTION
            const resolvedAssessmentId = unit.linkedAssessmentId ||
                unit.assessmentId ||
                unit.formalAssessmentId ||
                (typeof (unit as any).linkedAssessment === 'string' ? (unit as any).linkedAssessment : null) ||
                null;

            const isLocked = activeLockEnforced;

            const isUnitIncomplete = !isCompleted;
            const requiresNextLock = unit.isRequiredForNextUnit === true || (Boolean(resolvedAssessmentId) && unit.unlinkedPolicy === 'hard_gate');

            if (isUnitIncomplete && requiresNextLock) {
                activeLockEnforced = true;
            }

            return {
                ...unit,
                linkedAssessmentId: resolvedAssessmentId,
                unlinkedPolicy: unit.unlinkedPolicy || 'soft_gate',
                isCompleted,
                watchPercentage: watchPct,
                progressPercent: watchPct,
                isLocked
            };
        });
    }, [selectedCourse, allUnits, userProgressMap]);

    // ALWAYS RESOLVE FRESH ACTIVE UNIT FROM ENRICHED courseUnits
    const activeUnit = useMemo(() => {
        if (!selectedUnit) return null;
        return courseUnits.find(u => u.id === selectedUnit.id) || selectedUnit;
    }, [courseUnits, selectedUnit]);

    // 4. RESOLVE CONTINUE LEARNING BANNER
    const continueLearningCourse = useMemo(() => {
        return courses.find(c => {
            const isActiveStatus = String(c.runStatus || '').toLowerCase() === 'active';
            const extCourse = c as ExtendedCoursePackage;
            const hasStarted = extCourse.hasStarted === true || (c.completedUnitsCount !== undefined && c.completedUnitsCount > 0);
            const isIncomplete = c.completedUnitsCount === undefined || c.completedUnitsCount < c.totalUnitsCount;
            return isActiveStatus && hasStarted && isIncomplete;
        }) || null;
    }, [courses]);

    const continueLearningUnit = useMemo(() => {
        if (!continueLearningCourse) return null;
        const targetInstId = getCourseInstanceId(continueLearningCourse);

        const targetCourseUnits = (allUnits as ExtendedUnitProgress[])
            .filter(u => u.containerId === targetInstId || u.containerId === continueLearningCourse.id || u.cohortRunId === targetInstId)
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
            .map(u => {
                const prog = userProgressMap.get(u.id);
                return {
                    ...u,
                    isCompleted: prog ? prog.isCompleted : Boolean(u.isCompleted)
                };
            });

        return targetCourseUnits.find(u => !u.isCompleted && !u.isLocked) || targetCourseUnits[0] || null;
    }, [continueLearningCourse, allUnits, userProgressMap]);

    const groupedSyllabus = useMemo(() => {
        const groups: Record<string, LearnerUnitProgress[]> = {};
        courseUnits.forEach(u => {
            const key = selectedCourse?.framework === 'secam'
                ? (u.sprintTitle || 'Sprint 1: Core Fundamentals')
                : `${u.moduleCode || 'KM-01'} • ${u.moduleType?.toUpperCase() || 'KNOWLEDGE'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(u);
        });
        return groups;
    }, [courseUnits, selectedCourse]);

    const minutesToNextMilestone = useMemo(() => {
        if (courseUnits.length === 0) return 0;
        const nextIncomplete = courseUnits.find(u => !u.isCompleted && !u.isLocked);
        return nextIncomplete ? nextIncomplete.estimatedMinutes || 0 : 0;
    }, [courseUnits]);

    const handleSelectCourse = (course: CoursePackage) => {
        setSelectedCourse(course);
        setView('overview');
    };

    // ACCURATE START / RESUME HANDLER
    const handleStartOrResume = () => {
        if (!selectedCourse || courseUnits.length === 0) return;

        let targetUnit = courseUnits.find(u => !u.isCompleted && !u.isLocked);

        if (!targetUnit) {
            targetUnit = courseUnits.find(u => u.id === selectedCourse.lastActiveUnitId && !u.isLocked)
                || courseUnits[0];
        }

        if (targetUnit) {
            setSelectedUnit(targetUnit);

            const hasQuiz = Boolean(targetUnit.interactiveCheck?.checkType && (targetUnit.interactiveCheck.checkType as string) !== 'none');
            const watchPct = targetUnit.watchPercentage || targetUnit.progressPercent || 0;
            const reqPct = targetUnit.requiredWatchPercentage || 90;
            const isWatchDone = watchPct >= reqPct;

            const shouldOpenInQuiz = hasQuiz && isWatchDone && !targetUnit.isCompleted;

            const url = new URL(window.location.href);
            url.searchParams.set('hubView', 'player');
            url.searchParams.set('courseId', selectedCourse.id);
            if (selectedCourse.cohortRunId) url.searchParams.set('cohortRunId', selectedCourse.cohortRunId);
            url.searchParams.set('unitId', targetUnit.id);

            if (shouldOpenInQuiz) {
                url.searchParams.set('quiz', 'true');
            } else {
                url.searchParams.delete('quiz');
            }

            window.history.pushState({ path: url.toString() }, '', url.toString());
            setView('player');
        }
    };

    const handleContinueLearning = () => {
        if (!continueLearningCourse || !continueLearningUnit) return;
        setSelectedCourse(continueLearningCourse);
        setSelectedUnit(continueLearningUnit);
        setView('player');
    };

    if (loading || !hydrated) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
                <Loader message="Loading Catalog &amp; Progress..." />
            </div>
        );
    }

    return (
        <div className="lch-viewport">
            <div className="lch-scroll-container">
                {view === 'catalog' && (
                    <CourseCatalogView
                        courses={courses}
                        continueLearningCourse={continueLearningCourse}
                        continueLearningUnit={continueLearningUnit}
                        onSelectCourse={handleSelectCourse}
                        onContinueLearning={handleContinueLearning}
                    />
                )}

                {view === 'overview' && selectedCourse && (
                    <CourseOverviewView
                        selectedCourse={selectedCourse}
                        courseUnits={courseUnits}
                        groupedSyllabus={groupedSyllabus}
                        minutesToNextMilestone={minutesToNextMilestone}
                        onBackToCatalog={() => setView('catalog')}
                        onStartOrResume={handleStartOrResume}
                        onSelectUnit={(unit) => {
                            if (!unit.isLocked) {
                                setSelectedUnit(unit);
                                setView('player');
                            }
                        }}
                    />
                )}

                {view === 'player' && selectedCourse && (activeUnit || selectedUnit) && (
                    <CoursePlayerView
                        selectedCourse={selectedCourse}
                        selectedUnit={activeUnit || selectedUnit}
                        courseUnits={courseUnits}
                        groupedSyllabus={groupedSyllabus}
                        onBackToOverview={() => setView('overview')}
                        onSelectUnit={(unit) => {
                            setSelectedUnit(unit);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default LearnerContentHub;