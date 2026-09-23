// src/pages/LearnerPortal/LearnerContentHub/LearnerContentHub.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import 'react-quill-new/dist/quill.snow.css';
import './LearnerContentHub.css';

import type { LearnerUnitProgress, CoursePackage } from './types';
import { CourseCatalogView } from './CourseCatalogView';
import { CourseOverviewView } from './CourseOverviewView';
import { CoursePlayerView } from './CoursePlayerView';
import { Loader2 } from 'lucide-react';
import { useCourseStore } from '../../../store/useCourseStore';

interface ExtendedCoursePackage extends CoursePackage {
    timelineId?: string;
    placementId?: string;
    hasStarted?: boolean;
}

interface ExtendedUnitProgress extends LearnerUnitProgress {
    cohortRunId?: string;
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

    // 1. SAFELY INITIALIZE SUBSCRIPTIONS ONLY AFTER AUTH IS RESOLVED
    useEffect(() => {
        if (!initializeCourseSubscriptions) return;

        let unsubscribeStore: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, (authenticatedUser) => {
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

    // 2A. URL HYDRATION
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (loading || hydrated) return;

        if (courses.length === 0) {
            setHydrated(true);
            setView('catalog');
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const urlView = params.get('hubView');
        const courseId = params.get('courseId');
        const cohortRunId = params.get('cohortRunId') || params.get('timelineId');
        const unitId = params.get('unitId');

        let targetCourse: CoursePackage | null = null;
        let targetUnit: LearnerUnitProgress | null = null;

        if (cohortRunId || courseId) {
            targetCourse = courses.find(c => {
                const instId = getCourseInstanceId(c);
                return instId === cohortRunId || c.id === courseId;
            }) || null;
            if (targetCourse) setSelectedCourse(targetCourse);
        }

        if (unitId) {
            targetUnit = allUnits.find(u => u.id === unitId) || null;
            if (targetUnit) setSelectedUnit(targetUnit);
        }

        if (urlView === 'player' && targetCourse && targetUnit) {
            setView('player');
        } else if (urlView === 'overview' && targetCourse) {
            setView('overview');
        } else if (urlView) {
            setView('catalog');
        }

        const timer = setTimeout(() => {
            setHydrated(true);
        }, 150);

        return () => clearTimeout(timer);
    }, [loading, hydrated, courses, allUnits, setSelectedCourse, setSelectedUnit, setView]);

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

    // 2C. URL SYNC
    useEffect(() => {
        if (!hydrated) return;

        const params = new URLSearchParams();

        if (view === 'overview' && selectedCourse) {
            params.set('hubView', 'overview');
            params.set('courseId', selectedCourse.id);
            if (selectedCourse.cohortRunId) params.set('cohortRunId', selectedCourse.cohortRunId);
            const extCourse = selectedCourse as ExtendedCoursePackage;
            if (extCourse.timelineId) params.set('timelineId', extCourse.timelineId);
        } else if (view === 'player' && selectedCourse && selectedUnit) {
            params.set('hubView', 'player');
            params.set('courseId', selectedCourse.id);
            if (selectedCourse.cohortRunId) params.set('cohortRunId', selectedCourse.cohortRunId);
            const extCourse = selectedCourse as ExtendedCoursePackage;
            if (extCourse.timelineId) params.set('timelineId', extCourse.timelineId);
            params.set('unitId', selectedUnit.id);
        }

        const queryString = params.toString();
        const targetSearch = queryString ? `?${queryString}` : '';
        const currentSearch = window.location.search;

        if (targetSearch !== currentSearch) {
            const newUrl = `${window.location.pathname}${targetSearch}`;
            window.history.pushState({ path: newUrl }, '', newUrl);
        }
    }, [view, selectedCourse, selectedUnit, hydrated]);

    // 🚀 3. GRANULAR PER-LESSON PREREQUISITE & HARD-GATE ASSESSMENT LOCKING
    const courseUnits = useMemo(() => {
        if (!selectedCourse) return [];
        const activeInstId = getCourseInstanceId(selectedCourse);

        const rawUnits = (allUnits as ExtendedUnitProgress[])
            .filter(u => u.containerId === activeInstId || u.containerId === selectedCourse.id || u.cohortRunId === activeInstId)
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        let activeLockEnforced = false;

        return rawUnits.map((unit) => {
            const isLocked = activeLockEnforced;

            const isUnitIncomplete = !unit.isCompleted;
            const requiresNextLock = unit.isRequiredForNextUnit === true || (unit.linkedAssessmentId && unit.unlinkedPolicy === 'hard_gate');

            if (isUnitIncomplete && requiresNextLock) {
                activeLockEnforced = true;
            }

            return {
                ...unit,
                isLocked
            };
        });
    }, [selectedCourse, allUnits]);

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
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        return targetCourseUnits.find(u => !u.isCompleted && !u.isLocked) || targetCourseUnits[0] || null;
    }, [continueLearningCourse, allUnits]);

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

    const handleStartOrResume = () => {
        if (!selectedCourse) return;

        let targetUnit = courseUnits.find(u => !u.isCompleted && !u.isLocked)
            || courseUnits.find(u => u.id === selectedCourse.lastActiveUnitId && !u.isLocked)
            || courseUnits[0];

        if (!targetUnit) {
            targetUnit = {
                id: `unit_${getCourseInstanceId(selectedCourse)}_default`,
                containerId: getCourseInstanceId(selectedCourse),
                framework: selectedCourse.framework,
                title: `01. Introduction to ${selectedCourse.title}`,
                unitType: 'video',
                estimatedMinutes: 15,
                isRequired: true,
                orderIndex: 1,
                sprintTitle: 'Module 1: Core Overview & Fundamentals',
                dayOrLessonTitle: 'Lesson 1: Introduction',
                videoUrl: selectedCourse.previewVideoUrl || 'https://www.youtube.com/watch?v=SqcYaptowAo',
                requiredWatchPercentage: 90,
                attachments: [],
                isCompleted: false,
                isLocked: false
            };
        }

        setSelectedUnit(targetUnit);
        setView('player');
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
                <Loader2 size={36} className="lfm-spin" style={{ marginBottom: '12px' }} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                    Loading Catalog &amp; Progress...
                </span>
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

                {view === 'player' && selectedCourse && selectedUnit && (
                    <CoursePlayerView
                        selectedCourse={selectedCourse}
                        selectedUnit={selectedUnit}
                        courseUnits={courseUnits}
                        groupedSyllabus={groupedSyllabus}
                        onBackToOverview={() => setView('overview')}
                        onSelectUnit={(unit) => {
                            if (!unit.isLocked) {
                                setSelectedUnit(unit);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default LearnerContentHub;