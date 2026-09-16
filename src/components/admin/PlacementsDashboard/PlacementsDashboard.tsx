// src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
    Briefcase, Search, Plus, AlertTriangle,
    CheckCircle, Clock, Building2, User, FileText,
    MoreVertical, Edit, X, DownloadCloud, AlertCircle,
    ShieldAlert, Trash2, FileSpreadsheet, ShieldCheck,
    Coins, Landmark, Calculator, Layers, Users, ChevronDown, ChevronUp,
    Calendar
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';

import { useStore, type StaffMember } from '../../../store/useStore';
import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../types';
import { useToast, ToastContainer } from '../../common/Toast/Toast';
import Loader from '../../common/Loader/Loader';
import { ModuleProgressCard } from '../../common/ModuleProgressCard/ModuleProgressCard';

import '../WorkplacesManager/WorkplacesManager.css';
import type { EnrichedPlacement } from '../WorkplacesManager/CompanyInsightsView/CompanyInsightsView';
import MentorModal from '../WorkplacesManager/MentorModal';
import { PlacementMasterModal } from '../WorkplacesManager/CompanyInsightsView/PlacementMasterModal';

/* ─── INTERFACES ─────────────────────────────────────────────────────────────── */

export interface UploadedEvidence {
    url: string;
    uploadedAt: string;
    fileName: string;
    uploadedByUid?: string;
    uploadedByName?: string;
    isLinked?: boolean;
    linkedAt?: string;
    history?: UploadedEvidence[];
}

/* ─── ETI BREAKDOWN MODAL ────────────────────────────────────────────────── */
const EtiBreakdownModal: React.FC<{
    learner: EnrichedPlacement;
    onClose: () => void;
}> = ({ learner, onClose }) => {
    const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

    const wage = Number(learner.stipendAmount) || 0;
    const eti = learner.etiMonthlyValue;
    const annualEti = eti * 12;

    let mathString = "";
    if (wage < 2500) {
        mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
    } else if (wage >= 2500 && wage <= 5499) {
        mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
    } else if (wage >= 5500 && wage < 7500) {
        mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
    } else {
        mathString = `Stipend exceeds R7,500 upper limit. ETI Claim = R0`;
    }

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '0', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
                            <Landmark size={20} /> SARS ETI Tax Rebate Audit
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {learner.learnerName}</div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
                        <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
                    </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
                <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '0', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
                    {mathString}
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
                        If stipend is R0 – R2,499: ETI = 60% of stipend
                    </li>
                    <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
                        If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
                    </li>
                    <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
                        If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
                    </li>
                    <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
                        If stipend is R7,500 or more: ETI = R0
                    </li>
                </ul>

                <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center', borderRadius: '0' }}>
                    Close Audit Trail
                </button>
            </div>
        </div>,
        document.body
    );
};

/* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
const PlacementOptionsModal: React.FC<{ placement: any; onClose: () => void; onSaved: () => void; }> = ({ placement, onClose, onSaved }) => {
    const toast = useToast();
    const [processing, setProcessing] = useState(false);

    const handleChangeStatus = async (newStatus: string) => {
        if (!window.confirm(`Change this placement status to ${newStatus.replace('_', ' ')}?`)) return;
        setProcessing(true);
        console.log(`[PlacementOptionsModal] Attempting status update for placement ID: ${placement.id} -> ${newStatus}`);
        try {
            await updateDoc(doc(db, 'placements', placement.id), { status: newStatus, updatedAt: new Date().toISOString() });
            console.log(`[PlacementOptionsModal] SUCCESS: Updated status to ${newStatus} for placement ${placement.id}`);
            toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
            onSaved();
            onClose();
        } catch (err: any) {
            console.error(`[PlacementOptionsModal] ERROR updating status for placement ${placement.id}:`, err);
            toast.error(err.message || "Failed to update status.");
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteRecord = async () => {
        if (!window.confirm("CRITICAL: Delete this placement record completely? This cannot be undone.")) return;
        setProcessing(true);
        console.log(`[PlacementOptionsModal] Attempting permanent deletion of placement ID: ${placement.id}`);
        try {
            await deleteDoc(doc(db, 'placements', placement.id));
            console.log(`[PlacementOptionsModal] SUCCESS: Permanently deleted placement record ${placement.id}`);
            toast.success("Placement record permanently deleted.");
            onSaved();
            onClose();
        } catch (err: any) {
            console.error(`[PlacementOptionsModal] ERROR deleting placement record ${placement.id}:`, err);
            toast.error(err.message || "Failed to delete record.");
        } finally {
            setProcessing(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706', borderRadius: '0' }}><MoreVertical size={20} /></div>
                    <div><h2 className="wm-modal__title">Placement Options</h2><p className="wm-modal__subtitle">{placement.learnerName}</p></div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
                </div>
                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button type="button" disabled={processing || placement.status === 'Completed'} onClick={() => handleChangeStatus('Completed')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}><CheckCircle size={16} color="#16a34a" /> Mark as Completed</button>
                    <button type="button" disabled={processing || placement.status === 'Pending Match'} onClick={() => handleChangeStatus('Pending Match')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}><Clock size={16} color="#d97706" /> Revert to Pending Match</button>
                    <button type="button" disabled={processing || placement.status === 'Terminated'} onClick={() => handleChangeStatus('Terminated')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}><AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)</button>
                    <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
                    <button type="button" disabled={processing} onClick={handleDeleteRecord} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}><Trash2 size={16} /> Delete Record Permanently</button>
                </div>
            </div>
        </div>, document.body
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: PLACEMENTS DASHBOARD 
═══════════════════════════════════════════════════════════════════════════ */
export const PlacementsDashboard: React.FC = () => {
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const employerUrlParam = searchParams.get('employer');

    const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

    const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
    const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

    const programmes = (useStore(s => (s as any).programmes) || []) as any[];
    const fetchProgrammes = (useStore(s => (s as any).fetchProgrammes) || (async () => { })) as any;

    const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
    const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
    const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
    const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

    const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
    const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
    const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
    const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);

    const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');

    const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

    // ACCORDION COLLAPSE TRACKER
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroupAccordion = (groupKey: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setSearchParams(prev => {
            const params = new URLSearchParams(prev);
            if (filterEmployer !== 'all') params.set('employer', filterEmployer);
            else params.delete('employer');
            return params;
        }, { replace: true });
    }, [filterEmployer, setSearchParams]);

    useEffect(() => {
        const loadEcosystem = async () => {
            console.log('[PlacementsDashboard] Synchronizing placement ecosystem datasets...');
            try {
                await Promise.all([
                    fetchPlacements(), fetchEmployers(), fetchLearners(),
                    fetchStaff(), fetchCohorts(), fetchProgrammes()
                ]);
                console.log('[PlacementsDashboard] SUCCESS: Placement ecosystem data synchronized.');
            } catch (err) {
                console.error('[PlacementsDashboard] ERROR synchronizing ecosystem data:', err);
                toast.error("Failed to synchronize placement ecosystem data.");
            } finally {
                setIsInitialLoad(false);
            }
        };
        loadEcosystem();
    }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts, fetchProgrammes]);

    // Displays any active staff member assigned to a host company
    const mentors = useMemo(() => staff.filter(s => (s.role === 'mentor' || !!s.employerId) && s.status !== 'archived'), [staff]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

    const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
        return placements.map(p => {
            const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
            const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

            const placementRecord = p as PlacementContract & {
                placementType?: string, compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
                bbbeeSpendCategory?: string, mentorId?: string, secondaryMentorIds?: string[], cohortId?: string
            };

            const mentor = mentors.find(m => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);

            const secondaryMentorNames = (placementRecord.secondaryMentorIds || []).map(secId => {
                const secM = mentors.find(m => m.id === secId);
                return secM?.fullName || 'Co-Mentor';
            });

            const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
            const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
            const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

            let isEtiEligible = false;
            let isFemale = false;
            let isYouth = true;

            if (learner.idNumber && learner.idNumber.length >= 6) {
                const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
                const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
                const age = new Date().getFullYear() - birthYear;
                if (age >= 18 && age <= 29) isEtiEligible = true;
                if (age > 35) isYouth = false;
                const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
                if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
            } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
                isFemale = true;
            }

            const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
            const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

            let etiMonthlyValue = 0;
            const wage = Number(p.stipendAmount) || 0;

            if (isEtiEligible && wage > 0) {
                if (wage < 2500) etiMonthlyValue = wage * 0.60;
                else if (wage >= 2500 && wage <= 5499) etiMonthlyValue = 1500;
                else if (wage >= 5500 && wage < 7500) etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0);
                else etiMonthlyValue = 0;
            }

            const hasAnyMentor = !!(p.assignedMentorName || placementRecord.mentorId || mentor.id || (placementRecord.secondaryMentorIds && placementRecord.secondaryMentorIds.length > 0));

            return {
                ...p,
                placementType: placementRecord.placementType || 'QCTO Workplace Module',
                bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
                compliance: {
                    isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean' ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
                    wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
                },
                learnerName: learner.fullName || 'Unknown Learner',
                idNumber: learner.idNumber || '—',
                equityGroup: equity,
                isFemale,
                isYouth,
                hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
                employerName: employer.name || 'Unknown Company',
                mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
                secondaryMentorNames,
                isEtiEligible,
                etiMonthlyValue,
                projectedStipendSpend: wage * verifiedTimeline,
                hasMentor: hasAnyMentor
            } as EnrichedPlacement & { secondaryMentorNames?: string[] };
        });
    }, [placements, learners, employers, mentors]);

    const displayedPlacements = useMemo(() => {
        return enrichedAndFilteredPlacements
            .filter(p => {
                const sLower = p.status.toLowerCase();
                if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
                if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
                }
                if (filterType !== 'all' && p.placementType !== filterType) return false;
                if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;
                return true;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);

    const groupedPlacementsByProgramme = useMemo(() => {
        const groups: Record<string, { key: string; employerName: string; programmeTitle: string; intakeLabel: string; items: EnrichedPlacement[]; compliantCount: number; totalStipends: number; isUnassigned?: boolean; }> = {};

        displayedPlacements.forEach(p => {
            const empName = p.employerName || 'Unknown Organization';
            const matchedCohort = cohorts.find(c => c.id === p.cohortId);
            const schemaTitle = (p as any).complianceSchema?.schemaName;
            let progTitle = matchedCohort?.name || schemaTitle || p.placementType || 'Unassigned Track';
            let intakeLabel = p.startDate ? moment(p.startDate).format('MMM YYYY Term') : 'Open Timeline';
            const isFloating = !p.cohortId && !p.complianceSchema;
            const groupKey = isFloating ? `UNassigned_${p.employerId}` : `${p.employerId}_${progTitle}_${intakeLabel}`.replace(/\s+/g, '_');

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    key: groupKey, employerName: empName,
                    programmeTitle: isFloating ? '⚠️ Unassigned / Legacy Placements' : progTitle,
                    intakeLabel: isFloating ? 'Needs Programme Mapping' : intakeLabel,
                    items: [], compliantCount: 0, totalStipends: 0, isUnassigned: isFloating
                };
            }

            groups[groupKey].items.push(p);
            if (p.hasMentor && p.compliance.isAgreementFullyExecuted) groups[groupKey].compliantCount++;
            groups[groupKey].totalStipends += Number(p.stipendAmount) || 0;
        });

        return Object.values(groups).sort((a, b) => (a.isUnassigned ? 1 : -1));
    }, [displayedPlacements, cohorts]);

    useEffect(() => {
        if (groupedPlacementsByProgramme.length > 0) {
            setExpandedGroups(new Set(groupedPlacementsByProgramme.map(g => g.key)));
        }
    }, [groupedPlacementsByProgramme]);

    // 🚀 GLOBAL OVERALL ECOSYSTEM METRICS
    const globalEcosystemMetrics = useMemo(() => {
        let monthlyEtiSum = 0;
        let accumulatedSpend = 0;

        let africanCount = 0;
        let colouredCount = 0;
        let indianCount = 0;
        let youthCount = 0;
        let etiEligibleCount = 0;

        let activeCount = 0;
        let nonCompliantCount = 0;
        let compliantCount = 0;
        let completedCount = 0;
        let droppedCount = 0;

        const totalPlacementsCount = enrichedAndFilteredPlacements.length;
        const today = moment().startOf('day');

        enrichedAndFilteredPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
            const end = moment(p.endDate).startOf('day');
            const isExpired = end.isBefore(today);

            if (isLive) {
                activeCount++;
                if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor || isExpired) {
                    nonCompliantCount++;
                } else {
                    compliantCount++;
                }
            } else if (statusLower.includes('complete') || statusLower.includes('absorb')) {
                completedCount++;
            } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
                droppedCount++;
            }

            const eq = (p.equityGroup || '').trim().toLowerCase();
            if (eq.includes('african') || eq === 'black' || eq === 'ba') {
                africanCount++;
            } else if (eq.includes('coloured') || eq === 'bc') {
                colouredCount++;
            } else if (eq.includes('indian') || eq === 'bi' || eq.includes('asian')) {
                indianCount++;
            }

            if (p.isYouth) youthCount++;

            if (isLive) {
                if (p.isEtiEligible && p.etiMonthlyValue > 0) etiEligibleCount++;
                monthlyEtiSum += p.etiMonthlyValue || 0;
            }

            accumulatedSpend += p.projectedStipendSpend || 0;
        });

        const blackACICount = africanCount + colouredCount + indianCount;
        const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
        const totalEcosystemCapacity = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);

        return {
            activeCount,
            compliantCount,
            nonCompliantCount,
            completedCount,
            droppedCount,
            totalEcosystemCapacity,
            openSeatsCount: Math.max(totalEcosystemCapacity - activeCount, 0),
            monthlyETITotal: monthlyEtiSum,
            annualizedETIEstimate: monthlyEtiSum * 12,
            totalProjectedSpend: accumulatedSpend,
            transformationPercentage: totalPlacementsCount > 0 ? Math.round((blackACICount / totalPlacementsCount) * 100) : 0,
            youthPercentage: totalPlacementsCount > 0 ? Math.round((youthCount / totalPlacementsCount) * 100) : 0,
            blackACICount,
            africanCount,
            colouredCount,
            indianCount,
            youthCount,
            etiEligibleCount,
            totalPlacementsCount
        };
    }, [enrichedAndFilteredPlacements, employers]);

    const {
        activeCount, completedCount, droppedCount
    } = useMemo(() => {
        let active = 0, completed = 0, dropped = 0;

        enrichedAndFilteredPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');

            if (isLive) {
                active++;
            } else if (statusLower.includes('complete')) {
                completed++;
            } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
                dropped++;
            }
        });

        return {
            activeCount: active, completedCount: completed, droppedCount: dropped
        };
    }, [enrichedAndFilteredPlacements]);

    const formatDate = (dateStr: string) => dateStr ? moment(dateStr).format('DD MMM YYYY') : '—';

    const getExportData = () => {
        return displayedPlacements.map(p => ({
            "Learner Name": p.learnerName, "ID Number": p.idNumber, "Host Company": p.employerName, "Demographic": p.equityGroup,
            "Placement Type": p.placementType, "Monthly Stipend": p.stipendAmount || 0,
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
            "Start Date": moment(p.startDate).format('YYYY-MM-DD'), "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
            "Assigned Primary Mentor": p.mentorName,
            "Assigned Co-Mentors": (p as any).secondaryMentorNames ? (p as any).secondaryMentorNames.join(', ') : 'None',
            "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Operational Status": p.status.toUpperCase()
        }));
    };

    const handleExportCSV = () => {
        const data = getExportData();
        if (data.length === 0) {
            console.warn('[PlacementsDashboard] CSV Export skipped: No data available.');
            return;
        }
        console.log(`[PlacementsDashboard] Exporting ${data.length} records to CSV...`);
        try {
            const headers = Object.keys(data[0]);
            const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
            const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            console.log('[PlacementsDashboard] SUCCESS: CSV Export downloaded.');
        } catch (err) {
            console.error('[PlacementsDashboard] ERROR generating CSV Export:', err);
        } finally {
            setShowExportMenu(false);
        }
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) {
            console.warn('[PlacementsDashboard] Excel Export skipped: No data available.');
            return;
        }
        console.log(`[PlacementsDashboard] Exporting ${data.length} records to Excel...`);
        try {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
            XLSX.writeFile(workbook, `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.xlsx`);
            console.log('[PlacementsDashboard] SUCCESS: Excel Export downloaded.');
        } catch (err) {
            console.error('[PlacementsDashboard] ERROR generating Excel Export:', err);
        } finally {
            setShowExportMenu(false);
        }
    };

    if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

            {/* EXTERNAL STANDALONE UNIFIED MASTER MODAL FOR BOTH CREATE & EDIT ACTIONS */}
            {(isCreateModalOpen || editingPlacement) && (
                <PlacementMasterModal
                    editPlacement={editingPlacement}
                    employers={employers}
                    mentors={mentors}
                    learners={learners.filter(l => !l.isArchived)}
                    placements={placements}
                    cohorts={cohorts}
                    programmes={programmes}
                    onClose={() => {
                        console.log('[PlacementsDashboard] Closing PlacementMasterModal');
                        setIsCreateModalOpen(false);
                        setEditingPlacement(null);
                    }}
                    onSaved={async () => {
                        console.log('[PlacementsDashboard] Placement saved. Refreshing placements ledger...');
                        await fetchPlacements(true);
                    }}
                    onCreate={createPlacement}
                    onAddNewMentor={(empId) => {
                        console.log('[PlacementsDashboard] Opening Quick Add Mentor modal for company ID:', empId);
                        setActiveMentorEmpId(empId);
                        setIsMentorModalOpen(true);
                    }}
                />
            )}

            {optionsPlacement && <PlacementOptionsModal placement={optionsPlacement} onClose={() => setOptionsPlacement(null)} onSaved={() => fetchPlacements(true)} />}

            {isMentorModalOpen && (
                <MentorModal employerId={activeMentorEmpId} onClose={() => setIsMentorModalOpen(false)} onSaved={async () => { await fetchStaff(true); }} addStaff={addStaff} />
            )}

            {/* OVERALL SYSTEM STATS REUSING ModuleProgressCard */}
            <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Calculator size={18} color="var(--mlab-blue)" /> Overall Ecosystem Financial & B-BBEE Auditor
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '3px 8px', borderRadius: '0' }}>
                        System Totals ({globalEcosystemMetrics.totalPlacementsCount} Placements Across All Host Companies)
                    </span>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '1.25rem'
                }}>
                    <ModuleProgressCard
                        type="Workplace Placements"
                        data={{
                            total: globalEcosystemMetrics.totalEcosystemCapacity,
                            logged: globalEcosystemMetrics.activeCount,
                            subValue: `${globalEcosystemMetrics.openSeatsCount} Open Seats`,
                            segments: [
                                { label: 'Placed', value: globalEcosystemMetrics.activeCount, color: '#94c73d' },
                                { label: 'Open Seats', value: globalEcosystemMetrics.openSeatsCount, color: '#e2e8f0' }
                            ]
                        }}
                    />
                    <ModuleProgressCard
                        type="At-Risk Analytics"
                        data={{
                            total: globalEcosystemMetrics.activeCount,
                            logged: globalEcosystemMetrics.compliantCount,
                            subValue: `${globalEcosystemMetrics.nonCompliantCount} Non-Compliant Files`,
                            segments: [
                                { label: 'Audit Ready', value: globalEcosystemMetrics.compliantCount, color: '#16a34a' },
                                { label: 'Missing / At-Risk', value: globalEcosystemMetrics.nonCompliantCount, color: '#ef4444' }
                            ]
                        }}
                    />
                    <ModuleProgressCard
                        type="ETI Tax Rebates"
                        data={{
                            total: globalEcosystemMetrics.activeCount,
                            logged: globalEcosystemMetrics.etiEligibleCount,
                            subValue: `${formatCurrency(globalEcosystemMetrics.monthlyETITotal)} /mo`,
                            segments: [
                                { label: 'Eligible', value: globalEcosystemMetrics.etiEligibleCount, color: '#10b981' },
                                { label: 'Ineligible', value: globalEcosystemMetrics.activeCount - globalEcosystemMetrics.etiEligibleCount, color: '#e2e8f0' }
                            ]
                        }}
                    />
                    <ModuleProgressCard
                        type="Recognized Spend"
                        data={{
                            total: globalEcosystemMetrics.totalPlacementsCount,
                            logged: globalEcosystemMetrics.activeCount,
                            subValue: formatCurrency(globalEcosystemMetrics.totalProjectedSpend),
                            segments: [
                                { label: 'Stipend Spend', value: globalEcosystemMetrics.activeCount, color: '#4f46e5' },
                                { label: 'Unallocated', value: globalEcosystemMetrics.totalPlacementsCount - globalEcosystemMetrics.activeCount, color: '#e2e8f0' }
                            ]
                        }}
                    />
                    <ModuleProgressCard
                        type="ACI Demographics"
                        data={{
                            total: globalEcosystemMetrics.totalPlacementsCount,
                            logged: globalEcosystemMetrics.blackACICount,
                            subValue: `${globalEcosystemMetrics.transformationPercentage}% ACI`,
                            segments: [
                                { label: 'African', value: globalEcosystemMetrics.africanCount, color: '#d97706' },
                                { label: 'Coloured', value: globalEcosystemMetrics.colouredCount, color: '#8b5cf6' },
                                { label: 'Indian/Asian', value: globalEcosystemMetrics.indianCount, color: '#ec4899' }
                            ]
                        }}
                    />
                    <ModuleProgressCard
                        type="Youth Representation"
                        data={{
                            total: globalEcosystemMetrics.totalPlacementsCount,
                            logged: globalEcosystemMetrics.youthCount,
                            subValue: `${globalEcosystemMetrics.youthPercentage}% Youth`,
                            segments: [
                                { label: 'Youth (<35)', value: globalEcosystemMetrics.youthCount, color: '#4d7c0f' },
                                { label: 'Over 35', value: globalEcosystemMetrics.totalPlacementsCount - globalEcosystemMetrics.youthCount, color: '#e2e8f0' }
                            ]
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
                <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
                    <Search size={15} color="var(--mlab-grey)" />
                    <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
                    <Briefcase size={14} color="var(--mlab-grey)" />
                    <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="all">All Placement Types</option>
                        <option value="QCTO Workplace Module">QCTO Practicals</option>
                        <option value="Alumni Internship">Alumni Internships</option>
                        <option value="External WIL">External WIL</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
                    <Building2 size={14} color="var(--mlab-grey)" />
                    <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
                        <option value="all">All Host Companies</option>
                        {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative' }} ref={exportMenuRef}>
                        <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={enrichedAndFilteredPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '0', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}>
                            <DownloadCloud size={14} /> Export Options
                        </button>
                        {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
                                <button type="button" onClick={handleExportCSV} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download as CSV</button>
                                <button type="button" onClick={handleExportExcel} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)</button>
                            </div>
                        )}
                    </div>
                    <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: '0' }} onClick={() => { console.log('[PlacementsDashboard] Opening modal to create new placement...'); setEditingPlacement(null); setIsCreateModalOpen(true); }}>
                        <Plus size={14} /> New Placement
                    </button>
                </div>
            </div>

            {/* PROGRAMME-BOUND ACCORDION LEDGER */}
            <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                <div className="vp-card" style={{ marginBottom: 0, background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)' }}>
                    <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem', background: '#f8fafc' }}>
                        <div className="vp-card-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Briefcase size={18} color="var(--mlab-blue)" />
                                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Program-Bound Global Placement Ledger</h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: '0' }}>{groupedPlacementsByProgramme.length} Active Programme Track(s)</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', background: 'white' }}>
                        <button type="button" onClick={() => setActiveTab('active')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{activeCount}</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab('history')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
                        </button>
                        <button type="button" onClick={() => setActiveTab('all')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
                        </button>
                    </div>

                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
                        {groupedPlacementsByProgramme.length > 0 ? (
                            groupedPlacementsByProgramme.map(group => {
                                const isOpen = expandedGroups.has(group.key);
                                const isCompliant = group.compliantCount === group.items.length;

                                return (
                                    <div key={group.key} style={{ background: 'white', border: `1px solid ${group.isUnassigned ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                        <div onClick={() => toggleGroupAccordion(group.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: group.isUnassigned ? '#fff1f2' : isOpen ? '#f1f5f9' : 'white', cursor: 'pointer', borderBottom: isOpen ? '1px solid #cbd5e1' : 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: group.isUnassigned ? '#fee2e2' : 'var(--mlab-midnight)', color: group.isUnassigned ? '#dc2626' : 'white', padding: '8px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {group.isUnassigned ? <AlertTriangle size={18} /> : <Layers size={18} />}
                                                </div>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: group.isUnassigned ? '#991b1b' : 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{group.employerName} — <span style={{ color: 'var(--mlab-blue)' }}>{group.programmeTitle}</span></div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span><Calendar size={12} style={{ display: 'inline', marginRight: '3px' }} /> {group.intakeLabel}</span><span>•</span><span style={{ color: 'var(--mlab-midnight)' }}>{group.items.length} Learner(s) Enrolled</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: isCompliant ? '#dcfce7' : '#fef3c7', color: isCompliant ? '#166534' : '#b45309', border: `1px solid ${isCompliant ? '#86efac' : '#fde68a'}` }}>{group.compliantCount}/{group.items.length} Audit Ready</span>
                                                    {group.totalStipends > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>{formatCurrency(group.totalStipends)}/mo Payroll</span>}
                                                </div>
                                                {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                                            </div>
                                        </div>

                                        {isOpen && (
                                            <div className="mlab-table-wrap" style={{ borderTop: 'none' }}>
                                                <table className="mlab-table" style={{ margin: 0 }}>
                                                    <thead style={{ background: 'whitesmoke', color: 'black' }}>
                                                        <tr>
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Learner Profile</th>
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Supervision & Mentors</th>
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Track & Stipend</th>
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Contract Timeline</th>
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Compliance Readiness</th>
                                                            <th style={{ fontSize: '0.7rem', textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {group.items.map(p => {
                                                            const today = moment().startOf('day');
                                                            const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');
                                                            const end = moment(p.endDate).startOf('day');

                                                            const isExpired = end.isBefore(today);
                                                            const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

                                                            const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
                                                            const missingItems = [];
                                                            if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
                                                            if (!p.hasMentor) missingItems.push("Workplace Mentor");

                                                            const secNames = (p as any).secondaryMentorNames || [];

                                                            return (
                                                                <tr key={p.id} style={{ background: 'white' }}>
                                                                    <td>
                                                                        <div className="cdp-learner-cell">
                                                                            <div className="cdp-learner-avatar" style={{ borderRadius: '0' }}>{p.learnerName.charAt(0)}</div>
                                                                            <div className="cdp-learner-cell__info"><span className="cdp-learner-cell__name">{p.learnerName}</span><span className="cdp-learner-cell__id">{p.idNumber}</span></div>
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#334155' : '#dc2626', display: 'flex', flexDirection: 'column', gap: '3px', fontWeight: p.hasMentor ? 600 : 700 }}>
                                                                            {p.hasMentor ? (
                                                                                <>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <User size={12} color="#0284c7" />
                                                                                        <span>{p.mentorName}</span>
                                                                                        <span style={{ fontSize: '0.55rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 4px', borderRadius: '2px', fontWeight: 700 }}>PRIMARY</span>
                                                                                    </div>
                                                                                    {secNames.length > 0 && (
                                                                                        <div style={{ fontSize: '0.68rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', fontWeight: 500 }}>
                                                                                            <Users size={10} color="#6366f1" />
                                                                                            <span>Co-Mentors: {secNames.join(', ')}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <><AlertTriangle size={12} /> No Mentor Assigned</>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
                                                                            <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content', borderRadius: '0' }}>{p.placementType}</span>
                                                                            {p.stipendAmount && p.stipendAmount > 0 && <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0' }}><Coins size={10} /> R{p.stipendAmount}/mo</span>}
                                                                            {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
                                                                                <button type="button" onClick={() => setEtiBreakdownLearner(p)} style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }} title="Click to view exact SARS mathematical breakdown"><Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo</button>
                                                                            ) : <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}><AlertCircle size={10} /> Ineligible</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
                                                                            {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
                                                                        </div>
                                                                        {isExpired && <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 800, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><AlertTriangle size={11} color="#dc2626" /> Contract Expired</div>}
                                                                        {isExpiringSoon && <div style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><Clock size={11} color="#d97706" /> Ends &lt; 30 Days</div>}
                                                                    </td>
                                                                    <td>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                                                            <span className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' : p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''}`} style={p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '0' } : p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0' } : { borderRadius: '0' }}>{p.status.replace('_', ' ')}</span>
                                                                            {isAuditReady ? (
                                                                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', width: 'fit-content' }}><div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}><ShieldCheck size={12} /> Audit Ready</div></div>
                                                                            ) : isExpired ? (
                                                                                <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px' }}><ShieldAlert size={12} color="#dc2626" /> Critical: Overdue & Incomplete</div>
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{missingItems.map(m => <span key={m} style={{ fontSize: '0.6rem', color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><X size={8} /> {m}</span>)}</div>
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}><AlertTriangle size={12} /> Missing Data</div>
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{missingItems.map(m => <span key={m} style={{ fontSize: '0.6rem', color: '#991b1b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><X size={8} /> {m}</span>)}</div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ textAlign: 'right' }}>
                                                                        <div className="cdp-actions" style={{ justifyContent: 'flex-end' }}>
                                                                            <button type="button" onClick={() => {
                                                                                setEditingPlacement(p);
                                                                            }} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-blue)' }} title="Edit Placement Details"><Edit size={14} /></button>
                                                                            <button type="button" onClick={() => { setOptionsPlacement(p); }} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-amber)' }} title="Placement Options"><MoreVertical size={14} /></button>
                                                                        </div>
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
                            })
                        ) : (
                            <div style={{ padding: '4rem', textAlign: 'center', background: 'white', border: '1px solid #cbd5e1' }}>
                                <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
                                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                    {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
                                        ? "Try adjusting your filters or search query."
                                        : "You haven't assigned any learners to host companies yet."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};