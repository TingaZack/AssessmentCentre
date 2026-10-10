// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/CurriculumAnalyticsDashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../store/useStore';
import type { LearningUnit, ContentContainer } from '../../../../types/content.types';
import type { ExtendedLearningUnit, EnrichedContentContainer } from '../ContentAuthoring';

import './LessonAnalytics.css';
import { LessonAnalyticsView } from './LessonAnalyticsView';
import { PackageAnalyticsView } from './PackageAnalyticsView';

type Unit = LearningUnit | ExtendedLearningUnit;

interface Props {
    container: ContentContainer | EnrichedContentContainer;
    units: LearningUnit[] | ExtendedLearningUnit[];
    initialLesson: Unit | null;
    initialCohortId: string | null;
    onClose: () => void;
    onSelectLesson: (unit: Unit | null) => void;
}

export const CurriculumAnalyticsDashboard: React.FC<Props> = ({
    container, units, initialLesson, initialCohortId, onClose, onSelectLesson
}) => {
    const { cohorts = [], learners = [], fetchLearners } = useStore();

    useEffect(() => {
        if (learners.length === 0) fetchLearners();
    }, [learners.length, fetchLearners]);

    const [viewMode, setViewMode] = useState<'package' | 'lesson'>(initialLesson || initialCohortId ? 'lesson' : 'package');
    const [currentLesson, setCurrentLesson] = useState<Unit | null>(initialLesson || (units.length > 0 ? units[0] : null));
    const [activeCohortRunId, setActiveCohortRunId] = useState<string | null>(initialCohortId);

    useEffect(() => {
        if (initialLesson || initialCohortId) {
            setViewMode('lesson');
            setCurrentLesson(initialLesson || (units.length > 0 ? units[0] : null));
            setActiveCohortRunId(initialCohortId);
        }
    }, [initialLesson, initialCohortId, units]);

    const formattedCohorts = useMemo(() => {
        const list: { id: string; name: string }[] = [];
        cohorts.forEach(c => { if (c.id && c.name) list.push({ id: c.id, name: c.name }); });
        return list;
    }, [cohorts]);

    return (
        <div className="mlab-staff la">
            {viewMode === 'lesson' && currentLesson ? (
                <LessonAnalyticsView
                    containerId={container.id}
                    unit={currentLesson}
                    allUnits={units}
                    onSelectUnit={next => {
                        if (next) {
                            setCurrentLesson(next);
                            onSelectLesson(next);
                        }
                    }}
                    cohorts={formattedCohorts}
                    initialCohortId={activeCohortRunId || 'all'}
                    onBack={() => {
                        setViewMode('package');
                        onSelectLesson(null);
                    }}
                />
            ) : (
                <PackageAnalyticsView
                    container={container}
                    units={units}
                    onBack={onClose}
                    onDrilldownLesson={(unit, cohortRunId) => {
                        setCurrentLesson(unit);
                        setActiveCohortRunId(cohortRunId || null);
                        setViewMode('lesson');
                        onSelectLesson(unit);
                    }}
                />
            )}
        </div>
    );
};