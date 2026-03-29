// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Users, Calendar,
    Clock, Loader2,
    RefreshCcw, Edit, DownloadCloud
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import './CohortDetailsPage.css';
import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { useToast } from '../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../types';

// ─── QCTO HELPERS ────────────────────────────────────────────────────────

/**
 * Formats date to YYYYMMDD as required by LEISA naming convention
 */
const formatQCTODate = (dateString?: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
};

const getDOBFromID = (idNumber: string) => {
    const cleanId = String(idNumber || '').replace(/\s/g, '');
    if (cleanId.length !== 13) return '';
    try {
        let year = parseInt(cleanId.substring(0, 2), 10);
        const month = cleanId.substring(2, 4);
        const day = cleanId.substring(4, 6);
        const currentYearShort = new Date().getFullYear() % 100;
        year += year <= currentYearShort ? 2000 : 1900;
        return `${year}${month}${day}`;
    } catch (e) {
        return '';
    }
};

/**
 * The "Nuclear Option" for Excel: Forces every cell to be an explicit String
 */
const createTextCell = (val: any) => ({
    t: 's',
    v: String(val === null || val === undefined ? '' : val),
    z: '@'
});

export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const {
        user, cohorts, learners, staff, employers, settings, programmes,
        fetchCohorts, fetchLearners, fetchStaff, fetchEmployers
    } = useStore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [submissions, setSubmissions] = useState<any[]>([]);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    const headerTheme = useMemo((): HeaderTheme => {
        if (!user?.role) return 'default';
        if (user.role === 'learner') return 'student';
        return user.role as HeaderTheme;
    }, [user?.role]);

    const enrolledLearners = useMemo(() => {
        return learners.filter(l => {
            const hasCohortId = l.cohortId === cohortId;
            const isInCohortArray = cohort?.learnerIds?.includes(l.id);
            return hasCohortId || isInCohortArray;
        });
    }, [learners, cohort, cohortId]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
        if (employers.length === 0) fetchEmployers();
    }, [cohorts, learners, staff, employers, fetchCohorts, fetchLearners, fetchStaff, fetchEmployers]);

    const fetchSubmissions = async () => {
        if (!cohortId) return;
        try {
            const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
            const snap = await getDocs(q);
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Error fetching submissions:", error);
        }
    };

    useEffect(() => {
        fetchSubmissions();
    }, [cohortId]);

    // ─── QCTO EXPORT HANDLER ─────────────────────────────────────────────
    const handleQCTOExport = async () => {
        if (!cohort || enrolledLearners.length === 0) {
            toast.error('Cannot export an empty cohort.');
            return;
        }

        setIsExporting(true);
        try {
            // 1. Resolve Institutional Data
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId)
                || settings?.campuses?.find((c: any) => c.isDefault)
                || settings?.campuses?.[0];

            const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';

            // 2. Resolve Qualification Logic
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);

            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');

            const todayQCTO = formatQCTODate(new Date().toISOString());
            const expectedCompletion = formatQCTODate(cohort.endDate);

            // 3. Build AOA for Sheet 2
            const headers = [
                "SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type",
                "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code",
                "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status",
                "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date",
                "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3",
                "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3",
                "Learner Home Address Postal Code", "Learner Postal Address Post Code",
                "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address",
                "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date",
                "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date",
                "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"
            ];

            const dataRows = [headers.map(createTextCell)];

            enrolledLearners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const lastName = names.length > 1 ? names.pop() : '';
                const firstNames = names.join(' ');
                const title = d.genderCode === 'F' ? 'Ms' : 'Mr';

                dataRows.push([
                    rawSdpCode,
                    saqaId,
                    learner.idNumber,
                    "", "533",
                    d.equityCode, d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O', d.homeLanguageCode, d.genderCode, d.citizenResidentStatusCode || 'SA',
                    d.socioeconomicStatusCode, d.disabilityStatusCode || 'N', d.disabilityRating, "03",
                    lastName, firstNames, "", title, getDOBFromID(learner.idNumber),
                    d.learnerHomeAddress1, d.learnerHomeAddress2, "",
                    d.learnerPostalAddress1 || d.learnerHomeAddress1, d.learnerPostalAddress2 || d.learnerHomeAddress2, "",
                    d.learnerHomeAddressPostalCode, d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode,
                    learner.phone, learner.phone, "", learner.email,
                    d.provinceCode,
                    (d as any).statsaaAreaCode || '',
                    d.popiActAgree || 'Y', d.popiActDate || todayQCTO,
                    expectedCompletion, "02", "", "", "1", "06", "", todayQCTO
                ].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();

            // Sheet 1: COMPULSORY COMPILER INSTRUCTIONS
            const instructions = [
                ["DETAILS: (COMPULSORY INFORMATION)"],
                ["Name and Surname of Compiler:", user?.fullName || ''],
                ["Email address:", user?.email || ''],
                ["Contact Number of Compiler:", (user as any)?.phone || ''],
                ["Contact Number of Institution:", settings?.phone || ''],
                ["Name of Qualification:", qualNameForHeader],
                ["Start Date:", cohort.startDate],
                ["Expected Completion Date:", cohort.endDate],
                ["Name of SDP:", mainInstitutionName],
                ["Address of SDP:", activeCampus?.address || (settings as any)?.institutionAddress || ''],
                ["Province:", activeCampus?.province || (settings as any)?.institutionProvince || ''],
                [],
                ["-------------------------------------------------"],
                ["QCTO LEISA Data Load File (Text Encapsulated)"],
                ["SDP Code:", rawSdpCode],
                ["SAQA Qualification ID:", saqaId],
                ["Export Date:", new Date().toLocaleDateString()],
                ["Naming Convention Used:", `LEISA${todayQCTO}-${mainInstitutionName}`]
            ].map(row => row.map(createTextCell));

            const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
            wsInstructions['!cols'] = [{ wch: 35 }, { wch: 65 }];
            XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

            const wsData = XLSX.utils.aoa_to_sheet(dataRows);
            XLSX.utils.book_append_sheet(wb, wsData, "Learner Enrolment and EISA");

            // FILENAME: LEISAyyyymmdd-SDP/AC name
            // Note: We remove special characters from the institution name for file safety
            const safeInstitutionName = mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `LEISA${todayQCTO}-${safeInstitutionName}.xlsx`;

            XLSX.writeFile(wb, fileName);
            toast.success(`QCTO Compliant file generated: ${fileName}`);

        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Export failed. Ensure institutional settings are configured.");
        } finally {
            setIsExporting(false);
        }
    };

    const syncLearnerWorkbooks = async () => {
        if (!cohortId) return;
        setIsSyncing(true);

        try {
            const batch = writeBatch(db);
            const assessmentsRef = collection(db, 'assessments');

            const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
            const snapArray = await getDocs(qArray);

            const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
            const snapString = await getDocs(qString);

            const allAssessments = new Map();
            snapArray.docs.forEach(d => allAssessments.set(d.id, d));
            snapString.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) {
                setIsSyncing(false);
                setModalConfig({
                    isOpen: true,
                    type: 'info',
                    title: 'No Assessments Found',
                    message: 'There are no active assessments published for this class yet.'
                });
                return;
            }

            let newDocsCount = 0;

            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;

                for (const [astId, astDoc] of allAssessments.entries()) {
                    const alreadyExists = submissions.some(s =>
                        s.assessmentId === astId &&
                        s.cohortId === cohortId &&
                        (s.enrollmentId === enrolId || s.learnerId === humanId)
                    );

                    if (!alreadyExists) {
                        const astData = astDoc.data();
                        const submissionId = `${cohortId}_${humanId}_${astId}`;
                        const subRef = doc(db, 'learner_submissions', submissionId);

                        batch.set(subRef, {
                            learnerId: humanId,
                            enrollmentId: enrolId,
                            qualificationName: learner.qualification?.name || '',
                            assessmentId: astId,
                            cohortId: cohortId,
                            title: astData.title,
                            type: astData.type || 'formative',
                            moduleNumber: astData.moduleInfo?.moduleNumber || '',
                            moduleType: astData.moduleType || 'knowledge',
                            status: 'not_started',
                            answers: {},
                            assignedAt: new Date().toISOString(),
                            totalMarks: astData.totalMarks || 0,
                            marks: 0,
                            createdAt: new Date().toISOString()
                        });

                        newDocsCount++;
                    }
                }
            }

            if (newDocsCount > 0) {
                await batch.commit();
                await fetchSubmissions();
                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Sync Complete',
                    message: `Generated ${newDocsCount} missing workbook(s).`
                });
            } else {
                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Already Synced',
                    message: 'All enrolled learners are up-to-date.'
                });
            }

        } catch (error: any) {
            console.error("Sync Error:", error);
            setModalConfig({ isOpen: true, type: 'error', title: 'Sync Failed', message: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    if (!cohort) {
        return (
            <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
                <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="mlab-state mlab-state--loading">
                        <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
                        <span>Loading Cohort Details…</span>
                    </div>
                </main>
            </div>
        );
    }

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const getEmployerName = (id?: string) => employers.find(e => e.id === id)?.name || 'Unknown Workplace';

    const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : 'Present';

    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
        if (reason && reason.trim().length > 0) {
            if (window.confirm(`Mark ${learnerName} as dropped?`)) {
                await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
            }
        }
    };

    const handleBackNavigation = () => {
        isAdmin ? navigate('/admin', { state: { activeTab: 'cohorts' } }) : navigate(-1);
    };

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

            {modalConfig.isOpen && (
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                />
            )}

            {learnerToPlace && (
                <WorkplacePlacementModal
                    learner={learnerToPlace}
                    onClose={() => setLearnerToPlace(null)}
                />
            )}

            <Sidebar
                role={user?.role}
                currentNav="cohorts"
                setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)}
                onLogout={() => navigate('/login')}
            />

            <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

                <PageHeader
                    theme={headerTheme}
                    variant="hero"
                    eyebrow={`${cohort.name}`}
                    title="Cohort Overview"
                    description="Manage Class Progress, Attendance & Exits."
                    onBack={handleBackNavigation}
                    backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
                    status={{
                        label: cohort.isArchived ? 'Archived' : 'Active Class',
                        variant: cohort.isArchived ? 'draft' : 'active'
                    }}
                    actions={
                        (isAdmin || isFacilitator) ? (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <PageHeader.Btn variant="outline" onClick={handleQCTOExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={14} className="spin" /> : <DownloadCloud size={14} />}
                                    Export LEISA
                                </PageHeader.Btn>
                                <PageHeader.Btn variant="outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                                    Sync Workbooks
                                </PageHeader.Btn>
                            </div>
                        ) : undefined
                    }
                />

                <div className="admin-content" style={{ paddingBottom: '4rem' }}>

                    <div className="mlab-summary-card">
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label"><Calendar size={13} /> Training Dates</span>
                            <span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Facilitator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Assessor</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Moderator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
                        </div>
                    </div>

                    <div className="mlab-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="mlab-section__title" style={{ margin: 0 }}>
                                <Users size={16} /> Enrolled Learners ({enrolledLearners.length})
                            </h3>
                        </div>

                        <div className="mlab-table-wrap">
                            <table className="mlab-table">
                                <thead>
                                    <tr>
                                        <th>Learner</th>
                                        <th>Workplace</th>
                                        <th>Progress</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {enrolledLearners.map(learner => {
                                        const isDropped = learner.status === 'dropped';
                                        const routingId = learner.enrollmentId || learner.id;
                                        const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                        const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');
                                        const employerName = getEmployerName(learner.employerId);

                                        return (
                                            <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                <td>
                                                    <div className="mlab-cell-name">{learner.fullName}</div>
                                                    <div className="mlab-cell-sub">{learner.idNumber}</div>
                                                    {!isDropped && pendingMarking.length > 0 && (
                                                        <div style={{ color: '#3b82f6', fontSize: '0.75rem', marginTop: '4px' }}>
                                                            <Clock size={12} /> {pendingMarking.length} marking pending
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{employerName}</td>
                                                <td>
                                                    <div className="mlab-module-chips">
                                                        <span className="mlab-chip mlab-chip--k">K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
                                                        <span className="mlab-chip mlab-chip--p">P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {isDropped ? <span className="text-red-500">Dropped</span> : <span className="text-green-500">Active</span>}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {isAdmin && <button className="mlab-btn" onClick={() => setLearnerToPlace(learner)}><Edit size={13} /></button>}
                                                        <button className="mlab-btn mlab-btn--outline-blue" onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}>View</button>
                                                        {isAdmin && <button className="mlab-btn mlab-btn--outline-red" onClick={() => handleDropLearner(learner.id, learner.fullName)}>Drop</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

