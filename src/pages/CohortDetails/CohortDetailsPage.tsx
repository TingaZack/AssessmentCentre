// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Users, Calendar, Clock, Loader2, RefreshCcw, DownloadCloud,
    Briefcase, FolderOpen, UserMinus, AlertCircle, ChevronLeft,
    CheckCircle, BookOpen, Wrench, Building2, Award, ArrowUpRight, Timer
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs, increment } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import './CohortDetailsPage.css';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { useToast } from '../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../types';
import { createPortal } from 'react-dom';
import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// ─── QCTO HELPERS ────────────────────────────────────────────────────────────

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

// ─── STAT CHIP ────────────────────────────────────────────────────────────────
const ModuleChip: React.FC<{ label: string; count: number; variant: 'k' | 'p' | 'w' }> = ({ label, count, variant }) => (
    <span className={`cdp-chip cdp-chip--${variant}`}>{label}: {count}</span>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const {
        user, cohorts, learners, staff, employers, settings, programmes, enrollments,
        fetchCohorts, fetchLearners, fetchStaff, fetchEmployers, fetchEnrollments
    } = useStore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGrantingTime, setIsGrantingTime] = useState(false);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>
        ({ isOpen: false, type: 'info', title: '', message: '' });
    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    // Build enrolled learners from registration ledger
    const enrolledLearners = useMemo(() => {
        if (!cohortId) return [];
        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohortId);
        const merged: DashboardLearner[] = [];
        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) {
                merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
            }
        });
        learners.forEach(profile => {
            if (profile.cohortId === cohortId && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });
        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, enrollments, cohortId]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
        if (employers.length === 0) fetchEmployers();
        if (enrollments.length === 0) fetchEnrollments();
    }, [cohorts, learners, staff, employers, enrollments]);

    const fetchSubmissions = async () => {
        if (!cohortId) return;
        try {
            const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId)));
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('Error fetching submissions:', e); }
    };
    useEffect(() => { fetchSubmissions(); }, [cohortId]);

    // ── ACTIVE EXAM CHECK ───────────────────────────────────────────────────
    // If any submission in this cohort is currently "in_progress", we show the Emergency Time controls
    const activeExams = useMemo(() => {
        return submissions.filter(s => s.status === 'in_progress');
    }, [submissions]);

    // ── GRANT EXTRA TIME FUNCTION ────────────────────────────────────────────
    const grantExtraTimeToCohort = async (minutes: number) => {
        if (activeExams.length === 0) return;

        const confirmation = window.confirm(`Are you sure you want to add ${minutes} minutes to the clock for all ${activeExams.length} active exam sessions?`);
        if (!confirmation) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);

            activeExams.forEach(sub => {
                const subRef = doc(db, 'learner_submissions', sub.id);
                batch.update(subRef, {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });

            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes to ${activeExams.length} learners!`);

            // Refresh local state to reflect changes instantly
            await fetchSubmissions();
        } catch (error) {
            console.error("Failed to grant time:", error);
            toast.error("Failed to grant extra time. Please try again.");
        } finally {
            setIsGrantingTime(false);
        }
    };

    // ── QCTO Export ──────────────────────────────────────────────────────────
    const handleQCTOExport = async () => {
        if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
        setIsExporting(true);
        try {
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId)
                || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
            const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);
            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');
            const todayQCTO = formatQCTODate(new Date().toISOString());
            const expectedCompletion = formatQCTODate(cohort.endDate);

            const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

            const dataRows = [headers.map(createTextCell)];
            enrolledLearners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const lastName = names.length > 1 ? names.pop() : '';
                const firstNames = names.join(' ');
                const title = d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr');
                const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
                const sorStatus = d.statementOfResultsStatus || (d as any).sorStatus || '02';
                const sorIssueDate = d.statementOfResultsIssueDate || (d as any).sorIssueDate || '';
                dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', lastName, firstNames, d.learnerMiddleName || '', title, getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || expectedCompletion, sorStatus, sorStatus === '01' ? cleanDate(sorIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || (d as any).eisaReadinessId || '1', d.flc || (d as any).flcStatus || '06', String(d.flcStatementOfResultNumber || (d as any).flcResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();
            const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Email:", user?.email || ''], ["Institution:", mainInstitutionName], ["Qualification:", qualNameForHeader], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
            XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
            const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success(`Export successful: ${fileName}`);
        } catch (e) { console.error('Export failed:', e); toast.error('Export failed. Check console for details.'); }
        finally { setIsExporting(false); }
    };

    // ── Sync workbooks ────────────────────────────────────────────────────────
    const syncLearnerWorkbooks = async () => {
        if (!cohortId) return;
        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            const aRef = collection(db, 'assessments');
            const [snapA, snapS] = await Promise.all([
                getDocs(query(aRef, where('cohortIds', 'array-contains', cohortId), where('status', 'in', ['active', 'scheduled']))),
                getDocs(query(aRef, where('cohortId', '==', cohortId), where('status', 'in', ['active', 'scheduled']))),
            ]);
            const allAssessments = new Map<string, any>();
            snapA.docs.forEach(d => allAssessments.set(d.id, d));
            snapS.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) {
                setIsSyncing(false);
                setModalConfig({ isOpen: true, type: 'info', title: 'No Assessments Found', message: 'There are no active assessments published for this class yet.' });
                return;
            }
            let count = 0;
            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;
                const authUid = learner.authUid || learner.idNumber || humanId;
                for (const [astId, astDoc] of allAssessments.entries()) {
                    const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohortId && (s.enrollmentId === enrolId || s.learnerId === humanId));
                    if (!exists) {
                        const data = astDoc.data();
                        batch.set(doc(db, 'learner_submissions', `${cohortId}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
                        count++;
                    }
                }
            }
            if (count > 0) { await batch.commit(); await fetchSubmissions(); setModalConfig({ isOpen: true, type: 'success', title: 'Sync Complete', message: `Generated ${count} missing workbook(s).` }); }
            else setModalConfig({ isOpen: true, type: 'success', title: 'Already Synced', message: 'All enrolled learners are up-to-date.' });
        } catch (e: any) { console.error('Sync Error:', e); setModalConfig({ isOpen: true, type: 'error', title: 'Sync Failed', message: e.message }); }
        finally { setIsSyncing(false); }
    };

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
        if (reason?.trim()) {
            if (window.confirm(`Mark ${learnerName} as dropped?`)) {
                await useStore.getState().dropLearnerFromCohort(learnerId, cohort!.id, reason);
            }
        }
    };

    const handleBack = () => {
        isAdmin ? navigate('/admin', { state: { activeTab: 'cohorts' } }) : navigate(-1);
    };

    // ── Loading state ─────────────────────────────────────────────────────────
    if (!cohort) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
                <main className="cdp-main cdp-main--centered">
                    <div className="cdp-loading-state">
                        <Loader2 size={40} className="cdp-spinner" />
                        <span className="cdp-loading-state__label">Loading Cohort Details…</span>
                    </div>
                </main>
            </div>
        );
    }

    // ── Derived data ──────────────────────────────────────────────────────────
    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
    const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
    const pendingTotal = submissions.filter(s => s.status === 'submitted').length;

    return (
        <div className="cdp-layout">

            {/* Portals */}
            {modalConfig.isOpen && createPortal(
                <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />,
                document.body
            )}
            {learnerToPlace && createPortal(
                <WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />,
                document.body
            )}

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">

                {/* ── PAGE HEADER ── */}
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow">
                            <Users size={12} /> Cohort Overview
                        </div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" />
                            {cohort.startDate} — {cohort.endDate}
                            <span className={`cdp-header__status${cohort.isArchived ? ' cdp-header__status--archived' : ' cdp-header__status--active'}`}>
                                {cohort.isArchived ? 'Archived' : 'Active Class'}
                            </span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        {(isAdmin || isFacilitator) && (
                            <div className="cdp-header__actions">
                                <button className="cdp-btn cdp-btn--outline" onClick={handleQCTOExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={13} className="cdp-spinner" /> : <DownloadCloud size={13} />}
                                    Export LEISA
                                </button>
                                <button className="cdp-btn cdp-btn--outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 size={13} className="cdp-spinner" /> : <RefreshCcw size={13} />}
                                    Sync Workbooks
                                </button>
                            </div>
                        )}
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content">

                    {/* 🚀 LIVE EXAM CONTROLS BANNER 🚀 */}
                    {activeExams.length > 0 && (
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#3b82f6', padding: '8px', borderRadius: '50%' }}>
                                    <Timer size={20} color="white" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1rem', fontWeight: 700 }}>Live Exam in Progress</h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#2563eb', fontSize: '0.85rem' }}>{activeExams.length} learner(s) currently taking an assessment.</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="cdp-btn"
                                    style={{ background: 'white', color: '#2563eb', border: '1px solid #bfdbfe' }}
                                    onClick={() => grantExtraTimeToCohort(15)}
                                    disabled={isGrantingTime}
                                >
                                    {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />}
                                    +15 Mins
                                </button>
                                <button
                                    className="cdp-btn"
                                    style={{ background: '#2563eb', color: 'white', border: '1px solid #2563eb' }}
                                    onClick={() => grantExtraTimeToCohort(30)}
                                    disabled={isGrantingTime}
                                >
                                    {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />}
                                    +30 Mins
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STAT CARDS ── */}
                    <div className="cdp-stat-row">
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><Users size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{activeCount}</span>
                                <span className="cdp-stat-card__label">Active Learners</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--green">
                            <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{placedCount}</span>
                                <span className="cdp-stat-card__label">Workplace Placements</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--amber">
                            <div className="cdp-stat-card__icon"><Clock size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{pendingTotal}</span>
                                <span className="cdp-stat-card__label">Pending Marking</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--grey">
                            <div className="cdp-stat-card__icon"><Award size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{droppedCount}</span>
                                <span className="cdp-stat-card__label">Dropped / Exited</span>
                            </div>
                        </div>
                    </div>

                    {/* ── STAFF SUMMARY CARD ── */}
                    <div className="mlab-summary-card">
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label"><Calendar size={12} /> Training Period</span>
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

                    {/* ── LEARNER TABLE ── */}
                    <div className="cdp-panel">
                        <div className="cdp-panel__header">
                            <div className="cdp-panel__title">
                                <Users size={15} className="cdp-panel__title-icon" />
                                Enrolled Learners
                                <span className="cdp-panel__count">{enrolledLearners.length}</span>
                            </div>
                        </div>

                        <div className="mlab-table-wrap">
                            <table className="mlab-table">
                                <thead>
                                    <tr>
                                        <th>Learner</th>
                                        <th>Workplace</th>
                                        <th>Module Progress</th>
                                        <th>Status</th>
                                        <th className="cdp-th--right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {enrolledLearners.map(learner => {
                                        const isDropped = learner.status === 'dropped';
                                        const routingId = learner.enrollmentId || learner.id;
                                        const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                        const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
                                        const employerObj = employers.find(e => e.id === learner.employerId);
                                        const isPlaced = !!learner.employerId && !!employerObj;

                                        const kDone = learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length;
                                        const pDone = learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length;
                                        const wDone = learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length;

                                        return (
                                            <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                <td>
                                                    <div className="cdp-learner-cell">
                                                        <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
                                                        <div className="cdp-learner-cell__info">
                                                            <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>
                                                                {learner.fullName}
                                                            </span>
                                                            <span className="cdp-learner-cell__id">{learner.idNumber}</span>
                                                            {!isDropped && pendingCount > 0 && (
                                                                <span className="cdp-pending-chip">
                                                                    <Clock size={10} /> {pendingCount} marking pending
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    {isPlaced ? (
                                                        <span className="cdp-placement__employer">{employerObj!.name}</span>
                                                    ) : (
                                                        <span className="cdp-placement--pending">
                                                            <AlertCircle size={12} /> Pending Placement
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="cdp-chips">
                                                        <ModuleChip label="K" count={kDone} variant="k" />
                                                        <ModuleChip label="P" count={pDone} variant="p" />
                                                        <ModuleChip label="W" count={wDone} variant="w" />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>
                                                        {isDropped ? 'Dropped' : 'Active'}
                                                    </span>
                                                </td>
                                                <td className="cdp-td--right">
                                                    <div className="cdp-actions">
                                                        {isAdmin && (
                                                            <button
                                                                className={`cdp-btn${isPlaced ? ' cdp-btn--outline' : ' cdp-btn--sky'}`}
                                                                onClick={() => setLearnerToPlace(learner)}
                                                                title={isPlaced ? 'Reassign workplace' : 'Assign to workplace'}
                                                            >
                                                                <Briefcase size={12} />
                                                                {isPlaced ? 'Reassign' : 'Place'}
                                                            </button>
                                                        )}
                                                        <button
                                                            className="cdp-btn cdp-btn--outline"
                                                            onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
                                                        >
                                                            <FolderOpen size={12} /> Portfolio
                                                        </button>
                                                        {isAdmin && !isDropped && (
                                                            <button
                                                                className="cdp-btn cdp-btn--danger"
                                                                onClick={() => handleDropLearner(learner.id, learner.fullName)}
                                                            >
                                                                <UserMinus size={12} />
                                                            </button>
                                                        )}
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



// // src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// import React, { useEffect, useState, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import {
//     Users, Calendar, Clock, Loader2, RefreshCcw, DownloadCloud,
//     Briefcase, FolderOpen, UserMinus, AlertCircle, ChevronLeft,
//     CheckCircle, BookOpen, Wrench, Building2, Award, ArrowUpRight
// } from 'lucide-react';
// import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// import * as XLSX from 'xlsx';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import './CohortDetailsPage.css';
// import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// import { useToast } from '../../components/common/Toast/Toast';
// import type { DashboardLearner } from '../../types';
// import { createPortal } from 'react-dom';
// import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';

// // ─── QCTO HELPERS ────────────────────────────────────────────────────────────

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

// // ─── STAT CHIP ────────────────────────────────────────────────────────────────
// const ModuleChip: React.FC<{ label: string; count: number; variant: 'k' | 'p' | 'w' }> = ({ label, count, variant }) => (
//     <span className={`cdp-chip cdp-chip--${variant}`}>{label}: {count}</span>
// );

// // ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// export const CohortDetailsPage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();
//     const toast = useToast();

//     const {
//         user, cohorts, learners, staff, employers, settings, programmes, enrollments,
//         fetchCohorts, fetchLearners, fetchStaff, fetchEmployers, fetchEnrollments
//     } = useStore();

//     const [isSyncing, setIsSyncing] = useState(false);
//     const [isExporting, setIsExporting] = useState(false);
//     const [submissions, setSubmissions] = useState<any[]>([]);
//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>
//         ({ isOpen: false, type: 'info', title: '', message: '' });
//     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

//     const isAdmin = user?.role === 'admin';
//     const isFacilitator = user?.role === 'facilitator';
//     const cohort = cohorts.find(c => c.id === cohortId);

//     // Build enrolled learners from registration ledger
//     const enrolledLearners = useMemo(() => {
//         if (!cohortId) return [];
//         const cohortEnrollments = enrollments.filter(e => e.cohortId === cohortId);
//         const merged: DashboardLearner[] = [];
//         cohortEnrollments.forEach(enrollment => {
//             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
//             if (profile?.fullName && profile?.idNumber) {
//                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });
//         learners.forEach(profile => {
//             if (profile.cohortId === cohortId && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
//                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });
//         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
//     }, [learners, enrollments, cohortId]);

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (staff.length === 0) fetchStaff();
//         if (employers.length === 0) fetchEmployers();
//         if (enrollments.length === 0) fetchEnrollments();
//     }, [cohorts, learners, staff, employers, enrollments]);

//     const fetchSubmissions = async () => {
//         if (!cohortId) return;
//         try {
//             const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId)));
//             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//         } catch (e) { console.error('Error fetching submissions:', e); }
//     };
//     useEffect(() => { fetchSubmissions(); }, [cohortId]);

//     // ── QCTO Export ──────────────────────────────────────────────────────────
//     const handleQCTOExport = async () => {
//         if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
//         setIsExporting(true);
//         try {
//             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId)
//                 || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
//             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
//             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
//             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
//             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);
//             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
//             const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');
//             const todayQCTO = formatQCTODate(new Date().toISOString());
//             const expectedCompletion = formatQCTODate(cohort.endDate);

//             const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

//             const dataRows = [headers.map(createTextCell)];
//             enrolledLearners.forEach(learner => {
//                 const d = learner.demographics || {};
//                 const names = (learner.fullName || '').trim().split(' ');
//                 const lastName = names.length > 1 ? names.pop() : '';
//                 const firstNames = names.join(' ');
//                 const title = d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr');
//                 const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
//                 const sorStatus = d.statementOfResultsStatus || (d as any).sorStatus || '02';
//                 const sorIssueDate = d.statementOfResultsIssueDate || (d as any).sorIssueDate || '';
//                 dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', lastName, firstNames, d.learnerMiddleName || '', title, getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || expectedCompletion, sorStatus, sorStatus === '01' ? cleanDate(sorIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || (d as any).eisaReadinessId || '1', d.flc || (d as any).flcStatus || '06', String(d.flcStatementOfResultNumber || (d as any).flcResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
//             });

//             const wb = XLSX.utils.book_new();
//             const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Email:", user?.email || ''], ["Institution:", mainInstitutionName], ["Qualification:", qualNameForHeader], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
//             XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
//             XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
//             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
//             XLSX.writeFile(wb, fileName);
//             toast.success(`Export successful: ${fileName}`);
//         } catch (e) { console.error('Export failed:', e); toast.error('Export failed. Check console for details.'); }
//         finally { setIsExporting(false); }
//     };

//     // ── Sync workbooks ────────────────────────────────────────────────────────
//     const syncLearnerWorkbooks = async () => {
//         if (!cohortId) return;
//         setIsSyncing(true);
//         try {
//             const batch = writeBatch(db);
//             const aRef = collection(db, 'assessments');
//             const [snapA, snapS] = await Promise.all([
//                 getDocs(query(aRef, where('cohortIds', 'array-contains', cohortId), where('status', 'in', ['active', 'scheduled']))),
//                 getDocs(query(aRef, where('cohortId', '==', cohortId), where('status', 'in', ['active', 'scheduled']))),
//             ]);
//             const allAssessments = new Map<string, any>();
//             snapA.docs.forEach(d => allAssessments.set(d.id, d));
//             snapS.docs.forEach(d => allAssessments.set(d.id, d));

//             if (allAssessments.size === 0) {
//                 setIsSyncing(false);
//                 setModalConfig({ isOpen: true, type: 'info', title: 'No Assessments Found', message: 'There are no active assessments published for this class yet.' });
//                 return;
//             }
//             let count = 0;
//             for (const learner of enrolledLearners) {
//                 const enrolId = learner.enrollmentId || learner.id;
//                 const humanId = learner.learnerId || learner.id;
//                 const authUid = learner.authUid || learner.idNumber || humanId;
//                 for (const [astId, astDoc] of allAssessments.entries()) {
//                     const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohortId && (s.enrollmentId === enrolId || s.learnerId === humanId));
//                     if (!exists) {
//                         const data = astDoc.data();
//                         batch.set(doc(db, 'learner_submissions', `${cohortId}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
//                         count++;
//                     }
//                 }
//             }
//             if (count > 0) { await batch.commit(); await fetchSubmissions(); setModalConfig({ isOpen: true, type: 'success', title: 'Sync Complete', message: `Generated ${count} missing workbook(s).` }); }
//             else setModalConfig({ isOpen: true, type: 'success', title: 'Already Synced', message: 'All enrolled learners are up-to-date.' });
//         } catch (e: any) { console.error('Sync Error:', e); setModalConfig({ isOpen: true, type: 'error', title: 'Sync Failed', message: e.message }); }
//         finally { setIsSyncing(false); }
//     };

//     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     const handleDropLearner = async (learnerId: string, learnerName: string) => {
//         const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
//         if (reason?.trim()) {
//             if (window.confirm(`Mark ${learnerName} as dropped?`)) {
//                 await useStore.getState().dropLearnerFromCohort(learnerId, cohort!.id, reason);
//             }
//         }
//     };

//     const handleBack = () => {
//         isAdmin ? navigate('/admin', { state: { activeTab: 'cohorts' } }) : navigate(-1);
//     };

//     // ── Loading state ─────────────────────────────────────────────────────────
//     if (!cohort) {
//         return (
//             <div className="cdp-layout">
//                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
//                 <main className="cdp-main cdp-main--centered">
//                     <div className="cdp-loading-state">
//                         <Loader2 size={40} className="cdp-spinner" />
//                         <span className="cdp-loading-state__label">Loading Cohort Details…</span>
//                     </div>
//                 </main>
//             </div>
//         );
//     }

//     // ── Derived data ──────────────────────────────────────────────────────────
//     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
//     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
//     const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
//     const pendingTotal = submissions.filter(s => s.status === 'submitted').length;

//     return (
//         <div className="cdp-layout">

//             {/* Portals */}
//             {modalConfig.isOpen && createPortal(
//                 <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />,
//                 document.body
//             )}
//             {learnerToPlace && createPortal(
//                 <WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />,
//                 document.body
//             )}

//             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

//             <main className="cdp-main">

//                 {/* ── PAGE HEADER ── */}
//                 <header className="cdp-header">
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={handleBack}>
//                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
//                         </button>
//                         <div className="cdp-header__eyebrow">
//                             <Users size={12} /> Cohort Overview
//                         </div>
//                         <h1 className="cdp-header__title">{cohort.name}</h1>
//                         <p className="cdp-header__sub">
//                             <Calendar size={12} className="cdp-header__sub-icon" />
//                             {cohort.startDate} — {cohort.endDate}
//                             <span className={`cdp-header__status${cohort.isArchived ? ' cdp-header__status--archived' : ' cdp-header__status--active'}`}>
//                                 {cohort.isArchived ? 'Archived' : 'Active Class'}
//                             </span>
//                         </p>
//                     </div>
//                     <div className="cdp-header__right">
//                         {(isAdmin || isFacilitator) && (
//                             <div className="cdp-header__actions">
//                                 <button className="cdp-btn cdp-btn--outline" onClick={handleQCTOExport} disabled={isExporting}>
//                                     {isExporting ? <Loader2 size={13} className="cdp-spinner" /> : <DownloadCloud size={13} />}
//                                     Export LEISA
//                                 </button>
//                                 <button className="cdp-btn cdp-btn--outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
//                                     {isSyncing ? <Loader2 size={13} className="cdp-spinner" /> : <RefreshCcw size={13} />}
//                                     Sync Workbooks
//                                 </button>
//                             </div>
//                         )}
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="cdp-content">

//                     {/* ── STAT CARDS ── */}
//                     <div className="cdp-stat-row">
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Users size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{activeCount}</span>
//                                 <span className="cdp-stat-card__label">Active Learners</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--green">
//                             <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{placedCount}</span>
//                                 <span className="cdp-stat-card__label">Workplace Placements</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--amber">
//                             <div className="cdp-stat-card__icon"><Clock size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{pendingTotal}</span>
//                                 <span className="cdp-stat-card__label">Pending Marking</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--grey">
//                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{droppedCount}</span>
//                                 <span className="cdp-stat-card__label">Dropped / Exited</span>
//                             </div>
//                         </div>
//                     </div>

//                     {/* ── STAFF SUMMARY CARD ── */}
//                     <div className="mlab-summary-card">
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label"><Calendar size={12} /> Training Period</span>
//                             <span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Facilitator</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Assessor</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
//                         </div>
//                         <div className="mlab-summary-item">
//                             <span className="mlab-summary-item__label">Moderator</span>
//                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
//                         </div>
//                     </div>

//                     {/* ── LEARNER TABLE ── */}
//                     <div className="cdp-panel">
//                         <div className="cdp-panel__header">
//                             <div className="cdp-panel__title">
//                                 <Users size={15} className="cdp-panel__title-icon" />
//                                 Enrolled Learners
//                                 <span className="cdp-panel__count">{enrolledLearners.length}</span>
//                             </div>
//                         </div>

//                         <div className="mlab-table-wrap">
//                             <table className="mlab-table">
//                                 <thead>
//                                     <tr>
//                                         <th>Learner</th>
//                                         <th>Workplace</th>
//                                         <th>Module Progress</th>
//                                         <th>Status</th>
//                                         <th className="cdp-th--right">Actions</th>
//                                     </tr>
//                                 </thead>
//                                 <tbody>
//                                     {enrolledLearners.map(learner => {
//                                         const isDropped = learner.status === 'dropped';
//                                         const routingId = learner.enrollmentId || learner.id;
//                                         const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
//                                         const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
//                                         const employerObj = employers.find(e => e.id === learner.employerId);
//                                         const isPlaced = !!learner.employerId && !!employerObj;

//                                         const kDone = learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length;
//                                         const pDone = learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length;
//                                         const wDone = learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length;

//                                         return (
//                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
//                                                 <td>
//                                                     <div className="cdp-learner-cell">
//                                                         <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
//                                                         <div className="cdp-learner-cell__info">
//                                                             <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>
//                                                                 {learner.fullName}
//                                                             </span>
//                                                             <span className="cdp-learner-cell__id">{learner.idNumber}</span>
//                                                             {!isDropped && pendingCount > 0 && (
//                                                                 <span className="cdp-pending-chip">
//                                                                     <Clock size={10} /> {pendingCount} marking pending
//                                                                 </span>
//                                                             )}
//                                                         </div>
//                                                     </div>
//                                                 </td>
//                                                 <td>
//                                                     {isPlaced ? (
//                                                         <span className="cdp-placement__employer">{employerObj!.name}</span>
//                                                     ) : (
//                                                         <span className="cdp-placement--pending">
//                                                             <AlertCircle size={12} /> Pending Placement
//                                                         </span>
//                                                     )}
//                                                 </td>
//                                                 <td>
//                                                     <div className="cdp-chips">
//                                                         <ModuleChip label="K" count={kDone} variant="k" />
//                                                         <ModuleChip label="P" count={pDone} variant="p" />
//                                                         <ModuleChip label="W" count={wDone} variant="w" />
//                                                     </div>
//                                                 </td>
//                                                 <td>
//                                                     <span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>
//                                                         {isDropped ? 'Dropped' : 'Active'}
//                                                     </span>
//                                                 </td>
//                                                 <td className="cdp-td--right">
//                                                     <div className="cdp-actions">
//                                                         {isAdmin && (
//                                                             <button
//                                                                 className={`cdp-btn${isPlaced ? ' cdp-btn--outline' : ' cdp-btn--sky'}`}
//                                                                 onClick={() => setLearnerToPlace(learner)}
//                                                                 title={isPlaced ? 'Reassign workplace' : 'Assign to workplace'}
//                                                             >
//                                                                 <Briefcase size={12} />
//                                                                 {isPlaced ? 'Reassign' : 'Place'}
//                                                             </button>
//                                                         )}
//                                                         <button
//                                                             className="cdp-btn cdp-btn--outline"
//                                                             onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
//                                                         >
//                                                             <FolderOpen size={12} /> Portfolio
//                                                         </button>
//                                                         {isAdmin && !isDropped && (
//                                                             <button
//                                                                 className="cdp-btn cdp-btn--danger"
//                                                                 onClick={() => handleDropLearner(learner.id, learner.fullName)}
//                                                             >
//                                                                 <UserMinus size={12} />
//                                                             </button>
//                                                         )}
//                                                     </div>
//                                                 </td>
//                                             </tr>
//                                         );
//                                     })}
//                                 </tbody>
//                             </table>
//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };


// // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import {
// //     Users, Calendar, Clock, Loader2,
// //     RefreshCcw, Edit, DownloadCloud,
// //     Briefcase, FolderOpen, UserMinus, AlertCircle
// // } from 'lucide-react';
// // import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// // import * as XLSX from 'xlsx';
// // import { db } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// // import './CohortDetailsPage.css';
// // import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
// // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// // import { useToast } from '../../components/common/Toast/Toast';
// // import type { DashboardLearner } from '../../types';
// // import { createPortal } from 'react-dom'; // 🚀 IMPORTED CREATEPORTAL

// // // ─── QCTO HELPERS ────────────────────────────────────────────────────────

// // const formatQCTODate = (dateString?: string) => {
// //     if (!dateString) return '';
// //     const d = new Date(dateString);
// //     if (isNaN(d.getTime())) return '';
// //     const year = d.getFullYear();
// //     const month = String(d.getMonth() + 1).padStart(2, '0');
// //     const day = String(d.getDate()).padStart(2, '0');
// //     return `${year}${month}${day}`;
// // };

// // const getDOBFromID = (idNumber: string) => {
// //     const cleanId = String(idNumber || '').replace(/\s/g, '');
// //     if (cleanId.length !== 13) return '';
// //     try {
// //         let year = parseInt(cleanId.substring(0, 2), 10);
// //         const month = cleanId.substring(2, 4);
// //         const day = cleanId.substring(4, 6);
// //         const currentYearShort = new Date().getFullYear() % 100;
// //         year += year <= currentYearShort ? 2000 : 1900;
// //         return `${year}${month}${day}`;
// //     } catch (e) {
// //         return '';
// //     }
// // };

// // const createTextCell = (val: any) => ({
// //     t: 's',
// //     v: String(val === null || val === undefined ? '' : val),
// //     z: '@'
// // });

// // export const CohortDetailsPage: React.FC = () => {
// //     const { cohortId } = useParams();
// //     const navigate = useNavigate();
// //     const toast = useToast();

// //     const {
// //         user, cohorts, learners, staff, employers, settings, programmes,
// //         fetchCohorts, fetchLearners, fetchStaff, fetchEmployers
// //     } = useStore();

// //     const [isSyncing, setIsSyncing] = useState(false);
// //     const [isExporting, setIsExporting] = useState(false);
// //     const [submissions, setSubmissions] = useState<any[]>([]);

// //     const [modalConfig, setModalConfig] = useState<{
// //         isOpen: boolean;
// //         type: StatusType;
// //         title: string;
// //         message: string;
// //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

// //     const isAdmin = user?.role === 'admin';
// //     const isFacilitator = user?.role === 'facilitator';
// //     const cohort = cohorts.find(c => c.id === cohortId);

// //     const headerTheme = useMemo((): HeaderTheme => {
// //         if (!user?.role) return 'default';
// //         if (user.role === 'learner') return 'student';
// //         return user.role as HeaderTheme;
// //     }, [user?.role]);

// //     const enrolledLearners = useMemo(() => {
// //         return learners.filter(l => {
// //             const hasCohortId = l.cohortId === cohortId;
// //             const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// //             return hasCohortId || isInCohortArray;
// //         });
// //     }, [learners, cohort, cohortId]);

// //     useEffect(() => {
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //         if (staff.length === 0) fetchStaff();
// //         if (employers.length === 0) fetchEmployers();
// //     }, [cohorts, learners, staff, employers, fetchCohorts, fetchLearners, fetchStaff, fetchEmployers]);

// //     const fetchSubmissions = async () => {
// //         if (!cohortId) return;
// //         try {
// //             const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
// //             const snap = await getDocs(q);
// //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //         } catch (error) {
// //             console.error("Error fetching submissions:", error);
// //         }
// //     };

// //     useEffect(() => {
// //         fetchSubmissions();
// //     }, [cohortId]);

// //     // ─── QCTO EXPORT HANDLER ─────────────────────────────────────────────
// //     const handleQCTOExport = async () => {
// //         if (!cohort || enrolledLearners.length === 0) {
// //             toast.error('Cannot export an empty cohort.');
// //             return;
// //         }

// //         setIsExporting(true);
// //         try {
// //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId)
// //                 || settings?.campuses?.find((c: any) => c.isDefault)
// //                 || settings?.campuses?.[0];

// //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';

// //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);

// //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// //             const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');

// //             const todayQCTO = formatQCTODate(new Date().toISOString());
// //             const expectedCompletion = formatQCTODate(cohort.endDate);

// //             // 43 COMPULSORY COLUMNS
// //             const headers = [
// //                 "SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type",
// //                 "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code",
// //                 "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status",
// //                 "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date",
// //                 "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3",
// //                 "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3",
// //                 "Learner Home Address Postal Code", "Learner Postal Address Post Code",
// //                 "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address",
// //                 "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date",
// //                 "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date",
// //                 "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"
// //             ];

// //             const dataRows = [headers.map(createTextCell)];

// //             enrolledLearners.forEach(learner => {
// //                 const d = learner.demographics || {};

// //                 const names = (learner.fullName || '').trim().split(' ');
// //                 const lastName = names.length > 1 ? names.pop() : '';
// //                 const firstNames = names.join(' ');
// //                 const title = d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr');

// //                 // Helper for Date Formatting inside loop
// //                 const cleanDate = (dateVal?: string) => {
// //                     if (!dateVal) return "";
// //                     const parts = dateVal.split('-');
// //                     if (parts.length === 3) {
// //                         if (parts[0].length === 4) return `${parts[0]}${parts[1]}${parts[2]}`;
// //                         if (parts[2].length === 4) return `${parts[2]}${parts[1]}${parts[0]}`;
// //                     }
// //                     return dateVal.replace(/-/g, '');
// //                 };

// //                 const sorStatus = d.statementOfResultsStatus || (d as any).sorStatus || "02";
// //                 const sorIssueDate = d.statementOfResultsIssueDate || (d as any).sorIssueDate || "";

// //                 // DIRECT ARRAY PUSH TO PREVENT SHADOWING/MAPPING LOSS
// //                 dataRows.push([
// //                     rawSdpCode,                                         // 1
// //                     saqaId,                                             // 2
// //                     learner.idNumber,                                   // 3
// //                     d.learnerAlternateId || "",                         // 4
// //                     d.alternativeIdType || "533",                       // 5
// //                     d.equityCode || "",                                 // 6
// //                     d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), // 7
// //                     d.homeLanguageCode || "",                           // 8
// //                     d.genderCode || "",                                 // 9
// //                     d.citizenResidentStatusCode || 'SA',                // 10
// //                     d.socioeconomicStatusCode || "01",                  // 11
// //                     d.disabilityStatusCode || 'N',                      // 12
// //                     d.disabilityRating || "",                           // 13
// //                     d.immigrantStatus || "03",                          // 14
// //                     lastName,                                           // 15
// //                     firstNames,                                         // 16
// //                     d.learnerMiddleName || "",                          // 17
// //                     title,                                              // 18
// //                     getDOBFromID(learner.idNumber),                     // 19
// //                     d.learnerHomeAddress1 || "",                        // 20
// //                     d.learnerHomeAddress2 || "",                        // 21
// //                     d.learnerHomeAddress3 || "",                        // 22
// //                     d.learnerPostalAddress1 || d.learnerHomeAddress1 || "", // 23
// //                     d.learnerPostalAddress2 || d.learnerHomeAddress2 || "", // 24
// //                     d.learnerPostalAddress3 || "",                      // 25
// //                     d.learnerHomeAddressPostalCode || "",               // 26
// //                     d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || "", // 27
// //                     d.learnerPhoneNumber || learner.phone || "",        // 28
// //                     d.learnerPhoneNumber || learner.phone || "",        // 29
// //                     d.learnerFaxNumber || "",                           // 30
// //                     d.learnerEmailAddress || learner.email || "",       // 31
// //                     d.provinceCode || "",                               // 32
// //                     d.statsaaAreaCode || (d as any).statssaAreaCode || "", // 33
// //                     d.popiActAgree === 'No' ? 'N' : 'Y',                // 34
// //                     cleanDate(d.popiActDate) || todayQCTO,              // 35
// //                     cleanDate(d.expectedTrainingCompletionDate) || expectedCompletion, // 36
// //                     sorStatus,                                          // 37
// //                     sorStatus === "01" ? cleanDate(sorIssueDate) : "",  // 38
// //                     d.assessmentCentreCode || "",                       // 39
// //                     d.learnerReadinessForEISATypeId || (d as any).eisaReadinessId || "1", // 40
// //                     d.flc || (d as any).flcStatus || "06",              // 41

// //                     // EXPLICITLY READ FROM THE KEY VERIFIED IN CONSOLE
// //                     String(d.flcStatementOfResultNumber || (d as any).flcResultNumber || ""), // 42

// //                     d.dateStamp || todayQCTO                            // 43
// //                 ].map(createTextCell));
// //             });

// //             const wb = XLSX.utils.book_new();

// //             // Instructions Sheet
// //             const instructions = [
// //                 ["DETAILS: (COMPULSORY INFORMATION)"],
// //                 ["Compiler:", user?.fullName || ''],
// //                 ["Email:", user?.email || ''],
// //                 ["Institution:", mainInstitutionName],
// //                 ["Qualification:", qualNameForHeader],
// //                 ["SAQA ID:", saqaId],
// //                 ["SDP Code:", rawSdpCode],
// //                 ["Total Learners:", enrolledLearners.length],
// //                 ["Export Date:", new Date().toLocaleDateString()]
// //             ].map(row => row.map(createTextCell));

// //             const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
// //             XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

// //             // Data Sheet
// //             const wsData = XLSX.utils.aoa_to_sheet(dataRows);
// //             XLSX.utils.book_append_sheet(wb, wsData, "Learner Enrolment and EISA");

// //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// //             XLSX.writeFile(wb, fileName);
// //             toast.success(`Export successful: ${fileName}`);

// //         } catch (error) {
// //             console.error("Export failed:", error);
// //             toast.error("Export failed. Check console for details.");
// //         } finally {
// //             setIsExporting(false);
// //         }
// //     };


// //     const syncLearnerWorkbooks = async () => {
// //         if (!cohortId) return;
// //         setIsSyncing(true);

// //         try {
// //             const batch = writeBatch(db);
// //             const assessmentsRef = collection(db, 'assessments');

// //             const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
// //             const snapArray = await getDocs(qArray);

// //             const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
// //             const snapString = await getDocs(qString);

// //             const allAssessments = new Map();
// //             snapArray.docs.forEach(d => allAssessments.set(d.id, d));
// //             snapString.docs.forEach(d => allAssessments.set(d.id, d));

// //             if (allAssessments.size === 0) {
// //                 setIsSyncing(false);
// //                 setModalConfig({ isOpen: true, type: 'info', title: 'No Assessments Found', message: 'There are no active assessments published for this class yet.' });
// //                 return;
// //             }

// //             let newDocsCount = 0;

// //             for (const learner of enrolledLearners) {
// //                 const enrolId = learner.enrollmentId || learner.id;
// //                 const humanId = learner.learnerId || learner.id;
// //                 const authUid = learner.authUid || null; // 🚀 GET AUTH UID IF IT EXISTS

// //                 for (const [astId, astDoc] of allAssessments.entries()) {
// //                     // We check if this exact learner+assessment combo already has a submission
// //                     const alreadyExists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohortId && (s.enrollmentId === enrolId || s.learnerId === humanId));

// //                     if (!alreadyExists) {
// //                         const astData = astDoc.data();
// //                         // We use a composite ID so we don't accidentally create duplicates
// //                         const submissionId = `${cohortId}_${humanId}_${astId}`;
// //                         const subRef = doc(db, 'learner_submissions', submissionId);

// //                         batch.set(subRef, {
// //                             learnerId: humanId,
// //                             enrollmentId: enrolId,
// //                             authUid: authUid, // 🚀 SAVE IT TO THE SUBMISSION
// //                             qualificationName: learner.qualification?.name || '',
// //                             assessmentId: astId,
// //                             cohortId: cohortId,
// //                             title: astData.title,
// //                             type: astData.type || 'formative',
// //                             moduleNumber: astData.moduleInfo?.moduleNumber || '',
// //                             moduleType: astData.moduleType || 'knowledge',
// //                             status: 'not_started',
// //                             answers: {},
// //                             assignedAt: new Date().toISOString(),
// //                             totalMarks: astData.totalMarks || 0,
// //                             marks: 0,
// //                             createdAt: new Date().toISOString()
// //                         });
// //                         newDocsCount++;
// //                     }
// //                 }
// //             }

// //             if (newDocsCount > 0) {
// //                 await batch.commit();
// //                 await fetchSubmissions();
// //                 setModalConfig({ isOpen: true, type: 'success', title: 'Sync Complete', message: `Generated ${newDocsCount} missing workbook(s).` });
// //             } else {
// //                 setModalConfig({ isOpen: true, type: 'success', title: 'Already Synced', message: 'All enrolled learners are up-to-date.' });
// //             }

// //         } catch (error: any) {
// //             console.error("Sync Error:", error);
// //             setModalConfig({ isOpen: true, type: 'error', title: 'Sync Failed', message: error.message });
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     if (!cohort) {
// //         return (
// //             <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// //                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
// //                 <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
// //                     <div className="mlab-state mlab-state--loading">
// //                         <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
// //                         <span>Loading Cohort Details…</span>
// //                     </div>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// //     const getEmployerName = (id?: string) => employers.find(e => e.id === id)?.name || 'Unknown Workplace';

// //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// //         const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
// //         if (reason && reason.trim().length > 0) {
// //             if (window.confirm(`Mark ${learnerName} as dropped?`)) {
// //                 await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
// //             }
// //         }
// //     };

// //     const handleBackNavigation = () => {
// //         isAdmin ? navigate('/admin', { state: { activeTab: 'cohorts' } }) : navigate(-1);
// //     };

// //     return (
// //         <div className="admin-layout">

// //             {/* 🚀 MODALS MOVED TO PORTALS 🚀 */}
// //             {modalConfig.isOpen && createPortal(
// //                 <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} />,
// //                 document.body
// //             )}

// //             {learnerToPlace && createPortal(
// //                 <WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />,
// //                 document.body
// //             )}

// //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// //             <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

// //                 <PageHeader
// //                     theme={headerTheme}
// //                     variant="hero"
// //                     eyebrow={`${cohort.name}`}
// //                     title="Cohort Overview"
// //                     description="Manage Class Progress, Attendance & Exits."
// //                     onBack={handleBackNavigation}
// //                     backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
// //                     status={{
// //                         label: cohort.isArchived ? 'Archived' : 'Active Class',
// //                         variant: cohort.isArchived ? 'draft' : 'active'
// //                     }}
// //                     actions={
// //                         (isAdmin || isFacilitator) ? (
// //                             <div style={{ display: 'flex', gap: '10px' }}>
// //                                 <PageHeader.Btn variant="outline" onClick={handleQCTOExport} disabled={isExporting}>
// //                                     {isExporting ? <Loader2 size={14} className="spin" /> : <DownloadCloud size={14} />}
// //                                     Export LEISA
// //                                 </PageHeader.Btn>
// //                                 <PageHeader.Btn variant="outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// //                                     {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
// //                                     Sync Workbooks
// //                                 </PageHeader.Btn>
// //                             </div>
// //                         ) : undefined
// //                     }
// //                 />

// //                 <div className="admin-content" style={{ paddingBottom: '4rem', padding: 16 }}>

// //                     <div className="mlab-summary-card">
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label"><Calendar size={13} /> Training Dates</span>
// //                             <span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Facilitator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Assessor</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// //                         </div>
// //                         <div className="mlab-summary-item">
// //                             <span className="mlab-summary-item__label">Moderator</span>
// //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// //                         </div>
// //                     </div>

// //                     <div className="mlab-section" style={{ padding: 16 }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
// //                             <h3 className="mlab-section__title" style={{ margin: 0 }}>
// //                                 <Users size={16} /> Enrolled Learners ({enrolledLearners.length})
// //                             </h3>
// //                         </div>

// //                         <div className="mlab-table-wrap">
// //                             <table className="mlab-table">
// //                                 <thead>
// //                                     <tr>
// //                                         <th>Learner</th>
// //                                         <th>Workplace</th>
// //                                         <th>Progress</th>
// //                                         <th>Status</th>
// //                                         <th>Actions</th>
// //                                     </tr>
// //                                 </thead>
// //                                 <tbody>
// //                                     {enrolledLearners.map(learner => {
// //                                         const isDropped = learner.status === 'dropped';
// //                                         const routingId = learner.enrollmentId || learner.id;
// //                                         const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// //                                         const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

// //                                         const employerObj = employers.find(e => e.id === learner.employerId);
// //                                         const isPlaced = !!learner.employerId && !!employerObj;

// //                                         return (
// //                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// //                                                 <td>
// //                                                     <div className="mlab-cell-name">{learner.fullName}</div>
// //                                                     <div className="mlab-cell-sub">{learner.idNumber}</div>
// //                                                     {!isDropped && pendingMarking.length > 0 && (
// //                                                         <div style={{ color: '#3b82f6', fontSize: '0.75rem', marginTop: '4px' }}>
// //                                                             <Clock size={12} /> {pendingMarking.length} marking pending
// //                                                         </div>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     {isPlaced ? (
// //                                                         <span style={{ fontWeight: 500 }}>{employerObj.name}</span>
// //                                                     ) : (
// //                                                         <span style={{ color: '#d97706', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                             <AlertCircle size={13} /> Pending Placement
// //                                                         </span>
// //                                                     )}
// //                                                 </td>
// //                                                 <td>
// //                                                     <div className="mlab-module-chips">
// //                                                         <span className="mlab-chip mlab-chip--k">K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
// //                                                         <span className="mlab-chip mlab-chip--p">P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
// //                                                         <span className="mlab-chip mlab-chip--k">W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
// //                                                     </div>
// //                                                 </td>
// //                                                 <td>
// //                                                     {isDropped ? <span className="text-red-500">Dropped</span> : <span className="text-green-500">Active</span>}
// //                                                 </td>
// //                                                 <td>
// //                                                     <div className="cdp-actions">
// //                                                         {isAdmin && (
// //                                                             <button
// //                                                                 className={`mlab-btn ${isPlaced ? 'mlab-btn--outline-blue' : 'cdp-btn--sky'}`}
// //                                                                 onClick={() => setLearnerToPlace(learner)}
// //                                                                 title={isPlaced ? "Reassign to a different company" : "Assign to a workplace"}
// //                                                             >
// //                                                                 <Briefcase size={13} /> {isPlaced ? 'Reassign' : 'Place'}
// //                                                             </button>
// //                                                         )}
// //                                                         <button
// //                                                             className="mlab-btn mlab-btn--outline-blue"
// //                                                             onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
// //                                                             title="View learner's digital portfolio"
// //                                                         >
// //                                                             <FolderOpen size={13} /> Portfolio
// //                                                         </button>
// //                                                         {isAdmin && !isDropped && (
// //                                                             <button
// //                                                                 className="mlab-btn mlab-btn--outline-red"
// //                                                                 onClick={() => handleDropLearner(learner.id, learner.fullName)}
// //                                                                 title="Remove learner from this class"
// //                                                             >
// //                                                                 <UserMinus size={13} /> Remove
// //                                                             </button>
// //                                                         )}
// //                                                     </div>
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     })}
// //                                 </tbody>
// //                             </table>
// //                         </div>
// //                     </div>
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };



// // // // src/pages/CohortDetailsPage/CohortDetailsPage.tsx

// // // import React, { useEffect, useState, useMemo } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     Users, Calendar, Clock, Loader2,
// // //     RefreshCcw, Edit, DownloadCloud,
// // //     Briefcase, FolderOpen, UserMinus, AlertCircle
// // // } from 'lucide-react';
// // // import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
// // // import * as XLSX from 'xlsx';
// // // import { db } from '../../lib/firebase';
// // // import { useStore } from '../../store/useStore';
// // // import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// // // import './CohortDetailsPage.css';
// // // import PageHeader, { type HeaderTheme } from '../../components/common/PageHeader/PageHeader';
// // // import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
// // // import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
// // // import { useToast } from '../../components/common/Toast/Toast';
// // // import type { DashboardLearner } from '../../types';

// // // // ─── QCTO HELPERS ────────────────────────────────────────────────────────

// // // const formatQCTODate = (dateString?: string) => {
// // //     if (!dateString) return '';
// // //     const d = new Date(dateString);
// // //     if (isNaN(d.getTime())) return '';
// // //     const year = d.getFullYear();
// // //     const month = String(d.getMonth() + 1).padStart(2, '0');
// // //     const day = String(d.getDate()).padStart(2, '0');
// // //     return `${year}${month}${day}`;
// // // };

// // // const getDOBFromID = (idNumber: string) => {
// // //     const cleanId = String(idNumber || '').replace(/\s/g, '');
// // //     if (cleanId.length !== 13) return '';
// // //     try {
// // //         let year = parseInt(cleanId.substring(0, 2), 10);
// // //         const month = cleanId.substring(2, 4);
// // //         const day = cleanId.substring(4, 6);
// // //         const currentYearShort = new Date().getFullYear() % 100;
// // //         year += year <= currentYearShort ? 2000 : 1900;
// // //         return `${year}${month}${day}`;
// // //     } catch (e) {
// // //         return '';
// // //     }
// // // };

// // // const createTextCell = (val: any) => ({
// // //     t: 's',
// // //     v: String(val === null || val === undefined ? '' : val),
// // //     z: '@'
// // // });

// // // export const CohortDetailsPage: React.FC = () => {
// // //     const { cohortId } = useParams();
// // //     const navigate = useNavigate();
// // //     const toast = useToast();

// // //     const {
// // //         user, cohorts, learners, staff, employers, settings, programmes,
// // //         fetchCohorts, fetchLearners, fetchStaff, fetchEmployers
// // //     } = useStore();

// // //     const [isSyncing, setIsSyncing] = useState(false);
// // //     const [isExporting, setIsExporting] = useState(false);
// // //     const [submissions, setSubmissions] = useState<any[]>([]);

// // //     const [modalConfig, setModalConfig] = useState<{
// // //         isOpen: boolean;
// // //         type: StatusType;
// // //         title: string;
// // //         message: string;
// // //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// // //     const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

// // //     const isAdmin = user?.role === 'admin';
// // //     const isFacilitator = user?.role === 'facilitator';
// // //     const cohort = cohorts.find(c => c.id === cohortId);

// // //     const headerTheme = useMemo((): HeaderTheme => {
// // //         if (!user?.role) return 'default';
// // //         if (user.role === 'learner') return 'student';
// // //         return user.role as HeaderTheme;
// // //     }, [user?.role]);

// // //     const enrolledLearners = useMemo(() => {
// // //         return learners.filter(l => {
// // //             const hasCohortId = l.cohortId === cohortId;
// // //             const isInCohortArray = cohort?.learnerIds?.includes(l.id);
// // //             return hasCohortId || isInCohortArray;
// // //         });
// // //     }, [learners, cohort, cohortId]);

// // //     useEffect(() => {
// // //         if (cohorts.length === 0) fetchCohorts();
// // //         if (learners.length === 0) fetchLearners();
// // //         if (staff.length === 0) fetchStaff();
// // //         if (employers.length === 0) fetchEmployers();
// // //     }, [cohorts, learners, staff, employers, fetchCohorts, fetchLearners, fetchStaff, fetchEmployers]);

// // //     const fetchSubmissions = async () => {
// // //         if (!cohortId) return;
// // //         try {
// // //             const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId));
// // //             const snap = await getDocs(q);
// // //             setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // //         } catch (error) {
// // //             console.error("Error fetching submissions:", error);
// // //         }
// // //     };

// // //     useEffect(() => {
// // //         fetchSubmissions();
// // //     }, [cohortId]);

// // //     // ─── QCTO EXPORT HANDLER ─────────────────────────────────────────────
// // //     const handleQCTOExport = async () => {
// // //         if (!cohort || enrolledLearners.length === 0) {
// // //             toast.error('Cannot export an empty cohort.');
// // //             return;
// // //         }

// // //         setIsExporting(true);
// // //         try {
// // //             const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId)
// // //                 || settings?.campuses?.find((c: any) => c.isDefault)
// // //                 || settings?.campuses?.[0];

// // //             const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
// // //             const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';

// // //             const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
// // //             const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);

// // //             const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
// // //             const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');

// // //             const todayQCTO = formatQCTODate(new Date().toISOString());
// // //             const expectedCompletion = formatQCTODate(cohort.endDate);

// // //             // 43 COMPULSORY COLUMNS
// // //             const headers = [
// // //                 "SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type",
// // //                 "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code",
// // //                 "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status",
// // //                 "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date",
// // //                 "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3",
// // //                 "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3",
// // //                 "Learner Home Address Postal Code", "Learner Postal Address Post Code",
// // //                 "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address",
// // //                 "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date",
// // //                 "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date",
// // //                 "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"
// // //             ];

// // //             const dataRows = [headers.map(createTextCell)];

// // //             enrolledLearners.forEach(learner => {
// // //                 const d = learner.demographics || {};

// // //                 const names = (learner.fullName || '').trim().split(' ');
// // //                 const lastName = names.length > 1 ? names.pop() : '';
// // //                 const firstNames = names.join(' ');
// // //                 const title = d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr');

// // //                 // Helper for Date Formatting inside loop
// // //                 const cleanDate = (dateVal?: string) => {
// // //                     if (!dateVal) return "";
// // //                     const parts = dateVal.split('-');
// // //                     if (parts.length === 3) {
// // //                         if (parts[0].length === 4) return `${parts[0]}${parts[1]}${parts[2]}`;
// // //                         if (parts[2].length === 4) return `${parts[2]}${parts[1]}${parts[0]}`;
// // //                     }
// // //                     return dateVal.replace(/-/g, '');
// // //                 };

// // //                 const sorStatus = d.statementOfResultsStatus || (d as any).sorStatus || "02";
// // //                 const sorIssueDate = d.statementOfResultsIssueDate || (d as any).sorIssueDate || "";

// // //                 // DIRECT ARRAY PUSH TO PREVENT SHADOWING/MAPPING LOSS
// // //                 dataRows.push([
// // //                     rawSdpCode,                                         // 1
// // //                     saqaId,                                             // 2
// // //                     learner.idNumber,                                   // 3
// // //                     d.learnerAlternateId || "",                         // 4
// // //                     d.alternativeIdType || "533",                       // 5
// // //                     d.equityCode || "",                                 // 6
// // //                     d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), // 7
// // //                     d.homeLanguageCode || "",                           // 8
// // //                     d.genderCode || "",                                 // 9
// // //                     d.citizenResidentStatusCode || 'SA',                // 10
// // //                     d.socioeconomicStatusCode || "01",                  // 11
// // //                     d.disabilityStatusCode || 'N',                      // 12
// // //                     d.disabilityRating || "",                           // 13
// // //                     d.immigrantStatus || "03",                          // 14
// // //                     lastName,                                           // 15
// // //                     firstNames,                                         // 16
// // //                     d.learnerMiddleName || "",                          // 17
// // //                     title,                                              // 18
// // //                     getDOBFromID(learner.idNumber),                     // 19
// // //                     d.learnerHomeAddress1 || "",                        // 20
// // //                     d.learnerHomeAddress2 || "",                        // 21
// // //                     d.learnerHomeAddress3 || "",                        // 22
// // //                     d.learnerPostalAddress1 || d.learnerHomeAddress1 || "", // 23
// // //                     d.learnerPostalAddress2 || d.learnerHomeAddress2 || "", // 24
// // //                     d.learnerPostalAddress3 || "",                      // 25
// // //                     d.learnerHomeAddressPostalCode || "",               // 26
// // //                     d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || "", // 27
// // //                     d.learnerPhoneNumber || learner.phone || "",        // 28
// // //                     d.learnerPhoneNumber || learner.phone || "",        // 29
// // //                     d.learnerFaxNumber || "",                           // 30
// // //                     d.learnerEmailAddress || learner.email || "",       // 31
// // //                     d.provinceCode || "",                               // 32
// // //                     d.statsaaAreaCode || (d as any).statssaAreaCode || "", // 33
// // //                     d.popiActAgree === 'No' ? 'N' : 'Y',                // 34
// // //                     cleanDate(d.popiActDate) || todayQCTO,              // 35
// // //                     cleanDate(d.expectedTrainingCompletionDate) || expectedCompletion, // 36
// // //                     sorStatus,                                          // 37
// // //                     sorStatus === "01" ? cleanDate(sorIssueDate) : "",  // 38
// // //                     d.assessmentCentreCode || "",                       // 39
// // //                     d.learnerReadinessForEISATypeId || (d as any).eisaReadinessId || "1", // 40
// // //                     d.flc || (d as any).flcStatus || "06",              // 41

// // //                     // EXPLICITLY READ FROM THE KEY VERIFIED IN CONSOLE
// // //                     String(d.flcStatementOfResultNumber || (d as any).flcResultNumber || ""), // 42

// // //                     d.dateStamp || todayQCTO                            // 43
// // //                 ].map(createTextCell));
// // //             });

// // //             const wb = XLSX.utils.book_new();

// // //             // Instructions Sheet
// // //             const instructions = [
// // //                 ["DETAILS: (COMPULSORY INFORMATION)"],
// // //                 ["Compiler:", user?.fullName || ''],
// // //                 ["Email:", user?.email || ''],
// // //                 ["Institution:", mainInstitutionName],
// // //                 ["Qualification:", qualNameForHeader],
// // //                 ["SAQA ID:", saqaId],
// // //                 ["SDP Code:", rawSdpCode],
// // //                 ["Total Learners:", enrolledLearners.length],
// // //                 ["Export Date:", new Date().toLocaleDateString()]
// // //             ].map(row => row.map(createTextCell));

// // //             const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
// // //             XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

// // //             // Data Sheet
// // //             const wsData = XLSX.utils.aoa_to_sheet(dataRows);
// // //             XLSX.utils.book_append_sheet(wb, wsData, "Learner Enrolment and EISA");

// // //             const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
// // //             XLSX.writeFile(wb, fileName);
// // //             toast.success(`Export successful: ${fileName}`);

// // //         } catch (error) {
// // //             console.error("Export failed:", error);
// // //             toast.error("Export failed. Check console for details.");
// // //         } finally {
// // //             setIsExporting(false);
// // //         }
// // //     };


// // //     const syncLearnerWorkbooks = async () => {
// // //         if (!cohortId) return;
// // //         setIsSyncing(true);

// // //         try {
// // //             const batch = writeBatch(db);
// // //             const assessmentsRef = collection(db, 'assessments');

// // //             const qArray = query(assessmentsRef, where('cohortIds', 'array-contains', cohortId));
// // //             const snapArray = await getDocs(qArray);

// // //             const qString = query(assessmentsRef, where('cohortId', '==', cohortId));
// // //             const snapString = await getDocs(qString);

// // //             const allAssessments = new Map();
// // //             snapArray.docs.forEach(d => allAssessments.set(d.id, d));
// // //             snapString.docs.forEach(d => allAssessments.set(d.id, d));

// // //             if (allAssessments.size === 0) {
// // //                 setIsSyncing(false);
// // //                 setModalConfig({ isOpen: true, type: 'info', title: 'No Assessments Found', message: 'There are no active assessments published for this class yet.' });
// // //                 return;
// // //             }

// // //             let newDocsCount = 0;

// // //             for (const learner of enrolledLearners) {
// // //                 const enrolId = learner.enrollmentId || learner.id;
// // //                 const humanId = learner.learnerId || learner.id;

// // //                 for (const [astId, astDoc] of allAssessments.entries()) {
// // //                     const alreadyExists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohortId && (s.enrollmentId === enrolId || s.learnerId === humanId));
// // //                     if (!alreadyExists) {
// // //                         const astData = astDoc.data();
// // //                         const submissionId = `${cohortId}_${humanId}_${astId}`;
// // //                         const subRef = doc(db, 'learner_submissions', submissionId);

// // //                         batch.set(subRef, {
// // //                             learnerId: humanId, enrollmentId: enrolId, qualificationName: learner.qualification?.name || '',
// // //                             assessmentId: astId, cohortId: cohortId, title: astData.title, type: astData.type || 'formative',
// // //                             moduleNumber: astData.moduleInfo?.moduleNumber || '', moduleType: astData.moduleType || 'knowledge',
// // //                             status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: astData.totalMarks || 0, marks: 0, createdAt: new Date().toISOString()
// // //                         });
// // //                         newDocsCount++;
// // //                     }
// // //                 }
// // //             }

// // //             if (newDocsCount > 0) {
// // //                 await batch.commit();
// // //                 await fetchSubmissions();
// // //                 setModalConfig({ isOpen: true, type: 'success', title: 'Sync Complete', message: `Generated ${newDocsCount} missing workbook(s).` });
// // //             } else {
// // //                 setModalConfig({ isOpen: true, type: 'success', title: 'Already Synced', message: 'All enrolled learners are up-to-date.' });
// // //             }

// // //         } catch (error: any) {
// // //             console.error("Sync Error:", error);
// // //             setModalConfig({ isOpen: true, type: 'error', title: 'Sync Failed', message: error.message });
// // //         } finally {
// // //             setIsSyncing(false);
// // //         }
// // //     };

// // //     if (!cohort) {
// // //         return (
// // //             <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// // //                 <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
// // //                 <main className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
// // //                     <div className="mlab-state mlab-state--loading">
// // //                         <Loader2 className="spin" size={40} color="var(--mlab-blue)" />
// // //                         <span>Loading Cohort Details…</span>
// // //                     </div>
// // //                 </main>
// // //             </div>
// // //         );
// // //     }

// // //     const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';
// // //     const getEmployerName = (id?: string) => employers.find(e => e.id === id)?.name || 'Unknown Workplace';

// // //     const handleDropLearner = async (learnerId: string, learnerName: string) => {
// // //         const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
// // //         if (reason && reason.trim().length > 0) {
// // //             if (window.confirm(`Mark ${learnerName} as dropped?`)) {
// // //                 await useStore.getState().dropLearnerFromCohort(learnerId, cohort.id, reason);
// // //             }
// // //         }
// // //     };

// // //     const handleBackNavigation = () => {
// // //         isAdmin ? navigate('/admin', { state: { activeTab: 'cohorts' } }) : navigate(-1);
// // //     };

// // //     return (
// // //         <div className="admin-layout">

// // //             {modalConfig.isOpen && (
// // //                 <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} />
// // //             )}

// // //             {learnerToPlace && (
// // //                 <WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />
// // //             )}

// // //             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

// // //             <main className="main-wrapper" style={{ width: '100%', overflowY: 'auto' }}>

// // //                 <PageHeader
// // //                     theme={headerTheme}
// // //                     variant="hero"
// // //                     eyebrow={`${cohort.name}`}
// // //                     title="Cohort Overview"
// // //                     description="Manage Class Progress, Attendance & Exits."
// // //                     onBack={handleBackNavigation}
// // //                     backLabel={isAdmin ? "Back to Dashboard" : "Back to Classes"}
// // //                     status={{
// // //                         label: cohort.isArchived ? 'Archived' : 'Active Class',
// // //                         variant: cohort.isArchived ? 'draft' : 'active'
// // //                     }}
// // //                     actions={
// // //                         (isAdmin || isFacilitator) ? (
// // //                             <div style={{ display: 'flex', gap: '10px' }}>
// // //                                 <PageHeader.Btn variant="outline" onClick={handleQCTOExport} disabled={isExporting}>
// // //                                     {isExporting ? <Loader2 size={14} className="spin" /> : <DownloadCloud size={14} />}
// // //                                     Export LEISA
// // //                                 </PageHeader.Btn>
// // //                                 <PageHeader.Btn variant="outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
// // //                                     {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
// // //                                     Sync Workbooks
// // //                                 </PageHeader.Btn>
// // //                             </div>
// // //                         ) : undefined
// // //                     }
// // //                 />

// // //                 <div className="admin-content" style={{ paddingBottom: '4rem', padding: 16 }}>

// // //                     <div className="mlab-summary-card">
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label"><Calendar size={13} /> Training Dates</span>
// // //                             <span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Facilitator</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Assessor</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
// // //                         </div>
// // //                         <div className="mlab-summary-item">
// // //                             <span className="mlab-summary-item__label">Moderator</span>
// // //                             <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
// // //                         </div>
// // //                     </div>

// // //                     <div className="mlab-section" style={{ padding: 16 }}>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
// // //                             <h3 className="mlab-section__title" style={{ margin: 0 }}>
// // //                                 <Users size={16} /> Enrolled Learners ({enrolledLearners.length})
// // //                             </h3>
// // //                         </div>

// // //                         <div className="mlab-table-wrap">
// // //                             <table className="mlab-table">
// // //                                 <thead>
// // //                                     <tr>
// // //                                         <th>Learner</th>
// // //                                         <th>Workplace</th>
// // //                                         <th>Progress</th>
// // //                                         <th>Status</th>
// // //                                         <th>Actions</th>
// // //                                     </tr>
// // //                                 </thead>
// // //                                 <tbody>
// // //                                     {enrolledLearners.map(learner => {
// // //                                         const isDropped = learner.status === 'dropped';
// // //                                         const routingId = learner.enrollmentId || learner.id;
// // //                                         const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
// // //                                         const pendingMarking = learnerSubs.filter(s => s.status === 'submitted');

// // //                                         const employerObj = employers.find(e => e.id === learner.employerId);
// // //                                         const isPlaced = !!learner.employerId && !!employerObj;

// // //                                         return (
// // //                                             <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
// // //                                                 <td>
// // //                                                     <div className="mlab-cell-name">{learner.fullName}</div>
// // //                                                     <div className="mlab-cell-sub">{learner.idNumber}</div>
// // //                                                     {!isDropped && pendingMarking.length > 0 && (
// // //                                                         <div style={{ color: '#3b82f6', fontSize: '0.75rem', marginTop: '4px' }}>
// // //                                                             <Clock size={12} /> {pendingMarking.length} marking pending
// // //                                                         </div>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {isPlaced ? (
// // //                                                         <span style={{ fontWeight: 500 }}>{employerObj.name}</span>
// // //                                                     ) : (
// // //                                                         <span style={{ color: '#d97706', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                             <AlertCircle size={13} /> Pending Placement
// // //                                                         </span>
// // //                                                     )}
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div className="mlab-module-chips">
// // //                                                         <span className="mlab-chip mlab-chip--k">K: {learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length}</span>
// // //                                                         <span className="mlab-chip mlab-chip--p">P: {learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length}</span>
// // //                                                         <span className="mlab-chip mlab-chip--k">W: {learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length}</span>
// // //                                                     </div>
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     {isDropped ? <span className="text-red-500">Dropped</span> : <span className="text-green-500">Active</span>}
// // //                                                 </td>
// // //                                                 <td>
// // //                                                     <div className="cdp-actions">
// // //                                                         {isAdmin && (
// // //                                                             <button
// // //                                                                 className={`mlab-btn ${isPlaced ? 'mlab-btn--outline-blue' : 'cdp-btn--sky'}`}
// // //                                                                 onClick={() => setLearnerToPlace(learner)}
// // //                                                                 title={isPlaced ? "Reassign to a different company" : "Assign to a workplace"}
// // //                                                             >
// // //                                                                 <Briefcase size={13} /> {isPlaced ? 'Reassign' : 'Place'}
// // //                                                             </button>
// // //                                                         )}
// // //                                                         <button
// // //                                                             className="mlab-btn mlab-btn--outline-blue"
// // //                                                             onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
// // //                                                             title="View learner's digital portfolio"
// // //                                                         >
// // //                                                             <FolderOpen size={13} /> Portfolio
// // //                                                         </button>
// // //                                                         {isAdmin && !isDropped && (
// // //                                                             <button
// // //                                                                 className="mlab-btn mlab-btn--outline-red"
// // //                                                                 onClick={() => handleDropLearner(learner.id, learner.fullName)}
// // //                                                                 title="Remove learner from this class"
// // //                                                             >
// // //                                                                 <UserMinus size={13} /> Remove
// // //                                                             </button>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 </td>
// // //                                             </tr>
// // //                                         );
// // //                                     })}
// // //                                 </tbody>
// // //                             </table>
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };
