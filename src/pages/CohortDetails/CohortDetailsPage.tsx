// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import './CohortDetailsPage.css';
import { BootcampCohortView } from '../../components/views/CohortDetailsViews/BootcampCohortView';
import { QCTOCohortView } from '../../components/views/CohortDetailsViews/QCTOCohortView';

export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();

    const {
        user, cohorts, fetchCohorts, learners, fetchLearners,
        staff, fetchStaff, employers, fetchEmployers,
        enrollments, fetchEnrollments, programmes, fetchProgrammes
    } = useStore();

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
        if (employers.length === 0) fetchEmployers();
        if (enrollments.length === 0) fetchEnrollments();
        if (programmes.length === 0) fetchProgrammes();
    }, [cohorts, learners, staff, employers, enrollments, programmes]);

    const cohort = cohorts.find(c => c.id === cohortId);


    const isBootcampCohort = useMemo(() => {
        if (!cohort) return false;
        return (cohort as any).type === 'bootcamp' || (cohort as any).isBootcamp === true;
    }, [cohort]);

    // Show loading spinner while Firebase fetches the cohort
    if (!cohort) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
                <main className="cdp-main cdp-main--centered">
                    <Loader2 size={40} className="cdp-spinner spin" />
                </main>
            </div>
        );
    }

    // Render the lean Bootcamp view or the heavy QCTO view
    if (isBootcampCohort) {
        return <BootcampCohortView cohort={cohort} />;
    }

    return <QCTOCohortView cohort={cohort} />;
};

export default CohortDetailsPage;

