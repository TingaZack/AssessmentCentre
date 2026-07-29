// src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, storage } from '../../../lib/firebase';
import {
    Briefcase, Search, Plus, Filter, AlertTriangle,
    CheckCircle, Clock, Building2, User, FileText,
    MoreVertical, Edit, X, DownloadCloud, AlertCircle,
    ShieldAlert, Save, Loader2, Award, Trash2,
    LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
    Landmark, Activity, Wallet, Percent, Lightbulb, Info,
    Calculator, Accessibility, Layers, Users, ChevronDown, ChevronUp,
    Calendar
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { useStore, type StaffMember } from '../../../store/useStore';
import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../types';
import { useToast, ToastContainer } from '../../common/Toast/Toast';
import Loader from '../../common/Loader/Loader';

import '../WorkplacesManager/WorkplacesManager.css';
import type { EnrichedPlacement } from '../WorkplacesManager/CompanyInsightsView/CompanyInsightsView';
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
                    <li>
                        
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

/* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
interface MentorModalProps {
    employerId: string;
    onClose: () => void;
    onSaved: () => void;
    addStaff: (m: StaffMember) => Promise<void>;
}
const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
            toast.success('Mentor created successfully!');
            onSaved();
            onClose();
        } catch (err) {
            console.error('Mentor save error:', err);
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
                <div className="wm-modal__header wm-modal__header--green">
                    <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
                    <div>
                        <h2 className="wm-modal__title">Quick-Add Mentor</h2>
                        <p className="wm-modal__subtitle">Workplace supervision contact</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form">
                    <div className="wm-modal__body">
                        <div className="wm-form-grid">
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
                                <input className="wm-form-input" style={{ borderRadius: '0' }} required type="text" placeholder="e.g. John Smith"
                                    value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
                                <input className="wm-form-input" style={{ borderRadius: '0' }} required type="email" placeholder="john@company.com"
                                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Phone Number</label>
                                <input className="wm-form-input" style={{ borderRadius: '0' }} type="tel" placeholder="082 123 4567"
                                    value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
                        </button>
                    </div>
                </form>
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
        try {
            await updateDoc(doc(db, 'placements', placement.id), { status: newStatus, updatedAt: new Date().toISOString() });
            toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
            onSaved(); onClose();
        } catch (err: any) { toast.error(err.message || "Failed to update status."); } finally { setProcessing(false); }
    };

    const handleDeleteRecord = async () => {
        if (!window.confirm("CRITICAL: Delete this placement record completely? This cannot be undone.")) return;
        setProcessing(true);
        try {
            await deleteDoc(doc(db, 'placements', placement.id));
            toast.success("Placement record permanently deleted.");
            onSaved(); onClose();
        } catch (err: any) { toast.error(err.message || "Failed to delete record."); } finally { setProcessing(false); }
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

/* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}><Activity size={16} color="#d97706" /> {title}</div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}</div>
    </div>
);

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
    const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 'youth' | null>(null);

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
            try {
                await Promise.all([
                    fetchPlacements(), fetchEmployers(), fetchLearners(),
                    fetchStaff(), fetchCohorts(), fetchProgrammes()
                ]);
            } catch (err) { toast.error("Failed to synchronize placement ecosystem data."); } 
            finally { setIsInitialLoad(false); }
        };
        loadEcosystem();
    }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts, fetchProgrammes]);

    const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

    const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
        return placements.map(p => {
            const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
            const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

            const placementRecord = p as PlacementContract & {
                placementType?: string, compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
                bbbeeSpendCategory?: string, mentorId?: string, cohortId?: string
            };

            const mentor = mentors.find(m => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);

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
                isEtiEligible,
                etiMonthlyValue,
                projectedStipendSpend: wage * verifiedTimeline,
                hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
            } as EnrichedPlacement;
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

    const {
        activeCount, expiringSoonCount, nonCompliantCount, completedCount, droppedCount, openSeats,
        transformationPercentage, youthPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend
    } = useMemo(() => {
        const today = moment().startOf('day');
        const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');

        let active = 0, expiring = 0, nonCompliant = 0, completed = 0, dropped = 0;
        let blackACI = 0, youthCountTracker = 0, monthlyEtiSum = 0, accumulatedSpend = 0;

        enrichedAndFilteredPlacements.forEach(p => {
            const statusLower = p.status.toLowerCase();
            const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
            const end = moment(p.endDate).startOf('day');
            const isExpired = end.isBefore(today);
            const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

            if (isLive) {
                active++;
                if (statusLower.includes('active')) {
                    if (isExpiringSoon) expiring++;
                    if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor || isExpired) nonCompliant++;
                }
            } else if (statusLower.includes('complete')) {
                completed++;
            } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
                dropped++;
            }

            const eq = p.equityGroup.trim().toLowerCase();
            if (eq.includes('african') || eq === 'black' || eq === 'ba' || eq.includes('coloured') || eq === 'bc' || eq.includes('indian') || eq === 'bi') blackACI++;

            if (p.isYouth) youthCountTracker++;

            if (isLive) {
                monthlyEtiSum += p.etiMonthlyValue;
                accumulatedSpend += p.projectedStipendSpend;
            }
        });

        const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
        const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);

        return {
            activeCount: active, expiringSoonCount: expiring, nonCompliantCount: nonCompliant,
            completedCount: completed, droppedCount: dropped, openSeats: Math.max(totalCap - active, 0),
            transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
            youthPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((youthCountTracker / enrichedAndFilteredPlacements.length) * 100) : 0,
            monthlyETITotal: monthlyEtiSum, annualizedETIEstimate: monthlyEtiSum * 12, totalProjectedSpend: accumulatedSpend
        };
    }, [enrichedAndFilteredPlacements, employers]);

    const formatDate = (dateStr: string) => dateStr ? moment(dateStr).format('DD MMM YYYY') : '—';

    const getExportData = () => {
        return displayedPlacements.map(p => ({
            "Learner Name": p.learnerName, "ID Number": p.idNumber, "Host Company": p.employerName, "Demographic": p.equityGroup,
            "Placement Type": p.placementType, "Monthly Stipend": p.stipendAmount || 0,
            "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
            "Start Date": moment(p.startDate).format('YYYY-MM-DD'), "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
            "Assigned Mentor": p.mentorName, "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Operational Status": p.status.toUpperCase()
        }));
    };

    const handleExportCSV = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
        const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setShowExportMenu(false);
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
        XLSX.writeFile(workbook, `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.xlsx`);
        setShowExportMenu(false);
    };

    if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

            {/* REUSED UNIFIED MASTER MODAL FOR BOTH CREATE & EDIT ACTIONS */}
            {(isCreateModalOpen || editingPlacement) && (
                <PlacementMasterModal
                    editPlacement={editingPlacement}
                    employers={employers}
                    mentors={mentors}
                    learners={learners.filter(l => !l.isArchived)}
                    placements={placements}
                    cohorts={cohorts}
                    programmes={programmes}
                    onClose={() => { setIsCreateModalOpen(false); setEditingPlacement(null); }}
                    onSaved={() => fetchPlacements(true)}
                    onCreate={createPlacement}
                    onAddNewMentor={(empId) => {
                        setActiveMentorEmpId(empId);
                        setIsMentorModalOpen(true);
                    }}
                />
            )}

            {optionsPlacement && <PlacementOptionsModal placement={optionsPlacement} onClose={() => setOptionsPlacement(null)} onSaved={() => fetchPlacements(true)} />}

            {isMentorModalOpen && (
                <MentorModal employerId={activeMentorEmpId} onClose={() => setIsMentorModalOpen(false)} onSaved={async () => { await fetchStaff(true); }} addStaff={addStaff} />
            )}

            <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Placements</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{openSeats}</span><span className="cdp-stat-card__label">Open Ecosystem Seats</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--amber">
                    <div className="cdp-stat-card__icon">{nonCompliantCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}</div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: nonCompliantCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>{nonCompliantCount}</span><span className="cdp-stat-card__label">Audit Risks / Non-Compliant</span></div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} /></div>
                    <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>{expiringSoonCount}</span><span className="cdp-stat-card__label">Expiring &lt; 30 Days</span></div>
                </div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Auditor
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
                        <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}><Landmark size={22} /></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button></div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span></div>
                            <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>Annually: {formatCurrency(annualizedETIEstimate)}</div>
                            {activeInsight === 'eti' && <InsightPopup title="SARS Employment Tax Incentive" currentValue={`${formatCurrency(monthlyETITotal)}/mo`} actionSteps={[<span key="1"><strong>Live Calculation:</strong> Evaluates every active learner's recorded stipend against official SARS scales.</span>, <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500.</span>]} onClose={() => setActiveInsight(null)} />}
                        </div>
                    </div>

                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
                        <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}><Wallet size={22} /></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button></div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{formatCurrency(totalProjectedSpend)}</div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
                            {activeInsight === 'spend' && <InsightPopup title="Skills Target Spend" currentValue={formatCurrency(totalProjectedSpend)} actionSteps={[<span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>, <span key="2"><strong>To Optimize:</strong> Log accurate stipends to count toward B-BBEE payroll targets.</span>]} onClose={() => setActiveInsight(null)} />}
                        </div>
                    </div>

                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
                        <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}><Percent size={22} /></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button></div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{transformationPercentage}%</div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
                            {activeInsight === 'transformation' && <InsightPopup title="Transformation Demographic Metrics" currentValue={`${transformationPercentage}%`} actionSteps={[<span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>, <span key="2"><strong>To Optimize:</strong> Scale allocations using ACI candidate pools.</span>]} onClose={() => setActiveInsight(null)} />}
                        </div>
                    </div>

                    <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
                        <div style={{ background: '#ecfccb', padding: '10px', borderRadius: '50%', color: '#4d7c0f', height: 'fit-content' }}><User size={22} /></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#4d7c0f', fontWeight: 700, textTransform: 'uppercase' }}>Youth Employment</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'youth' ? null : 'youth')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4d7c0f', display: 'flex' }}><Info size={14} /></button></div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{youthPercentage}%</div>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Ratio of candidates under the age of 35.</span>
                            {activeInsight === 'youth' && <InsightPopup title="Youth Employment Metrics" currentValue={`${youthPercentage}%`} actionSteps={[<span key="1"><strong>Demographic:</strong> Verified automatically against National ID numbers.</span>, <span key="2"><strong>Impact:</strong> Influences YES program reporting and quota verification.</span>]} onClose={() => setActiveInsight(null)} />}
                        </div>
                    </div>
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
                    <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: '0' }} onClick={() => { setEditingPlacement(null); setIsCreateModalOpen(true); }}>
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
                                                            <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Supervision & Mentor</th>
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

                                                            return (
                                                                <tr key={p.id} style={{ background: 'white' }}>
                                                                    <td>
                                                                        <div className="cdp-learner-cell">
                                                                            <div className="cdp-learner-avatar" style={{ borderRadius: '0' }}>{p.learnerName.charAt(0)}</div>
                                                                            <div className="cdp-learner-cell__info"><span className="cdp-learner-cell__name">{p.learnerName}</span><span className="cdp-learner-cell__id">{p.idNumber}</span></div>
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#334155' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: p.hasMentor ? 600 : 700 }}>
                                                                            {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> No Mentor Assigned</>}
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
                                                                            <button type="button" onClick={() => setEditingPlacement(p)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-blue)' }} title="Edit Placement Details"><Edit size={14} /></button>
                                                                            <button type="button" onClick={() => setOptionsPlacement(p)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-amber)' }} title="Placement Options"><MoreVertical size={14} /></button>
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


// // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// import React, { useState, useEffect, useMemo, useRef } from 'react';
// import { createPortal } from 'react-dom';
// import { useSearchParams } from 'react-router-dom';
// import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// import { db, storage } from '../../../lib/firebase';
// import {
//     Briefcase, Search, Plus, Filter, AlertTriangle,
//     CheckCircle, Clock, Building2, User, FileText,
//     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
//     ShieldAlert, Save, Loader2, Award, Trash2,
//     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
//     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
//     Calculator, Accessibility, Layers, Users, ChevronDown, ChevronUp,
//     Calendar
// } from 'lucide-react';
// import moment from 'moment';
// import * as XLSX from 'xlsx';
// import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// import { useStore, type StaffMember } from '../../../store/useStore';
// import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../types';
// import { useToast, ToastContainer } from '../../common/Toast/Toast';
// import Loader from '../../common/Loader/Loader';

// import '../WorkplacesManager/WorkplacesManager.css';
// import type { EnrichedPlacement } from '../WorkplacesManager/CompanyInsightsView/CompanyInsightsView';

// /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */

// export interface UploadedEvidence {
//     url: string;
//     uploadedAt: string;
//     fileName: string;
//     uploadedByUid?: string;
//     uploadedByName?: string;
//     isLinked?: boolean;
//     linkedAt?: string;
//     history?: UploadedEvidence[];
// }

// /* ─── FALLBACK COMPLIANCE SCHEMAS ───────────────────────────────────────────── */
// const GENERIC_3_PHASE_SCHEMA: ComplianceSchema = {
//     schemaId: 'generic_3_phase',
//     schemaName: 'Standard 3-Phase Presets',
//     tranches: [
//         { trancheId: 'phase_1', title: 'Phase 1: Onboarding', percentage: 33, dueAtMonth: 1, requirements: [{ id: 'req_1', label: 'Employment Contract', type: 'document', required: true, systemTag: 'employmentContractUrl' }] },
//         { trancheId: 'phase_2', title: 'Phase 2: Mid-Point Review', percentage: 33, dueAtMonth: 6, requirements: [{ id: 'req_2', label: 'Mid-Term Site Visit', type: 'site_visit', required: true }] },
//         { trancheId: 'phase_3', title: 'Phase 3: Offboarding', percentage: 34, dueAtMonth: 12, requirements: [{ id: 'req_3', label: 'Final Completion Letter', type: 'document', required: true }] }
//     ]
// };

// const MONTHLY_PAYROLL_SCHEMA: ComplianceSchema = {
//     schemaId: 'monthly_payroll_only',
//     schemaName: 'Pure Monthly Compliance',
//     tranches: [
//         { trancheId: 'onboarding', title: 'Initial HR Onboarding', percentage: 0, dueAtMonth: 0, requirements: [{ id: 'req_1', label: 'Signed SLA/Contract', type: 'document', required: true }] }
//     ]
// };

// /* ─── ETI BREAKDOWN MODAL ────────────────────────────────────────────────── */
// const EtiBreakdownModal: React.FC<{
//     learner: EnrichedPlacement;
//     onClose: () => void;
// }> = ({ learner, onClose }) => {
//     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

//     const wage = Number(learner.stipendAmount) || 0;
//     const eti = learner.etiMonthlyValue;
//     const annualEti = eti * 12;

//     let mathString = "";
//     if (wage < 2500) {
//         mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
//     } else if (wage >= 2500 && wage <= 5499) {
//         mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
//     } else if (wage >= 5500 && wage < 7500) {
//         mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
//     } else {
//         mathString = `Stipend exceeds R7,500 upper limit. ETI Claim = R0`;
//     }

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '0', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
//                     <div>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
//                             <Landmark size={20} /> SARS ETI Tax Rebate Audit
//                         </div>
//                         <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {learner.learnerName}</div>
//                     </div>
//                     <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
//                 </div>

//                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0', padding: '1rem', marginBottom: '1rem' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
//                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
//                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
//                     </div>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
//                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
//                         <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
//                     </div>
//                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
//                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
//                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
//                     </div>
//                 </div>

//                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
//                 <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '0', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
//                     {mathString}
//                 </div>

//                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
//                 <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                     <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
//                         If stipend is R0 – R2,499: ETI = 60% of stipend
//                     </li>
//                     <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
//                         If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
//                     </li>
//                     <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
//                         If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
//                     </li>
//                     <li>
                        
//                     </li>
//                     {/* <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight wage >= 7500 ? 700 : 400 }}>
//                         If stipend is R7,500 or more: ETI = R0
//                     </li> */}
//                 </ul>

//                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center', borderRadius: '0' }}>
//                     Close Audit Trail
//                 </button>
//             </div>
//         </div>,
//         document.body
//     );
// };

// /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// interface MentorModalProps {
//     employerId: string;
//     onClose: () => void;
//     onSaved: () => void;
//     addStaff: (m: StaffMember) => Promise<void>;
// }
// const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
//     const toast = useToast();
//     const [saving, setSaving] = useState(false);
//     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setSaving(true);
//         try {
//             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
//             toast.success('Mentor created successfully!');
//             onSaved();
//             onClose();
//         } catch (err) {
//             console.error('Mentor save error:', err);
//         } finally {
//             setSaving(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
//             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
//                 <div className="wm-modal__header wm-modal__header--green">
//                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
//                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
//                 </div>

//                 <form onSubmit={handleSubmit} className="wm-modal__form">
//                     <div className="wm-modal__body">
//                         <div className="wm-form-grid">
//                             <div className="wm-form-group wm-form-group--full">
//                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
//                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="text" placeholder="e.g. John Smith"
//                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
//                             </div>
//                             <div className="wm-form-group wm-form-group--full">
//                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
//                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="email" placeholder="john@company.com"
//                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
//                             </div>
//                             <div className="wm-form-group wm-form-group--full">
//                                 <label className="wm-form-label">Phone Number</label>
//                                 <input className="wm-form-input" style={{ borderRadius: '0' }} type="tel" placeholder="082 123 4567"
//                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
//                             </div>
//                         </div>
//                     </div>
//                     <div className="wm-modal__footer">
//                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
//                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving}>
//                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };

// /* ─── UNIFIED MASTER PLACEMENT MODAL (CREATE & EDIT IN ONE) ─────────────────── */
// interface SelectedLearner {
//     learner: DashboardLearner;
//     mentorId: string;
// }

// export const PlacementMasterModal: React.FC<{
//     editPlacement?: any | null; // Pass placement object to Edit, or null/undefined to Create
//     employers: Employer[];
//     mentors: StaffMember[];
//     learners: DashboardLearner[];
//     placements: PlacementContract[];
//     cohorts: any[];
//     programmes: any[];
//     onClose: () => void;
//     onSaved: () => void;
//     onCreate?: (data: any) => Promise<void>;
//     onAddNewMentor: (employerId: string) => void;
// }> = ({ editPlacement, employers, mentors, learners, placements, cohorts, programmes, onClose, onSaved, onCreate, onAddNewMentor }) => {
//     const toast = useToast();
//     const { fetchEmployers } = useStore() as any;
//     const [saving, setSaving] = useState(false);
//     const [uploadingDoc, setUploadingDoc] = useState(false);

//     const isEditMode = !!editPlacement;

//     // Inline Employer Capacity Editor State
//     const [isEditingCap, setIsEditingCap] = useState(false);
//     const [tempCap, setTempCap] = useState(1);

//     // Document Upload mode state
//     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
//     const [selectedFile, setSelectedFile] = useState<File | null>(null);

//     // Employer & Cohort Identifiers
//     const [selectedEmployerId, setSelectedEmployerId] = useState(isEditMode ? editPlacement.employerId : '');
//     const [selectedCohortId, setSelectedCohortId] = useState(isEditMode ? (editPlacement.cohortId || '') : '');
//     const [learnerSearch, setLearnerSearch] = useState('');

//     // Selected Learners State (1 learner for Edit, 1+ for Create)
//     const [selectedLearners, setSelectedLearners] = useState<SelectedLearner[]>(() => {
//         if (isEditMode) {
//             const targetLearner = learners.find(l => l.id === editPlacement.learnerId) || ({
//                 id: editPlacement.learnerId,
//                 fullName: editPlacement.learnerName || 'Learner',
//                 idNumber: editPlacement.idNumber || '—'
//             } as DashboardLearner);
//             return [{ learner: targetLearner, mentorId: editPlacement.mentorId || '' }];
//         }
//         return [];
//     });

//     const [fallbackSchemaId, setFallbackSchemaId] = useState(isEditMode ? (editPlacement.complianceSchema?.schemaId || 'generic_3_phase') : 'generic_3_phase');
//     const [customPlacementType, setCustomPlacementType] = useState(isEditMode ? (editPlacement.customPlacementType || '') : '');
//     const [linkToExistingCohort, setLinkToExistingCohort] = useState(false);
//     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

//     const [form, setForm] = useState({
//         placementType: isEditMode ? (editPlacement.placementType || 'SETA Funded (Programme Linked)') : 'SETA Funded (Programme Linked)',
//         startDate: isEditMode ? editPlacement.startDate : '',
//         endDate: isEditMode ? editPlacement.endDate : '',
//         fundingSource: 'Corporate Funded',
//         bbbeeSpendCategory: isEditMode ? (editPlacement.compliance?.bbbeeSpendCategory || editPlacement.bbbeeSpendCategory || 'N/A') : 'N/A',
//         stipendAmount: isEditMode ? (editPlacement.stipendAmount || '') : '',
//         isAgreementFullyExecuted: isEditMode ? (editPlacement.compliance?.isAgreementFullyExecuted || false) : false,
//         wblpaAgreementUrl: isEditMode ? (editPlacement.compliance?.wblpaAgreementUrl || '') : ''
//     });

//     const isRegulatedTrack = form.placementType === 'QCTO Workplace Module' || form.placementType === 'SETA Funded (Programme Linked)';

//     const availableMentors = useMemo(() => {
//         if (!selectedEmployerId) return [];
//         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
//     }, [selectedEmployerId, mentors]);

//     const filteredLearners = useMemo(() => {
//         if (!learnerSearch) return [];
//         return learners.filter(l => {
//             const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
//             const notSelected = !selectedLearners.find(sl => sl.learner.id === l.id);
//             return matchesSearch && notSelected;
//         }).slice(0, 5);
//     }, [learnerSearch, learners, selectedLearners]);

//     const displayedCohorts = useMemo(() => {
//         if (forceShowAllProgrammes || !isEditMode) return cohorts;
//         const relevantIds = new Set<string>();
//         if (selectedLearners[0]?.learner?.cohortId) relevantIds.add(selectedLearners[0].learner.cohortId);
//         if (selectedCohortId) relevantIds.add(selectedCohortId);
//         if (relevantIds.size === 0) return cohorts;
//         const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
//         return matchingTracks.length === 0 ? cohorts : matchingTracks;
//     }, [cohorts, selectedLearners, selectedCohortId, forceShowAllProgrammes, isEditMode]);

//     const handleRemoveLearner = (id: string) => {
//         if (isEditMode) return; // Cannot remove learner when editing an established contract
//         setSelectedLearners(prev => prev.filter(sl => sl.learner.id !== id));
//     };

//     const handleLearnerMentorChange = (learnerId: string, mentorId: string) => {
//         setSelectedLearners(prev => prev.map(sl => sl.learner.id === learnerId ? { ...sl, mentorId } : sl));
//     };

//     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
//     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));

//     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
//     const isOverCapacity = !isEditMode && selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

//     useEffect(() => {
//         if (selectedEmployer && !isEditMode) {
//             setTempCap((selectedEmployer as any).internCapacity || 1);
//             setIsEditingCap(false);
//         }
//     }, [selectedEmployer, isEditMode]);

//     const handleSaveCapacity = async (e: React.MouseEvent) => {
//         e.stopPropagation();
//         if (!selectedEmployerId) return;
//         try {
//             await updateDoc(doc(db, 'employers', selectedEmployerId), {
//                 internCapacity: Number(tempCap)
//             });
//             await fetchEmployers(true);
//             setIsEditingCap(false);
//             toast.success("Host Company capacity updated!");
//         } catch (err) {
//             toast.error("Failed to update capacity.");
//         }
//     };

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
//         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");
//         if (form.placementType === 'Other' && !customPlacementType.trim()) return toast.error("Please specify the custom placement type.");

//         if (isRegulatedTrack && linkToExistingCohort && !isEditMode) {
//             const missingCohorts = selectedLearners.filter(sl => !sl.learner.cohortId);
//             if (missingCohorts.length > 0) {
//                 return toast.error(`Cannot auto-bind: ${missingCohorts.map(sl => sl.learner.fullName).join(', ')} do not have an active classroom cohort.`);
//             }
//         } else if (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId) {
//             return toast.error("Please select a target Programme/Cohort from the dropdown.");
//         }

//         if (isOverCapacity && !isEditMode) {
//             if (!window.confirm(`WARNING: Exceeding stated capacity for ${selectedEmployer?.name}. Force placement?`)) return;
//         }

//         setSaving(true);
//         try {
//             let finalDocumentUrl = form.wblpaAgreementUrl;
//             const isSinglePlacement = isEditMode || selectedLearners.length === 1;

//             if (isSinglePlacement && uploadMode === 'upload' && selectedFile) {
//                 setUploadingDoc(true);
//                 const docId = isEditMode ? editPlacement.id : `new_${Date.now()}`;
//                 const fileRef = ref(storage, `placements/${docId}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//                 await uploadBytes(fileRef, selectedFile);
//                 finalDocumentUrl = await getDownloadURL(fileRef);
//                 setUploadingDoc(false);
//             }

//             const finalPlacementType = form.placementType === 'Other' ? customPlacementType.trim() : form.placementType;

//             if (isEditMode) {
//                 // 🚀 UPDATE EXISTING PLACEMENT CONTRACT
//                 let schemaToApply = editPlacement.complianceSchema || null;

//                 if (isRegulatedTrack && selectedCohortId) {
//                     const matchedCohort = cohorts.find(c => c.id === selectedCohortId);
//                     if (matchedCohort) {
//                         if (matchedCohort.complianceSchema) schemaToApply = matchedCohort.complianceSchema;
//                         else if (matchedCohort.programmeId || matchedCohort.qualificationId) {
//                             const templateId = matchedCohort.programmeId || matchedCohort.qualificationId;
//                             const matchedProg = programmes.find(p => p.id === templateId);
//                             if (matchedProg && matchedProg.complianceSchema) schemaToApply = matchedProg.complianceSchema;
//                         }
//                     }
//                 } else if (!isRegulatedTrack && fallbackSchemaId) {
//                     if (fallbackSchemaId === 'generic_3_phase') schemaToApply = GENERIC_3_PHASE_SCHEMA;
//                     else if (fallbackSchemaId === 'monthly_payroll_only') schemaToApply = MONTHLY_PAYROLL_SCHEMA;
//                     else {
//                         const custom = programmes.find(p => p.id === fallbackSchemaId);
//                         if (custom?.complianceSchema) schemaToApply = custom.complianceSchema;
//                     }
//                 }

//                 const batch = writeBatch(db);
//                 const placementRef = doc(db, 'placements', editPlacement.id);
//                 const learnerRef = doc(db, 'learners', editPlacement.learnerId);

//                 batch.update(placementRef, {
//                     mentorId: selectedLearners[0].mentorId,
//                     cohortId: isRegulatedTrack ? selectedCohortId : '',
//                     placementType: finalPlacementType,
//                     customPlacementType: finalPlacementType,
//                     stipendAmount: Number(form.stipendAmount) || 0,
//                     startDate: form.startDate,
//                     endDate: form.endDate,
//                     complianceSchema: schemaToApply,
//                     compliance: {
//                         ...(editPlacement.compliance || {}),
//                         bbbeeSpendCategory: form.bbbeeSpendCategory,
//                         isAgreementFullyExecuted: form.isAgreementFullyExecuted,
//                         wblpaAgreementUrl: finalDocumentUrl
//                     },
//                     updatedAt: new Date().toISOString()
//                 });

//                 batch.update(learnerRef, { mentorId: selectedLearners[0].mentorId, updatedAt: new Date().toISOString() });
//                 await batch.commit();

//             } else {
//                 // 🚀 CREATE NEW PLACEMENT CONTRACTS (BULK OR SINGLE)
//                 await Promise.all(selectedLearners.map(sl => {
//                     let schemaToApply: ComplianceSchema | null = null;
//                     const targetCohortId = isRegulatedTrack ? (linkToExistingCohort ? sl.learner.cohortId : selectedCohortId) : '';

//                     if (isRegulatedTrack && targetCohortId) {
//                         const matchedCohort = cohorts.find(c => c.id === targetCohortId);
//                         if (matchedCohort) {
//                             if (matchedCohort.complianceSchema) schemaToApply = matchedCohort.complianceSchema;
//                             else if (matchedCohort.programmeId || matchedCohort.qualificationId) {
//                                 const templateId = matchedCohort.programmeId || matchedCohort.qualificationId;
//                                 const matchedProg = programmes.find(p => p.id === templateId);
//                                 if (matchedProg && matchedProg.complianceSchema) schemaToApply = matchedProg.complianceSchema;
//                             }
//                         }
//                     } else if (!isRegulatedTrack) {
//                         if (fallbackSchemaId === 'generic_3_phase') schemaToApply = GENERIC_3_PHASE_SCHEMA;
//                         else if (fallbackSchemaId === 'monthly_payroll_only') schemaToApply = MONTHLY_PAYROLL_SCHEMA;
//                         else {
//                             const matchedCustomTemplate = programmes.find(p => p.id === fallbackSchemaId);
//                             if (matchedCustomTemplate && matchedCustomTemplate.complianceSchema) schemaToApply = matchedCustomTemplate.complianceSchema;
//                         }
//                     }

//                     return onCreate!({
//                         learnerId: sl.learner.id,
//                         employerId: selectedEmployerId,
//                         cohortId: targetCohortId,
//                         mentorId: sl.mentorId,
//                         startDate: form.startDate,
//                         endDate: form.endDate,
//                         placementType: finalPlacementType,
//                         customPlacementType: finalPlacementType,
//                         stipendAmount: Number(form.stipendAmount) || 0,
//                         bbbeeSpendCategory: form.bbbeeSpendCategory,
//                         status: 'Active Placement',
//                         complianceSchema: schemaToApply,
//                         compliance: {
//                             bbbeeSpendCategory: form.bbbeeSpendCategory,
//                             isAgreementFullyExecuted: isSinglePlacement ? form.isAgreementFullyExecuted : false,
//                             wblpaAgreementUrl: isSinglePlacement ? finalDocumentUrl : ''
//                         },
//                         evidenceMap: {}
//                     });
//                 }));
//             }

//             toast.success(isEditMode ? "Placement contract updated successfully!" : `Successfully placed ${selectedLearners.length} learner(s)!`);
//             setTimeout(() => {
//                 onSaved();
//                 onClose();
//             }, 1200);

//         } catch (err: any) {
//             toast.error(err.message || "Failed to process placement details.");
//             setUploadingDoc(false);
//             setSaving(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', borderRadius: '0' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1', borderRadius: '0' }}><Network size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">{isEditMode ? 'Edit Placement Contract' : 'Create Global Placement'}</h2>
//                         <p className="wm-modal__subtitle">{isEditMode ? `Updating ${selectedLearners[0]?.learner?.fullName}` : 'Assign learner(s) to a host company from the master ledger.'}</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
//                 </div>

//                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
//                     <div className="wm-modal__body">

//                         {/* SECTION 1: WORKSPACE CONFIGURATION */}
//                         <div className="wm-form-section">
//                             <div className="wm-form-section__label"><Building2 size={12} /> 1. Workspace Configuration</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
//                                     <select className="wm-form-input" style={{ borderRadius: '0', background: isEditMode ? '#f1f5f9' : 'white' }} required value={selectedEmployerId} onChange={e => setSelectedEmployerId(e.target.value)} disabled={isEditMode || saving}>
//                                         <option value="">-- Choose Host Company --</option>
//                                         {employers.filter(emp => emp.status !== 'archived').map(emp => (
//                                             <option key={emp.id} value={emp.id}>{emp.name}</option>
//                                         ))}
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
//                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.placementType} onChange={e => {
//                                         const val = e.target.value;
//                                         setForm(p => ({ ...p, placementType: val }));
//                                         if (val !== 'QCTO Workplace Module' && val !== 'SETA Funded (Programme Linked)') setSelectedCohortId('');
//                                     }} disabled={saving}>
//                                         <option value="SETA Funded (Programme Linked)">SETA Funded (Linked to Training)</option>
//                                         <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
//                                         <option value="Independent SETA Internship">SETA Funded (Independent / Uni Grads)</option>
//                                         <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
//                                         <option value="External WIL">External WIL (Unregulated)</option>
//                                         <option value="Other">Other (Custom)</option>
//                                     </select>
//                                 </div>

//                                 {form.placementType === 'Other' && (
//                                     <div className="wm-form-group wm-form-group--full animate-fade-in" style={{ marginTop: '-4px', background: '#f8fafc', padding: '10px', borderRadius: '0', border: '1px dashed #cbd5e1' }}>
//                                         <label className="wm-form-label">Specify Custom Placement Type <span className="wm-form-required">*</span></label>
//                                         <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} required value={customPlacementType} onChange={e => setCustomPlacementType(e.target.value)} placeholder="e.g. Corporate CSI Initiative" disabled={saving} />
//                                     </div>
//                                 )}

//                                 {!isEditMode && selectedEmployer && (
//                                     <div className="wm-form-group wm-form-group--full" style={{ marginTop: '-0.5rem' }}>
//                                         <div style={{ padding: '0.5rem', borderRadius: '0', background: isOverCapacity ? '#fff1f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isOverCapacity ? '#991b1b' : '#15803d', fontWeight: 600 }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
//                                                 Placement Capacity: {currentEmployerPlacements.length + selectedLearners.length} /
//                                                 {isEditingCap ? (
//                                                     <input
//                                                         type="number"
//                                                         min="1"
//                                                         value={tempCap}
//                                                         onChange={(e) => setTempCap(Number(e.target.value))}
//                                                         style={{ width: '60px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '0', outline: 'none', marginLeft: '4px' }}
//                                                         autoFocus
//                                                     />
//                                                 ) : (
//                                                     <span>{internCapacity}</span>
//                                                 )}
//                                                 allocations utilized.
//                                             </div>

//                                             {isEditingCap ? (
//                                                 <div style={{ display: 'flex', gap: '4px' }}>
//                                                     <button type="button" onClick={() => setIsEditingCap(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
//                                                     <button type="button" onClick={handleSaveCapacity} style={{ background: 'var(--mlab-green)', border: 'none', color: 'white', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                         <Save size={10} /> Save
//                                                     </button>
//                                                 </div>
//                                             ) : (
//                                                 <button type="button" onClick={() => setIsEditingCap(true)} style={{ background: 'none', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, color: isOverCapacity ? '#991b1b' : '#15803d', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
//                                                     <Edit size={10} /> Update Cap
//                                                 </button>
//                                             )}
//                                         </div>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* SECTION 2: PARTICIPANT & SUPERVISOR */}
//                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
//                             <div className="wm-form-section__label"><Users size={12} /> 2. Participant & Supervisor</div>

//                             {!isEditMode && (
//                                 <div style={{ position: 'relative', marginBottom: selectedLearners.length > 0 ? '16px' : '0' }}>
//                                     <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} placeholder="Search by name or ID to add a learner..." value={learnerSearch} onChange={e => setLearnerSearch(e.target.value)} disabled={saving} />
//                                     {learnerSearch && (
//                                         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
//                                             {filteredLearners.length > 0 ? filteredLearners.map(l => (
//                                                 <div key={l.id} onClick={() => { setSelectedLearners(prev => [...prev, { learner: l, mentorId: '' }]); setLearnerSearch(''); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                     <div>
//                                                         <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
//                                                         <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
//                                                     </div>
//                                                 </div>
//                                             )) : (
//                                                 <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
//                                             )}
//                                         </div>
//                                     )}
//                                 </div>
//                             )}

//                             {selectedLearners.length > 0 && (
//                                 <div className="animate-fade-in" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden' }}>
//                                     <div style={{ background: '#f1f5f9', padding: '8px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
//                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>LEARNER PROFILE</div>
//                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                             ASSIGNED MENTOR
//                                             {selectedEmployerId && (
//                                                 <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
//                                                     <Plus size={10} /> Quick Add
//                                                 </button>
//                                             )}
//                                         </div>
//                                         {!isEditMode && <div style={{ width: '30px' }}></div>}
//                                     </div>
//                                     <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
//                                         {selectedLearners.map((sl, i) => (
//                                             <div key={sl.learner.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: i === selectedLearners.length - 1 ? 'none' : '1px solid #e2e8f0', background: isEditMode ? '#f8fafc' : 'white' }}>
//                                                 <div style={{ flex: 1 }}>
//                                                     <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{sl.learner.fullName}</div>
//                                                     <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sl.learner.idNumber}</div>
//                                                 </div>
//                                                 <div style={{ flex: 1, paddingRight: isEditMode ? '0' : '12px' }}>
//                                                     <select
//                                                         className="wm-form-input"
//                                                         style={{ padding: '6px 8px', borderRadius: '0', fontSize: '0.75rem', height: 'auto', background: sl.mentorId ? 'white' : '#fff7ed', borderColor: sl.mentorId ? '#cbd5e1' : '#fed7aa' }}
//                                                         value={sl.mentorId}
//                                                         onChange={e => handleLearnerMentorChange(sl.learner.id, e.target.value)}
//                                                         disabled={saving}
//                                                     >
//                                                         <option value="">-- Flag as Missing --</option>
//                                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
//                                                     </select>
//                                                 </div>
//                                                 {!isEditMode && (
//                                                     <div style={{ width: '30px', textAlign: 'right' }}>
//                                                         <button type="button" onClick={() => handleRemoveLearner(sl.learner.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={16} /></button>
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         ))}
//                                     </div>
//                                 </div>
//                             )}
//                         </div>

//                         {/* SECTION 3: COMPLIANCE ROUTING */}
//                         {isRegulatedTrack ? (
//                             selectedLearners.length > 0 && (
//                                 <div className="wm-form-section animate-fade-in">
//                                     <div className="wm-form-section__label" style={{ marginBottom: '10px' }}><Layers size={12} /> 3. Regulated Program Verification</div>

//                                     {!isEditMode && (
//                                         <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '0', marginBottom: '12px' }}>
//                                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.8rem' }}>
//                                                 <input
//                                                     type="checkbox"
//                                                     checked={linkToExistingCohort}
//                                                     onChange={e => setLinkToExistingCohort(e.target.checked)}
//                                                     style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
//                                                 />
//                                                 Auto-bind placement to the learner's currently enrolled class/cohort
//                                             </label>
//                                             <p style={{ margin: '4px 0 0 24px', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>
//                                                 Check this if the learner is doing workplace practicals for their existing class. Uncheck to place them into a completely new Programme/Cohort.
//                                             </p>

//                                             {linkToExistingCohort && (
//                                                 <div style={{ marginTop: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '8px' }}>
//                                                     <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-midnight)', marginBottom: '8px', textTransform: 'uppercase' }}>Auto-Resolved Cohort Mapping:</div>
//                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                         {selectedLearners.map(sl => {
//                                                             const linkedCohort = cohorts.find(c => c.id === sl.learner.cohortId);
//                                                             return (
//                                                                 <div key={sl.learner.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', padding: '4px', background: '#f8fafc', borderRadius: '0' }}>
//                                                                     <span style={{ color: '#475569', fontWeight: 600 }}>{sl.learner.fullName}</span>
//                                                                     {linkedCohort ? (
//                                                                         <span style={{ color: 'var(--mlab-blue)', fontWeight: 700 }}>{linkedCohort.name}</span>
//                                                                     ) : (
//                                                                         <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Unassigned Error</span>
//                                                                     )}
//                                                                 </div>
//                                                             );
//                                                         })}
//                                                     </div>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     )}

//                                     {(!linkToExistingCohort || isEditMode) && (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                             {isEditMode && (
//                                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                                     <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
//                                                     <button type="button" onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
//                                                         {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
//                                                     </button>
//                                                 </div>
//                                             )}
//                                             <select className="wm-form-input animate-fade-in" required={isRegulatedTrack && (!linkToExistingCohort || isEditMode)} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)} style={{ borderRadius: '0', borderLeft: '4px solid var(--mlab-amber)' }} disabled={saving}>
//                                                 <option value="">-- Assign Target Qualification / Programme Record --</option>
//                                                 {displayedCohorts.map(c => (
//                                                     <option key={c.id} value={c.id}>{c.name}</option>
//                                                 ))}
//                                             </select>
//                                         </div>
//                                     )}

//                                     <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
//                                         * Note: Placements will automatically inherit the Tranche & Funding Blueprint attached to the selected programme.
//                                     </div>
//                                 </div>
//                             )
//                         ) : (
//                             <div className="wm-form-section animate-fade-in" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px' }}>
//                                 <div className="wm-form-section__label" style={{ marginBottom: '8px' }}><Wallet size={12} /> 3. Independent Compliance Mode</div>
//                                 <select className="wm-form-input" value={fallbackSchemaId} onChange={e => setFallbackSchemaId(e.target.value)} style={{ borderRadius: 0 }} disabled={saving}>
//                                     <optgroup label="System Defaults">
//                                         <option value="generic_3_phase">Standard 3-Phase Lifecycle (Onboard, Mid-Point, Offboard)</option>
//                                         <option value="monthly_payroll_only">Unstructured (Monthly Payroll & HR Only)</option>
//                                     </optgroup>
//                                     {programmes && programmes.length > 0 && (
//                                         <optgroup label="Custom Qualification Templates">
//                                             {programmes.map((prog: any) => (
//                                                 <option key={prog.id} value={prog.id}>{prog.name || 'Custom Blueprint'}</option>
//                                             ))}
//                                         </optgroup>
//                                     )}
//                                 </select>
//                             </div>
//                         )}

//                         {/* SECTION 4: LOGISTICS & FINANCIALS */}
//                         <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId || isEditMode) ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId || isEditMode) ? 'auto' : 'none' }}>
//                             <div className="wm-form-section__label"><Briefcase size={12} /> {isRegulatedTrack ? '4' : '3'}. Global Placement Settings</div>
//                             <div className="wm-form-grid">

//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">B-BBEE Spend Category</label>
//                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
//                                         <option value="N/A">Not Applicable (Non-B-BBEE / Unregulated)</option>
//                                         <option value="Category B">Category B (Degree/Diploma)</option>
//                                         <option value="Category C">Category C (Certificate/Occupational)</option>
//                                         <option value="Category D">Category D (Apprenticeship)</option>
//                                         <option value="Category E">Category E (Work-integrated learning)</option>
//                                     </select>
//                                 </div>

//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
//                                     <div style={{ position: 'relative' }}>
//                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
//                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px', borderRadius: '0' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} disabled={saving} />
//                                     </div>
//                                 </div>

//                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} /></div>
//                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} /></div>
//                             </div>
//                         </div>

//                         {/* SECTION 5: CONTRACT EVIDENCE (VISIBLE IN EDIT MODE OR SINGLE CREATE) */}
//                         {(isEditMode || selectedLearners.length === 1) && (
//                             <div className="wm-form-section animate-fade-in" style={{ marginTop: '1.5rem' }}>
//                                 <div className="wm-form-section__label"><ShieldAlert size={12} /> Contract Evidence</div>
//                                 <div className="wm-form-grid">
//                                     <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '0', border: '1px solid #e2e8f0' }}>
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
//                                             <input type="checkbox" checked={form.isAgreementFullyExecuted} onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }} disabled={saving} />
//                                             WBLPA Signed & On File
//                                         </label>
//                                         <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden', marginTop: '12px' }}>
//                                             <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
//                                                 <button type="button" onClick={() => setUploadMode('link')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><LinkIcon size={12} /> Paste Link</button>
//                                                 <button type="button" onClick={() => setUploadMode('upload')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><UploadCloud size={12} /> Upload File</button>
//                                             </div>
//                                             <div style={{ padding: '12px' }}>
//                                                 {uploadMode === 'link' ? (
//                                                     <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label><input className="wm-form-input" style={{ borderRadius: '0' }} type="url" placeholder="https://drive.google.com/file/d/..." value={form.wblpaAgreementUrl} onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))} disabled={saving} /></>
//                                                 ) : (
//                                                     <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label><input className="wm-form-input" style={{ borderRadius: '0', padding: '6px' }} type="file" accept=".pdf,image/*,.doc,.docx" onChange={e => { if (e.target.files && e.target.files.length > 0) setSelectedFile(e.target.files[0]); }} disabled={saving} /></>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                     </div>
//                     <div className="wm-modal__footer">
//                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
//                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId && !isEditMode)}>
//                             {saving ? <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Processing…'}</> : <><Save size={13} /> {isEditMode ? 'Save Changes' : `Place ${selectedLearners.length} Learner(s)`}</>}
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };

// /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// const PlacementOptionsModal: React.FC<{ placement: any; onClose: () => void; onSaved: () => void; }> = ({ placement, onClose, onSaved }) => {
//     const toast = useToast();
//     const [processing, setProcessing] = useState(false);

//     const handleChangeStatus = async (newStatus: string) => {
//         if (!window.confirm(`Change this placement status to ${newStatus.replace('_', ' ')}?`)) return;
//         setProcessing(true);
//         try {
//             await updateDoc(doc(db, 'placements', placement.id), { status: newStatus, updatedAt: new Date().toISOString() });
//             toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
//             onSaved(); onClose();
//         } catch (err: any) { toast.error(err.message || "Failed to update status."); } finally { setProcessing(false); }
//     };

//     const handleDeleteRecord = async () => {
//         if (!window.confirm("CRITICAL: Delete this placement record completely? This cannot be undone.")) return;
//         setProcessing(true);
//         try {
//             await deleteDoc(doc(db, 'placements', placement.id));
//             toast.success("Placement record permanently deleted.");
//             onSaved(); onClose();
//         } catch (err: any) { toast.error(err.message || "Failed to delete record."); } finally { setProcessing(false); }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
//             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706', borderRadius: '0' }}><MoreVertical size={20} /></div>
//                     <div><h2 className="wm-modal__title">Placement Options</h2><p className="wm-modal__subtitle">{placement.learnerName}</p></div>
//                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
//                 </div>
//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                     <button type="button" disabled={processing || placement.status === 'Completed'} onClick={() => handleChangeStatus('Completed')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}><CheckCircle size={16} color="#16a34a" /> Mark as Completed</button>
//                     <button type="button" disabled={processing || placement.status === 'Pending Match'} onClick={() => handleChangeStatus('Pending Match')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}><Clock size={16} color="#d97706" /> Revert to Pending Match</button>
//                     <button type="button" disabled={processing || placement.status === 'Terminated'} onClick={() => handleChangeStatus('Terminated')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}><AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)</button>
//                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
//                     <button type="button" disabled={processing} onClick={handleDeleteRecord} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}><Trash2 size={16} /> Delete Record Permanently</button>
//                 </div>
//             </div>
//         </div>, document.body
//     );
// };

// /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
//     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
//         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}><Activity size={16} color="#d97706" /> {title}</div>
//             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
//         </div>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}</div>
//     </div>
// );

// /* ═══════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// ═══════════════════════════════════════════════════════════════════════════ */
// export const PlacementsDashboard: React.FC = () => {
//     const toast = useToast();
//     const [searchParams, setSearchParams] = useSearchParams();

//     const employerUrlParam = searchParams.get('employer');

//     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

//     const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
//     const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

//     const programmes = (useStore(s => (s as any).programmes) || []) as any[];
//     const fetchProgrammes = (useStore(s => (s as any).fetchProgrammes) || (async () => { })) as any;

//     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
//     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
//     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
//     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

//     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

//     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
//     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
//     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
//     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
//     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
//     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 'youth' | null>(null);

//     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

//     const [searchQuery, setSearchQuery] = useState('');
//     const [filterType, setFilterType] = useState('all');

//     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
//     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

//     // ACCORDION COLLAPSE TRACKER
//     const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

//     const toggleGroupAccordion = (groupKey: string) => {
//         setExpandedGroups(prev => {
//             const next = new Set(prev);
//             if (next.has(groupKey)) next.delete(groupKey);
//             else next.add(groupKey);
//             return next;
//         });
//     };

//     const [showExportMenu, setShowExportMenu] = useState(false);
//     const exportMenuRef = useRef<HTMLDivElement>(null);

//     useEffect(() => {
//         const handleClickOutside = (event: MouseEvent) => {
//             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
//                 setShowExportMenu(false);
//             }
//         };
//         document.addEventListener('mousedown', handleClickOutside);
//         return () => document.removeEventListener('mousedown', handleClickOutside);
//     }, []);

//     useEffect(() => {
//         setSearchParams(prev => {
//             const params = new URLSearchParams(prev);
//             if (filterEmployer !== 'all') params.set('employer', filterEmployer);
//             else params.delete('employer');
//             return params;
//         }, { replace: true });
//     }, [filterEmployer, setSearchParams]);

//     useEffect(() => {
//         const loadEcosystem = async () => {
//             try {
//                 await Promise.all([
//                     fetchPlacements(), fetchEmployers(), fetchLearners(),
//                     fetchStaff(), fetchCohorts(), fetchProgrammes()
//                 ]);
//             } catch (err) { toast.error("Failed to synchronize placement ecosystem data."); } 
//             finally { setIsInitialLoad(false); }
//         };
//         loadEcosystem();
//     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts, fetchProgrammes]);

//     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

//     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

//     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
//         return placements.map(p => {
//             const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
//             const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

//             const placementRecord = p as PlacementContract & {
//                 placementType?: string, compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
//                 bbbeeSpendCategory?: string, mentorId?: string, cohortId?: string
//             };

//             const mentor = mentors.find(m => (p.assignedMentorName && m.fullName === p.assignedMentorName) || (placementRecord.mentorId && m.id === placementRecord.mentorId)) || ({} as Partial<StaffMember>);

//             const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
//             const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
//             const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

//             let isEtiEligible = false;
//             let isFemale = false;
//             let isYouth = true;

//             if (learner.idNumber && learner.idNumber.length >= 6) {
//                 const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
//                 const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
//                 const age = new Date().getFullYear() - birthYear;
//                 if (age >= 18 && age <= 29) isEtiEligible = true;
//                 if (age > 35) isYouth = false;
//                 const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
//                 if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
//             } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
//                 isFemale = true;
//             }

//             const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
//             const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

//             let etiMonthlyValue = 0;
//             const wage = Number(p.stipendAmount) || 0;

//             if (isEtiEligible && wage > 0) {
//                 if (wage < 2500) etiMonthlyValue = wage * 0.60;
//                 else if (wage >= 2500 && wage <= 5499) etiMonthlyValue = 1500;
//                 else if (wage >= 5500 && wage < 7500) etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0);
//                 else etiMonthlyValue = 0;
//             }

//             return {
//                 ...p,
//                 placementType: placementRecord.placementType || 'QCTO Workplace Module',
//                 bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
//                 compliance: {
//                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean' ? placementRecord.compliance.isAgreementFullyExecuted : p.wblAgreementSigned,
//                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
//                 },
//                 learnerName: learner.fullName || 'Unknown Learner',
//                 idNumber: learner.idNumber || '—',
//                 equityGroup: equity,
//                 isFemale,
//                 isYouth,
//                 hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
//                 employerName: employer.name || 'Unknown Company',
//                 mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
//                 isEtiEligible,
//                 etiMonthlyValue,
//                 projectedStipendSpend: wage * verifiedTimeline,
//                 hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
//             } as EnrichedPlacement;
//         });
//     }, [placements, learners, employers, mentors]);

//     const displayedPlacements = useMemo(() => {
//         return enrichedAndFilteredPlacements
//             .filter(p => {
//                 const sLower = p.status.toLowerCase();
//                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
//                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;
//                 if (searchQuery) {
//                     const q = searchQuery.toLowerCase();
//                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
//                 }
//                 if (filterType !== 'all' && p.placementType !== filterType) return false;
//                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;
//                 return true;
//             })
//             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
//     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);

//     const groupedPlacementsByProgramme = useMemo(() => {
//         const groups: Record<string, { key: string; employerName: string; programmeTitle: string; intakeLabel: string; items: EnrichedPlacement[]; compliantCount: number; totalStipends: number; isUnassigned?: boolean; }> = {};

//         displayedPlacements.forEach(p => {
//             const empName = p.employerName || 'Unknown Organization';
//             const matchedCohort = cohorts.find(c => c.id === p.cohortId);
//             const schemaTitle = (p as any).complianceSchema?.schemaName;
//             let progTitle = matchedCohort?.name || schemaTitle || p.placementType || 'Unassigned Track';
//             let intakeLabel = p.startDate ? moment(p.startDate).format('MMM YYYY Term') : 'Open Timeline';
//             const isFloating = !p.cohortId && !p.complianceSchema;
//             const groupKey = isFloating ? `UNassigned_${p.employerId}` : `${p.employerId}_${progTitle}_${intakeLabel}`.replace(/\s+/g, '_');

//             if (!groups[groupKey]) {
//                 groups[groupKey] = {
//                     key: groupKey, employerName: empName,
//                     programmeTitle: isFloating ? '⚠️ Unassigned / Legacy Placements' : progTitle,
//                     intakeLabel: isFloating ? 'Needs Programme Mapping' : intakeLabel,
//                     items: [], compliantCount: 0, totalStipends: 0, isUnassigned: isFloating
//                 };
//             }

//             groups[groupKey].items.push(p);
//             if (p.hasMentor && p.compliance.isAgreementFullyExecuted) groups[groupKey].compliantCount++;
//             groups[groupKey].totalStipends += Number(p.stipendAmount) || 0;
//         });

//         return Object.values(groups).sort((a, b) => (a.isUnassigned ? 1 : -1));
//     }, [displayedPlacements, cohorts]);

//     useEffect(() => {
//         if (groupedPlacementsByProgramme.length > 0) {
//             setExpandedGroups(new Set(groupedPlacementsByProgramme.map(g => g.key)));
//         }
//     }, [groupedPlacementsByProgramme]);

//     const {
//         activeCount, expiringSoonCount, nonCompliantCount, completedCount, droppedCount, openSeats,
//         transformationPercentage, youthPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend
//     } = useMemo(() => {
//         const today = moment().startOf('day');
//         const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');

//         let active = 0, expiring = 0, nonCompliant = 0, completed = 0, dropped = 0;
//         let blackACI = 0, youthCountTracker = 0, monthlyEtiSum = 0, accumulatedSpend = 0;

//         enrichedAndFilteredPlacements.forEach(p => {
//             const statusLower = p.status.toLowerCase();
//             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
//             const end = moment(p.endDate).startOf('day');
//             const isExpired = end.isBefore(today);
//             const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

//             if (isLive) {
//                 active++;
//                 if (statusLower.includes('active')) {
//                     if (isExpiringSoon) expiring++;
//                     if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor || isExpired) nonCompliant++;
//                 }
//             } else if (statusLower.includes('complete')) {
//                 completed++;
//             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
//                 dropped++;
//             }

//             const eq = p.equityGroup.trim().toLowerCase();
//             if (eq.includes('african') || eq === 'black' || eq === 'ba' || eq.includes('coloured') || eq === 'bc' || eq.includes('indian') || eq === 'bi') blackACI++;

//             if (p.isYouth) youthCountTracker++;

//             if (isLive) {
//                 monthlyEtiSum += p.etiMonthlyValue;
//                 accumulatedSpend += p.projectedStipendSpend;
//             }
//         });

//         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
//         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);

//         return {
//             activeCount: active, expiringSoonCount: expiring, nonCompliantCount: nonCompliant,
//             completedCount: completed, droppedCount: dropped, openSeats: Math.max(totalCap - active, 0),
//             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
//             youthPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((youthCountTracker / enrichedAndFilteredPlacements.length) * 100) : 0,
//             monthlyETITotal: monthlyEtiSum, annualizedETIEstimate: monthlyEtiSum * 12, totalProjectedSpend: accumulatedSpend
//         };
//     }, [enrichedAndFilteredPlacements, employers]);

//     const formatDate = (dateStr: string) => dateStr ? moment(dateStr).format('DD MMM YYYY') : '—';

//     const getExportData = () => {
//         return displayedPlacements.map(p => ({
//             "Learner Name": p.learnerName, "ID Number": p.idNumber, "Host Company": p.employerName, "Demographic": p.equityGroup,
//             "Placement Type": p.placementType, "Monthly Stipend": p.stipendAmount || 0,
//             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
//             "Start Date": moment(p.startDate).format('YYYY-MM-DD'), "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
//             "Assigned Mentor": p.mentorName, "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
//             "Operational Status": p.status.toUpperCase()
//         }));
//     };

//     const handleExportCSV = () => {
//         const data = getExportData();
//         if (data.length === 0) return;
//         const headers = Object.keys(data[0]);
//         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
//         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
//         const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
//         link.setAttribute('download', `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.csv`);
//         document.body.appendChild(link); link.click(); document.body.removeChild(link);
//         setShowExportMenu(false);
//     };

//     const handleExportExcel = () => {
//         const data = getExportData();
//         if (data.length === 0) return;
//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
//         XLSX.writeFile(workbook, `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.xlsx`);
//         setShowExportMenu(false);
//     };

//     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

//     return (
//         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

//             {/* 🚀 REUSED UNIFIED MASTER MODAL FOR BOTH CREATE & EDIT ACTIONS */}
//             {(isCreateModalOpen || editingPlacement) && (
//                 <PlacementMasterModal
//                     editPlacement={editingPlacement}
//                     employers={employers}
//                     mentors={mentors}
//                     learners={learners.filter(l => !l.isArchived)}
//                     placements={placements}
//                     cohorts={cohorts}
//                     programmes={programmes}
//                     onClose={() => { setIsCreateModalOpen(false); setEditingPlacement(null); }}
//                     onSaved={() => fetchPlacements(true)}
//                     onCreate={createPlacement}
//                     onAddNewMentor={(empId) => {
//                         setActiveMentorEmpId(empId);
//                         setIsMentorModalOpen(true);
//                     }}
//                 />
//             )}

//             {optionsPlacement && <PlacementOptionsModal placement={optionsPlacement} onClose={() => setOptionsPlacement(null)} onSaved={() => fetchPlacements(true)} />}

//             {isMentorModalOpen && (
//                 <MentorModal employerId={activeMentorEmpId} onClose={() => setIsMentorModalOpen(false)} onSaved={async () => { await fetchStaff(true); }} addStaff={addStaff} />
//             )}

//             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
//                 <div className="cdp-stat-card cdp-stat-card--green">
//                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
//                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Placements</span></div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--blue">
//                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
//                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{openSeats}</span><span className="cdp-stat-card__label">Open Ecosystem Seats</span></div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--amber">
//                     <div className="cdp-stat-card__icon">{nonCompliantCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}</div>
//                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: nonCompliantCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>{nonCompliantCount}</span><span className="cdp-stat-card__label">Audit Risks / Non-Compliant</span></div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--grey">
//                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} /></div>
//                     <div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>{expiringSoonCount}</span><span className="cdp-stat-card__label">Expiring &lt; 30 Days</span></div>
//                 </div>
//             </div>

//             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Auditor
//                 </div>

//                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
//                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}><Landmark size={22} /></div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button></div>
//                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span></div>
//                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>Annually: {formatCurrency(annualizedETIEstimate)}</div>
//                             {activeInsight === 'eti' && <InsightPopup title="SARS Employment Tax Incentive" currentValue={`${formatCurrency(monthlyETITotal)}/mo`} actionSteps={[<span key="1"><strong>Live Calculation:</strong> Evaluates every active learner's recorded stipend against official SARS scales.</span>, <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500.</span>]} onClose={() => setActiveInsight(null)} />}
//                         </div>
//                     </div>

//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
//                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}><Wallet size={22} /></div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button></div>
//                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{formatCurrency(totalProjectedSpend)}</div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
//                             {activeInsight === 'spend' && <InsightPopup title="Skills Target Spend" currentValue={formatCurrency(totalProjectedSpend)} actionSteps={[<span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>, <span key="2"><strong>To Optimize:</strong> Log accurate stipends to count toward B-BBEE payroll targets.</span>]} onClose={() => setActiveInsight(null)} />}
//                         </div>
//                     </div>

//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
//                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}><Percent size={22} /></div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button></div>
//                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{transformationPercentage}%</div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
//                             {activeInsight === 'transformation' && <InsightPopup title="Transformation Demographic Metrics" currentValue={`${transformationPercentage}%`} actionSteps={[<span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>, <span key="2"><strong>To Optimize:</strong> Scale allocations using ACI candidate pools.</span>]} onClose={() => setActiveInsight(null)} />}
//                         </div>
//                     </div>

//                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
//                         <div style={{ background: '#ecfccb', padding: '10px', borderRadius: '50%', color: '#4d7c0f', height: 'fit-content' }}><User size={22} /></div>
//                         <div style={{ flex: 1 }}>
//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', color: '#4d7c0f', fontWeight: 700, textTransform: 'uppercase' }}>Youth Employment</span><button type="button" onClick={() => setActiveInsight(activeInsight === 'youth' ? null : 'youth')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4d7c0f', display: 'flex' }}><Info size={14} /></button></div>
//                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>{youthPercentage}%</div>
//                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Ratio of candidates under the age of 35.</span>
//                             {activeInsight === 'youth' && <InsightPopup title="Youth Employment Metrics" currentValue={`${youthPercentage}%`} actionSteps={[<span key="1"><strong>Demographic:</strong> Verified automatically against National ID numbers.</span>, <span key="2"><strong>Impact:</strong> Influences YES program reporting and quota verification.</span>]} onClose={() => setActiveInsight(null)} />}
//                         </div>
//                     </div>
//                 </div>
//             </div>

//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
//                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
//                     <Search size={15} color="var(--mlab-grey)" />
//                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
//                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
//                 </div>

//                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
//                     <Briefcase size={14} color="var(--mlab-grey)" />
//                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
//                         <option value="all">All Placement Types</option>
//                         <option value="QCTO Workplace Module">QCTO Practicals</option>
//                         <option value="Alumni Internship">Alumni Internships</option>
//                         <option value="External WIL">External WIL</option>
//                     </select>
//                 </div>

//                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
//                     <Building2 size={14} color="var(--mlab-grey)" />
//                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
//                         <option value="all">All Host Companies</option>
//                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
//                     </select>
//                 </div>

//                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
//                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
//                         <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={enrichedAndFilteredPlacements.length === 0} className="cdp-btn cdp-btn--outline" style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '0', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}>
//                             <DownloadCloud size={14} /> Export Options
//                         </button>
//                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
//                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
//                                 <button type="button" onClick={handleExportCSV} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileText size={14} color="#0ea5e9" /> Download as CSV</button>
//                                 <button type="button" onClick={handleExportExcel} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}><FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)</button>
//                             </div>
//                         )}
//                     </div>
//                     <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: '0' }} onClick={() => { setEditingPlacement(null); setIsCreateModalOpen(true); }}>
//                         <Plus size={14} /> New Placement
//                     </button>
//                 </div>
//             </div>

//             {/* ════════════════════════════════════════════════════════════════════
//                PROGRAMME-BOUND ACCORDION LEDGER
//             ════════════════════════════════════════════════════════════════════ */}
//             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
//                 <div className="vp-card" style={{ marginBottom: 0, background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)' }}>
//                     <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem', background: '#f8fafc' }}>
//                         <div className="vp-card-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <Briefcase size={18} color="var(--mlab-blue)" />
//                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Program-Bound Global Placement Ledger</h3>
//                             </div>
//                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: '0' }}>{groupedPlacementsByProgramme.length} Active Programme Track(s)</span>
//                         </div>
//                     </div>

//                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', background: 'white' }}>
//                         <button type="button" onClick={() => setActiveTab('active')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{activeCount}</span>
//                         </button>
//                         <button type="button" onClick={() => setActiveTab('history')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
//                         </button>
//                         <button type="button" onClick={() => setActiveTab('all')} style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
//                         </button>
//                     </div>

//                     <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
//                         {groupedPlacementsByProgramme.length > 0 ? (
//                             groupedPlacementsByProgramme.map(group => {
//                                 const isOpen = expandedGroups.has(group.key);
//                                 const isCompliant = group.compliantCount === group.items.length;

//                                 return (
//                                     <div key={group.key} style={{ background: 'white', border: `1px solid ${group.isUnassigned ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
//                                         <div onClick={() => toggleGroupAccordion(group.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: group.isUnassigned ? '#fff1f2' : isOpen ? '#f1f5f9' : 'white', cursor: 'pointer', borderBottom: isOpen ? '1px solid #cbd5e1' : 'none' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                                 <div style={{ background: group.isUnassigned ? '#fee2e2' : 'var(--mlab-midnight)', color: group.isUnassigned ? '#dc2626' : 'white', padding: '8px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                                     {group.isUnassigned ? <AlertTriangle size={18} /> : <Layers size={18} />}
//                                                 </div>
//                                                 <div>
//                                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: group.isUnassigned ? '#991b1b' : 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{group.employerName} — <span style={{ color: 'var(--mlab-blue)' }}>{group.programmeTitle}</span></div>
//                                                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                         <span><Calendar size={12} style={{ display: 'inline', marginRight: '3px' }} /> {group.intakeLabel}</span><span>•</span><span style={{ color: 'var(--mlab-midnight)' }}>{group.items.length} Learner(s) Enrolled</span>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
//                                                     <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: isCompliant ? '#dcfce7' : '#fef3c7', color: isCompliant ? '#166534' : '#b45309', border: `1px solid ${isCompliant ? '#86efac' : '#fde68a'}` }}>{group.compliantCount}/{group.items.length} Audit Ready</span>
//                                                     {group.totalStipends > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>{formatCurrency(group.totalStipends)}/mo Payroll</span>}
//                                                 </div>
//                                                 {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
//                                             </div>
//                                         </div>

//                                         {isOpen && (
//                                             <div className="mlab-table-wrap" style={{ borderTop: 'none' }}>
//                                                 <table className="mlab-table" style={{ margin: 0 }}>
//                                                     <thead style={{ background: 'whitesmoke', color: 'black' }}>
//                                                         <tr>
//                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Learner Profile</th>
//                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Supervision & Mentor</th>
//                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Track & Stipend</th>
//                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Contract Timeline</th>
//                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Compliance Readiness</th>
//                                                             <th style={{ fontSize: '0.7rem', textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
//                                                         </tr>
//                                                     </thead>
//                                                     <tbody>
//                                                         {group.items.map(p => {
//                                                             const today = moment().startOf('day');
//                                                             const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');
//                                                             const end = moment(p.endDate).startOf('day');

//                                                             const isExpired = end.isBefore(today);
//                                                             const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

//                                                             const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
//                                                             const missingItems = [];
//                                                             if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
//                                                             if (!p.hasMentor) missingItems.push("Workplace Mentor");

//                                                             return (
//                                                                 <tr key={p.id} style={{ background: 'white' }}>
//                                                                     <td>
//                                                                         <div className="cdp-learner-cell">
//                                                                             <div className="cdp-learner-avatar" style={{ borderRadius: '0' }}>{p.learnerName.charAt(0)}</div>
//                                                                             <div className="cdp-learner-cell__info"><span className="cdp-learner-cell__name">{p.learnerName}</span><span className="cdp-learner-cell__id">{p.idNumber}</span></div>
//                                                                         </div>
//                                                                     </td>
//                                                                     <td>
//                                                                         <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#334155' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: p.hasMentor ? 600 : 700 }}>
//                                                                             {p.hasMentor ? <><User size={12} /> {p.mentorName}</> : <><AlertTriangle size={12} /> No Mentor Assigned</>}
//                                                                         </div>
//                                                                     </td>
//                                                                     <td>
//                                                                         <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
//                                                                             <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content', borderRadius: '0' }}>{p.placementType}</span>
//                                                                             {p.stipendAmount && p.stipendAmount > 0 && <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0' }}><Coins size={10} /> R{p.stipendAmount}/mo</span>}
//                                                                             {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
//                                                                                 <button type="button" onClick={() => setEtiBreakdownLearner(p)} style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }} title="Click to view exact SARS mathematical breakdown"><Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo</button>
//                                                                             ) : <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}><AlertCircle size={10} /> Ineligible</span>}
//                                                                         </div>
//                                                                     </td>
//                                                                     <td>
//                                                                         <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
//                                                                             {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
//                                                                         </div>
//                                                                         {isExpired && <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 800, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><AlertTriangle size={11} color="#dc2626" /> Contract Expired</div>}
//                                                                         {isExpiringSoon && <div style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}><Clock size={11} color="#d97706" /> Ends &lt; 30 Days</div>}
//                                                                     </td>
//                                                                     <td>
//                                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
//                                                                             <span className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' : p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''}`} style={p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '0' } : p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0' } : { borderRadius: '0' }}>{p.status.replace('_', ' ')}</span>
//                                                                             {isAuditReady ? (
//                                                                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', width: 'fit-content' }}><div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}><ShieldCheck size={12} /> Audit Ready</div></div>
//                                                                             ) : isExpired ? (
//                                                                                 <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
//                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px' }}><ShieldAlert size={12} color="#dc2626" /> Critical: Overdue & Incomplete</div>
//                                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{missingItems.map(m => <span key={m} style={{ fontSize: '0.6rem', color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><X size={8} /> {m}</span>)}</div>
//                                                                                 </div>
//                                                                             ) : (
//                                                                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
//                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}><AlertTriangle size={12} /> Missing Data</div>
//                                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{missingItems.map(m => <span key={m} style={{ fontSize: '0.6rem', color: '#991b1b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><X size={8} /> {m}</span>)}</div>
//                                                                                 </div>
//                                                                             )}
//                                                                         </div>
//                                                                     </td>
//                                                                     <td style={{ textAlign: 'right' }}>
//                                                                         <div className="cdp-actions" style={{ justifyContent: 'flex-end' }}>
//                                                                             <button type="button" onClick={() => setEditingPlacement(p)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-blue)' }} title="Edit Placement Details"><Edit size={14} /></button>
//                                                                             <button type="button" onClick={() => setOptionsPlacement(p)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-amber)' }} title="Placement Options"><MoreVertical size={14} /></button>
//                                                                         </div>
//                                                                     </td>
//                                                                 </tr>
//                                                             );
//                                                         })}
//                                                     </tbody>
//                                                 </table>
//                                             </div>
//                                         )}
//                                     </div>
//                                 );
//                             })
//                         ) : (
//                             <div style={{ padding: '4rem', textAlign: 'center', background: 'white', border: '1px solid #cbd5e1' }}>
//                                 <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
//                                 <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
//                                 <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
//                                     {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
//                                         ? "Try adjusting your filters or search query."
//                                         : "You haven't assigned any learners to host companies yet."}
//                                 </p>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };


// // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // import { createPortal } from 'react-dom';
// // import { useSearchParams } from 'react-router-dom';
// // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // import { db, storage } from '../../../lib/firebase';
// // import {
// //     Briefcase, Search, Plus, Filter, AlertTriangle,
// //     CheckCircle, Clock, Building2, User, FileText,
// //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// //     ShieldAlert, Save, Loader2, Award, Trash2,
// //     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
// //     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
// //     Calculator, Accessibility, Layers, Users, ChevronDown, ChevronUp,
// //     Calendar
// // } from 'lucide-react';
// // import moment from 'moment';
// // import * as XLSX from 'xlsx';
// // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // import { useStore, type StaffMember } from '../../../store/useStore';
// // import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../types';
// // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // import Loader from '../../common/Loader/Loader';

// // import '../WorkplacesManager/WorkplacesManager.css';
// // import type { EnrichedPlacement } from '../WorkplacesManager/CompanyInsightsView/CompanyInsightsView';
// // import { EditPlacementModal } from '../WorkplacesManager/CompanyInsightsView/EditPlacementModal';

// // /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */

// // export interface UploadedEvidence {
// //     url: string;
// //     uploadedAt: string;
// //     fileName: string;
// //     uploadedByUid?: string;
// //     uploadedByName?: string;
// //     isLinked?: boolean;
// //     linkedAt?: string;
// //     history?: UploadedEvidence[];
// // }

// // /* ─── ETI BREAKDOWN MODAL ────────────────────────────────────────────────── */
// // const EtiBreakdownModal: React.FC<{
// //     learner: EnrichedPlacement;
// //     onClose: () => void;
// // }> = ({ learner, onClose }) => {
// //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// //     const wage = Number(learner.stipendAmount) || 0;
// //     const eti = learner.etiMonthlyValue;
// //     const annualEti = eti * 12;

// //     let mathString = "";
// //     if (wage < 2500) {
// //         mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
// //     } else if (wage >= 2500 && wage <= 5499) {
// //         mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// //     } else if (wage >= 5500 && wage < 7500) {
// //         mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
// //     } else {
// //         mathString = `Stipend exceeds R7,500 upper limit. ETI Claim = R0`;
// //     }

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '0', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// //                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// //                     <div>
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// //                             <Landmark size={20} /> SARS ETI Tax Rebate Audit
// //                         </div>
// //                         <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {learner.learnerName}</div>
// //                     </div>
// //                     <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// //                 </div>

// //                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0', padding: '1rem', marginBottom: '1rem' }}>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// //                     </div>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// //                         <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// //                     </div>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
// //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// //                     </div>
// //                 </div>

// //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// //                 <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '0', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// //                     {mathString}
// //                 </div>

// //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
// //                 <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// //                     <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
// //                         If stipend is R0 – R2,499: ETI = 60% of stipend
// //                     </li>
// //                     <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
// //                         If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
// //                     </li>
// //                     <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
// //                         If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
// //                     </li>
// //                     <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
// //                         If stipend is R7,500 or more: ETI = R0
// //                     </li>
// //                 </ul>

// //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center', borderRadius: '0' }}>
// //                     Close Audit Trail
// //                 </button>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // interface MentorModalProps {
// //     employerId: string;
// //     onClose: () => void;
// //     onSaved: () => void;
// //     addStaff: (m: StaffMember) => Promise<void>;
// // }
// // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// //     const toast = useToast();
// //     const [saving, setSaving] = useState(false);
// //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setSaving(true);
// //         try {
// //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// //             toast.success('Mentor created successfully!');
// //             onSaved();
// //             onClose();
// //         } catch (err) {
// //             console.error('Mentor save error:', err);
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
// //                 <div className="wm-modal__header wm-modal__header--green">
// //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// //                     <div className="wm-modal__body">
// //                         <div className="wm-form-grid">
// //                             <div className="wm-form-group wm-form-group--full">
// //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="text" placeholder="e.g. John Smith"
// //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// //                             </div>
// //                             <div className="wm-form-group wm-form-group--full">
// //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="email" placeholder="john@company.com"
// //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// //                             </div>
// //                             <div className="wm-form-group wm-form-group--full">
// //                                 <label className="wm-form-label">Phone Number</label>
// //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} type="tel" placeholder="082 123 4567"
// //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// //                             </div>
// //                         </div>
// //                     </div>
// //                     <div className="wm-modal__footer">
// //                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
// //                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving}>
// //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // // ─── FALLBACK COMPLIANCE SCHEMAS ───
// // const GENERIC_3_PHASE_SCHEMA: ComplianceSchema = {
// //     schemaId: 'generic_3_phase',
// //     schemaName: 'Standard 3-Phase Presets',
// //     tranches: [
// //         { trancheId: 'phase_1', title: 'Phase 1: Onboarding', percentage: 33, dueAtMonth: 1, requirements: [{ id: 'req_1', label: 'Employment Contract', type: 'document', required: true, systemTag: 'employmentContractUrl' }] },
// //         { trancheId: 'phase_2', title: 'Phase 2: Mid-Point Review', percentage: 33, dueAtMonth: 6, requirements: [{ id: 'req_2', label: 'Mid-Term Site Visit', type: 'site_visit', required: true }] },
// //         { trancheId: 'phase_3', title: 'Phase 3: Offboarding', percentage: 34, dueAtMonth: 12, requirements: [{ id: 'req_3', label: 'Final Completion Letter', type: 'document', required: true }] }
// //     ]
// // };

// // const MONTHLY_PAYROLL_SCHEMA: ComplianceSchema = {
// //     schemaId: 'monthly_payroll_only',
// //     schemaName: 'Pure Monthly Compliance',
// //     tranches: [
// //         { trancheId: 'onboarding', title: 'Initial HR Onboarding', percentage: 0, dueAtMonth: 0, requirements: [{ id: 'req_1', label: 'Signed SLA/Contract', type: 'document', required: true }] }
// //     ]
// // };

// // interface SelectedLearner {
// //     learner: DashboardLearner;
// //     mentorId: string;
// // }

// // export const GlobalCreatePlacementModal: React.FC<{
// //     employers: Employer[],
// //     mentors: StaffMember[],
// //     learners: DashboardLearner[],
// //     placements: PlacementContract[],
// //     cohorts: any[],
// //     programmes: any[],
// //     onClose: () => void,
// //     onCreate: (data: any) => Promise<void>,
// //     onAddNewMentor: (employerId: string) => void
// // }> = ({ employers, mentors, learners, placements, cohorts, programmes, onClose, onCreate, onAddNewMentor }) => {
// //     const toast = useToast();
// //     const { fetchEmployers } = useStore() as any;
// //     const [saving, setSaving] = useState(false);

// //     const [isEditingCap, setIsEditingCap] = useState(false);
// //     const [tempCap, setTempCap] = useState(1);

// //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// //     const [selectedCohortId, setSelectedCohortId] = useState('');
// //     const [learnerSearch, setLearnerSearch] = useState('');

// //     const [selectedLearners, setSelectedLearners] = useState<SelectedLearner[]>([]);

// //     const [fallbackSchemaId, setFallbackSchemaId] = useState('generic_3_phase');
// //     const [customPlacementType, setCustomPlacementType] = useState('');
// //     const [linkToExistingCohort, setLinkToExistingCohort] = useState(false);

// //     const [form, setForm] = useState({
// //         placementType: 'SETA Funded (Programme Linked)',
// //         startDate: '',
// //         endDate: '',
// //         fundingSource: 'Corporate Funded',
// //         bbbeeSpendCategory: 'N/A',
// //         stipendAmount: ''
// //     });

// //     const isRegulatedTrack = form.placementType === 'QCTO Workplace Module' || form.placementType === 'SETA Funded (Programme Linked)';

// //     const availableMentors = useMemo(() => {
// //         if (!selectedEmployerId) return [];
// //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// //     }, [selectedEmployerId, mentors]);

// //     const filteredLearners = useMemo(() => {
// //         if (!learnerSearch) return [];
// //         return learners.filter(l => {
// //             const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
// //             const notSelected = !selectedLearners.find(sl => sl.learner.id === l.id);
// //             return matchesSearch && notSelected;
// //         }).slice(0, 5);
// //     }, [learnerSearch, learners, selectedLearners]);

// //     const handleRemoveLearner = (id: string) => {
// //         setSelectedLearners(prev => prev.filter(sl => sl.learner.id !== id));
// //     };

// //     const handleLearnerMentorChange = (learnerId: string, mentorId: string) => {
// //         setSelectedLearners(prev => prev.map(sl => sl.learner.id === learnerId ? { ...sl, mentorId } : sl));
// //     };

// //     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
// //     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));

// //     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
// //     const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

// //     useEffect(() => {
// //         if (selectedEmployer) {
// //             setTempCap((selectedEmployer as any).internCapacity || 1);
// //             setIsEditingCap(false);
// //         }
// //     }, [selectedEmployer]);

// //     const handleSaveCapacity = async (e: React.MouseEvent) => {
// //         e.stopPropagation();
// //         if (!selectedEmployerId) return;
// //         try {
// //             await updateDoc(doc(db, 'employers', selectedEmployerId), {
// //                 internCapacity: Number(tempCap)
// //             });
// //             await fetchEmployers(true);
// //             setIsEditingCap(false);
// //             toast.success("Host Company capacity updated!");
// //         } catch (err) {
// //             toast.error("Failed to update capacity.");
// //         }
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");
// //         if (form.placementType === 'Other' && !customPlacementType.trim()) return toast.error("Please specify the custom placement type.");

// //         if (isRegulatedTrack && linkToExistingCohort) {
// //             const missingCohorts = selectedLearners.filter(sl => !sl.learner.cohortId);
// //             if (missingCohorts.length > 0) {
// //                 return toast.error(`Cannot auto-bind: ${missingCohorts.map(sl => sl.learner.fullName).join(', ')} do not have an active classroom cohort. Please uncheck the box and select a programme manually.`);
// //             }
// //         } else if (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId) {
// //             return toast.error("Please select a target Programme/Cohort from the dropdown.");
// //         }

// //         if (isOverCapacity) {
// //             if (!window.confirm(`WARNING: You are exceeding the stated capacity for ${selectedEmployer?.name}. Are you sure you want to force this placement?`)) return;
// //         }

// //         setSaving(true);
// //         try {
// //             const finalPlacementType = form.placementType === 'Other' ? customPlacementType.trim() : form.placementType;

// //             await Promise.all(selectedLearners.map(sl => {
// //                 let schemaToApply: ComplianceSchema | null = null;

// //                 const targetCohortId = isRegulatedTrack
// //                     ? (linkToExistingCohort ? sl.learner.cohortId : selectedCohortId)
// //                     : '';

// //                 if (isRegulatedTrack && targetCohortId) {
// //                     const matchedCohort = cohorts.find(c => c.id === targetCohortId);
// //                     if (matchedCohort) {
// //                         if (matchedCohort.complianceSchema) {
// //                             schemaToApply = matchedCohort.complianceSchema;
// //                         }
// //                         else if (matchedCohort.programmeId || matchedCohort.qualificationId) {
// //                             const templateId = matchedCohort.programmeId || matchedCohort.qualificationId;
// //                             const matchedProg = programmes.find(p => p.id === templateId);
// //                             if (matchedProg && matchedProg.complianceSchema) {
// //                                 schemaToApply = matchedProg.complianceSchema;
// //                             }
// //                         }
// //                     }
// //                 } else if (!isRegulatedTrack) {
// //                     if (fallbackSchemaId === 'generic_3_phase') {
// //                         schemaToApply = GENERIC_3_PHASE_SCHEMA;
// //                     } else if (fallbackSchemaId === 'monthly_payroll_only') {
// //                         schemaToApply = MONTHLY_PAYROLL_SCHEMA;
// //                     } else {
// //                         const matchedCustomTemplate = programmes.find(p => p.id === fallbackSchemaId);
// //                         if (matchedCustomTemplate && matchedCustomTemplate.complianceSchema) {
// //                             schemaToApply = matchedCustomTemplate.complianceSchema;
// //                         }
// //                     }
// //                 }

// //                 return onCreate({
// //                     learnerId: sl.learner.id,
// //                     employerId: selectedEmployerId,
// //                     cohortId: targetCohortId,
// //                     mentorId: sl.mentorId,
// //                     ...form,
// //                     placementType: finalPlacementType,
// //                     stipendAmount: Number(form.stipendAmount) || 0,
// //                     status: 'Active Placement',
// //                     complianceSchema: schemaToApply,
// //                     evidenceMap: {}
// //                 });
// //             }));

// //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// //             onClose();
// //         } catch (err: any) {
// //             toast.error(err.message || "Failed to create placements.");
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', borderRadius: '0' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1', borderRadius: '0' }}><Network size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// //                     <div className="wm-modal__body">

// //                         <div className="wm-form-section">
// //                             <div className="wm-form-section__label"><Building2 size={12} /> 1. Setup Placement Ecosystem</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
// //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} required value={selectedEmployerId} onChange={e => setSelectedEmployerId(e.target.value)}>
// //                                         <option value="">-- Choose Host Company --</option>
// //                                         {employers.filter(emp => emp.status !== 'archived').map(emp => (
// //                                             <option key={emp.id} value={emp.id}>{emp.name}</option>
// //                                         ))}
// //                                     </select>
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
// //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.placementType} onChange={e => {
// //                                         const val = e.target.value;
// //                                         setForm(p => ({ ...p, placementType: val }));
// //                                         setSelectedCohortId('');
// //                                     }}>
// //                                         <option value="SETA Funded (Programme Linked)">SETA Funded (Linked to Training)</option>
// //                                         <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
// //                                         <option value="Independent SETA Internship">SETA Funded (Independent / Uni Grads)</option>
// //                                         <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
// //                                         <option value="External WIL">External WIL (Unregulated)</option>
// //                                         <option value="Other">Other (Custom)</option>
// //                                     </select>
// //                                 </div>

// //                                 {form.placementType === 'Other' && (
// //                                     <div className="wm-form-group wm-form-group--full animate-fade-in" style={{ marginTop: '-4px', background: '#f8fafc', padding: '10px', borderRadius: '0', border: '1px dashed #cbd5e1' }}>
// //                                         <label className="wm-form-label">Specify Custom Placement Type <span className="wm-form-required">*</span></label>
// //                                         <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} required value={customPlacementType} onChange={e => setCustomPlacementType(e.target.value)} placeholder="e.g. Corporate CSI Initiative" />
// //                                     </div>
// //                                 )}

// //                                 {selectedEmployer && (
// //                                     <div className="wm-form-group wm-form-group--full" style={{ marginTop: '-0.5rem' }}>
// //                                         <div style={{ padding: '0.5rem', borderRadius: '0', background: isOverCapacity ? '#fff1f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isOverCapacity ? '#991b1b' : '#15803d', fontWeight: 600 }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                 {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
// //                                                 Placement Capacity: {currentEmployerPlacements.length + selectedLearners.length} /
// //                                                 {isEditingCap ? (
// //                                                     <input
// //                                                         type="number"
// //                                                         min="1"
// //                                                         value={tempCap}
// //                                                         onChange={(e) => setTempCap(Number(e.target.value))}
// //                                                         style={{ width: '60px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '0', outline: 'none', marginLeft: '4px' }}
// //                                                         autoFocus
// //                                                     />
// //                                                 ) : (
// //                                                     <span>{internCapacity}</span>
// //                                                 )}
// //                                                 allocations utilized.
// //                                             </div>

// //                                             {isEditingCap ? (
// //                                                 <div style={{ display: 'flex', gap: '4px' }}>
// //                                                     <button type="button" onClick={() => setIsEditingCap(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
// //                                                     <button type="button" onClick={handleSaveCapacity} style={{ background: 'var(--mlab-green)', border: 'none', color: 'white', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                         <Save size={10} /> Save
// //                                                     </button>
// //                                                 </div>
// //                                             ) : (
// //                                                 <button type="button" onClick={() => setIsEditingCap(true)} style={{ background: 'none', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, color: isOverCapacity ? '#991b1b' : '#15803d', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
// //                                                     <Edit size={10} /> Update Cap
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>

// //                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// //                             <div className="wm-form-section__label"><Users size={12} /> 2. Select Learners & Assign Mentors</div>

// //                             <div style={{ position: 'relative', marginBottom: selectedLearners.length > 0 ? '16px' : '0' }}>
// //                                 <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} placeholder="Search by name or ID to add a learner..." value={learnerSearch} onChange={e => setLearnerSearch(e.target.value)} />
// //                                 {learnerSearch && (
// //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// //                                             <div key={l.id} onClick={() => { setSelectedLearners(prev => [...prev, { learner: l, mentorId: '' }]); setLearnerSearch(''); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                                 <div>
// //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// //                                                 </div>
// //                                             </div>
// //                                         )) : (
// //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
// //                                         )}
// //                                     </div>
// //                                 )}
// //                             </div>

// //                             {selectedLearners.length > 0 && (
// //                                 <div className="animate-fade-in" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden' }}>
// //                                     <div style={{ background: '#f1f5f9', padding: '8px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
// //                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>LEARNER PROFILE</div>
// //                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                             ASSIGNED MENTOR
// //                                             {selectedEmployerId && (
// //                                                 <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
// //                                                     <Plus size={10} /> Quick Add
// //                                                 </button>
// //                                             )}
// //                                         </div>
// //                                         <div style={{ width: '30px' }}></div>
// //                                     </div>
// //                                     <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
// //                                         {selectedLearners.map((sl, i) => (
// //                                             <div key={sl.learner.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: i === selectedLearners.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
// //                                                 <div style={{ flex: 1 }}>
// //                                                     <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{sl.learner.fullName}</div>
// //                                                     <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sl.learner.idNumber}</div>
// //                                                 </div>
// //                                                 <div style={{ flex: 1, paddingRight: '12px' }}>
// //                                                     <select
// //                                                         className="wm-form-input"
// //                                                         style={{ padding: '6px 8px', borderRadius: '0', fontSize: '0.75rem', height: 'auto', background: sl.mentorId ? 'white' : '#fff7ed', borderColor: sl.mentorId ? '#cbd5e1' : '#fed7aa' }}
// //                                                         value={sl.mentorId}
// //                                                         onChange={e => handleLearnerMentorChange(sl.learner.id, e.target.value)}
// //                                                     >
// //                                                         <option value="">-- Flag as Missing --</option>
// //                                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
// //                                                     </select>
// //                                                 </div>
// //                                                 <div style={{ width: '30px', textAlign: 'right' }}>
// //                                                     <button type="button" onClick={() => handleRemoveLearner(sl.learner.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={16} /></button>
// //                                                 </div>
// //                                             </div>
// //                                         ))}
// //                                     </div>
// //                                 </div>
// //                             )}
// //                         </div>

// //                         {isRegulatedTrack ? (
// //                             selectedLearners.length > 0 && (
// //                                 <div className="wm-form-section animate-fade-in">
// //                                     <div className="wm-form-section__label" style={{ marginBottom: '10px' }}><Layers size={12} /> 3. Regulated Program Verification</div>

// //                                     <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '0', marginBottom: '12px' }}>
// //                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.8rem' }}>
// //                                             <input
// //                                                 type="checkbox"
// //                                                 checked={linkToExistingCohort}
// //                                                 onChange={e => setLinkToExistingCohort(e.target.checked)}
// //                                                 style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
// //                                             />
// //                                             Auto-bind placement to the learner's currently enrolled class/cohort
// //                                         </label>
// //                                         <p style={{ margin: '4px 0 0 24px', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>
// //                                             Check this if the learner is doing workplace practicals for their existing class. Uncheck to place them into a completely new Programme/Cohort.
// //                                         </p>

// //                                         {linkToExistingCohort && (
// //                                             <div style={{ marginTop: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '8px' }}>
// //                                                 <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-midnight)', marginBottom: '8px', textTransform: 'uppercase' }}>Auto-Resolved Cohort Mapping:</div>
// //                                                 {selectedLearners.length === 0 ? (
// //                                                     <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>Select learners above to see their mappings.</div>
// //                                                 ) : (
// //                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                                         {selectedLearners.map(sl => {
// //                                                             const linkedCohort = cohorts.find(c => c.id === sl.learner.cohortId);
// //                                                             return (
// //                                                                 <div key={sl.learner.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', padding: '4px', background: '#f8fafc', borderRadius: '0' }}>
// //                                                                     <span style={{ color: '#475569', fontWeight: 600 }}>{sl.learner.fullName}</span>
// //                                                                     {linkedCohort ? (
// //                                                                         <span style={{ color: 'var(--mlab-blue)', fontWeight: 700 }}>{linkedCohort.name}</span>
// //                                                                     ) : (
// //                                                                         <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Unassigned Error</span>
// //                                                                     )}
// //                                                                 </div>
// //                                                             );
// //                                                         })}
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         )}
// //                                     </div>

// //                                     {!linkToExistingCohort && (
// //                                         <select className="wm-form-input animate-fade-in" required={isRegulatedTrack && !linkToExistingCohort} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)} style={{ borderRadius: '0', borderLeft: '4px solid var(--mlab-amber)' }}>
// //                                             <option value="">-- Assign Target Qualification / Programme Record --</option>
// //                                             {cohorts.map(c => (
// //                                                 <option key={c.id} value={c.id}>{c.name}</option>
// //                                             ))}
// //                                         </select>
// //                                     )}

// //                                     <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
// //                                         * Note: Placements will automatically inherit the Tranche & Funding Blueprint attached to the selected programme.
// //                                     </div>
// //                                 </div>
// //                             )
// //                         ) : (
// //                             <div className="wm-form-section animate-fade-in" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px' }}>
// //                                 <div className="wm-form-section__label" style={{ marginBottom: '8px' }}><Wallet size={12} /> 3. Independent Compliance Mode</div>
// //                                 <select className="wm-form-input" value={fallbackSchemaId} onChange={e => setFallbackSchemaId(e.target.value)} style={{ borderRadius: 0 }}>
// //                                     <optgroup label="System Defaults">
// //                                         <option value="generic_3_phase">Standard 3-Phase Lifecycle (Onboard, Mid-Point, Offboard)</option>
// //                                         <option value="monthly_payroll_only">Unstructured (Monthly Payroll & HR Only)</option>
// //                                     </optgroup>
// //                                     {programmes && programmes.length > 0 && (
// //                                         <optgroup label="Custom Qualification Templates">
// //                                             {programmes.map((prog: any) => (
// //                                                 <option key={prog.id} value={prog.id}>{prog.name || 'Custom Blueprint'}</option>
// //                                             ))}
// //                                         </optgroup>
// //                                     )}
// //                                 </select>
// //                             </div>
// //                         )}

// //                         <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId) ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId) ? 'auto' : 'none' }}>
// //                             <div className="wm-form-section__label"><Briefcase size={12} /> {isRegulatedTrack ? '4' : '3'}. Global Placement Settings</div>
// //                             <div className="wm-form-grid">

// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// //                                         <option value="N/A">Not Applicable (Non-B-BBEE / Unregulated)</option>
// //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// //                                         <option value="Category D">Category D (Apprenticeship)</option>
// //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// //                                     </select>
// //                                 </div>

// //                                 <div className="wm-form-group wm-form-group--full">
// //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// //                                     <div style={{ position: 'relative' }}>
// //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// //                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px', borderRadius: '0' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} />
// //                                     </div>
// //                                 </div>

// //                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
// //                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
// //                             </div>
// //                         </div>

// //                     </div>
// //                     <div className="wm-modal__footer">
// //                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
// //                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId)}>
// //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };


// // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// // const PlacementOptionsModal: React.FC<{
// //     placement: any;
// //     onClose: () => void;
// //     onSaved: () => void;
// // }> = ({ placement, onClose, onSaved }) => {
// //     const toast = useToast();
// //     const [processing, setProcessing] = useState(false);

// //     const handleChangeStatus = async (newStatus: string) => {
// //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// //         setProcessing(true);
// //         try {
// //             await updateDoc(doc(db, 'placements', placement.id), {
// //                 status: newStatus,
// //                 updatedAt: new Date().toISOString()
// //             });
// //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// //             onSaved();
// //             onClose();
// //         } catch (err: any) {
// //             toast.error(err.message || "Failed to update status.");
// //         } finally {
// //             setProcessing(false);
// //         }
// //     };

// //     const handleDeleteRecord = async () => {
// //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// //         setProcessing(true);
// //         try {
// //             await deleteDoc(doc(db, 'placements', placement.id));
// //             toast.success("Placement record permanently deleted.");
// //             onSaved();
// //             onClose();
// //         } catch (err: any) {
// //             toast.error(err.message || "Failed to delete record.");
// //         } finally {
// //             setProcessing(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706', borderRadius: '0' }}><MoreVertical size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Placement Options</h2>
// //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// //                 </div>

// //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                     <button
// //                         type="button"
// //                         disabled={processing || placement.status === 'Completed'}
// //                         onClick={() => handleChangeStatus('Completed')}
// //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// //                     >
// //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// //                     </button>
// //                     <button
// //                         type="button"
// //                         disabled={processing || placement.status === 'Pending Match'}
// //                         onClick={() => handleChangeStatus('Pending Match')}
// //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// //                     >
// //                         <Clock size={16} color="#d97706" /> Revert to Pending Match
// //                     </button>
// //                     <button
// //                         type="button"
// //                         disabled={processing || placement.status === 'Terminated'}
// //                         onClick={() => handleChangeStatus('Terminated')}
// //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}
// //                     >
// //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// //                     </button>
// //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
// //                     <button
// //                         type="button"
// //                         disabled={processing}
// //                         onClick={handleDeleteRecord}
// //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// //                     >
// //                         <Trash2 size={16} /> Delete Record Permanently
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };

// // /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// //                 <Activity size={16} color="#d97706" /> {title}
// //             </div>
// //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// //         </div>
// //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// //         </div>
// //     </div>
// // );

// // /* ═══════════════════════════════════════════════════════════════════════════
// //    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// // ═══════════════════════════════════════════════════════════════════════════ */
// // export const PlacementsDashboard: React.FC = () => {
// //     const toast = useToast();
// //     const [searchParams, setSearchParams] = useSearchParams();

// //     const employerUrlParam = searchParams.get('employer');

// //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// //     const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
// //     const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

// //     const programmes = (useStore(s => (s as any).programmes) || []) as any[];
// //     const fetchProgrammes = (useStore(s => (s as any).fetchProgrammes) || (async () => { })) as any;

// //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
// //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
// //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 'youth' | null>(null);

// //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// //     const [searchQuery, setSearchQuery] = useState('');
// //     const [filterType, setFilterType] = useState('all');

// //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// //     // ACCORDION COLLAPSE TRACKER
// //     const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

// //     const toggleGroupAccordion = (groupKey: string) => {
// //         setExpandedGroups(prev => {
// //             const next = new Set(prev);
// //             if (next.has(groupKey)) next.delete(groupKey);
// //             else next.add(groupKey);
// //             return next;
// //         });
// //     };

// //     const [showExportMenu, setShowExportMenu] = useState(false);
// //     const exportMenuRef = useRef<HTMLDivElement>(null);

// //     useEffect(() => {
// //         const handleClickOutside = (event: MouseEvent) => {
// //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// //                 setShowExportMenu(false);
// //             }
// //         };
// //         document.addEventListener('mousedown', handleClickOutside);
// //         return () => document.removeEventListener('mousedown', handleClickOutside);
// //     }, []);

// //     useEffect(() => {
// //         setSearchParams(prev => {
// //             const params = new URLSearchParams(prev);
// //             if (filterEmployer !== 'all') {
// //                 params.set('employer', filterEmployer);
// //             } else {
// //                 params.delete('employer');
// //             }
// //             return params;
// //         }, { replace: true });
// //     }, [filterEmployer, setSearchParams]);

// //     useEffect(() => {
// //         const loadEcosystem = async () => {
// //             try {
// //                 await Promise.all([
// //                     fetchPlacements(),
// //                     fetchEmployers(),
// //                     fetchLearners(),
// //                     fetchStaff(),
// //                     fetchCohorts(),
// //                     fetchProgrammes()
// //                 ]);
// //             } catch (err) {
// //                 toast.error("Failed to synchronize placement ecosystem data.");
// //             } finally {
// //                 setIsInitialLoad(false);
// //             }
// //         };
// //         loadEcosystem();
// //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts, fetchProgrammes]);

// //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// //     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
// //         return placements
// //             .map(p => {
// //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

// //                 const placementRecord = p as PlacementContract & {
// //                     placementType?: string,
// //                     compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// //                     bbbeeSpendCategory?: string,
// //                     mentorId?: string,
// //                     cohortId?: string
// //                 };

// //                 const mentor = mentors.find(m =>
// //                     (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// //                     (placementRecord.mentorId && m.id === placementRecord.mentorId)
// //                 ) || ({} as Partial<StaffMember>);

// //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// //                 let isEtiEligible = false;
// //                 let isFemale = false;
// //                 let isYouth = true;

// //                 if (learner.idNumber && learner.idNumber.length >= 6) {
// //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// //                     const age = new Date().getFullYear() - birthYear;
// //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// //                     if (age > 35) isYouth = false;

// //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// //                 } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
// //                     isFemale = true;
// //                 }

// //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

// //                 let etiMonthlyValue = 0;
// //                 const wage = Number(p.stipendAmount) || 0;

// //                 if (isEtiEligible && wage > 0) {
// //                     if (wage < 2500) {
// //                         etiMonthlyValue = wage * 0.60;
// //                     } else if (wage >= 2500 && wage <= 5499) {
// //                         etiMonthlyValue = 1500;
// //                     } else if (wage >= 5500 && wage < 7500) {
// //                         etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0);
// //                     } else {
// //                         etiMonthlyValue = 0;
// //                     }
// //                 }

// //                 const structuredCompliance = {
// //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// //                         ? placementRecord.compliance.isAgreementFullyExecuted
// //                         : p.wblAgreementSigned,
// //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// //                 };

// //                 return {
// //                     ...p,
// //                     placementType: placementRecord.placementType || 'QCTO Workplace Module',
// //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// //                     compliance: structuredCompliance,
// //                     learnerName: learner.fullName || 'Unknown Learner',
// //                     idNumber: learner.idNumber || '—',
// //                     equityGroup: equity,
// //                     isFemale,
// //                     isYouth,
// //                     hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
// //                     employerName: employer.name || 'Unknown Company',
// //                     mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// //                     isEtiEligible,
// //                     etiMonthlyValue,
// //                     projectedStipendSpend: wage * verifiedTimeline,
// //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
// //                 } as EnrichedPlacement;
// //             });
// //     }, [placements, learners, employers, mentors]);

// //     const displayedPlacements = useMemo(() => {
// //         return enrichedAndFilteredPlacements
// //             .filter(p => {
// //                 const sLower = p.status.toLowerCase();

// //                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// //                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;

// //                 if (searchQuery) {
// //                     const q = searchQuery.toLowerCase();
// //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// //                 }
// //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// //                 return true;
// //             })
// //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// //     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);

// //     // PROGRAMME / COHORT GROUPING ENGINE WITH AUTO-EXPAND FIRST GROUP
// //     const groupedPlacementsByProgramme = useMemo(() => {
// //         const groups: Record<string, {
// //             key: string;
// //             employerName: string;
// //             programmeTitle: string;
// //             intakeLabel: string;
// //             items: EnrichedPlacement[];
// //             compliantCount: number;
// //             totalStipends: number;
// //             isUnassigned?: boolean;
// //         }> = {};

// //         displayedPlacements.forEach(p => {
// //             const empName = p.employerName || 'Unknown Organization';

// //             const matchedCohort = cohorts.find(c => c.id === p.cohortId);
// //             const schemaTitle = (p as any).complianceSchema?.schemaName;

// //             let progTitle = matchedCohort?.name || schemaTitle || p.placementType || 'Unassigned Track';
// //             let intakeLabel = p.startDate ? moment(p.startDate).format('MMM YYYY Term') : 'Open Timeline';

// //             const isFloating = !p.cohortId && !p.complianceSchema;

// //             const groupKey = isFloating
// //                 ? `UNassigned_${p.employerId}`
// //                 : `${p.employerId}_${progTitle}_${intakeLabel}`.replace(/\s+/g, '_');

// //             if (!groups[groupKey]) {
// //                 groups[groupKey] = {
// //                     key: groupKey,
// //                     employerName: empName,
// //                     programmeTitle: isFloating ? '⚠️ Unassigned / Legacy Placements' : progTitle,
// //                     intakeLabel: isFloating ? 'Needs Programme Mapping' : intakeLabel,
// //                     items: [],
// //                     compliantCount: 0,
// //                     totalStipends: 0,
// //                     isUnassigned: isFloating
// //                 };
// //             }

// //             groups[groupKey].items.push(p);
// //             if (p.hasMentor && p.compliance.isAgreementFullyExecuted) {
// //                 groups[groupKey].compliantCount++;
// //             }
// //             groups[groupKey].totalStipends += Number(p.stipendAmount) || 0;
// //         });

// //         return Object.values(groups).sort((a, b) => (a.isUnassigned ? 1 : -1));
// //     }, [displayedPlacements, cohorts]);

// //     // Auto-expand all groups on initial load or search change
// //     useEffect(() => {
// //         if (groupedPlacementsByProgramme.length > 0) {
// //             setExpandedGroups(new Set(groupedPlacementsByProgramme.map(g => g.key)));
// //         }
// //     }, [groupedPlacementsByProgramme]);

// //     // 🚀 UPDATED ACCURATE DATE & EXPIRY KPI METRICS
// //     const {
// //         activeCount, expiringSoonCount, nonCompliantCount, completedCount, droppedCount, openSeats,
// //         transformationPercentage, disabilityPercentage, youthPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend, absorptionRate
// //     } = useMemo(() => {
// //         const today = moment().startOf('day');
// //         const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');

// //         let active = 0, expiring = 0, nonCompliant = 0, completed = 0, dropped = 0, absorbed = 0;

// //         let blackACI = 0;
// //         let blackFemale = 0;
// //         let disabilityCount = 0;
// //         let youthCountTracker = 0;
// //         let monthlyEtiSum = 0;
// //         let accumulatedSpend = 0;

// //         enrichedAndFilteredPlacements.forEach(p => {
// //             const statusLower = p.status.toLowerCase();
// //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
// //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes('absorb') || (p as any).isAbsorbed;

// //             const end = moment(p.endDate).startOf('day');
// //             const isExpired = end.isBefore(today);
// //             const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

// //             if (isLive) {
// //                 active++;
// //                 if (statusLower.includes('active')) {
// //                     if (isExpiringSoon) expiring++;
// //                     if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor || isExpired) {
// //                         nonCompliant++;
// //                     }
// //                 }
// //             } else if (statusLower.includes('complete')) {
// //                 completed++;
// //             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
// //                 dropped++;
// //             }

// //             if (isAbsorbed) absorbed++;

// //             const eq = p.equityGroup.trim().toLowerCase();
// //             if (eq.includes('african') || eq === 'black' || eq === 'ba') { blackACI++; if (p.isFemale) blackFemale++; }
// //             else if (eq.includes('coloured') || eq === 'bc') { blackACI++; if (p.isFemale) blackFemale++; }
// //             else if (eq.includes('indian') || eq === 'bi') { blackACI++; if (p.isFemale) blackFemale++; }

// //             if (p.isYouth) youthCountTracker++;
// //             if (p.hasDisability) disabilityCount++;

// //             if (isLive) {
// //                 monthlyEtiSum += p.etiMonthlyValue;
// //                 accumulatedSpend += p.projectedStipendSpend;
// //             }
// //         });

// //         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
// //         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);
// //         const open = totalCap - active;

// //         return {
// //             activeCount: active,
// //             expiringSoonCount: expiring,
// //             nonCompliantCount: nonCompliant,
// //             completedCount: completed,
// //             droppedCount: dropped,
// //             openSeats: Math.max(open, 0),
// //             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
// //             disabilityPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((disabilityCount / enrichedAndFilteredPlacements.length) * 100) : 0,
// //             youthPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((youthCountTracker / enrichedAndFilteredPlacements.length) * 100) : 0,
// //             monthlyETITotal: monthlyEtiSum,
// //             annualizedETIEstimate: monthlyEtiSum * 12,
// //             absorptionRate: completed > 0 ? Math.round((absorbed / completed) * 100) : 0,
// //             totalProjectedSpend: accumulatedSpend
// //         };
// //     }, [enrichedAndFilteredPlacements, employers]);

// //     const formatDate = (dateStr: string) => dateStr ? moment(dateStr).format('DD MMM YYYY') : '—';

// //     const getExportData = () => {
// //         return displayedPlacements.map(p => ({
// //             "Learner Name": p.learnerName,
// //             "ID Number": p.idNumber,
// //             "Host Company": p.employerName,
// //             "Demographic": p.equityGroup,
// //             "Placement Type": p.placementType,
// //             "B-BBEE Category": p.bbbeeSpendCategory,
// //             "Monthly Stipend": p.stipendAmount || 0,
// //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
// //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// //             "Assigned Mentor": p.mentorName,
// //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// //             "Contract Link": p.compliance.wblpaAgreementUrl || 'Not Uploaded',
// //             "Operational Status": p.status.toUpperCase()
// //         }));
// //     };

// //     const generateFileName = (extension: string) => {
// //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// //     };

// //     const handleExportCSV = () => {
// //         const data = getExportData();
// //         if (data.length === 0) return;
// //         const headers = Object.keys(data[0]);
// //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// //         const link = document.createElement('a');
// //         link.href = URL.createObjectURL(blob);
// //         link.setAttribute('download', generateFileName('csv'));
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //         setShowExportMenu(false);
// //     };

// //     const handleExportExcel = () => {
// //         const data = getExportData();
// //         if (data.length === 0) return;
// //         const worksheet = XLSX.utils.json_to_sheet(data);
// //         const workbook = XLSX.utils.book_new();
// //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
// //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// //         setShowExportMenu(false);
// //     };

// //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// //     return (
// //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* ACTION MODALS */}
// //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

// //             {editingPlacement && (
// //                 <EditPlacementModal
// //                     placement={editingPlacement}
// //                     mentors={mentors}
// //                     cohorts={cohorts}
// //                     learners={learners}
// //                     onClose={() => setEditingPlacement(null)}
// //                     onSaved={() => fetchPlacements(true)}
// //                 />
// //             )}

// //             {optionsPlacement && (
// //                 <PlacementOptionsModal
// //                     placement={optionsPlacement}
// //                     onClose={() => setOptionsPlacement(null)}
// //                     onSaved={() => fetchPlacements(true)}
// //                 />
// //             )}

// //             {isMentorModalOpen && (
// //                 <MentorModal
// //                     employerId={activeMentorEmpId}
// //                     onClose={() => setIsMentorModalOpen(false)}
// //                     onSaved={async () => {
// //                         await fetchStaff(true);
// //                     }}
// //                     addStaff={addStaff}
// //                 />
// //             )}

// //             {isCreateModalOpen && (
// //                 <GlobalCreatePlacementModal
// //                     employers={employers}
// //                     mentors={mentors}
// //                     learners={learners.filter(l => !l.isArchived)}
// //                     placements={placements}
// //                     cohorts={cohorts}
// //                     programmes={programmes}
// //                     onClose={() => setIsCreateModalOpen(false)}
// //                     onCreate={createPlacement}
// //                     onAddNewMentor={(empId) => {
// //                         setActiveMentorEmpId(empId);
// //                         setIsMentorModalOpen(true);
// //                     }}
// //                 />
// //             )}

// //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// //                 <div className="cdp-stat-card cdp-stat-card--green">
// //                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{activeCount}</span>
// //                         <span className="cdp-stat-card__label">Active Placements</span>
// //                     </div>
// //                 </div>

// //                 <div className="cdp-stat-card cdp-stat-card--blue">
// //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{openSeats}</span>
// //                         <span className="cdp-stat-card__label">Open Ecosystem Seats</span>
// //                     </div>
// //                 </div>

// //                 <div className="cdp-stat-card cdp-stat-card--amber">
// //                     <div className="cdp-stat-card__icon">
// //                         {nonCompliantCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value" style={{ color: nonCompliantCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// //                             {nonCompliantCount}
// //                         </span>
// //                         <span className="cdp-stat-card__label">Audit Risks / Non-Compliant</span>
// //                     </div>
// //                 </div>

// //                 <div className="cdp-stat-card cdp-stat-card--grey">
// //                     <div className="cdp-stat-card__icon">
// //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// //                     </div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// //                             {expiringSoonCount}
// //                         </span>
// //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// //                     </div>
// //                 </div>
// //             </div>

// //             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
// //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Auditor
// //                 </div>

// //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

// //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// //                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}>
// //                             <Landmark size={22} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span>
// //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// //                             </div>
// //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// //                                 {formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
// //                             </div>
// //                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
// //                                 Annually: {formatCurrency(annualizedETIEstimate)}
// //                             </div>
// //                             {activeInsight === 'eti' && (
// //                                 <InsightPopup
// //                                     title="SARS Employment Tax Incentive"
// //                                     currentValue={`${formatCurrency(monthlyETITotal)}/mo`}
// //                                     actionSteps={[
// //                                         <span key="1"><strong>Live Calculation:</strong> Evaluates every active learner's recorded stipend against official SARS scales.</span>,
// //                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500.</span>
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// //                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
// //                             <Wallet size={22} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
// //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
// //                             </div>
// //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// //                                 {formatCurrency(totalProjectedSpend)}
// //                             </div>
// //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
// //                             {activeInsight === 'spend' && (
// //                                 <InsightPopup
// //                                     title="Skills Target Spend"
// //                                     currentValue={formatCurrency(totalProjectedSpend)}
// //                                     actionSteps={[
// //                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
// //                                         <span key="2"><strong>To Optimize:</strong> Log accurate stipends to count toward B-BBEE payroll targets.</span>
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// //                             <Percent size={22} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span>
// //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// //                             </div>
// //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// //                                 {transformationPercentage}%
// //                             </div>
// //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
// //                             {activeInsight === 'transformation' && (
// //                                 <InsightPopup
// //                                     title="Transformation Demographic Metrics"
// //                                     currentValue={`${transformationPercentage}%`}
// //                                     actionSteps={[
// //                                         <span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>,
// //                                         <span key="2"><strong>To Optimize:</strong> Scale allocations using ACI candidate pools.</span>
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>

// //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// //                         <div style={{ background: '#ecfccb', padding: '10px', borderRadius: '50%', color: '#4d7c0f', height: 'fit-content' }}>
// //                             <User size={22} />
// //                         </div>
// //                         <div style={{ flex: 1 }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                 <span style={{ fontSize: '0.75rem', color: '#4d7c0f', fontWeight: 700, textTransform: 'uppercase' }}>Youth Employment</span>
// //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'youth' ? null : 'youth')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4d7c0f', display: 'flex' }}><Info size={14} /></button>
// //                             </div>
// //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// //                                 {youthPercentage}%
// //                             </div>
// //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Ratio of candidates under the age of 35.</span>
// //                             {activeInsight === 'youth' && (
// //                                 <InsightPopup
// //                                     title="Youth Employment Metrics"
// //                                     currentValue={`${youthPercentage}%`}
// //                                     actionSteps={[
// //                                         <span key="1"><strong>Demographic:</strong> Verified automatically against National ID numbers.</span>,
// //                                         <span key="2"><strong>Impact:</strong> Influences YES program reporting and quota verification.</span>
// //                                     ]}
// //                                     onClose={() => setActiveInsight(null)}
// //                                 />
// //                             )}
// //                         </div>
// //                     </div>
// //                 </div>
// //             </div>

// //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// //                     <Search size={15} color="var(--mlab-grey)" />
// //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// //                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// //                 </div>

// //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// //                     <Briefcase size={14} color="var(--mlab-grey)" />
// //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// //                         <option value="all">All Placement Types</option>
// //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// //                         <option value="Alumni Internship">Alumni Internships</option>
// //                         <option value="External WIL">External WIL</option>
// //                     </select>
// //                 </div>

// //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// //                     <Building2 size={14} color="var(--mlab-grey)" />
// //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// //                         <option value="all">All Host Companies</option>
// //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// //                     </select>
// //                 </div>

// //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
// //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// //                         <button
// //                             type="button"
// //                             onClick={() => setShowExportMenu(!showExportMenu)}
// //                             disabled={enrichedAndFilteredPlacements.length === 0}
// //                             className="cdp-btn cdp-btn--outline"
// //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '0', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// //                         >
// //                             <DownloadCloud size={14} /> Export Options
// //                         </button>

// //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// //                                 <button
// //                                     type="button"
// //                                     onClick={handleExportCSV}
// //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// //                                 >
// //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// //                                 </button>
// //                                 <button
// //                                     type="button"
// //                                     onClick={handleExportExcel}
// //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// //                                 >
// //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// //                                 </button>
// //                             </div>
// //                         )}
// //                     </div>

// //                     <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: '0' }} onClick={() => setIsCreateModalOpen(true)}>
// //                         <Plus size={14} /> New Placement
// //                     </button>
// //                 </div>
// //             </div>

// //             {/* ════════════════════════════════════════════════════════════════════
// //                PROGRAMME-BOUND ACCORDION LEDGER
// //             ════════════════════════════════════════════════════════════════════ */}
// //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// //                 <div className="vp-card" style={{ marginBottom: 0, background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)' }}>
// //                     <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem', background: '#f8fafc' }}>
// //                         <div className="vp-card-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                 <Briefcase size={18} color="var(--mlab-blue)" />
// //                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// //                                     Program-Bound Global Placement Ledger
// //                                 </h3>
// //                             </div>
// //                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: '0' }}>
// //                                 {groupedPlacementsByProgramme.length} Active Programme Track(s)
// //                             </span>
// //                         </div>
// //                     </div>

// //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', background: 'white' }}>
// //                         <button
// //                             type="button"
// //                             onClick={() => setActiveTab('active')}
// //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// //                         >
// //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{activeCount}</span>
// //                         </button>
// //                         <button
// //                             type="button"
// //                             onClick={() => setActiveTab('history')}
// //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// //                         >
// //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// //                         </button>
// //                         <button
// //                             type="button"
// //                             onClick={() => setActiveTab('all')}
// //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// //                         >
// //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
// //                         </button>
// //                     </div>

// //                     <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
// //                         {groupedPlacementsByProgramme.length > 0 ? (
// //                             groupedPlacementsByProgramme.map(group => {
// //                                 const isOpen = expandedGroups.has(group.key);
// //                                 const isCompliant = group.compliantCount === group.items.length;

// //                                 return (
// //                                     <div key={group.key} style={{ background: 'white', border: `1px solid ${group.isUnassigned ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
// //                                         {/* ACCORDION HEADER */}
// //                                         <div
// //                                             onClick={() => toggleGroupAccordion(group.key)}
// //                                             style={{
// //                                                 display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem',
// //                                                 background: group.isUnassigned ? '#fff1f2' : isOpen ? '#f1f5f9' : 'white',
// //                                                 cursor: 'pointer', borderBottom: isOpen ? '1px solid #cbd5e1' : 'none'
// //                                             }}
// //                                         >
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                                 <div style={{ background: group.isUnassigned ? '#fee2e2' : 'var(--mlab-midnight)', color: group.isUnassigned ? '#dc2626' : 'white', padding: '8px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                                                     {group.isUnassigned ? <AlertTriangle size={18} /> : <Layers size={18} />}
// //                                                 </div>
// //                                                 <div>
// //                                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: group.isUnassigned ? '#991b1b' : 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
// //                                                         {group.employerName} — <span style={{ color: 'var(--mlab-blue)' }}>{group.programmeTitle}</span>
// //                                                     </div>
// //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                         <span><Calendar size={12} style={{ display: 'inline', marginRight: '3px' }} /> {group.intakeLabel}</span>
// //                                                         <span>•</span>
// //                                                         <span style={{ color: 'var(--mlab-midnight)' }}>{group.items.length} Learner(s) Enrolled</span>
// //                                                     </div>
// //                                                 </div>
// //                                             </div>

// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// //                                                     <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: isCompliant ? '#dcfce7' : '#fef3c7', color: isCompliant ? '#166534' : '#b45309', border: `1px solid ${isCompliant ? '#86efac' : '#fde68a'}` }}>
// //                                                         {group.compliantCount}/{group.items.length} Audit Ready
// //                                                     </span>
// //                                                     {group.totalStipends > 0 && (
// //                                                         <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>
// //                                                             {formatCurrency(group.totalStipends)}/mo Payroll
// //                                                         </span>
// //                                                     )}
// //                                                 </div>
// //                                                 {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
// //                                             </div>
// //                                         </div>

// //                                         {/* ACCORDION BODY TABLE */}
// //                                         {isOpen && (
// //                                             <div className="mlab-table-wrap" style={{ borderTop: 'none' }}>
// //                                                 <table className="mlab-table" style={{ margin: 0 }}>
// //                                                     <thead style={{ background: 'whitesmoke', color: 'black' }}>
// //                                                         <tr>
// //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Learner Profile</th>
// //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Supervision & Mentor</th>
// //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Track & Stipend</th>
// //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Contract Timeline</th>
// //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>Compliance Readiness</th>
// //                                                             <th style={{ fontSize: '0.7rem', textAlign: 'right', color: 'var(--mlab-grey)' }}>Actions</th>
// //                                                         </tr>
// //                                                     </thead>
// //                                                     <tbody>
// //                                                         {group.items.map(p => {
// //                                                             const today = moment().startOf('day');
// //                                                             const thirtyDaysFromNow = moment().add(30, 'days').startOf('day');
// //                                                             const end = moment(p.endDate).startOf('day');

// //                                                             const isExpired = end.isBefore(today);
// //                                                             const isExpiringSoon = !isExpired && end.isBefore(thirtyDaysFromNow);

// //                                                             const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
// //                                                             const missingItems = [];
// //                                                             if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
// //                                                             if (!p.hasMentor) missingItems.push("Workplace Mentor");

// //                                                             return (
// //                                                                 <tr key={p.id} style={{ background: 'white' }}>
// //                                                                     <td>
// //                                                                         <div className="cdp-learner-cell">
// //                                                                             <div className="cdp-learner-avatar" style={{ borderRadius: '0' }}>{p.learnerName.charAt(0)}</div>
// //                                                                             <div className="cdp-learner-cell__info">
// //                                                                                 <span className="cdp-learner-cell__name">{p.learnerName}</span>
// //                                                                                 <span className="cdp-learner-cell__id">{p.idNumber}</span>
// //                                                                             </div>
// //                                                                         </div>
// //                                                                     </td>
// //                                                                     <td>
// //                                                                         <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#334155' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: p.hasMentor ? 600 : 700 }}>
// //                                                                             {p.hasMentor ? (
// //                                                                                 <><User size={12} /> {p.mentorName}</>
// //                                                                             ) : (
// //                                                                                 <><AlertTriangle size={12} /> No Mentor Assigned</>
// //                                                                             )}
// //                                                                         </div>
// //                                                                     </td>
// //                                                                     <td>
// //                                                                         <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// //                                                                             <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content', borderRadius: '0' }}>{p.placementType}</span>
// //                                                                             {p.stipendAmount && p.stipendAmount > 0 && (
// //                                                                                 <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0' }}>
// //                                                                                     <Coins size={10} /> R{p.stipendAmount}/mo
// //                                                                                 </span>
// //                                                                             )}
// //                                                                             {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// //                                                                                 <button
// //                                                                                     type="button"
// //                                                                                     onClick={() => setEtiBreakdownLearner(p)}
// //                                                                                     style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// //                                                                                     title="Click to view exact SARS mathematical breakdown"
// //                                                                                 >
// //                                                                                     <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// //                                                                                 </button>
// //                                                                             ) : (
// //                                                                                 <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}>
// //                                                                                     <AlertCircle size={10} /> Ineligible
// //                                                                                 </span>
// //                                                                             )}
// //                                                                         </div>
// //                                                                     </td>

// //                                                                     {/* 🚀 ACCURATE CONTRACT TIMELINE CELL */}
// //                                                                     <td>
// //                                                                         <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// //                                                                             {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
// //                                                                         </div>
// //                                                                         {isExpired && (
// //                                                                             <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 800, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
// //                                                                                 <AlertTriangle size={11} color="#dc2626" /> Contract Expired
// //                                                                             </div>
// //                                                                         )}
// //                                                                         {isExpiringSoon && (
// //                                                                             <div style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
// //                                                                                 <Clock size={11} color="#d97706" /> Ends &lt; 30 Days
// //                                                                             </div>
// //                                                                         )}
// //                                                                     </td>

// //                                                                     {/* 🚀 ACCURATE COMPLIANCE READINESS CELL */}
// //                                                                     <td>
// //                                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
// //                                                                             <span
// //                                                                                 className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' : ''}`}
// //                                                                                 style={{ borderRadius: '0' }}
// //                                                                             >
// //                                                                                 {p.status.replace('_', ' ')}
// //                                                                             </span>

// //                                                                             {isAuditReady ? (
// //                                                                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', width: 'fit-content' }}>
// //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
// //                                                                                         <ShieldCheck size={12} /> Audit Ready
// //                                                                                     </div>
// //                                                                                 </div>
// //                                                                             ) : isExpired ? (
// //                                                                                 <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
// //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px' }}>
// //                                                                                         <ShieldAlert size={12} color="#dc2626" /> Critical: Overdue & Incomplete
// //                                                                                     </div>
// //                                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// //                                                                                         {missingItems.map(m => (
// //                                                                                             <span key={m} style={{ fontSize: '0.6rem', color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
// //                                                                                                 <X size={8} /> {m}
// //                                                                                             </span>
// //                                                                                         ))}
// //                                                                                     </div>
// //                                                                                 </div>
// //                                                                             ) : (
// //                                                                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
// //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>
// //                                                                                         <AlertTriangle size={12} /> Missing Data
// //                                                                                     </div>
// //                                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// //                                                                                         {missingItems.map(m => (
// //                                                                                             <span key={m} style={{ fontSize: '0.6rem', color: '#991b1b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
// //                                                                                                 <X size={8} /> {m}
// //                                                                                             </span>
// //                                                                                         ))}
// //                                                                                     </div>
// //                                                                                 </div>
// //                                                                             )}
// //                                                                         </div>
// //                                                                     </td>
// //                                                                     <td style={{ textAlign: 'right' }}>
// //                                                                         <div className="cdp-actions" style={{ justifyContent: 'flex-end' }}>
// //                                                                             <button
// //                                                                                 type="button"
// //                                                                                 onClick={() => setEditingPlacement(p)}
// //                                                                                 style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// //                                                                                 title="Edit Placement Details"
// //                                                                             >
// //                                                                                 <Edit size={14} />
// //                                                                             </button>
// //                                                                             <button
// //                                                                                 type="button"
// //                                                                                 onClick={() => setOptionsPlacement(p)}
// //                                                                                 style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// //                                                                                 title="Placement Options"
// //                                                                             >
// //                                                                                 <MoreVertical size={14} />
// //                                                                             </button>
// //                                                                         </div>
// //                                                                     </td>
// //                                                                 </tr>
// //                                                             );
// //                                                         })}
// //                                                     </tbody>
// //                                                 </table>
// //                                             </div>
// //                                         )}
// //                                     </div>
// //                                 );
// //                             })
// //                         ) : (
// //                             <div style={{ padding: '4rem', textAlign: 'center', background: 'white', border: '1px solid #cbd5e1' }}>
// //                                 <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// //                                 <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// //                                 <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// //                                     {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// //                                         ? "Try adjusting your filters or search query."
// //                                         : "You haven't assigned any learners to host companies yet."}
// //                                 </p>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };


// // // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import { useSearchParams } from 'react-router-dom';
// // // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // // import { db, storage } from '../../../lib/firebase';
// // // import {
// // //     Briefcase, Search, Plus, Filter, AlertTriangle,
// // //     CheckCircle, Clock, Building2, User, FileText,
// // //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// // //     ShieldAlert, Save, Loader2, Award, Trash2,
// // //     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
// // //     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
// // //     Calculator, Accessibility, Layers, Users, ChevronDown, ChevronUp,
// // //     Calendar
// // // } from 'lucide-react';
// // // import moment from 'moment';
// // // import * as XLSX from 'xlsx';
// // // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../types';
// // // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // // import Loader from '../../common/Loader/Loader';

// // // import '../WorkplacesManager/WorkplacesManager.css';
// // // import type { EnrichedPlacement } from '../WorkplacesManager/CompanyInsightsView/CompanyInsightsView';

// // // /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */

// // // export interface UploadedEvidence {
// // //     url: string;
// // //     uploadedAt: string;
// // //     fileName: string;
// // //     uploadedByUid?: string;
// // //     uploadedByName?: string;
// // //     isLinked?: boolean;
// // //     linkedAt?: string;
// // //     history?: UploadedEvidence[];
// // // }

// // // /* ─── ETI BREAKDOWN MODAL ────────────────────────────────────────────────── */
// // // const EtiBreakdownModal: React.FC<{
// // //     learner: EnrichedPlacement;
// // //     onClose: () => void;
// // // }> = ({ learner, onClose }) => {
// // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // //     const wage = Number(learner.stipendAmount) || 0;
// // //     const eti = learner.etiMonthlyValue;
// // //     const annualEti = eti * 12;

// // //     let mathString = "";
// // //     if (wage < 2500) {
// // //         mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
// // //     } else if (wage >= 2500 && wage <= 5499) {
// // //         mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // //     } else if (wage >= 5500 && wage < 7500) {
// // //         mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
// // //     } else {
// // //         mathString = `Stipend exceeds R7,500 upper limit. ETI Claim = R0`;
// // //     }

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '0', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// // //                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// // //                     <div>
// // //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// // //                             <Landmark size={20} /> SARS ETI Tax Rebate Audit
// // //                         </div>
// // //                         <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {learner.learnerName}</div>
// // //                     </div>
// // //                     <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// // //                 </div>

// // //                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0', padding: '1rem', marginBottom: '1rem' }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// // //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// // //                     </div>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// // //                         <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// // //                     </div>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
// // //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// // //                 <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '0', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// // //                     {mathString}
// // //                 </div>

// // //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
// // //                 <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                     <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
// // //                         If stipend is R0 – R2,499: ETI = 60% of stipend
// // //                     </li>
// // //                     <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
// // //                         If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
// // //                     </li>
// // //                     <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
// // //                         If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
// // //                     </li>
// // //                     <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
// // //                         If stipend is R7,500 or more: ETI = R0
// // //                     </li>
// // //                 </ul>

// // //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center', borderRadius: '0' }}>
// // //                     Close Audit Trail
// // //                 </button>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // // interface MentorModalProps {
// // //     employerId: string;
// // //     onClose: () => void;
// // //     onSaved: () => void;
// // //     addStaff: (m: StaffMember) => Promise<void>;
// // // }
// // // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// // //     const toast = useToast();
// // //     const [saving, setSaving] = useState(false);
// // //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// // //     const handleSubmit = async (e: React.FormEvent) => {
// // //         e.preventDefault();
// // //         setSaving(true);
// // //         try {
// // //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // //             toast.success('Mentor created successfully!');
// // //             onSaved();
// // //             onClose();
// // //         } catch (err) {
// // //             console.error('Mentor save error:', err);
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
// // //                 <div className="wm-modal__header wm-modal__header--green">
// // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // //                 </div>

// // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // //                     <div className="wm-modal__body">
// // //                         <div className="wm-form-grid">
// // //                             <div className="wm-form-group wm-form-group--full">
// // //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// // //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="text" placeholder="e.g. John Smith"
// // //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// // //                             </div>
// // //                             <div className="wm-form-group wm-form-group--full">
// // //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} required type="email" placeholder="john@company.com"
// // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// // //                             </div>
// // //                             <div className="wm-form-group wm-form-group--full">
// // //                                 <label className="wm-form-label">Phone Number</label>
// // //                                 <input className="wm-form-input" style={{ borderRadius: '0' }} type="tel" placeholder="082 123 4567"
// // //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                     <div className="wm-modal__footer">
// // //                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
// // //                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving}>
// // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// // //                         </button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // // ─── FALLBACK COMPLIANCE SCHEMAS ───
// // // const GENERIC_3_PHASE_SCHEMA: ComplianceSchema = {
// // //     schemaId: 'generic_3_phase',
// // //     schemaName: 'Standard 3-Phase Presets',
// // //     tranches: [
// // //         { trancheId: 'phase_1', title: 'Phase 1: Onboarding', percentage: 33, dueAtMonth: 1, requirements: [{ id: 'req_1', label: 'Employment Contract', type: 'document', required: true, systemTag: 'employmentContractUrl' }] },
// // //         { trancheId: 'phase_2', title: 'Phase 2: Mid-Point Review', percentage: 33, dueAtMonth: 6, requirements: [{ id: 'req_2', label: 'Mid-Term Site Visit', type: 'site_visit', required: true }] },
// // //         { trancheId: 'phase_3', title: 'Phase 3: Offboarding', percentage: 34, dueAtMonth: 12, requirements: [{ id: 'req_3', label: 'Final Completion Letter', type: 'document', required: true }] }
// // //     ]
// // // };

// // // const MONTHLY_PAYROLL_SCHEMA: ComplianceSchema = {
// // //     schemaId: 'monthly_payroll_only',
// // //     schemaName: 'Pure Monthly Compliance',
// // //     tranches: [
// // //         { trancheId: 'onboarding', title: 'Initial HR Onboarding', percentage: 0, dueAtMonth: 0, requirements: [{ id: 'req_1', label: 'Signed SLA/Contract', type: 'document', required: true }] }
// // //     ]
// // // };

// // // interface SelectedLearner {
// // //     learner: DashboardLearner;
// // //     mentorId: string;
// // // }

// // // export const GlobalCreatePlacementModal: React.FC<{
// // //     employers: Employer[],
// // //     mentors: StaffMember[],
// // //     learners: DashboardLearner[],
// // //     placements: PlacementContract[],
// // //     cohorts: any[],
// // //     programmes: any[],
// // //     onClose: () => void,
// // //     onCreate: (data: any) => Promise<void>,
// // //     onAddNewMentor: (employerId: string) => void
// // // }> = ({ employers, mentors, learners, placements, cohorts, programmes, onClose, onCreate, onAddNewMentor }) => {
// // //     const toast = useToast();
// // //     const { fetchEmployers } = useStore() as any;
// // //     const [saving, setSaving] = useState(false);

// // //     const [isEditingCap, setIsEditingCap] = useState(false);
// // //     const [tempCap, setTempCap] = useState(1);

// // //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// // //     const [selectedCohortId, setSelectedCohortId] = useState('');
// // //     const [learnerSearch, setLearnerSearch] = useState('');

// // //     const [selectedLearners, setSelectedLearners] = useState<SelectedLearner[]>([]);

// // //     const [fallbackSchemaId, setFallbackSchemaId] = useState('generic_3_phase');
// // //     const [customPlacementType, setCustomPlacementType] = useState('');
// // //     const [linkToExistingCohort, setLinkToExistingCohort] = useState(false);

// // //     const [form, setForm] = useState({
// // //         placementType: 'SETA Funded (Programme Linked)',
// // //         startDate: '',
// // //         endDate: '',
// // //         fundingSource: 'Corporate Funded',
// // //         bbbeeSpendCategory: 'N/A',
// // //         stipendAmount: ''
// // //     });

// // //     const isRegulatedTrack = form.placementType === 'QCTO Workplace Module' || form.placementType === 'SETA Funded (Programme Linked)';

// // //     const availableMentors = useMemo(() => {
// // //         if (!selectedEmployerId) return [];
// // //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// // //     }, [selectedEmployerId, mentors]);

// // //     const filteredLearners = useMemo(() => {
// // //         if (!learnerSearch) return [];
// // //         return learners.filter(l => {
// // //             const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
// // //             const notSelected = !selectedLearners.find(sl => sl.learner.id === l.id);
// // //             return matchesSearch && notSelected;
// // //         }).slice(0, 5);
// // //     }, [learnerSearch, learners, selectedLearners]);

// // //     const handleRemoveLearner = (id: string) => {
// // //         setSelectedLearners(prev => prev.filter(sl => sl.learner.id !== id));
// // //     };

// // //     const handleLearnerMentorChange = (learnerId: string, mentorId: string) => {
// // //         setSelectedLearners(prev => prev.map(sl => sl.learner.id === learnerId ? { ...sl, mentorId } : sl));
// // //     };

// // //     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
// // //     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));

// // //     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
// // //     const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

// // //     useEffect(() => {
// // //         if (selectedEmployer) {
// // //             setTempCap((selectedEmployer as any).internCapacity || 1);
// // //             setIsEditingCap(false);
// // //         }
// // //     }, [selectedEmployer]);

// // //     const handleSaveCapacity = async (e: React.MouseEvent) => {
// // //         e.stopPropagation();
// // //         if (!selectedEmployerId) return;
// // //         try {
// // //             await updateDoc(doc(db, 'employers', selectedEmployerId), {
// // //                 internCapacity: Number(tempCap)
// // //             });
// // //             await fetchEmployers(true);
// // //             setIsEditingCap(false);
// // //             toast.success("Host Company capacity updated!");
// // //         } catch (err) {
// // //             toast.error("Failed to update capacity.");
// // //         }
// // //     };

// // //     const handleSubmit = async (e: React.FormEvent) => {
// // //         e.preventDefault();
// // //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// // //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");
// // //         if (form.placementType === 'Other' && !customPlacementType.trim()) return toast.error("Please specify the custom placement type.");

// // //         if (isRegulatedTrack && linkToExistingCohort) {
// // //             const missingCohorts = selectedLearners.filter(sl => !sl.learner.cohortId);
// // //             if (missingCohorts.length > 0) {
// // //                 return toast.error(`Cannot auto-bind: ${missingCohorts.map(sl => sl.learner.fullName).join(', ')} do not have an active classroom cohort. Please uncheck the box and select a programme manually.`);
// // //             }
// // //         } else if (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId) {
// // //             return toast.error("Please select a target Programme/Cohort from the dropdown.");
// // //         }

// // //         if (isOverCapacity) {
// // //             if (!window.confirm(`WARNING: You are exceeding the stated capacity for ${selectedEmployer?.name}. Are you sure you want to force this placement?`)) return;
// // //         }

// // //         setSaving(true);
// // //         try {
// // //             const finalPlacementType = form.placementType === 'Other' ? customPlacementType.trim() : form.placementType;

// // //             await Promise.all(selectedLearners.map(sl => {
// // //                 let schemaToApply: ComplianceSchema | null = null;

// // //                 const targetCohortId = isRegulatedTrack
// // //                     ? (linkToExistingCohort ? sl.learner.cohortId : selectedCohortId)
// // //                     : '';

// // //                 if (isRegulatedTrack && targetCohortId) {
// // //                     const matchedCohort = cohorts.find(c => c.id === targetCohortId);
// // //                     if (matchedCohort) {
// // //                         if (matchedCohort.complianceSchema) {
// // //                             schemaToApply = matchedCohort.complianceSchema;
// // //                         }
// // //                         else if (matchedCohort.programmeId || matchedCohort.qualificationId) {
// // //                             const templateId = matchedCohort.programmeId || matchedCohort.qualificationId;
// // //                             const matchedProg = programmes.find(p => p.id === templateId);
// // //                             if (matchedProg && matchedProg.complianceSchema) {
// // //                                 schemaToApply = matchedProg.complianceSchema;
// // //                             }
// // //                         }
// // //                     }
// // //                 } else if (!isRegulatedTrack) {
// // //                     if (fallbackSchemaId === 'generic_3_phase') {
// // //                         schemaToApply = GENERIC_3_PHASE_SCHEMA;
// // //                     } else if (fallbackSchemaId === 'monthly_payroll_only') {
// // //                         schemaToApply = MONTHLY_PAYROLL_SCHEMA;
// // //                     } else {
// // //                         const matchedCustomTemplate = programmes.find(p => p.id === fallbackSchemaId);
// // //                         if (matchedCustomTemplate && matchedCustomTemplate.complianceSchema) {
// // //                             schemaToApply = matchedCustomTemplate.complianceSchema;
// // //                         }
// // //                     }
// // //                 }

// // //                 return onCreate({
// // //                     learnerId: sl.learner.id,
// // //                     employerId: selectedEmployerId,
// // //                     cohortId: targetCohortId,
// // //                     mentorId: sl.mentorId,
// // //                     ...form,
// // //                     placementType: finalPlacementType,
// // //                     stipendAmount: Number(form.stipendAmount) || 0,
// // //                     status: 'Active Placement',
// // //                     complianceSchema: schemaToApply,
// // //                     evidenceMap: {}
// // //                 });
// // //             }));

// // //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// // //             onClose();
// // //         } catch (err: any) {
// // //             toast.error(err.message || "Failed to create placements.");
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', borderRadius: '0' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1', borderRadius: '0' }}><Network size={20} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// // //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // //                 </div>

// // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // //                     <div className="wm-modal__body">

// // //                         <div className="wm-form-section">
// // //                             <div className="wm-form-section__label"><Building2 size={12} /> 1. Setup Placement Ecosystem</div>
// // //                             <div className="wm-form-grid">
// // //                                 <div className="wm-form-group">
// // //                                     <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} required value={selectedEmployerId} onChange={e => setSelectedEmployerId(e.target.value)}>
// // //                                         <option value="">-- Choose Host Company --</option>
// // //                                         {employers.filter(emp => emp.status !== 'archived').map(emp => (
// // //                                             <option key={emp.id} value={emp.id}>{emp.name}</option>
// // //                                         ))}
// // //                                     </select>
// // //                                 </div>
// // //                                 <div className="wm-form-group">
// // //                                     <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.placementType} onChange={e => {
// // //                                         const val = e.target.value;
// // //                                         setForm(p => ({ ...p, placementType: val }));
// // //                                         setSelectedCohortId('');
// // //                                     }}>
// // //                                         <option value="SETA Funded (Programme Linked)">SETA Funded (Linked to Training)</option>
// // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
// // //                                         <option value="Independent SETA Internship">SETA Funded (Independent / Uni Grads)</option>
// // //                                         <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
// // //                                         <option value="External WIL">External WIL (Unregulated)</option>
// // //                                         <option value="Other">Other (Custom)</option>
// // //                                     </select>
// // //                                 </div>

// // //                                 {form.placementType === 'Other' && (
// // //                                     <div className="wm-form-group wm-form-group--full animate-fade-in" style={{ marginTop: '-4px', background: '#f8fafc', padding: '10px', borderRadius: '0', border: '1px dashed #cbd5e1' }}>
// // //                                         <label className="wm-form-label">Specify Custom Placement Type <span className="wm-form-required">*</span></label>
// // //                                         <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} required value={customPlacementType} onChange={e => setCustomPlacementType(e.target.value)} placeholder="e.g. Corporate CSI Initiative" />
// // //                                     </div>
// // //                                 )}

// // //                                 {selectedEmployer && (
// // //                                     <div className="wm-form-group wm-form-group--full" style={{ marginTop: '-0.5rem' }}>
// // //                                         <div style={{ padding: '0.5rem', borderRadius: '0', background: isOverCapacity ? '#fff1f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isOverCapacity ? '#991b1b' : '#15803d', fontWeight: 600 }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                                 {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
// // //                                                 Placement Capacity: {currentEmployerPlacements.length + selectedLearners.length} /
// // //                                                 {isEditingCap ? (
// // //                                                     <input
// // //                                                         type="number"
// // //                                                         min="1"
// // //                                                         value={tempCap}
// // //                                                         onChange={(e) => setTempCap(Number(e.target.value))}
// // //                                                         style={{ width: '60px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '0', outline: 'none', marginLeft: '4px' }}
// // //                                                         autoFocus
// // //                                                     />
// // //                                                 ) : (
// // //                                                     <span>{internCapacity}</span>
// // //                                                 )}
// // //                                                 allocations utilized.
// // //                                             </div>

// // //                                             {isEditingCap ? (
// // //                                                 <div style={{ display: 'flex', gap: '4px' }}>
// // //                                                     <button type="button" onClick={() => setIsEditingCap(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
// // //                                                     <button type="button" onClick={handleSaveCapacity} style={{ background: 'var(--mlab-green)', border: 'none', color: 'white', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                         <Save size={10} /> Save
// // //                                                     </button>
// // //                                                 </div>
// // //                                             ) : (
// // //                                                 <button type="button" onClick={() => setIsEditingCap(true)} style={{ background: 'none', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, color: isOverCapacity ? '#991b1b' : '#15803d', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
// // //                                                     <Edit size={10} /> Update Cap
// // //                                                 </button>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>

// // //                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// // //                             <div className="wm-form-section__label"><Users size={12} /> 2. Select Learners & Assign Mentors</div>

// // //                             <div style={{ position: 'relative', marginBottom: selectedLearners.length > 0 ? '16px' : '0' }}>
// // //                                 <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} placeholder="Search by name or ID to add a learner..." value={learnerSearch} onChange={e => setLearnerSearch(e.target.value)} />
// // //                                 {learnerSearch && (
// // //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// // //                                             <div key={l.id} onClick={() => { setSelectedLearners(prev => [...prev, { learner: l, mentorId: '' }]); setLearnerSearch(''); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                                 <div>
// // //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// // //                                                 </div>
// // //                                             </div>
// // //                                         )) : (
// // //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
// // //                                         )}
// // //                                     </div>
// // //                                 )}
// // //                             </div>

// // //                             {selectedLearners.length > 0 && (
// // //                                 <div className="animate-fade-in" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden' }}>
// // //                                     <div style={{ background: '#f1f5f9', padding: '8px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
// // //                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>LEARNER PROFILE</div>
// // //                                         <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                             ASSIGNED MENTOR
// // //                                             {selectedEmployerId && (
// // //                                                 <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
// // //                                                     <Plus size={10} /> Quick Add
// // //                                                 </button>
// // //                                             )}
// // //                                         </div>
// // //                                         <div style={{ width: '30px' }}></div>
// // //                                     </div>
// // //                                     <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
// // //                                         {selectedLearners.map((sl, i) => (
// // //                                             <div key={sl.learner.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: i === selectedLearners.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
// // //                                                 <div style={{ flex: 1 }}>
// // //                                                     <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{sl.learner.fullName}</div>
// // //                                                     <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sl.learner.idNumber}</div>
// // //                                                 </div>
// // //                                                 <div style={{ flex: 1, paddingRight: '12px' }}>
// // //                                                     <select
// // //                                                         className="wm-form-input"
// // //                                                         style={{ padding: '6px 8px', borderRadius: '0', fontSize: '0.75rem', height: 'auto', background: sl.mentorId ? 'white' : '#fff7ed', borderColor: sl.mentorId ? '#cbd5e1' : '#fed7aa' }}
// // //                                                         value={sl.mentorId}
// // //                                                         onChange={e => handleLearnerMentorChange(sl.learner.id, e.target.value)}
// // //                                                     >
// // //                                                         <option value="">-- Flag as Missing --</option>
// // //                                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
// // //                                                     </select>
// // //                                                 </div>
// // //                                                 <div style={{ width: '30px', textAlign: 'right' }}>
// // //                                                     <button type="button" onClick={() => handleRemoveLearner(sl.learner.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={16} /></button>
// // //                                                 </div>
// // //                                             </div>
// // //                                         ))}
// // //                                     </div>
// // //                                 </div>
// // //                             )}
// // //                         </div>

// // //                         {isRegulatedTrack ? (
// // //                             selectedLearners.length > 0 && (
// // //                                 <div className="wm-form-section animate-fade-in">
// // //                                     <div className="wm-form-section__label" style={{ marginBottom: '10px' }}><Layers size={12} /> 3. Regulated Program Verification</div>

// // //                                     <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '0', marginBottom: '12px' }}>
// // //                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.8rem' }}>
// // //                                             <input
// // //                                                 type="checkbox"
// // //                                                 checked={linkToExistingCohort}
// // //                                                 onChange={e => setLinkToExistingCohort(e.target.checked)}
// // //                                                 style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
// // //                                             />
// // //                                             Auto-bind placement to the learner's currently enrolled class/cohort
// // //                                         </label>
// // //                                         <p style={{ margin: '4px 0 0 24px', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>
// // //                                             Check this if the learner is doing workplace practicals for their existing class. Uncheck to place them into a completely new Programme/Cohort.
// // //                                         </p>

// // //                                         {linkToExistingCohort && (
// // //                                             <div style={{ marginTop: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '8px' }}>
// // //                                                 <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-midnight)', marginBottom: '8px', textTransform: 'uppercase' }}>Auto-Resolved Cohort Mapping:</div>
// // //                                                 {selectedLearners.length === 0 ? (
// // //                                                     <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>Select learners above to see their mappings.</div>
// // //                                                 ) : (
// // //                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // //                                                         {selectedLearners.map(sl => {
// // //                                                             const linkedCohort = cohorts.find(c => c.id === sl.learner.cohortId);
// // //                                                             return (
// // //                                                                 <div key={sl.learner.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', padding: '4px', background: '#f8fafc', borderRadius: '0' }}>
// // //                                                                     <span style={{ color: '#475569', fontWeight: 600 }}>{sl.learner.fullName}</span>
// // //                                                                     {linkedCohort ? (
// // //                                                                         <span style={{ color: 'var(--mlab-blue)', fontWeight: 700 }}>{linkedCohort.name}</span>
// // //                                                                     ) : (
// // //                                                                         <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Unassigned Error</span>
// // //                                                                     )}
// // //                                                                 </div>
// // //                                                             );
// // //                                                         })}
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>
// // //                                         )}
// // //                                     </div>

// // //                                     {!linkToExistingCohort && (
// // //                                         <select className="wm-form-input animate-fade-in" required={isRegulatedTrack && !linkToExistingCohort} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)} style={{ borderRadius: '0', borderLeft: '4px solid var(--mlab-amber)' }}>
// // //                                             <option value="">-- Assign Target Qualification / Programme Record --</option>
// // //                                             {cohorts.map(c => (
// // //                                                 <option key={c.id} value={c.id}>{c.name}</option>
// // //                                             ))}
// // //                                         </select>
// // //                                     )}

// // //                                     <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
// // //                                         * Note: Placements will automatically inherit the Tranche & Funding Blueprint attached to the selected programme.
// // //                                     </div>
// // //                                 </div>
// // //                             )
// // //                         ) : (
// // //                             <div className="wm-form-section animate-fade-in" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px' }}>
// // //                                 <div className="wm-form-section__label" style={{ marginBottom: '8px' }}><Wallet size={12} /> 3. Independent Compliance Mode</div>
// // //                                 <select className="wm-form-input" value={fallbackSchemaId} onChange={e => setFallbackSchemaId(e.target.value)} style={{ borderRadius: 0 }}>
// // //                                     <optgroup label="System Defaults">
// // //                                         <option value="generic_3_phase">Standard 3-Phase Lifecycle (Onboard, Mid-Point, Offboard)</option>
// // //                                         <option value="monthly_payroll_only">Unstructured (Monthly Payroll & HR Only)</option>
// // //                                     </optgroup>
// // //                                     {programmes && programmes.length > 0 && (
// // //                                         <optgroup label="Custom Qualification Templates">
// // //                                             {programmes.map((prog: any) => (
// // //                                                 <option key={prog.id} value={prog.id}>{prog.name || 'Custom Blueprint'}</option>
// // //                                             ))}
// // //                                         </optgroup>
// // //                                     )}
// // //                                 </select>
// // //                             </div>
// // //                         )}

// // //                         <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId) ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId) ? 'auto' : 'none' }}>
// // //                             <div className="wm-form-section__label"><Briefcase size={12} /> {isRegulatedTrack ? '4' : '3'}. Global Placement Settings</div>
// // //                             <div className="wm-form-grid">

// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// // //                                         <option value="N/A">Not Applicable (Non-B-BBEE / Unregulated)</option>
// // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // //                                     </select>
// // //                                 </div>

// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // //                                     <div style={{ position: 'relative' }}>
// // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // //                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px', borderRadius: '0' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} />
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
// // //                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
// // //                             </div>
// // //                         </div>

// // //                     </div>
// // //                     <div className="wm-modal__footer">
// // //                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
// // //                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId)}>
// // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// // //                         </button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };


// // // /* ─── EDIT PLACEMENT MODAL ───────────────────────────────────────────────────── */
// // // const EditPlacementModal: React.FC<{
// // //     placement: any;
// // //     mentors: StaffMember[];
// // //     cohorts: any[];
// // //     learners: DashboardLearner[];
// // //     onClose: () => void;
// // //     onSaved: () => void;
// // // }> = ({ placement, mentors, cohorts, learners, onClose, onSaved }) => {
// // //     const toast = useToast();
// // //     const [saving, setSaving] = useState(false);
// // //     const [uploadingDoc, setUploadingDoc] = useState(false);
// // //     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

// // //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// // //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// // //     const [form, setForm] = useState({
// // //         mentorId: placement.mentorId || '',
// // //         cohortId: placement.cohortId || '',
// // //         placementType: placement.placementType || 'QCTO Workplace Module',
// // //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// // //         stipendAmount: placement.stipendAmount || '',
// // //         startDate: placement.startDate || '',
// // //         endDate: placement.endDate || '',
// // //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// // //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// // //     });

// // //     const isQcto = form.placementType === 'QCTO Workplace Module';
// // //     const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');
// // //     const targetLearner = learners.find(l => l.id === placement.learnerId);

// // //     const displayedCohorts = useMemo(() => {
// // //         if (forceShowAllProgrammes) return cohorts;
// // //         const relevantIds = new Set<string>();
// // //         if (targetLearner?.cohortId) relevantIds.add(targetLearner.cohortId);
// // //         if (placement.cohortId) relevantIds.add(placement.cohortId);
// // //         if (relevantIds.size === 0) return cohorts;
// // //         const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
// // //         if (matchingTracks.length === 0) return cohorts;
// // //         return matchingTracks;
// // //     }, [cohorts, targetLearner, placement.cohortId, forceShowAllProgrammes]);

// // //     const handleSubmit = async (e: React.FormEvent) => {
// // //         e.preventDefault();
// // //         setSaving(true);
// // //         try {
// // //             let finalDocumentUrl = form.wblpaAgreementUrl;

// // //             if (uploadMode === 'upload' && selectedFile) {
// // //                 setUploadingDoc(true);
// // //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // //                 await uploadBytes(fileRef, selectedFile);
// // //                 finalDocumentUrl = await getDownloadURL(fileRef);
// // //                 setUploadingDoc(false);
// // //             }

// // //             const batch = writeBatch(db);
// // //             const placementRef = doc(db, 'placements', placement.id);
// // //             const learnerRef = doc(db, 'learners', placement.learnerId);

// // //             batch.update(placementRef, {
// // //                 mentorId: form.mentorId,
// // //                 cohortId: isQcto ? form.cohortId : '',
// // //                 placementType: form.placementType,
// // //                 stipendAmount: Number(form.stipendAmount) || 0,
// // //                 startDate: form.startDate,
// // //                 endDate: form.endDate,
// // //                 compliance: {
// // //                     ...(placement.compliance || {}),
// // //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// // //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// // //                     wblpaAgreementUrl: finalDocumentUrl
// // //                 },
// // //                 updatedAt: new Date().toISOString()
// // //             });

// // //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });
// // //             await batch.commit();

// // //             toast.success("Placement details updated successfully!");
// // //             setTimeout(() => {
// // //                 onSaved();
// // //                 onClose();
// // //             }, 1200);

// // //         } catch (err: any) {
// // //             toast.error(err.message || "Failed to update placement details.");
// // //             setUploadingDoc(false);
// // //             setSaving(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px', borderRadius: '0' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9', borderRadius: '0' }}><Edit size={20} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// // //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // //                 </div>

// // //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// // //                     <div className="wm-modal__body">
// // //                         <div className="wm-form-section">
// // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// // //                             <div className="wm-form-grid">
// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <label className="wm-form-label">Placement Type</label>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.placementType} onChange={e => {
// // //                                         setForm(p => ({ ...p, placementType: e.target.value }));
// // //                                         if (e.target.value !== 'QCTO Workplace Module') {
// // //                                             setForm(p => ({ ...p, cohortId: '' }));
// // //                                         }
// // //                                     }} disabled={saving}>
// // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // //                                         <option value="External WIL">External WIL</option>
// // //                                     </select>
// // //                                 </div>

// // //                                 {isQcto && (
// // //                                     <div className="wm-form-group wm-form-group--full animate-fade-in">
// // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                             <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
// // //                                             <button type="button" onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
// // //                                                 {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
// // //                                             </button>
// // //                                         </div>
// // //                                         <select className="wm-form-input" style={{ borderRadius: '0' }} required={isQcto} value={form.cohortId} onChange={e => setForm(p => ({ ...p, cohortId: e.target.value }))} disabled={saving}>
// // //                                             <option value="">-- Needs Programme Mapping --</option>
// // //                                             {displayedCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// // //                                         </select>
// // //                                     </div>
// // //                                 )}

// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // //                                     </div>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// // //                                         <option value="">-- No Mentor Assigned --</option>
// // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // //                                     </select>
// // //                                 </div>

// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // //                                     <div style={{ position: 'relative' }}>
// // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // //                                         <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px', borderRadius: '0' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} disabled={saving} />
// // //                                     </div>
// // //                                 </div>

// // //                                 <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} /></div>
// // //                                 <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} /></div>
// // //                             </div>
// // //                         </div>

// // //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// // //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// // //                             <div className="wm-form-grid">
// // //                                 <div className="wm-form-group wm-form-group--full">
// // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // //                                     <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // //                                     </select>
// // //                                 </div>

// // //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '0', border: '1px solid #e2e8f0' }}>
// // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// // //                                         <input type="checkbox" checked={form.isAgreementFullyExecuted} onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }} disabled={saving} />
// // //                                         WBLPA Signed & On File
// // //                                     </label>
// // //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden', marginTop: '12px' }}>
// // //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// // //                                             <button type="button" onClick={() => setUploadMode('link')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><LinkIcon size={12} /> Paste Link</button>
// // //                                             <button type="button" onClick={() => setUploadMode('upload')} style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }} disabled={saving}><UploadCloud size={12} /> Upload File</button>
// // //                                         </div>

// // //                                         <div style={{ padding: '12px' }}>
// // //                                             {uploadMode === 'link' ? (
// // //                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label><input className="wm-form-input" style={{ borderRadius: '0' }} type="url" placeholder="https://drive.google.com/file/d/..." value={form.wblpaAgreementUrl} onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))} disabled={saving} /></>
// // //                                             ) : (
// // //                                                 <><label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label><input className="wm-form-input" style={{ borderRadius: 0, padding: '6px' }} type="file" accept=".pdf,image/*,.doc,.docx" onChange={e => { if (e.target.files && e.target.files.length > 0) setSelectedFile(e.target.files[0]); }} disabled={saving} /></>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                     </div>
// // //                     <div className="wm-modal__footer">
// // //                         <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
// // //                         <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving}>
// // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</> : <><Save size={13} /> Save Changes</>}
// // //                         </button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// // // const PlacementOptionsModal: React.FC<{
// // //     placement: any;
// // //     onClose: () => void;
// // //     onSaved: () => void;
// // // }> = ({ placement, onClose, onSaved }) => {
// // //     const toast = useToast();
// // //     const [processing, setProcessing] = useState(false);

// // //     const handleChangeStatus = async (newStatus: string) => {
// // //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// // //         setProcessing(true);
// // //         try {
// // //             await updateDoc(doc(db, 'placements', placement.id), {
// // //                 status: newStatus,
// // //                 updatedAt: new Date().toISOString()
// // //             });
// // //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// // //             onSaved();
// // //             onClose();
// // //         } catch (err: any) {
// // //             toast.error(err.message || "Failed to update status.");
// // //         } finally {
// // //             setProcessing(false);
// // //         }
// // //     };

// // //     const handleDeleteRecord = async () => {
// // //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// // //         setProcessing(true);
// // //         try {
// // //             await deleteDoc(doc(db, 'placements', placement.id));
// // //             toast.success("Placement record permanently deleted.");
// // //             onSaved();
// // //             onClose();
// // //         } catch (err: any) {
// // //             toast.error(err.message || "Failed to delete record.");
// // //         } finally {
// // //             setProcessing(false);
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0' }}>
// // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706', borderRadius: '0' }}><MoreVertical size={20} /></div>
// // //                     <div>
// // //                         <h2 className="wm-modal__title">Placement Options</h2>
// // //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// // //                     </div>
// // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// // //                 </div>

// // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                     <button
// // //                         type="button"
// // //                         disabled={processing || placement.status === 'Completed'}
// // //                         onClick={() => handleChangeStatus('Completed')}
// // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // //                     >
// // //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// // //                     </button>
// // //                     <button
// // //                         type="button"
// // //                         disabled={processing || placement.status === 'Pending Match'}
// // //                         onClick={() => handleChangeStatus('Pending Match')}
// // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // //                     >
// // //                         <Clock size={16} color="#d97706" /> Revert to Pending Match
// // //                     </button>
// // //                     <button
// // //                         type="button"
// // //                         disabled={processing || placement.status === 'Terminated'}
// // //                         onClick={() => handleChangeStatus('Terminated')}
// // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}
// // //                     >
// // //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// // //                     </button>
// // //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
// // //                     <button
// // //                         type="button"
// // //                         disabled={processing}
// // //                         onClick={handleDeleteRecord}
// // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// // //                     >
// // //                         <Trash2 size={16} /> Delete Record Permanently
// // //                     </button>
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };

// // // /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// // // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// // //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// // //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// // //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// // //                 <Activity size={16} color="#d97706" /> {title}
// // //             </div>
// // //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// // //         </div>
// // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// // //         </div>
// // //     </div>
// // // );

// // // /* ═══════════════════════════════════════════════════════════════════════════
// // //    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// // // ═══════════════════════════════════════════════════════════════════════════ */
// // // export const PlacementsDashboard: React.FC = () => {
// // //     const toast = useToast();
// // //     const [searchParams, setSearchParams] = useSearchParams();

// // //     const employerUrlParam = searchParams.get('employer');

// // //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// // //     const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
// // //     const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

// // //     const programmes = (useStore(s => (s as any).programmes) || []) as any[];
// // //     const fetchProgrammes = (useStore(s => (s as any).fetchProgrammes) || (async () => { })) as any;

// // //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
// // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// // //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// // //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// // //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// // //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// // //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// // //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
// // //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 'youth' | null>(null);

// // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// // //     const [searchQuery, setSearchQuery] = useState('');
// // //     const [filterType, setFilterType] = useState('all');

// // //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// // //     // 🚀 ACCORDION COLLAPSE TRACKER
// // //     const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

// // //     const toggleGroupAccordion = (groupKey: string) => {
// // //         setExpandedGroups(prev => {
// // //             const next = new Set(prev);
// // //             if (next.has(groupKey)) next.delete(groupKey);
// // //             else next.add(groupKey);
// // //             return next;
// // //         });
// // //     };

// // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // //     const exportMenuRef = useRef<HTMLDivElement>(null);

// // //     useEffect(() => {
// // //         const handleClickOutside = (event: MouseEvent) => {
// // //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// // //                 setShowExportMenu(false);
// // //             }
// // //         };
// // //         document.addEventListener('mousedown', handleClickOutside);
// // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // //     }, []);

// // //     useEffect(() => {
// // //         setSearchParams(prev => {
// // //             const params = new URLSearchParams(prev);
// // //             if (filterEmployer !== 'all') {
// // //                 params.set('employer', filterEmployer);
// // //             } else {
// // //                 params.delete('employer');
// // //             }
// // //             return params;
// // //         }, { replace: true });
// // //     }, [filterEmployer, setSearchParams]);

// // //     useEffect(() => {
// // //         const loadEcosystem = async () => {
// // //             try {
// // //                 await Promise.all([
// // //                     fetchPlacements(),
// // //                     fetchEmployers(),
// // //                     fetchLearners(),
// // //                     fetchStaff(),
// // //                     fetchCohorts(),
// // //                     fetchProgrammes()
// // //                 ]);
// // //             } catch (err) {
// // //                 toast.error("Failed to synchronize placement ecosystem data.");
// // //             } finally {
// // //                 setIsInitialLoad(false);
// // //             }
// // //         };
// // //         loadEcosystem();
// // //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts, fetchProgrammes]);

// // //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // //     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
// // //         return placements
// // //             .map(p => {
// // //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

// // //                 const placementRecord = p as PlacementContract & {
// // //                     placementType?: string,
// // //                     compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// // //                     bbbeeSpendCategory?: string,
// // //                     mentorId?: string,
// // //                     cohortId?: string
// // //                 };

// // //                 const mentor = mentors.find(m =>
// // //                     (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// // //                     (placementRecord.mentorId && m.id === placementRecord.mentorId)
// // //                 ) || ({} as Partial<StaffMember>);

// // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// // //                 let isEtiEligible = false;
// // //                 let isFemale = false;
// // //                 let isYouth = true;

// // //                 if (learner.idNumber && learner.idNumber.length >= 6) {
// // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // //                     const age = new Date().getFullYear() - birthYear;
// // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // //                     if (age > 35) isYouth = false;

// // //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // //                 } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
// // //                     isFemale = true;
// // //                 }

// // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

// // //                 let etiMonthlyValue = 0;
// // //                 const wage = Number(p.stipendAmount) || 0;

// // //                 if (isEtiEligible && wage > 0) {
// // //                     if (wage < 2500) {
// // //                         etiMonthlyValue = wage * 0.60;
// // //                     } else if (wage >= 2500 && wage <= 5499) {
// // //                         etiMonthlyValue = 1500;
// // //                     } else if (wage >= 5500 && wage < 7500) {
// // //                         etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0);
// // //                     } else {
// // //                         etiMonthlyValue = 0;
// // //                     }
// // //                 }

// // //                 const structuredCompliance = {
// // //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// // //                         ? placementRecord.compliance.isAgreementFullyExecuted
// // //                         : p.wblAgreementSigned,
// // //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// // //                 };

// // //                 return {
// // //                     ...p,
// // //                     placementType: placementRecord.placementType || 'QCTO Workplace Module',
// // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// // //                     compliance: structuredCompliance,
// // //                     learnerName: learner.fullName || 'Unknown Learner',
// // //                     idNumber: learner.idNumber || '—',
// // //                     equityGroup: equity,
// // //                     isFemale,
// // //                     isYouth,
// // //                     hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
// // //                     employerName: employer.name || 'Unknown Company',
// // //                     mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// // //                     isEtiEligible,
// // //                     etiMonthlyValue,
// // //                     projectedStipendSpend: wage * verifiedTimeline,
// // //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
// // //                 } as EnrichedPlacement;
// // //             });
// // //     }, [placements, learners, employers, mentors]);

// // //     const displayedPlacements = useMemo(() => {
// // //         return enrichedAndFilteredPlacements
// // //             .filter(p => {
// // //                 const sLower = p.status.toLowerCase();

// // //                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// // //                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;

// // //                 if (searchQuery) {
// // //                     const q = searchQuery.toLowerCase();
// // //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// // //                 }
// // //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// // //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// // //                 return true;
// // //             })
// // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // //     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);

// // //     // 🚀 PROGRAMME / COHORT GROUPING ENGINE WITH AUTO-EXPAND FIRST GROUP
// // //     const groupedPlacementsByProgramme = useMemo(() => {
// // //         const groups: Record<string, {
// // //             key: string;
// // //             employerName: string;
// // //             programmeTitle: string;
// // //             intakeLabel: string;
// // //             items: EnrichedPlacement[];
// // //             compliantCount: number;
// // //             totalStipends: number;
// // //             isUnassigned?: boolean;
// // //         }> = {};

// // //         displayedPlacements.forEach(p => {
// // //             const empName = p.employerName || 'Unknown Organization';

// // //             // Find linked Cohort name or Programme Schema name
// // //             const matchedCohort = cohorts.find(c => c.id === p.cohortId);
// // //             const schemaTitle = (p as any).complianceSchema?.schemaName;

// // //             let progTitle = matchedCohort?.name || schemaTitle || p.placementType || 'Unassigned Track';
// // //             let intakeLabel = p.startDate ? moment(p.startDate).format('MMM YYYY Term') : 'Open Timeline';

// // //             const isFloating = !p.cohortId && !p.complianceSchema;

// // //             const groupKey = isFloating
// // //                 ? `UNassigned_${p.employerId}`
// // //                 : `${p.employerId}_${progTitle}_${intakeLabel}`.replace(/\s+/g, '_');

// // //             if (!groups[groupKey]) {
// // //                 groups[groupKey] = {
// // //                     key: groupKey,
// // //                     employerName: empName,
// // //                     programmeTitle: isFloating ? '⚠️ Unassigned / Legacy Placements' : progTitle,
// // //                     intakeLabel: isFloating ? 'Needs Programme Mapping' : intakeLabel,
// // //                     items: [],
// // //                     compliantCount: 0,
// // //                     totalStipends: 0,
// // //                     isUnassigned: isFloating
// // //                 };
// // //             }

// // //             groups[groupKey].items.push(p);
// // //             if (p.hasMentor && p.compliance.isAgreementFullyExecuted) {
// // //                 groups[groupKey].compliantCount++;
// // //             }
// // //             groups[groupKey].totalStipends += Number(p.stipendAmount) || 0;
// // //         });

// // //         return Object.values(groups).sort((a, b) => (a.isUnassigned ? 1 : -1));
// // //     }, [displayedPlacements, cohorts]);

// // //     // Auto-expand all groups on initial load or search change
// // //     useEffect(() => {
// // //         if (groupedPlacementsByProgramme.length > 0) {
// // //             setExpandedGroups(new Set(groupedPlacementsByProgramme.map(g => g.key)));
// // //         }
// // //     }, [groupedPlacementsByProgramme]);

// // //     const {
// // //         activeCount, expiringSoonCount, nonCompliantCount, completedCount, droppedCount, openSeats,
// // //         transformationPercentage, disabilityPercentage, youthPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend, absorptionRate
// // //     } = useMemo(() => {
// // //         const thirtyDaysFromNow = moment().add(30, 'days');
// // //         let active = 0, expiring = 0, nonCompliant = 0, completed = 0, dropped = 0, absorbed = 0;

// // //         let blackACI = 0;
// // //         let blackFemale = 0;
// // //         let disabilityCount = 0;
// // //         let youthCountTracker = 0;
// // //         let monthlyEtiSum = 0;
// // //         let accumulatedSpend = 0;

// // //         enrichedAndFilteredPlacements.forEach(p => {
// // //             const statusLower = p.status.toLowerCase();
// // //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
// // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes('absorb') || (p as any).isAbsorbed;

// // //             if (isLive) {
// // //                 active++;
// // //                 if (statusLower.includes('active')) {
// // //                     if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;
// // //                     if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor) {
// // //                         nonCompliant++;
// // //                     }
// // //                 }
// // //             } else if (statusLower.includes('complete')) {
// // //                 completed++;
// // //             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
// // //                 dropped++;
// // //             }

// // //             if (isAbsorbed) absorbed++;

// // //             const eq = p.equityGroup.trim().toLowerCase();
// // //             if (eq.includes('african') || eq === 'black' || eq === 'ba') { blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes('coloured') || eq === 'bc') { blackACI++; if (p.isFemale) blackFemale++; }
// // //             else if (eq.includes('indian') || eq === 'bi') { blackACI++; if (p.isFemale) blackFemale++; }

// // //             if (p.isYouth) youthCountTracker++;
// // //             if (p.hasDisability) disabilityCount++;

// // //             if (isLive) {
// // //                 monthlyEtiSum += p.etiMonthlyValue;
// // //                 accumulatedSpend += p.projectedStipendSpend;
// // //             }
// // //         });

// // //         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
// // //         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);
// // //         const open = totalCap - active;

// // //         return {
// // //             activeCount: active,
// // //             expiringSoonCount: expiring,
// // //             nonCompliantCount: nonCompliant,
// // //             completedCount: completed,
// // //             droppedCount: dropped,
// // //             openSeats: Math.max(open, 0),
// // //             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
// // //             disabilityPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((disabilityCount / enrichedAndFilteredPlacements.length) * 100) : 0,
// // //             youthPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((youthCountTracker / enrichedAndFilteredPlacements.length) * 100) : 0,
// // //             monthlyETITotal: monthlyEtiSum,
// // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // //             absorptionRate: completed > 0 ? Math.round((absorbed / completed) * 100) : 0,
// // //             totalProjectedSpend: accumulatedSpend
// // //         };
// // //     }, [enrichedAndFilteredPlacements, employers]);

// // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // //     const getExportData = () => {
// // //         return displayedPlacements.map(p => ({
// // //             "Learner Name": p.learnerName,
// // //             "ID Number": p.idNumber,
// // //             "Host Company": p.employerName,
// // //             "Demographic": p.equityGroup,
// // //             "Placement Type": p.placementType,
// // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // //             "Monthly Stipend": p.stipendAmount || 0,
// // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No",
// // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // //             "Assigned Mentor": p.mentorName,
// // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // //             "Contract Link": p.compliance.wblpaAgreementUrl || 'Not Uploaded',
// // //             "Operational Status": p.status.toUpperCase()
// // //         }));
// // //     };

// // //     const generateFileName = (extension: string) => {
// // //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// // //     };

// // //     const handleExportCSV = () => {
// // //         const data = getExportData();
// // //         if (data.length === 0) return;
// // //         const headers = Object.keys(data[0]);
// // //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// // //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// // //         const link = document.createElement('a');
// // //         link.href = URL.createObjectURL(blob);
// // //         link.setAttribute('download', generateFileName('csv'));
// // //         document.body.appendChild(link);
// // //         link.click();
// // //         document.body.removeChild(link);
// // //         setShowExportMenu(false);
// // //     };

// // //     const handleExportExcel = () => {
// // //         const data = getExportData();
// // //         if (data.length === 0) return;
// // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // //         const workbook = XLSX.utils.book_new();
// // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
// // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // //         setShowExportMenu(false);
// // //     };

// // //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// // //     return (
// // //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

// // //             {editingPlacement && (
// // //                 <EditPlacementModal
// // //                     placement={editingPlacement}
// // //                     mentors={mentors}
// // //                     cohorts={cohorts}
// // //                     learners={learners}
// // //                     onClose={() => setEditingPlacement(null)}
// // //                     onSaved={() => fetchPlacements(true)}
// // //                 />
// // //             )}

// // //             {optionsPlacement && (
// // //                 <PlacementOptionsModal
// // //                     placement={optionsPlacement}
// // //                     onClose={() => setOptionsPlacement(null)}
// // //                     onSaved={() => fetchPlacements(true)}
// // //                 />
// // //             )}

// // //             {isMentorModalOpen && (
// // //                 <MentorModal
// // //                     employerId={activeMentorEmpId}
// // //                     onClose={() => setIsMentorModalOpen(false)}
// // //                     onSaved={async () => {
// // //                         await fetchStaff(true);
// // //                     }}
// // //                     addStaff={addStaff}
// // //                 />
// // //             )}

// // //             {isCreateModalOpen && (
// // //                 <GlobalCreatePlacementModal
// // //                     employers={employers}
// // //                     mentors={mentors}
// // //                     learners={learners.filter(l => !l.isArchived)}
// // //                     placements={placements}
// // //                     cohorts={cohorts}
// // //                     programmes={programmes}
// // //                     onClose={() => setIsCreateModalOpen(false)}
// // //                     onCreate={createPlacement}
// // //                     onAddNewMentor={(empId) => {
// // //                         setActiveMentorEmpId(empId);
// // //                         setIsMentorModalOpen(true);
// // //                     }}
// // //                 />
// // //             )}

// // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // //                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // //                     </div>
// // //                 </div>

// // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value">{openSeats}</span>
// // //                         <span className="cdp-stat-card__label">Open Ecosystem Seats</span>
// // //                     </div>
// // //                 </div>

// // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // //                     <div className="cdp-stat-card__icon">
// // //                         {nonCompliantCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// // //                     </div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value" style={{ color: nonCompliantCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// // //                             {nonCompliantCount}
// // //                         </span>
// // //                         <span className="cdp-stat-card__label">Audit Risks / Non-Compliant</span>
// // //                     </div>
// // //                 </div>

// // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // //                     <div className="cdp-stat-card__icon">
// // //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// // //                     </div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// // //                             {expiringSoonCount}
// // //                         </span>
// // //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
// // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Auditor
// // //                 </div>

// // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

// // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // //                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}>
// // //                             <Landmark size={22} />
// // //                         </div>
// // //                         <div style={{ flex: 1 }}>
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span>
// // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // //                             </div>
// // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // //                                 {formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
// // //                             </div>
// // //                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
// // //                                 Annually: {formatCurrency(annualizedETIEstimate)}
// // //                             </div>
// // //                             {activeInsight === 'eti' && (
// // //                                 <InsightPopup
// // //                                     title="SARS Employment Tax Incentive"
// // //                                     currentValue={`${formatCurrency(monthlyETITotal)}/mo`}
// // //                                     actionSteps={[
// // //                                         <span key="1"><strong>Live Calculation:</strong> Evaluates every active learner's recorded stipend against official SARS scales.</span>,
// // //                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500.</span>
// // //                                     ]}
// // //                                     onClose={() => setActiveInsight(null)}
// // //                                 />
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // //                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
// // //                             <Wallet size={22} />
// // //                         </div>
// // //                         <div style={{ flex: 1 }}>
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
// // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
// // //                             </div>
// // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // //                                 {formatCurrency(totalProjectedSpend)}
// // //                             </div>
// // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
// // //                             {activeInsight === 'spend' && (
// // //                                 <InsightPopup
// // //                                     title="Skills Target Spend"
// // //                                     currentValue={formatCurrency(totalProjectedSpend)}
// // //                                     actionSteps={[
// // //                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
// // //                                         <span key="2"><strong>To Optimize:</strong> Log accurate stipends to count toward B-BBEE payroll targets.</span>
// // //                                     ]}
// // //                                     onClose={() => setActiveInsight(null)}
// // //                                 />
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // //                             <Percent size={22} />
// // //                         </div>
// // //                         <div style={{ flex: 1 }}>
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span>
// // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // //                             </div>
// // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // //                                 {transformationPercentage}%
// // //                             </div>
// // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
// // //                             {activeInsight === 'transformation' && (
// // //                                 <InsightPopup
// // //                                     title="Transformation Demographic Metrics"
// // //                                     currentValue={`${transformationPercentage}%`}
// // //                                     actionSteps={[
// // //                                         <span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>,
// // //                                         <span key="2"><strong>To Optimize:</strong> Scale allocations using ACI candidate pools.</span>
// // //                                     ]}
// // //                                     onClose={() => setActiveInsight(null)}
// // //                                 />
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '0', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // //                         <div style={{ background: '#ecfccb', padding: '10px', borderRadius: '50%', color: '#4d7c0f', height: 'fit-content' }}>
// // //                             <User size={22} />
// // //                         </div>
// // //                         <div style={{ flex: 1 }}>
// // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                 <span style={{ fontSize: '0.75rem', color: '#4d7c0f', fontWeight: 700, textTransform: 'uppercase' }}>Youth Employment</span>
// // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'youth' ? null : 'youth')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4d7c0f', display: 'flex' }}><Info size={14} /></button>
// // //                             </div>
// // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // //                                 {youthPercentage}%
// // //                             </div>
// // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Ratio of candidates under the age of 35.</span>
// // //                             {activeInsight === 'youth' && (
// // //                                 <InsightPopup
// // //                                     title="Youth Employment Metrics"
// // //                                     currentValue={`${youthPercentage}%`}
// // //                                     actionSteps={[
// // //                                         <span key="1"><strong>Demographic:</strong> Verified automatically against National ID numbers.</span>,
// // //                                         <span key="2"><strong>Impact:</strong> Influences YES program reporting and quota verification.</span>
// // //                                     ]}
// // //                                     onClose={() => setActiveInsight(null)}
// // //                                 />
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// // //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// // //                     <Search size={15} color="var(--mlab-grey)" />
// // //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// // //                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// // //                 </div>

// // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// // //                     <Briefcase size={14} color="var(--mlab-grey)" />
// // //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// // //                         <option value="all">All Placement Types</option>
// // //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// // //                         <option value="Alumni Internship">Alumni Internships</option>
// // //                         <option value="External WIL">External WIL</option>
// // //                     </select>
// // //                 </div>

// // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '0', padding: '0 12px' }}>
// // //                     <Building2 size={14} color="var(--mlab-grey)" />
// // //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// // //                         <option value="all">All Host Companies</option>
// // //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// // //                     </select>
// // //                 </div>

// // //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
// // //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setShowExportMenu(!showExportMenu)}
// // //                             disabled={enrichedAndFilteredPlacements.length === 0}
// // //                             className="cdp-btn cdp-btn--outline"
// // //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '0', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // //                         >
// // //                             <DownloadCloud size={14} /> Export Options
// // //                         </button>

// // //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// // //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // //                                 <button
// // //                                     type="button"
// // //                                     onClick={handleExportCSV}
// // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // //                                 >
// // //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// // //                                 </button>
// // //                                 <button
// // //                                     type="button"
// // //                                     onClick={handleExportExcel}
// // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // //                                 >
// // //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // //                                 </button>
// // //                             </div>
// // //                         )}
// // //                     </div>

// // //                     <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: '0' }} onClick={() => setIsCreateModalOpen(true)}>
// // //                         <Plus size={14} /> New Placement
// // //                     </button>
// // //                 </div>
// // //             </div>

// // //             {/* ════════════════════════════════════════════════════════════════════
// // //                PROGRAMME-BOUND ACCORDION LEDGER
// // //             ════════════════════════════════════════════════════════════════════ */}
// // //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// // //                 <div className="vp-card" style={{ marginBottom: 0, background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)' }}>
// // //                     <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem', background: '#f8fafc' }}>
// // //                         <div className="vp-card-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                 <Briefcase size={18} color="var(--mlab-blue)" />
// // //                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // //                                     Program-Bound Global Placement Ledger
// // //                                 </h3>
// // //                             </div>
// // //                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: '0' }}>
// // //                                 {groupedPlacementsByProgramme.length} Active Programme Track(s)
// // //                             </span>
// // //                         </div>
// // //                     </div>

// // //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', background: 'white' }}>
// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setActiveTab('active')}
// // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                         >
// // //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{activeCount}</span>
// // //                         </button>
// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setActiveTab('history')}
// // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                         >
// // //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // //                         </button>
// // //                         <button
// // //                             type="button"
// // //                             onClick={() => setActiveTab('all')}
// // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                         >
// // //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '0', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
// // //                         </button>
// // //                     </div>

// // //                     <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
// // //                         {groupedPlacementsByProgramme.length > 0 ? (
// // //                             groupedPlacementsByProgramme.map(group => {
// // //                                 const isOpen = expandedGroups.has(group.key);
// // //                                 const isCompliant = group.compliantCount === group.items.length;

// // //                                 return (
// // //                                     <div key={group.key} style={{ background: 'white', border: `1px solid ${group.isUnassigned ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
// // //                                         {/* ACCORDION HEADER */}
// // //                                         <div
// // //                                             onClick={() => toggleGroupAccordion(group.key)}
// // //                                             style={{
// // //                                                 display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem',
// // //                                                 background: group.isUnassigned ? '#fff1f2' : isOpen ? '#f1f5f9' : 'white',
// // //                                                 cursor: 'pointer', borderBottom: isOpen ? '1px solid #cbd5e1' : 'none'
// // //                                             }}
// // //                                         >
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                                 <div style={{ background: group.isUnassigned ? '#fee2e2' : 'var(--mlab-midnight)', color: group.isUnassigned ? '#dc2626' : 'white', padding: '8px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // //                                                     {group.isUnassigned ? <AlertTriangle size={18} /> : <Layers size={18} />}
// // //                                                 </div>
// // //                                                 <div>
// // //                                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: group.isUnassigned ? '#991b1b' : 'var(--mlab-midnight)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
// // //                                                         {group.employerName} — <span style={{ color: 'var(--mlab-blue)' }}>{group.programmeTitle}</span>
// // //                                                     </div>
// // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                         <span><Calendar size={12} style={{ display: 'inline', marginRight: '3px' }} /> {group.intakeLabel}</span>
// // //                                                         <span>•</span>
// // //                                                         <span style={{ color: 'var(--mlab-midnight)' }}>{group.items.length} Learner(s) Enrolled</span>
// // //                                                     </div>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// // //                                                     <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: isCompliant ? '#dcfce7' : '#fef3c7', color: isCompliant ? '#166534' : '#b45309', border: `1px solid ${isCompliant ? '#86efac' : '#fde68a'}` }}>
// // //                                                         {group.compliantCount}/{group.items.length} Audit Ready
// // //                                                     </span>
// // //                                                     {group.totalStipends > 0 && (
// // //                                                         <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '0', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>
// // //                                                             {formatCurrency(group.totalStipends)}/mo Payroll
// // //                                                         </span>
// // //                                                     )}
// // //                                                 </div>
// // //                                                 {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
// // //                                             </div>
// // //                                         </div>

// // //                                         {/* ACCORDION BODY TABLE */}
// // //                                         {isOpen && (
// // //                                             <div className="mlab-table-wrap" style={{ borderTop: 'none', }}>
// // //                                                 <table className="mlab-table" style={{ margin: 0 }}>
// // //                                                     <thead style={{ background: '#F0F9FF', color: 'black' }}>
// // //                                                         <tr>
// // //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey' }}>Learner Profile</th>
// // //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey' }}>Supervision & Mentor</th>
// // //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey' }}>Track & Stipend</th>
// // //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey' }}>Contract Timeline</th>
// // //                                                             <th style={{ fontSize: '0.7rem', color: 'var(--mlab-grey' }}>Compliance Readiness</th>
// // //                                                             <th style={{ fontSize: '0.7rem', textAlign: 'right', color: 'var(--mlab-grey' }}>Actions</th>
// // //                                                         </tr>
// // //                                                     </thead>
// // //                                                     <tbody>
// // //                                                         {group.items.map(p => {
// // //                                                             const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
// // //                                                             const missingItems = [];
// // //                                                             if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
// // //                                                             if (!p.hasMentor) missingItems.push("Workplace Mentor");

// // //                                                             return (
// // //                                                                 <tr key={p.id} style={{ background: 'white' }}>
// // //                                                                     <td>
// // //                                                                         <div className="cdp-learner-cell">
// // //                                                                             <div className="cdp-learner-avatar" style={{ borderRadius: '0' }}>{p.learnerName.charAt(0)}</div>
// // //                                                                             <div className="cdp-learner-cell__info">
// // //                                                                                 <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // //                                                                                 <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // //                                                                             </div>
// // //                                                                         </div>
// // //                                                                     </td>
// // //                                                                     <td>
// // //                                                                         <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#334155' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: p.hasMentor ? 600 : 700 }}>
// // //                                                                             {p.hasMentor ? (
// // //                                                                                 <><User size={12} /> {p.mentorName}</>
// // //                                                                             ) : (
// // //                                                                                 <><AlertTriangle size={12} /> No Mentor Assigned</>
// // //                                                                             )}
// // //                                                                         </div>
// // //                                                                     </td>
// // //                                                                     <td>
// // //                                                                         <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// // //                                                                             <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content', borderRadius: '0' }}>{p.placementType}</span>
// // //                                                                             {p.stipendAmount && p.stipendAmount > 0 && (
// // //                                                                                 <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '0' }}>
// // //                                                                                     <Coins size={10} /> R{p.stipendAmount}/mo
// // //                                                                                 </span>
// // //                                                                             )}
// // //                                                                             {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// // //                                                                                 <button
// // //                                                                                     type="button"
// // //                                                                                     onClick={() => setEtiBreakdownLearner(p)}
// // //                                                                                     style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// // //                                                                                     title="Click to view exact SARS mathematical breakdown"
// // //                                                                                 >
// // //                                                                                     <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// // //                                                                                 </button>
// // //                                                                             ) : (
// // //                                                                                 <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '0', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}>
// // //                                                                                     <AlertCircle size={10} /> Ineligible
// // //                                                                                 </span>
// // //                                                                             )}
// // //                                                                         </div>
// // //                                                                     </td>
// // //                                                                     <td>
// // //                                                                         <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // //                                                                             {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
// // //                                                                         </div>
// // //                                                                         {p.status.toLowerCase().includes('active') && moment(p.endDate).isBefore(moment().add(30, 'days')) && (
// // //                                                                             <div style={{ fontSize: '0.65rem', color: '#d97706', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                                                 <AlertTriangle size={10} /> Expiring Soon
// // //                                                                             </div>
// // //                                                                         )}
// // //                                                                     </td>
// // //                                                                     <td>
// // //                                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
// // //                                                                             <span
// // //                                                                                 className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
// // //                                                                                     p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
// // //                                                                                     }`}
// // //                                                                                 style={
// // //                                                                                     p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '0' } :
// // //                                                                                         p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0' } : { borderRadius: '0' }
// // //                                                                                 }
// // //                                                                             >
// // //                                                                                 {p.status.replace('_', ' ')}
// // //                                                                             </span>

// // //                                                                             {isAuditReady ? (
// // //                                                                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '0', width: 'fit-content' }}>
// // //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
// // //                                                                                         <ShieldCheck size={12} /> Audit Ready
// // //                                                                                     </div>
// // //                                                                                 </div>
// // //                                                                             ) : (
// // //                                                                                 <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 6px', borderRadius: '0', width: 'fit-content' }}>
// // //                                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>
// // //                                                                                         <AlertTriangle size={12} /> Missing Data
// // //                                                                                     </div>
// // //                                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
// // //                                                                                         {missingItems.map(m => (
// // //                                                                                             <span key={m} style={{ fontSize: '0.6rem', color: '#991b1b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
// // //                                                                                                 <X size={8} /> {m}
// // //                                                                                             </span>
// // //                                                                                         ))}
// // //                                                                                     </div>
// // //                                                                                 </div>
// // //                                                                             )}
// // //                                                                         </div>
// // //                                                                     </td>
// // //                                                                     <td style={{ textAlign: 'right' }}>
// // //                                                                         <div className="cdp-actions" style={{ justifyContent: 'flex-end' }}>
// // //                                                                             <button
// // //                                                                                 type="button"
// // //                                                                                 onClick={() => setEditingPlacement(p)}
// // //                                                                                 style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// // //                                                                                 title="Edit Placement Details"
// // //                                                                             >
// // //                                                                                 <Edit size={14} />
// // //                                                                             </button>
// // //                                                                             <button
// // //                                                                                 type="button"
// // //                                                                                 onClick={() => setOptionsPlacement(p)}
// // //                                                                                 style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '0', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// // //                                                                                 title="Placement Options"
// // //                                                                             >
// // //                                                                                 <MoreVertical size={14} />
// // //                                                                             </button>
// // //                                                                         </div>
// // //                                                                     </td>
// // //                                                                 </tr>
// // //                                                             );
// // //                                                         })}
// // //                                                     </tbody>
// // //                                                 </table>
// // //                                             </div>
// // //                                         )}
// // //                                     </div>
// // //                                 );
// // //                             })
// // //                         ) : (
// // //                             <div style={{ padding: '4rem', textAlign: 'center', background: 'white', border: '1px solid #cbd5e1' }}>
// // //                                 <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// // //                                 <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// // //                                 <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// // //                                     {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// // //                                         ? "Try adjusting your filters or search query."
// // //                                         : "You haven't assigned any learners to host companies yet."}
// // //                                 </p>
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // // // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import { useSearchParams } from 'react-router-dom';
// // // // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // // // import { db, storage } from '../../../lib/firebase';
// // // // import {
// // // //     Briefcase, Search, Plus, Filter, AlertTriangle,
// // // //     CheckCircle, Clock, Building2, User, FileText,
// // // //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// // // //     ShieldAlert, Save, Loader2, Award, Trash2,
// // // //     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
// // // //     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
// // // //     Calculator, Accessibility, Layers
// // // // } from 'lucide-react';
// // // // import moment from 'moment';
// // // // import * as XLSX from 'xlsx';
// // // // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // import type { DashboardLearner, Employer, PlacementContract } from '../../../types';
// // // // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // // // import Loader from '../../common/Loader/Loader';

// // // // import '../WorkplacesManager/WorkplacesManager.css';

// // // // /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */
// // // // interface EnrichedPlacement extends PlacementContract {
// // // //     placementType: string;
// // // //     bbbeeSpendCategory: string;
// // // //     compliance: {
// // // //         isAgreementFullyExecuted: boolean;
// // // //         wblpaAgreementUrl?: string;
// // // //     };
// // // //     learnerName: string;
// // // //     idNumber: string;
// // // //     equityGroup: string;
// // // //     isFemale: boolean;
// // // //     isYouth: boolean;
// // // //     hasDisability: boolean;
// // // //     employerName: string;
// // // //     mentorName: string;
// // // //     hasMentor: boolean;
// // // //     isEtiEligible: boolean;
// // // //     etiMonthlyValue: number;
// // // //     projectedStipendSpend: number;
// // // // }

// // // // /* ─── ETI BREAKDOWN MODAL (EXTRACTED & PORTALED) ───────────────────────────── */
// // // // const EtiBreakdownModal: React.FC<{
// // // //     learner: EnrichedPlacement;
// // // //     onClose: () => void;
// // // // }> = ({ learner, onClose }) => {
// // // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // // //     const wage = Number(learner.stipendAmount) || 0;
// // // //     const eti = learner.etiMonthlyValue;
// // // //     const annualEti = eti * 12;

// // // //     let mathString = "";
// // // //     if (wage < 2500) {
// // // //         mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
// // // //     } else if (wage >= 2500 && wage <= 5499) {
// // // //         mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // // //     } else if (wage >= 5500 && wage < 7500) {
// // // //         mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
// // // //     } else {
// // // //         mathString = `Stipend exceeds R7,500 upper limit. ETI Claim = R0`;
// // // //     }

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
// // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// // // //                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// // // //                     <div>
// // // //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// // // //                             <Landmark size={20} /> SARS ETI Tax Rebate Audit
// // // //                         </div>
// // // //                         <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {learner.learnerName}</div>
// // // //                     </div>
// // // //                     <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// // // //                 </div>

// // // //                 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// // // //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// // // //                     </div>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// // // //                         <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// // // //                     </div>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // // //                         <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Projection:</span>
// // // //                         <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// // // //                 <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// // // //                     {mathString}
// // // //                 </div>

// // // //                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
// // // //                 <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // //                     <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
// // // //                         If stipend is R0 – R2,499: ETI = 60% of stipend
// // // //                     </li>
// // // //                     <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
// // // //                         If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
// // // //                     </li>
// // // //                     <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
// // // //                         If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
// // // //                     </li>
// // // //                     <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
// // // //                         If stipend is R7,500 or more: ETI = R0
// // // //                     </li>
// // // //                 </ul>

// // // //                 <button type="button" onClick={onClose} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
// // // //                     Close Audit Trail
// // // //                 </button>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // // // interface MentorModalProps {
// // // //     employerId: string;
// // // //     onClose: () => void;
// // // //     onSaved: () => void;
// // // //     addStaff: (m: StaffMember) => Promise<void>;
// // // // }
// // // // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// // // //     const toast = useToast();
// // // //     const [saving, setSaving] = useState(false);
// // // //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         setSaving(true);
// // // //         try {
// // // //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // // //             toast.success('Mentor created successfully!');
// // // //             onSaved();
// // // //             onClose();
// // // //         } catch (err) {
// // // //             console.error('Mentor save error:', err);
// // // //         } finally {
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // //                 <div className="wm-modal__header wm-modal__header--green">
// // // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// // // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // // //                     </div>
// // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // //                     <div className="wm-modal__body">
// // // //                         <div className="wm-form-grid">
// // // //                             <div className="wm-form-group wm-form-group--full">
// // // //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// // // //                                 <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
// // // //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// // // //                             </div>
// // // //                             <div className="wm-form-group wm-form-group--full">
// // // //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // // //                                 <input className="wm-form-input" required type="email" placeholder="john@company.com"
// // // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// // // //                             </div>
// // // //                             <div className="wm-form-group wm-form-group--full">
// // // //                                 <label className="wm-form-label">Phone Number</label>
// // // //                                 <input className="wm-form-input" type="tel" placeholder="082 123 4567"
// // // //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                     <div className="wm-modal__footer">
// // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── GLOBAL CREATE PLACEMENT MODAL ──────────────────────────────────────────── */
// // // // const GlobalCreatePlacementModal: React.FC<{
// // // //     employers: Employer[],
// // // //     mentors: StaffMember[],
// // // //     learners: DashboardLearner[],
// // // //     placements: PlacementContract[],
// // // //     cohorts: any[],
// // // //     onClose: () => void,
// // // //     onCreate: (data: any) => Promise<void>,
// // // //     onAddNewMentor: (employerId: string) => void
// // // // }> = ({ employers, mentors, learners, placements, cohorts, onClose, onCreate, onAddNewMentor }) => {
// // // //     const toast = useToast();
// // // //     const [saving, setSaving] = useState(false);

// // // //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// // // //     const [selectedCohortId, setSelectedCohortId] = useState('');
// // // //     const [learnerSearch, setLearnerSearch] = useState('');
// // // //     const [selectedLearners, setSelectedLearners] = useState<DashboardLearner[]>([]);

// // // //     // Extends the view to all programs if strict profile mapping yields no results
// // // //     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

// // // //     const [form, setForm] = useState({
// // // //         mentorId: '',
// // // //         placementType: 'QCTO Workplace Module',
// // // //         startDate: '',
// // // //         endDate: '',
// // // //         fundingSource: 'Corporate Funded',
// // // //         bbbeeSpendCategory: 'Category C',
// // // //         stipendAmount: ''
// // // //     });

// // // //     const isQcto = form.placementType === 'QCTO Workplace Module';

// // // //     const availableMentors = useMemo(() => {
// // // //         if (!selectedEmployerId) return [];
// // // //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// // // //     }, [selectedEmployerId, mentors]);

// // // //     // 🚀 DYNAMIC COMPLIANCE SEARCH: No longer blocked by cohort. Find the learner first.
// // // //     const filteredLearners = useMemo(() => {
// // // //         if (!learnerSearch) return [];

// // // //         return learners.filter(l => {
// // // //             const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
// // // //             const notSelected = !selectedLearners.find(sl => sl.id === l.id);
// // // //             return matchesSearch && notSelected;
// // // //         }).slice(0, 5);
// // // //     }, [learnerSearch, learners, selectedLearners]);

// // // //     // 🚀 INTELLIGENT COMPLIANCE DROPDOWN FILTER ENGINE
// // // //     const displayedCohorts = useMemo(() => {
// // // //         if (selectedLearners.length === 0 || forceShowAllProgrammes) return cohorts;

// // // //         // Extract registered cohort tracks strictly from the selected learners
// // // //         const targetCohortIds = selectedLearners.map(l => l.cohortId).filter(Boolean);
// // // //         const matchingTracks = cohorts.filter(c => targetCohortIds.includes(c.id));

// // // //         // Fallback handler: If intersection produces zero metrics, automatically extend scope
// // // //         if (matchingTracks.length === 0) return cohorts;
// // // //         return matchingTracks;
// // // //     }, [cohorts, selectedLearners, forceShowAllProgrammes]);

// // // //     // Safe auto-selection side-effect if an explicit profile track resolves matching elements
// // // //     useEffect(() => {
// // // //         if (isQcto && displayedCohorts.length === 1 && !selectedCohortId) {
// // // //             setSelectedCohortId(displayedCohorts[0].id);
// // // //         } else if (selectedLearners.length === 0) {
// // // //             setSelectedCohortId('');
// // // //         }
// // // //     }, [displayedCohorts, isQcto, selectedCohortId, selectedLearners.length]);

// // // //     const handleRemoveLearner = (id: string) => {
// // // //         setSelectedLearners(prev => prev.filter(l => l.id !== id));
// // // //     };

// // // //     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
// // // //     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));
// // // //     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
// // // //     const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// // // //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");
// // // //         if (isQcto && !selectedCohortId) return toast.error("Please assign this regulated placement to a specific Programme/Cohort.");

// // // //         if (isOverCapacity) {
// // // //             if (!window.confirm(`WARNING: You are exceeding the stated capacity for ${selectedEmployer?.name}. Are you sure you want to force this placement?`)) return;
// // // //         }

// // // //         setSaving(true);
// // // //         try {
// // // //             await Promise.all(selectedLearners.map(learner =>
// // // //                 onCreate({
// // // //                     learnerId: learner.id,
// // // //                     employerId: selectedEmployerId,
// // // //                     cohortId: isQcto ? selectedCohortId : '',
// // // //                     ...form,
// // // //                     stipendAmount: Number(form.stipendAmount) || 0,
// // // //                     status: 'Active Placement'
// // // //                 })
// // // //             ));

// // // //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// // // //             onClose();
// // // //         } catch (err: any) {
// // // //             toast.error(err.message || "Failed to create placements.");
// // // //         } finally {
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
// // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><Network size={20} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// // // //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// // // //                     </div>
// // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // //                     <div className="wm-modal__body">

// // // //                         {/* STEP 1: ECOSYSTEM CONSTRAINTS */}
// // // //                         <div className="wm-form-section">
// // // //                             <div className="wm-form-section__label"><Building2 size={12} /> Setup Placement Ecosystem</div>
// // // //                             <div className="wm-form-grid">
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
// // // //                                     <select
// // // //                                         className="wm-form-input"
// // // //                                         required
// // // //                                         value={selectedEmployerId}
// // // //                                         onChange={e => {
// // // //                                             setSelectedEmployerId(e.target.value);
// // // //                                             setForm(p => ({ ...p, mentorId: '' }));
// // // //                                         }}
// // // //                                     >
// // // //                                         <option value="">-- Choose Host Company --</option>
// // // //                                         {employers.filter(emp => emp.status !== 'archived').map(emp => (
// // // //                                             <option key={emp.id} value={emp.id}>{emp.name}</option>
// // // //                                         ))}
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
// // // //                                     <select
// // // //                                         className="wm-form-input"
// // // //                                         value={form.placementType}
// // // //                                         onChange={e => {
// // // //                                             const val = e.target.value;
// // // //                                             setForm(p => ({ ...p, placementType: val }));
// // // //                                             setSelectedCohortId('');
// // // //                                             setSelectedLearners([]);
// // // //                                             setLearnerSearch('');
// // // //                                             setForceShowAllProgrammes(false);
// // // //                                         }}
// // // //                                     >
// // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
// // // //                                         <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
// // // //                                         <option value="External WIL">External WIL (Unregulated)</option>
// // // //                                     </select>
// // // //                                 </div>
// // // //                                 {selectedEmployer && (
// // // //                                     <div className="wm-form-group wm-form-group--full" style={{ marginTop: '-0.5rem' }}>
// // // //                                         <div style={{ padding: '0.5rem', borderRadius: '4px', background: isOverCapacity ? '#fff1f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: isOverCapacity ? '#991b1b' : '#15803d', fontWeight: 600 }}>
// // // //                                             {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
// // // //                                             Placement Capacity: {currentEmployerPlacements.length + selectedLearners.length} / {internCapacity} allocations utilized.
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* STEP 2: LEARNER PROFILE SELECTION */}
// // // //                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// // // //                             <div className="wm-form-section__label"><Search size={12} /> 2. Search and Select Learner(s)</div>

// // // //                             {selectedLearners.length > 0 && (
// // // //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
// // // //                                     {selectedLearners.map(l => (
// // // //                                         <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
// // // //                                             {l.fullName}
// // // //                                             <button type="button" onClick={() => handleRemoveLearner(l.id)} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove">
// // // //                                                 <X size={12} />
// // // //                                             </button>
// // // //                                         </div>
// // // //                                     ))}
// // // //                                 </div>
// // // //                             )}

// // // //                             <div style={{ position: 'relative' }}>
// // // //                                 <input
// // // //                                     type="text"
// // // //                                     className="wm-form-input"
// // // //                                     placeholder="Type learner full name or national identification number..."
// // // //                                     value={learnerSearch}
// // // //                                     onChange={e => setLearnerSearch(e.target.value)}
// // // //                                 />
// // // //                                 {learnerSearch && (
// // // //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // // //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// // // //                                             <div
// // // //                                                 key={l.id}
// // // //                                                 onClick={() => { setSelectedLearners(prev => [...prev, l]); setLearnerSearch(''); }}
// // // //                                                 style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
// // // //                                             >
// // // //                                                 <div>
// // // //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// // // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// // // //                                                 </div>
// // // //                                             </div>
// // // //                                         )) : (
// // // //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>

// // // //                         {/* STEP 3: PROGRAMME MATRIX BOUNDARY ASSIGNER (CONDITIONAL) */}
// // // //                         {isQcto && selectedLearners.length > 0 && (
// // // //                             <div className="wm-form-section animate-fade-in">
// // // //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
// // // //                                     <div className="wm-form-section__label" style={{ margin: 0 }}><Layers size={12} /> 3. Regulated Program Verification</div>

// // // //                                     <button
// // // //                                         type="button"
// // // //                                         onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)}
// // // //                                         style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
// // // //                                     >
// // // //                                         {forceShowAllProgrammes ? "Restrict to Enrolled Tracks" : "Extend / Show All Registry Qualifications"}
// // // //                                     </button>
// // // //                                 </div>
// // // //                                 <select
// // // //                                     className="wm-form-input"
// // // //                                     required={isQcto}
// // // //                                     value={selectedCohortId}
// // // //                                     onChange={e => setSelectedCohortId(e.target.value)}
// // // //                                     style={{ borderLeft: '4px solid var(--mlab-amber)' }}
// // // //                                 >
// // // //                                     <option value="">-- Assign Target Qualification Record --</option>
// // // //                                     {displayedCohorts.map(c => (
// // // //                                         <option key={c.id} value={c.id}>{c.name}</option>
// // // //                                     ))}
// // // //                                 </select>
// // // //                                 <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>
// // // //                                     {forceShowAllProgrammes
// // // //                                         ? "Displaying complete systemic qualification index."
// // // //                                         : "Filtered automatically to show only tracking programs matching chosen learner metrics."}
// // // //                                 </p>
// // // //                             </div>
// // // //                         )}

// // // //                         {/* STEP 4: INFRASTRUCTURE METRICS */}
// // // //                         <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 && (!isQcto || selectedCohortId) ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 && (!isQcto || selectedCohortId) ? 'auto' : 'none' }}>
// // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> {isQcto ? '4' : '3'}. Placement Details & Financials</div>
// // // //                             <div className="wm-form-grid">
// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // //                                         {selectedEmployerId && (
// // // //                                             <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
// // // //                                                 <Plus size={12} /> Quick Add Mentor
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>
// // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))}>
// // // //                                         <option value="">-- No Mentor Assigned (Flag as Missing) --</option>
// // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // //                                     </select>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // //                                     </select>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // //                                     <div style={{ position: 'relative' }}>
// // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // //                                         <input
// // // //                                             className="wm-form-input"
// // // //                                             type="number"
// // // //                                             min="0"
// // // //                                             style={{ paddingLeft: '28px' }}
// // // //                                             placeholder="e.g. 4500"
// // // //                                             value={form.stipendAmount}
// // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // //                                         />
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
// // // //                                 </div>
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                     </div>
// // // //                     <div className="wm-modal__footer">
// // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isQcto && !selectedCohortId)}>
// // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── EDIT PLACEMENT MODAL ───────────────────────────────────────────────────── */
// // // // const EditPlacementModal: React.FC<{
// // // //     placement: any;
// // // //     mentors: StaffMember[];
// // // //     cohorts: any[];
// // // //     learners: DashboardLearner[];
// // // //     onClose: () => void;
// // // //     onSaved: () => void;
// // // // }> = ({ placement, mentors, cohorts, learners, onClose, onSaved }) => {
// // // //     const toast = useToast();
// // // //     const [saving, setSaving] = useState(false);
// // // //     const [uploadingDoc, setUploadingDoc] = useState(false);
// // // //     const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

// // // //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// // // //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// // // //     const [form, setForm] = useState({
// // // //         mentorId: placement.mentorId || '',
// // // //         cohortId: placement.cohortId || '',
// // // //         placementType: placement.placementType || 'QCTO Workplace Module',
// // // //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// // // //         stipendAmount: placement.stipendAmount || '',
// // // //         startDate: placement.startDate || '',
// // // //         endDate: placement.endDate || '',
// // // //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// // // //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// // // //     });

// // // //     const isQcto = form.placementType === 'QCTO Workplace Module';
// // // //     const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');
// // // //     const targetLearner = learners.find(l => l.id === placement.learnerId);

// // // //     const displayedCohorts = useMemo(() => {
// // // //         if (forceShowAllProgrammes) return cohorts;

// // // //         const relevantIds = new Set<string>();
// // // //         if (targetLearner?.cohortId) relevantIds.add(targetLearner.cohortId);
// // // //         if (placement.cohortId) relevantIds.add(placement.cohortId);

// // // //         if (relevantIds.size === 0) return cohorts;

// // // //         const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
// // // //         if (matchingTracks.length === 0) return cohorts;

// // // //         return matchingTracks;
// // // //     }, [cohorts, targetLearner, placement.cohortId, forceShowAllProgrammes]);

// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         setSaving(true);
// // // //         try {
// // // //             let finalDocumentUrl = form.wblpaAgreementUrl;

// // // //             if (uploadMode === 'upload' && selectedFile) {
// // // //                 setUploadingDoc(true);
// // // //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // //                 await uploadBytes(fileRef, selectedFile);
// // // //                 finalDocumentUrl = await getDownloadURL(fileRef);
// // // //                 setUploadingDoc(false);
// // // //             }

// // // //             const batch = writeBatch(db);
// // // //             const placementRef = doc(db, 'placements', placement.id);
// // // //             const learnerRef = doc(db, 'learners', placement.learnerId);

// // // //             batch.update(placementRef, {
// // // //                 mentorId: form.mentorId,
// // // //                 cohortId: isQcto ? form.cohortId : '',
// // // //                 placementType: form.placementType,
// // // //                 stipendAmount: Number(form.stipendAmount) || 0,
// // // //                 startDate: form.startDate,
// // // //                 endDate: form.endDate,
// // // //                 compliance: {
// // // //                     ...(placement.compliance || {}),
// // // //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// // // //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// // // //                     wblpaAgreementUrl: finalDocumentUrl
// // // //                 },
// // // //                 updatedAt: new Date().toISOString()
// // // //             });

// // // //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

// // // //             await batch.commit();

// // // //             toast.success("Placement details and compliance updated successfully!");

// // // //             setTimeout(() => {
// // // //                 onSaved();
// // // //                 onClose();
// // // //             }, 1200);

// // // //         } catch (err: any) {
// // // //             console.error(err);
// // // //             toast.error(err.message || "Failed to update placement details.");
// // // //             setUploadingDoc(false);
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// // // //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// // // //                     </div>
// // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// // // //                     <div className="wm-modal__body">
// // // //                         <div className="wm-form-section">
// // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// // // //                             <div className="wm-form-grid">

// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Placement Type</label>
// // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => {
// // // //                                         setForm(p => ({ ...p, placementType: e.target.value }));
// // // //                                         if (e.target.value !== 'QCTO Workplace Module') {
// // // //                                             setForm(p => ({ ...p, cohortId: '' }));
// // // //                                         }
// // // //                                     }} disabled={saving}>
// // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // //                                         <option value="External WIL">External WIL</option>
// // // //                                     </select>
// // // //                                 </div>

// // // //                                 {isQcto && (
// // // //                                     <div className="wm-form-group wm-form-group--full animate-fade-in">
// // // //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // //                                             <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
// // // //                                             <button
// // // //                                                 type="button"
// // // //                                                 onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)}
// // // //                                                 style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
// // // //                                             >
// // // //                                                 {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
// // // //                                             </button>
// // // //                                         </div>
// // // //                                         <select className="wm-form-input" required={isQcto} value={form.cohortId} onChange={e => setForm(p => ({ ...p, cohortId: e.target.value }))} disabled={saving}>
// // // //                                             <option value="">-- Needs Programme Mapping --</option>
// // // //                                             {displayedCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// // // //                                         </select>
// // // //                                     </div>
// // // //                                 )}

// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // //                                     </div>
// // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// // // //                                         <option value="">-- No Mentor Assigned --</option>
// // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // //                                     </select>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // //                                     <div style={{ position: 'relative' }}>
// // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // //                                         <input
// // // //                                             className="wm-form-input"
// // // //                                             type="number"
// // // //                                             min="0"
// // // //                                             style={{ paddingLeft: '28px' }}
// // // //                                             placeholder="e.g. 4500"
// // // //                                             value={form.stipendAmount}
// // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // //                                             disabled={saving}
// // // //                                         />
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} />
// // // //                                 </div>
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} />
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// // // //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// // // //                             <div className="wm-form-grid">
// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // //                                     </select>
// // // //                                 </div>

// // // //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// // // //                                         <input
// // // //                                             type="checkbox"
// // // //                                             checked={form.isAgreementFullyExecuted}
// // // //                                             onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))}
// // // //                                             style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }}
// // // //                                             disabled={saving}
// // // //                                         />
// // // //                                         WBLPA Signed & On File
// // // //                                     </label>
// // // //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginTop: '12px' }}>
// // // //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// // // //                                             <button
// // // //                                                 type="button"
// // // //                                                 onClick={() => setUploadMode('link')}
// // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // //                                                 disabled={saving}
// // // //                                             >
// // // //                                                 <LinkIcon size={12} /> Paste Link
// // // //                                             </button>
// // // //                                             <button
// // // //                                                 type="button"
// // // //                                                 onClick={() => setUploadMode('upload')}
// // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // //                                                 disabled={saving}
// // // //                                             >
// // // //                                                 <UploadCloud size={12} /> Upload File
// // // //                                             </button>
// // // //                                         </div>

// // // //                                         <div style={{ padding: '12px' }}>
// // // //                                             {uploadMode === 'link' ? (
// // // //                                                 <>
// // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label>
// // // //                                                     <input
// // // //                                                         className="wm-form-input"
// // // //                                                         type="url"
// // // //                                                         placeholder="https://drive.google.com/file/d/..."
// // // //                                                         value={form.wblpaAgreementUrl}
// // // //                                                         onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))}
// // // //                                                         disabled={saving}
// // // //                                                     />
// // // //                                                 </>
// // // //                                             ) : (
// // // //                                                 <>
// // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label>
// // // //                                                     <input
// // // //                                                         className="wm-form-input"
// // // //                                                         type="file"
// // // //                                                         accept=".pdf,image/*,.doc,.docx"
// // // //                                                         onChange={e => {
// // // //                                                             if (e.target.files && e.target.files.length > 0) {
// // // //                                                                 setSelectedFile(e.target.files[0]);
// // // //                                                             }
// // // //                                                         }}
// // // //                                                         style={{ padding: '6px' }}
// // // //                                                         disabled={saving}
// // // //                                                     />
// // // //                                                 </>
// // // //                                             )}
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                     </div>
// // // //                     <div className="wm-modal__footer">
// // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // //                             {saving ? (
// // // //                                 <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</>
// // // //                             ) : (
// // // //                                 <><Save size={13} /> Save Changes</>
// // // //                             )}
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// // // // const PlacementOptionsModal: React.FC<{
// // // //     placement: any;
// // // //     onClose: () => void;
// // // //     onSaved: () => void;
// // // // }> = ({ placement, onClose, onSaved }) => {
// // // //     const toast = useToast();
// // // //     const [processing, setProcessing] = useState(false);

// // // //     const handleChangeStatus = async (newStatus: string) => {
// // // //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// // // //         setProcessing(true);
// // // //         try {
// // // //             await updateDoc(doc(db, 'placements', placement.id), {
// // // //                 status: newStatus,
// // // //                 updatedAt: new Date().toISOString()
// // // //             });
// // // //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// // // //             onSaved();
// // // //             onClose();
// // // //         } catch (err: any) {
// // // //             toast.error(err.message || "Failed to update status.");
// // // //         } finally {
// // // //             setProcessing(false);
// // // //         }
// // // //     };

// // // //     const handleDeleteRecord = async () => {
// // // //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// // // //         setProcessing(true);
// // // //         try {
// // // //             await deleteDoc(doc(db, 'placements', placement.id));
// // // //             toast.success("Placement record permanently deleted.");
// // // //             onSaved();
// // // //             onClose();
// // // //         } catch (err: any) {
// // // //             toast.error(err.message || "Failed to delete record.");
// // // //         } finally {
// // // //             setProcessing(false);
// // // //         }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // // //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706' }}><MoreVertical size={20} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">Placement Options</h2>
// // // //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// // // //                     </div>
// // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// // // //                 </div>

// // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                     <button
// // // //                         type="button"
// // // //                         disabled={processing || placement.status === 'Completed'}
// // // //                         onClick={() => handleChangeStatus('Completed')}
// // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // //                     >
// // // //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// // // //                     </button>
// // // //                     <button
// // // //                         type="button"
// // // //                         disabled={processing || placement.status === 'Pending Match'}
// // // //                         onClick={() => handleChangeStatus('Pending Match')}
// // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // //                     >
// // // //                         <Clock size={16} color="#d97706" /> Revert to Pending Match
// // // //                     </button>
// // // //                     <button
// // // //                         type="button"
// // // //                         disabled={processing || placement.status === 'Terminated'}
// // // //                         onClick={() => handleChangeStatus('Terminated')}
// // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}
// // // //                     >
// // // //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// // // //                     </button>
// // // //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
// // // //                     <button
// // // //                         type="button"
// // // //                         disabled={processing}
// // // //                         onClick={handleDeleteRecord}
// // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// // // //                     >
// // // //                         <Trash2 size={16} /> Delete Record Permanently
// // // //                     </button>
// // // //                 </div>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// // // // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// // // //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// // // //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// // // //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// // // //                 <Activity size={16} color="#d97706" /> {title}
// // // //             </div>
// // // //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// // // //         </div>
// // // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // // //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// // // //         </div>
// // // //     </div>
// // // // );

// // // // /* ═══════════════════════════════════════════════════════════════════════════
// // // //    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// // // // ═══════════════════════════════════════════════════════════════════════════ */
// // // // export const PlacementsDashboard: React.FC = () => {
// // // //     const toast = useToast();
// // // //     const [searchParams] = useSearchParams();
// // // //     const employerUrlParam = searchParams.get('employer');

// // // //     // 🚀 BATCH EXPLOIT AND DATA FETCHERS
// // // //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// // // //     const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
// // // //     const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

// // // //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
// // // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// // // //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// // // //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// // // //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// // // //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// // // //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// // // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// // // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// // // //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
// // // //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | 'youth' | null>(null);

// // // //     // 🚀 NEW: State for detailed ETI Math breakdown popup
// // // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// // // //     const [searchQuery, setSearchQuery] = useState('');
// // // //     const [filterType, setFilterType] = useState('all');
// // // //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// // // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// // // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // // //     const exportMenuRef = useRef<HTMLDivElement>(null);

// // // //     useEffect(() => {
// // // //         const handleClickOutside = (event: MouseEvent) => {
// // // //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// // // //                 setShowExportMenu(false);
// // // //             }
// // // //         };
// // // //         document.addEventListener('mousedown', handleClickOutside);
// // // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         if (employerUrlParam) setFilterEmployer(employerUrlParam);
// // // //     }, [employerUrlParam]);

// // // //     useEffect(() => {
// // // //         const loadEcosystem = async () => {
// // // //             try {
// // // //                 // 🚀 Sync all required matrix datasets
// // // //                 await Promise.all([
// // // //                     fetchPlacements(),
// // // //                     fetchEmployers(),
// // // //                     fetchLearners(),
// // // //                     fetchStaff(),
// // // //                     fetchCohorts()
// // // //                 ]);
// // // //             } catch (err) {
// // // //                 toast.error("Failed to synchronize placement ecosystem data.");
// // // //             } finally {
// // // //                 setIsInitialLoad(false);
// // // //             }
// // // //         };
// // // //         loadEcosystem();
// // // //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts]);

// // // //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// // // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // // //     // MAP AND ENRICH DATA DYNAMICALLY FROM DATABASE
// // // //     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
// // // //         return placements
// // // //             .map(p => {
// // // //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

// // // //                 const placementRecord = p as PlacementContract & {
// // // //                     placementType?: string,
// // // //                     compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// // // //                     bbbeeSpendCategory?: string,
// // // //                     mentorId?: string,
// // // //                     cohortId?: string
// // // //                 };

// // // //                 const mentor = mentors.find(m =>
// // // //                     (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// // // //                     (placementRecord.mentorId && m.id === placementRecord.mentorId)
// // // //                 ) || ({} as Partial<StaffMember>);

// // // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// // // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// // // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// // // //                 // 🚀 LIVE AGE RESOLUTION FROM SA NATIONAL ID
// // // //                 let isEtiEligible = false;
// // // //                 let isFemale = false;
// // // //                 let isYouth = true;

// // // //                 if (learner.idNumber && learner.idNumber.length >= 6) {
// // // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // // //                     const age = new Date().getFullYear() - birthYear;
// // // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // // //                     if (age > 35) isYouth = false;

// // // //                     const genderDigit = parseInt(learner.idNumber.substring(6, 7), 10);
// // // //                     if (genderDigit >= 0 && genderDigit <= 4) isFemale = true;
// // // //                 } else if ((learner.demographics as any)?.genderCode === 'F' || (extendedLearner as any).gender === 'Female') {
// // // //                     isFemale = true;
// // // //                 }

// // // //                 // 🚀 LIVE STIPEND MATHEMATICAL MONTH DURATION CALCULATOR
// // // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// // // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

// // // //                 // 🚀 LIVE STATUTORY SLIDING-SCALE SARS ETI ENGINE DEPLOYED
// // // //                 let etiMonthlyValue = 0;
// // // //                 const wage = Number(p.stipendAmount) || 0;

// // // //                 if (isEtiEligible && wage > 0) {
// // // //                     if (wage < 2500) {
// // // //                         etiMonthlyValue = wage * 0.60; // 60% rule
// // // //                     } else if (wage >= 2500 && wage <= 5499) {
// // // //                         etiMonthlyValue = 1500; // Cap rule
// // // //                     } else if (wage >= 5500 && wage < 7500) {
// // // //                         etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0); // Taper rule
// // // //                     } else {
// // // //                         etiMonthlyValue = 0; // Disqualified over R7500
// // // //                     }
// // // //                 }

// // // //                 const structuredCompliance = {
// // // //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// // // //                         ? placementRecord.compliance.isAgreementFullyExecuted
// // // //                         : p.wblAgreementSigned,
// // // //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// // // //                 };

// // // //                 return {
// // // //                     ...p,
// // // //                     placementType: placementRecord.placementType || 'QCTO Workplace Module',
// // // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// // // //                     compliance: structuredCompliance,
// // // //                     learnerName: learner.fullName || 'Unknown Learner',
// // // //                     idNumber: learner.idNumber || '—',
// // // //                     equityGroup: equity,
// // // //                     isFemale,
// // // //                     isYouth,
// // // //                     hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
// // // //                     employerName: employer.name || 'Unknown Company',
// // // //                     mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// // // //                     isEtiEligible,
// // // //                     etiMonthlyValue,
// // // //                     projectedStipendSpend: wage * verifiedTimeline,
// // // //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
// // // //                 } as EnrichedPlacement;
// // // //             });
// // // //     }, [placements, learners, employers, mentors]);

// // // //     // FILTER APPLIED LIST
// // // //     const displayedPlacements = useMemo(() => {
// // // //         return enrichedAndFilteredPlacements
// // // //             .filter(p => {
// // // //                 const sLower = p.status.toLowerCase();

// // // //                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// // // //                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;

// // // //                 if (searchQuery) {
// // // //                     const q = searchQuery.toLowerCase();
// // // //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// // // //                 }
// // // //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// // // //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// // // //                 return true;
// // // //             })
// // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // //     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);


// // // //     // KPI & CAPACITY INTELLIGENCE
// // // //     const {
// // // //         activeCount, expiringSoonCount, nonCompliantCount, completedCount, droppedCount, openSeats,
// // // //         transformationPercentage, disabilityPercentage, youthPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend, absorptionRate
// // // //     } = useMemo(() => {
// // // //         const thirtyDaysFromNow = moment().add(30, 'days');
// // // //         let active = 0, expiring = 0, nonCompliant = 0, completed = 0, dropped = 0, absorbed = 0;

// // // //         let blackACI = 0;
// // // //         let blackFemale = 0;
// // // //         let disabilityCount = 0;
// // // //         let youthCountTracker = 0;
// // // //         let monthlyEtiSum = 0;
// // // //         let accumulatedSpend = 0;

// // // //         enrichedAndFilteredPlacements.forEach(p => {
// // // //             const statusLower = p.status.toLowerCase();
// // // //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
// // // //             const isAbsorbed = p.isAbsorbedPostPlacement || statusLower.includes('absorb') || (p as any).isAbsorbed;

// // // //             // Ops & Compliance counts
// // // //             if (isLive) {
// // // //                 active++;
// // // //                 if (statusLower.includes('active')) {
// // // //                     if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;

// // // //                     // 🚀 The Master Compliance State Engine Check
// // // //                     if (!p.compliance.isAgreementFullyExecuted || !p.hasMentor) {
// // // //                         nonCompliant++;
// // // //                     }
// // // //                 }
// // // //             } else if (statusLower.includes('complete')) {
// // // //                 completed++;
// // // //             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
// // // //                 dropped++;
// // // //             }

// // // //             if (isAbsorbed) {
// // // //                 absorbed++;
// // // //             }

// // // //             // Financial & B-BBEE
// // // //             const eq = p.equityGroup.trim().toLowerCase();
// // // //             if (eq.includes('african') || eq === 'black' || eq === 'ba') { blackACI++; if (p.isFemale) blackFemale++; }
// // // //             else if (eq.includes('coloured') || eq === 'bc') { blackACI++; if (p.isFemale) blackFemale++; }
// // // //             else if (eq.includes('indian') || eq === 'bi') { blackACI++; if (p.isFemale) blackFemale++; }

// // // //             if (p.isYouth) youthCountTracker++;
// // // //             if (p.hasDisability) disabilityCount++;

// // // //             if (isLive) {
// // // //                 monthlyEtiSum += p.etiMonthlyValue;
// // // //                 accumulatedSpend += p.projectedStipendSpend;
// // // //             }
// // // //         });

// // // //         // Capacity Logic
// // // //         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
// // // //         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);
// // // //         const open = totalCap - active;

// // // //         return {
// // // //             activeCount: active,
// // // //             expiringSoonCount: expiring,
// // // //             nonCompliantCount: nonCompliant,
// // // //             completedCount: completed,
// // // //             droppedCount: dropped,
// // // //             openSeats: Math.max(open, 0),

// // // //             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // //             disabilityPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((disabilityCount / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // //             youthPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((youthCountTracker / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // //             monthlyETITotal: monthlyEtiSum,
// // // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // // //             absorptionRate: completed > 0 ? Math.round((absorbed / completed) * 100) : 0,
// // // //             totalProjectedSpend: accumulatedSpend
// // // //         };
// // // //     }, [enrichedAndFilteredPlacements, employers]);

// // // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // // //     const getExportData = () => {
// // // //         return displayedPlacements.map(p => ({
// // // //             "Learner Name": p.learnerName,
// // // //             "ID Number": p.idNumber,
// // // //             "Host Company": p.employerName,
// // // //             "Demographic": p.equityGroup,
// // // //             "Placement Type": p.placementType,
// // // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // // //             "Monthly Stipend": p.stipendAmount || 0,
// // // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No", // 🚀 DYNAMIC NO HARDCODING
// // // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // // //             "Assigned Mentor": p.mentorName,
// // // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // //             "Contract Link": p.compliance.wblpaAgreementUrl || 'Not Uploaded',
// // // //             "Operational Status": p.status.toUpperCase()
// // // //         }));
// // // //     };

// // // //     const generateFileName = (extension: string) => {
// // // //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// // // //     };

// // // //     const handleExportCSV = () => {
// // // //         const data = getExportData();
// // // //         if (data.length === 0) return;
// // // //         const headers = Object.keys(data[0]);
// // // //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// // // //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// // // //         const link = document.createElement('a');
// // // //         link.href = URL.createObjectURL(blob);
// // // //         link.setAttribute('download', generateFileName('csv'));
// // // //         document.body.appendChild(link);
// // // //         link.click();
// // // //         document.body.removeChild(link);
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     const handleExportExcel = () => {
// // // //         const data = getExportData();
// // // //         if (data.length === 0) return;
// // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // //         const workbook = XLSX.utils.book_new();
// // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
// // // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // // //         setShowExportMenu(false);
// // // //     };

// // // //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// // // //     return (
// // // //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // //             {/* ACTION MODALS */}
// // // //             {etiBreakdownLearner && <EtiBreakdownModal learner={etiBreakdownLearner} onClose={() => setEtiBreakdownLearner(null)} />}

// // // //             {editingPlacement && (
// // // //                 <EditPlacementModal
// // // //                     placement={editingPlacement}
// // // //                     mentors={mentors}
// // // //                     cohorts={cohorts}
// // // //                     learners={learners}
// // // //                     onClose={() => setEditingPlacement(null)}
// // // //                     onSaved={() => fetchPlacements(true)}
// // // //                 />
// // // //             )}

// // // //             {optionsPlacement && (
// // // //                 <PlacementOptionsModal
// // // //                     placement={optionsPlacement}
// // // //                     onClose={() => setOptionsPlacement(null)}
// // // //                     onSaved={() => fetchPlacements(true)}
// // // //                 />
// // // //             )}

// // // //             {/* QUICK-ADD MENTOR MODAL */}
// // // //             {isMentorModalOpen && (
// // // //                 <MentorModal
// // // //                     employerId={activeMentorEmpId}
// // // //                     onClose={() => setIsMentorModalOpen(false)}
// // // //                     onSaved={async () => {
// // // //                         await fetchStaff(true);
// // // //                     }}
// // // //                     addStaff={addStaff}
// // // //                 />
// // // //             )}

// // // //             {/* MAIN PLACEMENT MODAL */}
// // // //             {isCreateModalOpen && (
// // // //                 <GlobalCreatePlacementModal
// // // //                     employers={employers}
// // // //                     mentors={mentors}
// // // //                     learners={learners.filter(l => !l.isArchived)}
// // // //                     placements={placements}
// // // //                     cohorts={cohorts}
// // // //                     onClose={() => setIsCreateModalOpen(false)}
// // // //                     onCreate={createPlacement}
// // // //                     onAddNewMentor={(empId) => {
// // // //                         setActiveMentorEmpId(empId);
// // // //                         setIsMentorModalOpen(true);
// // // //                     }}
// // // //                 />
// // // //             )}

// // // //             {/* ── CDP STYLED METRICS RIBBON ── */}
// // // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // //                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value">{openSeats}</span>
// // // //                         <span className="cdp-stat-card__label">Open Ecosystem Seats</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // //                     <div className="cdp-stat-card__icon">
// // // //                         {nonCompliantCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// // // //                     </div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value" style={{ color: nonCompliantCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// // // //                             {nonCompliantCount}
// // // //                         </span>
// // // //                         <span className="cdp-stat-card__label">Audit Risks / Non-Compliant</span>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // //                     <div className="cdp-stat-card__icon">
// // // //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// // // //                     </div>
// // // //                     <div className="cdp-stat-card__body">
// // // //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// // // //                             {expiringSoonCount}
// // // //                         </span>
// // // //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
// // // //             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
// // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Auditor
// // // //                 </div>

// // // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

// // // //                     {/* SARS ETI Yield Framework */}
// // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // //                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}>
// // // //                             <Landmark size={22} />
// // // //                         </div>
// // // //                         <div style={{ flex: 1 }}>
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span>
// // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // //                             </div>
// // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // //                                 {formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
// // // //                             </div>
// // // //                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
// // // //                                 Annually: {formatCurrency(annualizedETIEstimate)}
// // // //                             </div>
// // // //                             {activeInsight === 'eti' && (
// // // //                                 <InsightPopup
// // // //                                     title="SARS Employment Tax Incentive"
// // // //                                     currentValue={`${formatCurrency(monthlyETITotal)}/mo`}
// // // //                                     actionSteps={[
// // // //                                         <span key="1"><strong>Live Calculation:</strong> This value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
// // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to trigger the algorithm.</span>
// // // //                                     ]}
// // // //                                     onClose={() => setActiveInsight(null)}
// // // //                                 />
// // // //                             )}
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* B-BBEE Skills Development Spend Tracker */}
// // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // //                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
// // // //                             <Wallet size={22} />
// // // //                         </div>
// // // //                         <div style={{ flex: 1 }}>
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
// // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
// // // //                             </div>
// // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // //                                 {formatCurrency(totalProjectedSpend)}
// // // //                             </div>
// // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
// // // //                             {activeInsight === 'spend' && (
// // // //                                 <InsightPopup
// // // //                                     title="Skills Target Spend"
// // // //                                     currentValue={formatCurrency(totalProjectedSpend)}
// // // //                                     actionSteps={[
// // // //                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
// // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
// // // //                                     ]}
// // // //                                     onClose={() => setActiveInsight(null)}
// // // //                                 />
// // // //                             )}
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* Equity Transformation Tracker */}
// // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // // //                             <Percent size={22} />
// // // //                         </div>
// // // //                         <div style={{ flex: 1 }}>
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span>
// // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // //                             </div>
// // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // //                                 {transformationPercentage}%
// // // //                             </div>
// // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
// // // //                             {activeInsight === 'transformation' && (
// // // //                                 <InsightPopup
// // // //                                     title="Transformation Demographic Metrics"
// // // //                                     currentValue={`${transformationPercentage}%`}
// // // //                                     actionSteps={[
// // // //                                         <span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>,
// // // //                                         <span key="2"><strong>To Optimize:</strong> Scale target allocations by requesting candidates from ACI demographic pools during future cohort intake cycles.</span>
// // // //                                     ]}
// // // //                                     onClose={() => setActiveInsight(null)}
// // // //                                 />
// // // //                             )}
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* Youth Demographics Metric */}
// // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // //                         <div style={{ background: '#ecfccb', padding: '10px', borderRadius: '50%', color: '#4d7c0f', height: 'fit-content' }}>
// // // //                             <User size={22} />
// // // //                         </div>
// // // //                         <div style={{ flex: 1 }}>
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                 <span style={{ fontSize: '0.75rem', color: '#4d7c0f', fontWeight: 700, textTransform: 'uppercase' }}>Youth Employment</span>
// // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'youth' ? null : 'youth')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4d7c0f', display: 'flex' }}><Info size={14} /></button>
// // // //                             </div>
// // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // //                                 {youthPercentage}%
// // // //                             </div>
// // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Ratio of candidates under the age of 35.</span>
// // // //                             {activeInsight === 'youth' && (
// // // //                                 <InsightPopup
// // // //                                     title="Youth Employment Metrics"
// // // //                                     currentValue={`${youthPercentage}% (Target: > 90%)`}
// // // //                                     actionSteps={[
// // // //                                         <span key="1"><strong>Demographic:</strong> Verified automatically against National ID numbers dynamically.</span>,
// // // //                                         <span key="2"><strong>Impact:</strong> Influences YES program reporting and specific skills development quotas.</span>
// // // //                                     ]}
// // // //                                     onClose={() => setActiveInsight(null)}
// // // //                                 />
// // // //                             )}
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── ADVANCED TOOLBAR ── */}
// // // //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// // // //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // //                     <Search size={15} color="var(--mlab-grey)" />
// // // //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// // // //                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// // // //                 </div>

// // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // //                     <Briefcase size={14} color="var(--mlab-grey)" />
// // // //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// // // //                         <option value="all">All Placement Types</option>
// // // //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// // // //                         <option value="Alumni Internship">Alumni Internships</option>
// // // //                         <option value="External WIL">External WIL</option>
// // // //                     </select>
// // // //                 </div>

// // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // //                     <Building2 size={14} color="var(--mlab-grey)" />
// // // //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// // // //                         <option value="all">All Host Companies</option>
// // // //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// // // //                     </select>
// // // //                 </div>

// // // //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
// // // //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={() => setShowExportMenu(!showExportMenu)}
// // // //                             disabled={enrichedAndFilteredPlacements.length === 0}
// // // //                             className="cdp-btn cdp-btn--outline"
// // // //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // // //                         >
// // // //                             <DownloadCloud size={14} /> Export Options
// // // //                         </button>

// // // //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// // // //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // // //                                 <button
// // // //                                     type="button"
// // // //                                     onClick={handleExportCSV}
// // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // //                                 >
// // // //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// // // //                                 </button>
// // // //                                 <button
// // // //                                     type="button"
// // // //                                     onClick={handleExportExcel}
// // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // //                                 >
// // // //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // // //                                 </button>
// // // //                             </div>
// // // //                         )}
// // // //                     </div>

// // // //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
// // // //                         <Plus size={14} /> New Placement
// // // //                     </button>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── PLACEMENT TABLE GRID ── */}
// // // //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// // // //                 <div className="vp-card" style={{ marginBottom: 0, background: 'whitesmoke' }}>
// // // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // // //                         <div className="vp-card-title-group">
// // // //                             <Briefcase size={18} color="var(--mlab-blue)" />
// // // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // // //                                 Global Placement Ledger
// // // //                             </h3>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc' }}>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={() => setActiveTab('active')}
// // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                         >
// // // //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // // //                         </button>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={() => setActiveTab('history')}
// // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                         >
// // // //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // // //                         </button>
// // // //                         <button
// // // //                             type="button"
// // // //                             onClick={() => setActiveTab('all')}
// // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // //                         >
// // // //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
// // // //                         </button>
// // // //                     </div>

// // // //                     <div className="mlab-table-wrap">
// // // //                         <table className="mlab-table">
// // // //                             <thead>
// // // //                                 <tr>
// // // //                                     <th>Learner Profile</th>
// // // //                                     <th>Host Workplace & Mentor</th>
// // // //                                     <th>Placement Details</th>
// // // //                                     <th>Timeline</th>
// // // //                                     <th>Status</th>
// // // //                                     <th className="cdp-th--right">Actions</th>
// // // //                                 </tr>
// // // //                             </thead>
// // // //                             <tbody>
// // // //                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => {

// // // //                                     // 🚀 THE MASTER COMPLIANCE STATE MACHINE
// // // //                                     const isAuditReady = p.hasMentor && p.compliance.isAgreementFullyExecuted;
// // // //                                     const missingItems = [];
// // // //                                     if (!p.compliance.isAgreementFullyExecuted) missingItems.push("WBLPA Contract");
// // // //                                     if (!p.hasMentor) missingItems.push("Workplace Mentor");

// // // //                                     return (
// // // //                                         <tr key={p.id}>
// // // //                                             <td>
// // // //                                                 <div className="cdp-learner-cell">
// // // //                                                     <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // //                                                     <div className="cdp-learner-cell__info">
// // // //                                                         <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // //                                                         <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // //                                                     </div>
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 <span className="cdp-placement__employer">{p.employerName}</span>
// // // //                                                 <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#64748b' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: p.hasMentor ? 500 : 700 }}>
// // // //                                                     {p.hasMentor ? (
// // // //                                                         <><User size={12} /> {p.mentorName}</>
// // // //                                                     ) : (
// // // //                                                         <><AlertTriangle size={12} /> No Mentor Assigned</>
// // // //                                                     )}
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// // // //                                                     <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>{p.placementType}</span>
// // // //                                                     {p.stipendAmount && p.stipendAmount > 0 && (
// // // //                                                         <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                             <Coins size={10} /> R{p.stipendAmount}/mo
// // // //                                                         </span>
// // // //                                                     )}
// // // //                                                     {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// // // //                                                         <button
// // // //                                                             type="button"
// // // //                                                             onClick={() => setEtiBreakdownLearner(p)}
// // // //                                                             style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// // // //                                                             title="Click to view exact SARS mathematical breakdown"
// // // //                                                         >
// // // //                                                             <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// // // //                                                         </button>
// // // //                                                     ) : (
// // // //                                                         <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}>
// // // //                                                             <AlertCircle size={10} /> Ineligible for ETI
// // // //                                                         </span>
// // // //                                                     )}
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // // //                                                     {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
// // // //                                                 </div>
// // // //                                                 {p.status.toLowerCase().includes('active') && moment(p.endDate).isBefore(moment().add(30, 'days')) && (
// // // //                                                     <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                         <AlertTriangle size={10} /> Ends &lt; 30 days
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>

// // // //                                                     {/* Operational Status (Active, Completed, Terminated) */}
// // // //                                                     <span
// // // //                                                         className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
// // // //                                                             p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
// // // //                                                             }`}
// // // //                                                         style={
// // // //                                                             p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } :
// // // //                                                                 p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}
// // // //                                                         }
// // // //                                                     >
// // // //                                                         {p.status.replace('_', ' ')}
// // // //                                                     </span>

// // // //                                                     {/* 🚀 NEW: MASTER TRAFFIC LIGHT ENGINE */}
// // // //                                                     {isAuditReady ? (
// // // //                                                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '6px', width: 'fit-content' }}>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                                                                 <ShieldCheck size={14} /> Audit Ready
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     ) : (
// // // //                                                         <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', width: 'fit-content' }}>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
// // // //                                                                 <AlertTriangle size={14} /> Non-Compliant
// // // //                                                             </div>
// // // //                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // //                                                                 {missingItems.map(m => (
// // // //                                                                     <span key={m} style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                                         <X size={10} /> Missing {m}
// // // //                                                                     </span>
// // // //                                                                 ))}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                     )}

// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             <td className="cdp-td--right">
// // // //                                                 <div className="cdp-actions">
// // // //                                                     <button
// // // //                                                         type="button"
// // // //                                                         onClick={() => setEditingPlacement(p)}
// // // //                                                         style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// // // //                                                         title="Edit Placement Details"
// // // //                                                     >
// // // //                                                         <Edit size={14} />
// // // //                                                     </button>
// // // //                                                     <button
// // // //                                                         type="button"
// // // //                                                         onClick={() => setOptionsPlacement(p)}
// // // //                                                         style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// // // //                                                         title="Placement Options"
// // // //                                                     >
// // // //                                                         <MoreVertical size={14} />
// // // //                                                     </button>
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     );
// // // //                                 }) : (
// // // //                                     <tr>
// // // //                                         <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
// // // //                                             <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// // // //                                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// // // //                                             <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// // // //                                                 {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// // // //                                                     ? "Try adjusting your filters or search query."
// // // //                                                     : "You haven't assigned any learners to host companies yet."}
// // // //                                             </p>
// // // //                                         </td>
// // // //                                     </tr>
// // // //                                 )}
// // // //                             </tbody>
// // // //                         </table>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };



// // // // // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // // // // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import { useSearchParams } from 'react-router-dom';
// // // // // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // // // // import { db, storage } from '../../../lib/firebase';
// // // // // import {
// // // // //     Briefcase, Search, Plus, Filter, AlertTriangle,
// // // // //     CheckCircle, Clock, Building2, User, FileText,
// // // // //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// // // // //     ShieldAlert, Save, Loader2, Award, Trash2,
// // // // //     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
// // // // //     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
// // // // //     Calculator, Accessibility, Layers
// // // // // } from 'lucide-react';
// // // // // import moment from 'moment';
// // // // // import * as XLSX from 'xlsx';
// // // // // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // // import type { DashboardLearner, Employer, PlacementContract } from '../../../types';
// // // // // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // // // // import Loader from '../../common/Loader/Loader';

// // // // // import '../WorkplacesManager/WorkplacesManager.css';

// // // // // /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */
// // // // // interface EnrichedPlacement extends PlacementContract {
// // // // //     placementType: string;
// // // // //     bbbeeSpendCategory: string;
// // // // //     compliance: {
// // // // //         isAgreementFullyExecuted: boolean;
// // // // //         wblpaAgreementUrl?: string;
// // // // //     };
// // // // //     learnerName: string;
// // // // //     idNumber: string;
// // // // //     equityGroup: string;
// // // // //     hasDisability: boolean;
// // // // //     employerName: string;
// // // // //     mentorName: string;
// // // // //     hasMentor: boolean;
// // // // //     isEtiEligible: boolean;
// // // // //     etiMonthlyValue: number;
// // // // //     projectedStipendSpend: number;
// // // // // }

// // // // // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // // // // interface MentorModalProps {
// // // // //     employerId: string;
// // // // //     onClose: () => void;
// // // // //     onSaved: () => void;
// // // // //     addStaff: (m: StaffMember) => Promise<void>;
// // // // // }
// // // // // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// // // // //     const toast = useToast();
// // // // //     const [saving, setSaving] = useState(false);
// // // // //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // //         e.preventDefault();
// // // // //         setSaving(true);
// // // // //         try {
// // // // //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // // // //             toast.success('Mentor created successfully!');
// // // // //             onSaved();
// // // // //             onClose();
// // // // //         } catch (err) {
// // // // //             console.error('Mentor save error:', err);
// // // // //         } finally {
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // //                 <div className="wm-modal__header wm-modal__header--green">
// // // // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // // // //                     <div>
// // // // //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// // // // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // // // //                     </div>
// // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // //                     <div className="wm-modal__body">
// // // // //                         <div className="wm-form-grid">
// // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// // // // //                                 <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
// // // // //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// // // // //                             </div>
// // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // // // //                                 <input className="wm-form-input" required type="email" placeholder="john@company.com"
// // // // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// // // // //                             </div>
// // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // //                                 <label className="wm-form-label">Phone Number</label>
// // // // //                                 <input className="wm-form-input" type="tel" placeholder="082 123 4567"
// // // // //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                     <div className="wm-modal__footer">
// // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// // // // //                         </button>
// // // // //                     </div>
// // // // //                 </form>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // /* ─── GLOBAL CREATE PLACEMENT MODAL ──────────────────────────────────────────── */
// // // // // const GlobalCreatePlacementModal: React.FC<{
// // // // //     employers: Employer[],
// // // // //     mentors: StaffMember[],
// // // // //     learners: DashboardLearner[],
// // // // //     placements: PlacementContract[],
// // // // //     cohorts: any[],
// // // // //     onClose: () => void,
// // // // //     onCreate: (data: any) => Promise<void>,
// // // // //     onAddNewMentor: (employerId: string) => void
// // // // // }> = ({ employers, mentors, learners, placements, cohorts, onClose, onCreate, onAddNewMentor }) => {
// // // // //     const toast = useToast();
// // // // //     const [saving, setSaving] = useState(false);

// // // // //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// // // // //     const [selectedCohortId, setSelectedCohortId] = useState('');
// // // // //     const [learnerSearch, setLearnerSearch] = useState('');
// // // // //     const [selectedLearners, setSelectedLearners] = useState<DashboardLearner[]>([]);

// // // // //     const [form, setForm] = useState({
// // // // //         mentorId: '',
// // // // //         placementType: 'QCTO Workplace Module',
// // // // //         startDate: '',
// // // // //         endDate: '',
// // // // //         fundingSource: 'Corporate Funded',
// // // // //         bbbeeSpendCategory: 'Category C',
// // // // //         stipendAmount: ''
// // // // //     });

// // // // //     const isQcto = form.placementType === 'QCTO Workplace Module';

// // // // //     const availableMentors = useMemo(() => {
// // // // //         if (!selectedEmployerId) return [];
// // // // //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// // // // //     }, [selectedEmployerId, mentors]);

// // // // //     // 🚀 DYNAMIC COMPLIANCE FILTER: Restricts learners based on the selected program if QCTO
// // // // //     const filteredLearners = useMemo(() => {
// // // // //         if (!learnerSearch) return [];
// // // // //         if (isQcto && !selectedCohortId) return []; // Block searching until track is mapped

// // // // //         return learners.filter(l => {
// // // // //             if (isQcto && l.cohortId !== selectedCohortId) return false;

// // // // //             const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
// // // // //             const notSelected = !selectedLearners.find(sl => sl.id === l.id);
// // // // //             return matchesSearch && notSelected;
// // // // //         }).slice(0, 5);
// // // // //     }, [learnerSearch, learners, selectedLearners, selectedCohortId, isQcto]);

// // // // //     const handleRemoveLearner = (id: string) => {
// // // // //         setSelectedLearners(prev => prev.filter(l => l.id !== id));
// // // // //     };

// // // // //     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
// // // // //     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));
// // // // //     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
// // // // //     const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

// // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // //         e.preventDefault();
// // // // //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// // // // //         if (isQcto && !selectedCohortId) return toast.error("Please assign this regulated placement to a specific Programme/Cohort.");
// // // // //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");

// // // // //         if (isOverCapacity) {
// // // // //             if (!window.confirm(`WARNING: You are exceeding the stated capacity for ${selectedEmployer?.name}. Are you sure you want to force this placement?`)) return;
// // // // //         }

// // // // //         setSaving(true);
// // // // //         try {
// // // // //             await Promise.all(selectedLearners.map(learner =>
// // // // //                 onCreate({
// // // // //                     learnerId: learner.id,
// // // // //                     employerId: selectedEmployerId,
// // // // //                     cohortId: isQcto ? selectedCohortId : '', // 🚀 Binds cohort conditionally
// // // // //                     ...form,
// // // // //                     stipendAmount: Number(form.stipendAmount) || 0,
// // // // //                     status: 'Active Placement'
// // // // //                 })
// // // // //             ));

// // // // //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// // // // //             onClose();
// // // // //         } catch (err: any) {
// // // // //             toast.error(err.message || "Failed to create placements.");
// // // // //         } finally {
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
// // // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><Network size={20} /></div>
// // // // //                     <div>
// // // // //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// // // // //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// // // // //                     </div>
// // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // //                     <div className="wm-modal__body">

// // // // //                         {/* SECTION 1: CORE PLACEMENT PARAMS */}
// // // // //                         <div className="wm-form-section">
// // // // //                             <div className="wm-form-section__label"><Building2 size={12} /> Setup Placement Ecosystem</div>
// // // // //                             <div className="wm-form-grid">
// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
// // // // //                                     <select
// // // // //                                         className="wm-form-input"
// // // // //                                         required
// // // // //                                         value={selectedEmployerId}
// // // // //                                         onChange={e => {
// // // // //                                             setSelectedEmployerId(e.target.value);
// // // // //                                             setForm(p => ({ ...p, mentorId: '' }));
// // // // //                                         }}
// // // // //                                     >
// // // // //                                         <option value="">-- Choose Host Company --</option>
// // // // //                                         {employers.filter(emp => emp.status !== 'archived').map(emp => (
// // // // //                                             <option key={emp.id} value={emp.id}>{emp.name}</option>
// // // // //                                         ))}
// // // // //                                     </select>
// // // // //                                     {selectedEmployer && (
// // // // //                                         <div style={{ marginTop: '0.75rem', padding: '0.5rem', borderRadius: '4px', background: isOverCapacity ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fecaca' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: isOverCapacity ? '#b91c1c' : '#15803d' }}>
// // // // //                                             {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
// // // // //                                             Capacity Check: {currentEmployerPlacements.length + selectedLearners.length} / {internCapacity} filled
// // // // //                                         </div>
// // // // //                                     )}
// // // // //                                 </div>
// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
// // // // //                                     <select
// // // // //                                         className="wm-form-input"
// // // // //                                         value={form.placementType}
// // // // //                                         onChange={e => {
// // // // //                                             const val = e.target.value;
// // // // //                                             setForm(p => ({ ...p, placementType: val }));
// // // // //                                             if (val !== 'QCTO Workplace Module') {
// // // // //                                                 setSelectedCohortId('');
// // // // //                                             }
// // // // //                                             setSelectedLearners([]);
// // // // //                                             setLearnerSearch('');
// // // // //                                         }}
// // // // //                                     >
// // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
// // // // //                                         <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
// // // // //                                         <option value="External WIL">External WIL (Unregulated)</option>
// // // // //                                     </select>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         {/* SECTION 2: SETA COHORT ISOLATION (CONDITIONAL) */}
// // // // //                         {isQcto && (
// // // // //                             <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// // // // //                                 <div className="wm-form-section__label"><Layers size={12} /> SETA Compliance: Link Qualification</div>
// // // // //                                 <select
// // // // //                                     className="wm-form-input"
// // // // //                                     required={isQcto}
// // // // //                                     value={selectedCohortId}
// // // // //                                     onChange={e => {
// // // // //                                         setSelectedCohortId(e.target.value);
// // // // //                                         setSelectedLearners([]);
// // // // //                                         setLearnerSearch('');
// // // // //                                     }}
// // // // //                                 >
// // // // //                                     <option value="">-- Choose Qualification / Programme --</option>
// // // // //                                     {cohorts.map(c => (
// // // // //                                         <option key={c.id} value={c.id}>{c.name}</option>
// // // // //                                     ))}
// // // // //                                 </select>
// // // // //                                 <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>This enforces strict isolation for regulated workplace logbook hours.</p>
// // // // //                             </div>
// // // // //                         )}

// // // // //                         {/* SECTION 3: LEARNER SELECTION */}
// // // // //                         <div className="wm-form-section" style={{ opacity: (!isQcto || selectedCohortId) && selectedEmployerId ? 1 : 0.5, pointerEvents: (!isQcto || selectedCohortId) && selectedEmployerId ? 'auto' : 'none' }}>
// // // // //                             <div className="wm-form-section__label"><Search size={12} /> Select Learner(s)</div>

// // // // //                             {selectedLearners.length > 0 && (
// // // // //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
// // // // //                                     {selectedLearners.map(l => (
// // // // //                                         <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
// // // // //                                             {l.fullName}
// // // // //                                             <button type="button" onClick={() => handleRemoveLearner(l.id)} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove">
// // // // //                                                 <X size={12} />
// // // // //                                             </button>
// // // // //                                         </div>
// // // // //                                     ))}
// // // // //                                 </div>
// // // // //                             )}

// // // // //                             <div style={{ position: 'relative' }}>
// // // // //                                 <input
// // // // //                                     type="text"
// // // // //                                     className="wm-form-input"
// // // // //                                     placeholder={isQcto && !selectedCohortId ? "Please select a programme first..." : "Search by Name or ID Number..."}
// // // // //                                     value={learnerSearch}
// // // // //                                     onChange={e => setLearnerSearch(e.target.value)}
// // // // //                                     disabled={isQcto && !selectedCohortId}
// // // // //                                 />
// // // // //                                 {learnerSearch && (!isQcto || selectedCohortId) && (
// // // // //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // // // //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// // // // //                                             <div
// // // // //                                                 key={l.id}
// // // // //                                                 onClick={() => { setSelectedLearners(prev => [...prev, l]); setLearnerSearch(''); }}
// // // // //                                                 style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
// // // // //                                             >
// // // // //                                                 <div>
// // // // //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// // // // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// // // // //                                                 </div>
// // // // //                                             </div>
// // // // //                                         )) : (
// // // // //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
// // // // //                                                 {isQcto ? "No unplaced candidates found in this programme." : "No candidates found."}
// // // // //                                             </div>
// // // // //                                         )}
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         {/* SECTION 4: PLACEMENT FINANCIALS */}
// // // // //                         <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 ? 'auto' : 'none' }}>
// // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Placement Details & Financials</div>
// // // // //                             <div className="wm-form-grid">
// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // // //                                         {selectedEmployerId && (
// // // // //                                             <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
// // // // //                                                 <Plus size={12} /> Quick Add Mentor
// // // // //                                             </button>
// // // // //                                         )}
// // // // //                                     </div>
// // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))}>
// // // // //                                         <option value="">-- No Mentor Assigned (Flag as Missing) --</option>
// // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // //                                     </select>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // //                                     </select>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // // //                                     <div style={{ position: 'relative' }}>
// // // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // // //                                         <input
// // // // //                                             className="wm-form-input"
// // // // //                                             type="number"
// // // // //                                             min="0"
// // // // //                                             style={{ paddingLeft: '28px' }}
// // // // //                                             placeholder="e.g. 4500"
// // // // //                                             value={form.stipendAmount}
// // // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // // //                                         />
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group">
// // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
// // // // //                                 </div>
// // // // //                                 <div className="wm-form-group">
// // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                     </div>
// // // // //                     <div className="wm-modal__footer">
// // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isQcto && !selectedCohortId)}>
// // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// // // // //                         </button>
// // // // //                     </div>
// // // // //                 </form>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // /* ─── EDIT PLACEMENT MODAL ───────────────────────────────────────────────────── */
// // // // // const EditPlacementModal: React.FC<{
// // // // //     placement: any;
// // // // //     mentors: StaffMember[];
// // // // //     cohorts: any[];
// // // // //     onClose: () => void;
// // // // //     onSaved: () => void;
// // // // // }> = ({ placement, mentors, cohorts, onClose, onSaved }) => {
// // // // //     const toast = useToast();
// // // // //     const [saving, setSaving] = useState(false);
// // // // //     const [uploadingDoc, setUploadingDoc] = useState(false);

// // // // //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// // // // //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// // // // //     const [form, setForm] = useState({
// // // // //         mentorId: placement.mentorId || '',
// // // // //         cohortId: placement.cohortId || '',
// // // // //         placementType: placement.placementType || 'QCTO Workplace Module',
// // // // //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// // // // //         stipendAmount: placement.stipendAmount || '',
// // // // //         startDate: placement.startDate || '',
// // // // //         endDate: placement.endDate || '',
// // // // //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// // // // //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// // // // //     });

// // // // //     const isQcto = form.placementType === 'QCTO Workplace Module';
// // // // //     const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');

// // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // //         e.preventDefault();
// // // // //         setSaving(true);
// // // // //         try {
// // // // //             let finalDocumentUrl = form.wblpaAgreementUrl;

// // // // //             if (uploadMode === 'upload' && selectedFile) {
// // // // //                 setUploadingDoc(true);
// // // // //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // // //                 await uploadBytes(fileRef, selectedFile);
// // // // //                 finalDocumentUrl = await getDownloadURL(fileRef);
// // // // //                 setUploadingDoc(false);
// // // // //             }

// // // // //             const batch = writeBatch(db);
// // // // //             const placementRef = doc(db, 'placements', placement.id);
// // // // //             const learnerRef = doc(db, 'learners', placement.learnerId);

// // // // //             batch.update(placementRef, {
// // // // //                 mentorId: form.mentorId,
// // // // //                 cohortId: isQcto ? form.cohortId : '', // 🚀 Strip cohort ID if switched to unregulated
// // // // //                 placementType: form.placementType,
// // // // //                 stipendAmount: Number(form.stipendAmount) || 0,
// // // // //                 startDate: form.startDate,
// // // // //                 endDate: form.endDate,
// // // // //                 compliance: {
// // // // //                     ...(placement.compliance || {}),
// // // // //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// // // // //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// // // // //                     wblpaAgreementUrl: finalDocumentUrl
// // // // //                 },
// // // // //                 updatedAt: new Date().toISOString()
// // // // //             });

// // // // //             // Sync structural pointer to learner profile
// // // // //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

// // // // //             await batch.commit();

// // // // //             toast.success("Placement details and compliance updated successfully!");

// // // // //             setTimeout(() => {
// // // // //                 onSaved();
// // // // //                 onClose();
// // // // //             }, 1200);

// // // // //         } catch (err: any) {
// // // // //             console.error(err);
// // // // //             toast.error(err.message || "Failed to update placement details.");
// // // // //             setUploadingDoc(false);
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // // //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
// // // // //                     <div>
// // // // //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// // // // //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// // // // //                     </div>
// // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// // // // //                     <div className="wm-modal__body">
// // // // //                         <div className="wm-form-section">
// // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// // // // //                             <div className="wm-form-grid">

// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">Placement Type</label>
// // // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => {
// // // // //                                         setForm(p => ({ ...p, placementType: e.target.value }));
// // // // //                                         if (e.target.value !== 'QCTO Workplace Module') {
// // // // //                                             setForm(p => ({ ...p, cohortId: '' }));
// // // // //                                         }
// // // // //                                     }} disabled={saving}>
// // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // // //                                         <option value="External WIL">External WIL</option>
// // // // //                                     </select>
// // // // //                                 </div>

// // // // //                                 {isQcto && (
// // // // //                                     <div className="wm-form-group wm-form-group--full">
// // // // //                                         <label className="wm-form-label">Programme / Qualification Linked <span className="wm-form-required">*</span></label>
// // // // //                                         <select className="wm-form-input" required={isQcto} value={form.cohortId} onChange={e => setForm(p => ({ ...p, cohortId: e.target.value }))} disabled={saving}>
// // // // //                                             <option value="">-- Needs Programme Mapping --</option>
// // // // //                                             {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// // // // //                                         </select>
// // // // //                                     </div>
// // // // //                                 )}

// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // // //                                     </div>
// // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// // // // //                                         <option value="">-- No Mentor Assigned --</option>
// // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // //                                     </select>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // // //                                     <div style={{ position: 'relative' }}>
// // // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // // //                                         <input
// // // // //                                             className="wm-form-input"
// // // // //                                             type="number"
// // // // //                                             min="0"
// // // // //                                             style={{ paddingLeft: '28px' }}
// // // // //                                             placeholder="e.g. 4500"
// // // // //                                             value={form.stipendAmount}
// // // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // // //                                             disabled={saving}
// // // // //                                         />
// // // // //                                     </div>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group">
// // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} />
// // // // //                                 </div>
// // // // //                                 <div className="wm-form-group">
// // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} />
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// // // // //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// // // // //                             <div className="wm-form-grid">
// // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // //                                     </select>
// // // // //                                 </div>

// // // // //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// // // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// // // // //                                         <input
// // // // //                                             type="checkbox"
// // // // //                                             checked={form.isAgreementFullyExecuted}
// // // // //                                             onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))}
// // // // //                                             style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }}
// // // // //                                             disabled={saving}
// // // // //                                         />
// // // // //                                         WBLPA Signed & On File
// // // // //                                     </label>
// // // // //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginTop: '12px' }}>
// // // // //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// // // // //                                             <button
// // // // //                                                 type="button"
// // // // //                                                 onClick={() => setUploadMode('link')}
// // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // //                                                 disabled={saving}
// // // // //                                             >
// // // // //                                                 <LinkIcon size={12} /> Paste Link
// // // // //                                             </button>
// // // // //                                             <button
// // // // //                                                 type="button"
// // // // //                                                 onClick={() => setUploadMode('upload')}
// // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // //                                                 disabled={saving}
// // // // //                                             >
// // // // //                                                 <UploadCloud size={12} /> Upload File
// // // // //                                             </button>
// // // // //                                         </div>

// // // // //                                         <div style={{ padding: '12px' }}>
// // // // //                                             {uploadMode === 'link' ? (
// // // // //                                                 <>
// // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label>
// // // // //                                                     <input
// // // // //                                                         className="wm-form-input"
// // // // //                                                         type="url"
// // // // //                                                         placeholder="https://drive.google.com/file/d/..."
// // // // //                                                         value={form.wblpaAgreementUrl}
// // // // //                                                         onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))}
// // // // //                                                         disabled={saving}
// // // // //                                                     />
// // // // //                                                 </>
// // // // //                                             ) : (
// // // // //                                                 <>
// // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label>
// // // // //                                                     <input
// // // // //                                                         className="wm-form-input"
// // // // //                                                         type="file"
// // // // //                                                         accept=".pdf,image/*,.doc,.docx"
// // // // //                                                         onChange={e => {
// // // // //                                                             if (e.target.files && e.target.files.length > 0) {
// // // // //                                                                 setSelectedFile(e.target.files[0]);
// // // // //                                                             }
// // // // //                                                         }}
// // // // //                                                         style={{ padding: '6px' }}
// // // // //                                                         disabled={saving}
// // // // //                                                     />
// // // // //                                                 </>
// // // // //                                             )}
// // // // //                                         </div>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                     </div>
// // // // //                     <div className="wm-modal__footer">
// // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // //                             {saving ? (
// // // // //                                 <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</>
// // // // //                             ) : (
// // // // //                                 <><Save size={13} /> Save Changes</>
// // // // //                             )}
// // // // //                         </button>
// // // // //                     </div>
// // // // //                 </form>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// // // // // const PlacementOptionsModal: React.FC<{
// // // // //     placement: any;
// // // // //     onClose: () => void;
// // // // //     onSaved: () => void;
// // // // // }> = ({ placement, onClose, onSaved }) => {
// // // // //     const toast = useToast();
// // // // //     const [processing, setProcessing] = useState(false);

// // // // //     const handleChangeStatus = async (newStatus: string) => {
// // // // //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// // // // //         setProcessing(true);
// // // // //         try {
// // // // //             await updateDoc(doc(db, 'placements', placement.id), {
// // // // //                 status: newStatus,
// // // // //                 updatedAt: new Date().toISOString()
// // // // //             });
// // // // //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// // // // //             onSaved();
// // // // //             onClose();
// // // // //         } catch (err: any) {
// // // // //             toast.error(err.message || "Failed to update status.");
// // // // //         } finally {
// // // // //             setProcessing(false);
// // // // //         }
// // // // //     };

// // // // //     const handleDeleteRecord = async () => {
// // // // //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// // // // //         setProcessing(true);
// // // // //         try {
// // // // //             await deleteDoc(doc(db, 'placements', placement.id));
// // // // //             toast.success("Placement record permanently deleted.");
// // // // //             onSaved();
// // // // //             onClose();
// // // // //         } catch (err: any) {
// // // // //             toast.error(err.message || "Failed to delete record.");
// // // // //         } finally {
// // // // //             setProcessing(false);
// // // // //         }
// // // // //     };

// // // // //     return createPortal(
// // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // // // //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706' }}><MoreVertical size={20} /></div>
// // // // //                     <div>
// // // // //                         <h2 className="wm-modal__title">Placement Options</h2>
// // // // //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// // // // //                     </div>
// // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// // // // //                 </div>

// // // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         disabled={processing || placement.status === 'Completed'}
// // // // //                         onClick={() => handleChangeStatus('Completed')}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // // //                     >
// // // // //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// // // // //                     </button>
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         disabled={processing || placement.status === 'Pending Match'}
// // // // //                         onClick={() => handleChangeStatus('Pending Match')}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // // //                     >
// // // // //                         <Clock size={16} color="#d97706" /> Revert to Pending Match
// // // // //                     </button>
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         disabled={processing || placement.status === 'Terminated'}
// // // // //                         onClick={() => handleChangeStatus('Terminated')}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}
// // // // //                     >
// // // // //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// // // // //                     </button>
// // // // //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
// // // // //                     <button
// // // // //                         type="button"
// // // // //                         disabled={processing}
// // // // //                         onClick={handleDeleteRecord}
// // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// // // // //                     >
// // // // //                         <Trash2 size={16} /> Delete Record Permanently
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>,
// // // // //         document.body
// // // // //     );
// // // // // };

// // // // // /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// // // // // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// // // // //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// // // // //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// // // // //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// // // // //                 <Activity size={16} color="#d97706" /> {title}
// // // // //             </div>
// // // // //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// // // // //         </div>
// // // // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // // // //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// // // // //         </div>
// // // // //     </div>
// // // // // );

// // // // // /* ═══════════════════════════════════════════════════════════════════════════
// // // // //    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// // // // // ═══════════════════════════════════════════════════════════════════════════ */
// // // // // export const PlacementsDashboard: React.FC = () => {
// // // // //     const toast = useToast();
// // // // //     const [searchParams] = useSearchParams();
// // // // //     const employerUrlParam = searchParams.get('employer');

// // // // //     // 🚀 BATCH EXPLOIT AND DATA FETCHERS
// // // // //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// // // // //     const cohorts = (useStore(s => (s as any).cohorts) || []) as any[];
// // // // //     const fetchCohorts = (useStore(s => (s as any).fetchCohorts) || (async () => { })) as any;

// // // // //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
// // // // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// // // // //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// // // // //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// // // // //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// // // // //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// // // // //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// // // // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// // // // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// // // // //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
// // // // //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | null>(null);

// // // // //     // 🚀 NEW: State for detailed ETI Math breakdown popup
// // // // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// // // // //     const [searchQuery, setSearchQuery] = useState('');
// // // // //     const [filterType, setFilterType] = useState('all');
// // // // //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// // // // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// // // // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // // // //     const exportMenuRef = useRef<HTMLDivElement>(null);

// // // // //     useEffect(() => {
// // // // //         const handleClickOutside = (event: MouseEvent) => {
// // // // //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// // // // //                 setShowExportMenu(false);
// // // // //             }
// // // // //         };
// // // // //         document.addEventListener('mousedown', handleClickOutside);
// // // // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // // // //     }, []);

// // // // //     useEffect(() => {
// // // // //         if (employerUrlParam) setFilterEmployer(employerUrlParam);
// // // // //     }, [employerUrlParam]);

// // // // //     useEffect(() => {
// // // // //         const loadEcosystem = async () => {
// // // // //             try {
// // // // //                 // 🚀 Sync all required matrix datasets
// // // // //                 await Promise.all([
// // // // //                     fetchPlacements(),
// // // // //                     fetchEmployers(),
// // // // //                     fetchLearners(),
// // // // //                     fetchStaff(),
// // // // //                     fetchCohorts()
// // // // //                 ]);
// // // // //             } catch (err) {
// // // // //                 toast.error("Failed to synchronize placement ecosystem data.");
// // // // //             } finally {
// // // // //                 setIsInitialLoad(false);
// // // // //             }
// // // // //         };
// // // // //         loadEcosystem();
// // // // //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff, fetchCohorts]);

// // // // //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// // // // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // // // //     // MAP AND ENRICH DATA DYNAMICALLY FROM DATABASE
// // // // //     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
// // // // //         return placements
// // // // //             .map(p => {
// // // // //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // // //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

// // // // //                 const placementRecord = p as PlacementContract & {
// // // // //                     placementType?: string,
// // // // //                     compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// // // // //                     bbbeeSpendCategory?: string,
// // // // //                     mentorId?: string,
// // // // //                     cohortId?: string
// // // // //                 };

// // // // //                 const mentor = mentors.find(m =>
// // // // //                     (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// // // // //                     (placementRecord.mentorId && m.id === placementRecord.mentorId)
// // // // //                 ) || ({} as Partial<StaffMember>);

// // // // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// // // // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// // // // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// // // // //                 // 🚀 LIVE AGE RESOLUTION FROM SA NATIONAL ID
// // // // //                 let isEtiEligible = false;
// // // // //                 if (learner.idNumber && learner.idNumber.length >= 6) {
// // // // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // // // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // // // //                     const age = new Date().getFullYear() - birthYear;
// // // // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // // // //                 }

// // // // //                 // 🚀 LIVE STIPEND MATHEMATICAL MONTH DURATION CALCULATOR
// // // // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// // // // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

// // // // //                 // 🚀 LIVE STATUTORY SLIDING-SCALE SARS ETI ENGINE DEPLOYED
// // // // //                 let etiMonthlyValue = 0;
// // // // //                 const wage = Number(p.stipendAmount) || 0;

// // // // //                 if (isEtiEligible && wage > 0) {
// // // // //                     if (wage < 2500) {
// // // // //                         etiMonthlyValue = wage * 0.60; // 60% rule
// // // // //                     } else if (wage >= 2500 && wage <= 5499) {
// // // // //                         etiMonthlyValue = 1500; // Cap rule
// // // // //                     } else if (wage >= 5500 && wage < 7500) {
// // // // //                         etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0); // Taper rule
// // // // //                     } else {
// // // // //                         etiMonthlyValue = 0; // Disqualified over R7500
// // // // //                     }
// // // // //                 }

// // // // //                 const structuredCompliance = {
// // // // //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// // // // //                         ? placementRecord.compliance.isAgreementFullyExecuted
// // // // //                         : p.wblAgreementSigned,
// // // // //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// // // // //                 };

// // // // //                 return {
// // // // //                     ...p,
// // // // //                     placementType: placementRecord.placementType || 'QCTO Workplace Module',
// // // // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// // // // //                     compliance: structuredCompliance,
// // // // //                     learnerName: learner.fullName || 'Unknown Learner',
// // // // //                     idNumber: learner.idNumber || '—',
// // // // //                     equityGroup: equity,
// // // // //                     hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
// // // // //                     employerName: employer.name || 'Unknown Company',
// // // // //                     mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// // // // //                     isEtiEligible,
// // // // //                     etiMonthlyValue,
// // // // //                     projectedStipendSpend: wage * verifiedTimeline,
// // // // //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
// // // // //                 } as EnrichedPlacement;
// // // // //             });
// // // // //     }, [placements, learners, employers, mentors]);

// // // // //     // FILTER APPLIED LIST
// // // // //     const displayedPlacements = useMemo(() => {
// // // // //         return enrichedAndFilteredPlacements
// // // // //             .filter(p => {
// // // // //                 const sLower = p.status.toLowerCase();

// // // // //                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// // // // //                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;

// // // // //                 if (searchQuery) {
// // // // //                     const q = searchQuery.toLowerCase();
// // // // //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// // // // //                 }
// // // // //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// // // // //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// // // // //                 return true;
// // // // //             })
// // // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // // //     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);


// // // // //     // KPI & CAPACITY INTELLIGENCE
// // // // //     const {
// // // // //         activeCount, expiringSoonCount, missingContractsCount, completedCount, droppedCount, openSeats,
// // // // //         transformationPercentage, disabilityPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend, absorptionRate
// // // // //     } = useMemo(() => {
// // // // //         const thirtyDaysFromNow = moment().add(30, 'days');
// // // // //         let active = 0, expiring = 0, missingContracts = 0, completed = 0, dropped = 0, absorbed = 0;

// // // // //         let blackACI = 0;
// // // // //         let disabilityCount = 0;
// // // // //         let monthlyEtiSum = 0;
// // // // //         let accumulatedSpend = 0;

// // // // //         enrichedAndFilteredPlacements.forEach(p => {
// // // // //             const statusLower = p.status.toLowerCase();
// // // // //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');

// // // // //             // Ops counts
// // // // //             if (isLive) {
// // // // //                 active++;
// // // // //                 if (statusLower.includes('active')) {
// // // // //                     if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;
// // // // //                     if (!p.compliance.isAgreementFullyExecuted) missingContracts++;
// // // // //                 }
// // // // //             } else if (statusLower.includes('complete')) {
// // // // //                 completed++;
// // // // //             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
// // // // //                 dropped++;
// // // // //             }
// // // // //             if (p.isAbsorbedPostPlacement || statusLower.includes('absorb')) absorbed++;

// // // // //             // Financial & B-BBEE
// // // // //             if (['African', 'Coloured', 'Indian', 'Black', 'ACI'].includes(p.equityGroup)) blackACI++;
// // // // //             if (p.hasDisability) disabilityCount++;
// // // // //             if (isLive) {
// // // // //                 monthlyEtiSum += p.etiMonthlyValue;
// // // // //                 accumulatedSpend += p.projectedStipendSpend;
// // // // //             }
// // // // //         });

// // // // //         // Capacity Logic
// // // // //         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
// // // // //         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);
// // // // //         const open = totalCap - active;

// // // // //         return {
// // // // //             activeCount: active,
// // // // //             expiringSoonCount: expiring,
// // // // //             missingContractsCount: missingContracts,
// // // // //             completedCount: completed,
// // // // //             droppedCount: dropped,
// // // // //             openSeats: Math.max(open, 0),

// // // // //             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // // //             disabilityPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((disabilityCount / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // // //             monthlyETITotal: monthlyEtiSum,
// // // // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // // // //             absorptionRate: completed > 0 ? Math.round((absorbed / completed) * 100) : 0,
// // // // //             totalProjectedSpend: accumulatedSpend
// // // // //         };
// // // // //     }, [enrichedAndFilteredPlacements, employers]);

// // // // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // // // //     const getExportData = () => {
// // // // //         return displayedPlacements.map(p => ({
// // // // //             "Learner Name": p.learnerName,
// // // // //             "ID Number": p.idNumber,
// // // // //             "Host Company": p.employerName,
// // // // //             "Demographic": p.equityGroup,
// // // // //             "Placement Type": p.placementType,
// // // // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // // // //             "Monthly Stipend": p.stipendAmount || 0,
// // // // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No", // 🚀 DYNAMIC NO HARDCODING
// // // // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // // // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // // // //             "Assigned Mentor": p.mentorName,
// // // // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // // //             "Contract Link": p.compliance.wblpaAgreementUrl || 'Not Uploaded',
// // // // //             "Operational Status": p.status.toUpperCase()
// // // // //         }));
// // // // //     };

// // // // //     const generateFileName = (extension: string) => {
// // // // //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// // // // //     };

// // // // //     const handleExportCSV = () => {
// // // // //         const data = getExportData();
// // // // //         if (data.length === 0) return;
// // // // //         const headers = Object.keys(data[0]);
// // // // //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// // // // //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// // // // //         const link = document.createElement('a');
// // // // //         link.href = URL.createObjectURL(blob);
// // // // //         link.setAttribute('download', generateFileName('csv'));
// // // // //         document.body.appendChild(link);
// // // // //         link.click();
// // // // //         document.body.removeChild(link);
// // // // //         setShowExportMenu(false);
// // // // //     };

// // // // //     const handleExportExcel = () => {
// // // // //         const data = getExportData();
// // // // //         if (data.length === 0) return;
// // // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // // //         const workbook = XLSX.utils.book_new();
// // // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
// // // // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // // // //         setShowExportMenu(false);
// // // // //     };

// // // // //     // 🚀 THE SARS ETI BREAKDOWN MODAL (PER LEARNER)
// // // // //     const EtiBreakdownModal = () => {
// // // // //         if (!etiBreakdownLearner) return null;
// // // // //         const wage = Number(etiBreakdownLearner.stipendAmount) || 0;
// // // // //         const eti = etiBreakdownLearner.etiMonthlyValue;
// // // // //         const annualEti = eti * 12;

// // // // //         let mathString = "";
// // // // //         if (wage < 2500) {
// // // // //             mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
// // // // //         } else if (wage >= 2500 && wage <= 5499) {
// // // // //             mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // // // //         } else if (wage >= 5500 && wage < 7500) {
// // // // //             mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
// // // // //         }

// // // // //         return (
// // // // //             <div className="wm-overlay animate-fade-in" onClick={() => setEtiBreakdownLearner(null)} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // // //                 <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// // // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// // // // //                         <div>
// // // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// // // // //                                 <Landmark size={20} /> SARS ETI Tax Rebate Audit
// // // // //                             </div>
// // // // //                             <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {etiBreakdownLearner.learnerName}</div>
// // // // //                         </div>
// // // // //                         <button type="button" onClick={() => setEtiBreakdownLearner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// // // // //                     </div>

// // // // //                     <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
// // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// // // // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// // // // //                         </div>
// // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// // // // //                             <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// // // // //                         </div>
// // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Value:</span>
// // // // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// // // // //                     <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// // // // //                         {mathString}
// // // // //                     </div>

// // // // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
// // // // //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // // //                         <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
// // // // //                             If stipend is R0 – R2,499: ETI = 60% of stipend
// // // // //                         </li>
// // // // //                         <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
// // // // //                             If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
// // // // //                         </li>
// // // // //                         <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
// // // // //                             If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
// // // // //                         </li>
// // // // //                         <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
// // // // //                             If stipend is R7,500 or more: ETI = R0
// // // // //                         </li>
// // // // //                     </ul>

// // // // //                     <button type="button" onClick={() => setEtiBreakdownLearner(null)} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
// // // // //                         Close Audit Trail
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>
// // // // //         );
// // // // //     };

// // // // //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// // // // //     return (
// // // // //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // //             {/* ACTION MODALS */}
// // // // //             {etiBreakdownLearner && <EtiBreakdownModal />}

// // // // //             {editingPlacement && (
// // // // //                 <EditPlacementModal
// // // // //                     placement={editingPlacement}
// // // // //                     mentors={mentors}
// // // // //                     cohorts={cohorts}
// // // // //                     onClose={() => setEditingPlacement(null)}
// // // // //                     onSaved={() => fetchPlacements(true)}
// // // // //                 />
// // // // //             )}

// // // // //             {optionsPlacement && (
// // // // //                 <PlacementOptionsModal
// // // // //                     placement={optionsPlacement}
// // // // //                     onClose={() => setOptionsPlacement(null)}
// // // // //                     onSaved={() => fetchPlacements(true)}
// // // // //                 />
// // // // //             )}

// // // // //             {/* QUICK-ADD MENTOR MODAL */}
// // // // //             {isMentorModalOpen && (
// // // // //                 <MentorModal
// // // // //                     employerId={activeMentorEmpId}
// // // // //                     onClose={() => setIsMentorModalOpen(false)}
// // // // //                     onSaved={async () => {
// // // // //                         await fetchStaff(true);
// // // // //                     }}
// // // // //                     addStaff={addStaff}
// // // // //                 />
// // // // //             )}

// // // // //             {/* MAIN PLACEMENT MODAL */}
// // // // //             {isCreateModalOpen && (
// // // // //                 <GlobalCreatePlacementModal
// // // // //                     employers={employers}
// // // // //                     mentors={mentors}
// // // // //                     learners={learners.filter(l => !l.isArchived)}
// // // // //                     placements={placements}
// // // // //                     cohorts={cohorts}
// // // // //                     onClose={() => setIsCreateModalOpen(false)}
// // // // //                     onCreate={createPlacement}
// // // // //                     onAddNewMentor={(empId) => {
// // // // //                         setActiveMentorEmpId(empId);
// // // // //                         setIsMentorModalOpen(true);
// // // // //                     }}
// // // // //                 />
// // // // //             )}

// // // // //             {/* ── CDP STYLED METRICS RIBBON ── */}
// // // // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // // //                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
// // // // //                     <div className="cdp-stat-card__body">
// // // // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // // // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // // //                     <div className="cdp-stat-card__body">
// // // // //                         <span className="cdp-stat-card__value">{openSeats}</span>
// // // // //                         <span className="cdp-stat-card__label">Open Ecosystem Seats</span>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // // //                     <div className="cdp-stat-card__icon">
// // // // //                         {missingContractsCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// // // // //                     </div>
// // // // //                     <div className="cdp-stat-card__body">
// // // // //                         <span className="cdp-stat-card__value" style={{ color: missingContractsCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// // // // //                             {missingContractsCount}
// // // // //                         </span>
// // // // //                         <span className="cdp-stat-card__label">Missing Signatures</span>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // // //                     <div className="cdp-stat-card__icon">
// // // // //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// // // // //                     </div>
// // // // //                     <div className="cdp-stat-card__body">
// // // // //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// // // // //                             {expiringSoonCount}
// // // // //                         </span>
// // // // //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
// // // // //             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
// // // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // // //                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Intelligence
// // // // //                 </div>

// // // // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

// // // // //                     {/* SARS ETI Yield Framework */}
// // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // //                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}>
// // // // //                             <Landmark size={22} />
// // // // //                         </div>
// // // // //                         <div style={{ flex: 1 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span>
// // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // //                             </div>
// // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // //                                 {formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
// // // // //                             </div>
// // // // //                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
// // // // //                                 Annually: {formatCurrency(annualizedETIEstimate)}
// // // // //                             </div>
// // // // //                             {activeInsight === 'eti' && (
// // // // //                                 <InsightPopup
// // // // //                                     title="SARS Employment Tax Incentive"
// // // // //                                     currentValue={`${formatCurrency(monthlyETITotal)}/mo`}
// // // // //                                     actionSteps={[
// // // // //                                         <span key="1"><strong>Live Calculation:</strong> This value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
// // // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to trigger the algorithm.</span>
// // // // //                                     ]}
// // // // //                                     onClose={() => setActiveInsight(null)}
// // // // //                                 />
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* B-BBEE Skills Development Spend Tracker */}
// // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // //                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
// // // // //                             <Wallet size={22} />
// // // // //                         </div>
// // // // //                         <div style={{ flex: 1 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
// // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
// // // // //                             </div>
// // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // //                                 {formatCurrency(totalProjectedSpend)}
// // // // //                             </div>
// // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
// // // // //                             {activeInsight === 'spend' && (
// // // // //                                 <InsightPopup
// // // // //                                     title="Skills Target Spend"
// // // // //                                     currentValue={formatCurrency(totalProjectedSpend)}
// // // // //                                     actionSteps={[
// // // // //                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
// // // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
// // // // //                                     ]}
// // // // //                                     onClose={() => setActiveInsight(null)}
// // // // //                                 />
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* Equity Transformation Tracker */}
// // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // // // //                             <Percent size={22} />
// // // // //                         </div>
// // // // //                         <div style={{ flex: 1 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span>
// // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // //                             </div>
// // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // //                                 {transformationPercentage}%
// // // // //                             </div>
// // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
// // // // //                             {activeInsight === 'transformation' && (
// // // // //                                 <InsightPopup
// // // // //                                     title="Transformation Demographic Metrics"
// // // // //                                     currentValue={`${transformationPercentage}%`}
// // // // //                                     actionSteps={[
// // // // //                                         <span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>,
// // // // //                                         <span key="2"><strong>To Optimize:</strong> Scale target allocations by requesting candidates from ACI demographic pools during future cohort intake cycles.</span>
// // // // //                                     ]}
// // // // //                                     onClose={() => setActiveInsight(null)}
// // // // //                                 />
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     {/* Disability Inclusion Metric */}
// // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // // // //                             <Accessibility size={22} />
// // // // //                         </div>
// // // // //                         <div style={{ flex: 1 }}>
// // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Disability Index</span>
// // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'disability' ? null : 'disability')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // //                             </div>
// // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // //                                 {disabilityPercentage}%
// // // // //                             </div>
// // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Headcount ratio meeting disability sub-quotas.</span>
// // // // //                             {activeInsight === 'disability' && (
// // // // //                                 <InsightPopup
// // // // //                                     title="Disability Inclusion Framework"
// // // // //                                     currentValue={`${disabilityPercentage}%`}
// // // // //                                     actionSteps={[
// // // // //                                         <span key="1"><strong>Target:</strong> &gt; 2% National Benchmark.</span>,
// // // // //                                         <span key="2"><strong>To Optimize:</strong> B-BBEE assigns 4 critical bonus points for training disabled Black people. Ensure candidates upload medical certificates into their digital profiles.</span>
// // // // //                                     ]}
// // // // //                                     onClose={() => setActiveInsight(null)}
// // // // //                                 />
// // // // //                             )}
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* ── ADVANCED TOOLBAR ── */}
// // // // //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// // // // //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // //                     <Search size={15} color="var(--mlab-grey)" />
// // // // //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// // // // //                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// // // // //                 </div>

// // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // //                     <Briefcase size={14} color="var(--mlab-grey)" />
// // // // //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// // // // //                         <option value="all">All Placement Types</option>
// // // // //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// // // // //                         <option value="Alumni Internship">Alumni Internships</option>
// // // // //                         <option value="External WIL">External WIL</option>
// // // // //                     </select>
// // // // //                 </div>

// // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // //                     <Building2 size={14} color="var(--mlab-grey)" />
// // // // //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// // // // //                         <option value="all">All Host Companies</option>
// // // // //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// // // // //                     </select>
// // // // //                 </div>

// // // // //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>

// // // // //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// // // // //                         <button
// // // // //                             type="button"
// // // // //                             onClick={() => setShowExportMenu(!showExportMenu)}
// // // // //                             disabled={enrichedAndFilteredPlacements.length === 0}
// // // // //                             className="cdp-btn cdp-btn--outline"
// // // // //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // // // //                         >
// // // // //                             <DownloadCloud size={14} /> Export Options
// // // // //                         </button>

// // // // //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// // // // //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // // // //                                 <button
// // // // //                                     type="button"
// // // // //                                     onClick={handleExportCSV}
// // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // //                                 >
// // // // //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// // // // //                                 </button>
// // // // //                                 <button
// // // // //                                     type="button"
// // // // //                                     onClick={handleExportExcel}
// // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // //                                 >
// // // // //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // // // //                                 </button>
// // // // //                             </div>
// // // // //                         )}
// // // // //                     </div>

// // // // //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
// // // // //                         <Plus size={14} /> New Placement
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* ── CDP STYLED DATA GRID ── */}
// // // // //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// // // // //                 <div className="vp-card" style={{ marginBottom: 0, background: 'whitesmoke' }}>

// // // // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // // // //                         <div className="vp-card-title-group">
// // // // //                             <Briefcase size={18} color="var(--mlab-blue)" />
// // // // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // // // //                                 Global Placement Ledger
// // // // //                             </h3>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc' }}>
// // // // //                         <button
// // // // //                             type="button"
// // // // //                             onClick={() => setActiveTab('active')}
// // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // //                         >
// // // // //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // // // //                         </button>
// // // // //                         <button
// // // // //                             type="button"
// // // // //                             onClick={() => setActiveTab('history')}
// // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // //                         >
// // // // //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // // // //                         </button>
// // // // //                         <button
// // // // //                             type="button"
// // // // //                             onClick={() => setActiveTab('all')}
// // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // //                         >
// // // // //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
// // // // //                         </button>
// // // // //                     </div>

// // // // //                     <div className="mlab-table-wrap">
// // // // //                         <table className="mlab-table">
// // // // //                             <thead>
// // // // //                                 <tr>
// // // // //                                     <th>Learner Profile</th>
// // // // //                                     <th>Host Workplace & Mentor</th>
// // // // //                                     <th>Placement Details</th>
// // // // //                                     <th>Timeline</th>
// // // // //                                     <th>Status</th>
// // // // //                                     <th className="cdp-th--right">Actions</th>
// // // // //                                 </tr>
// // // // //                             </thead>
// // // // //                             <tbody>
// // // // //                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
// // // // //                                     <tr key={p.id}>
// // // // //                                         {/* Learner Name & Identity */}
// // // // //                                         <td>
// // // // //                                             <div className="cdp-learner-cell">
// // // // //                                                 <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // // //                                                 <div className="cdp-learner-cell__info">
// // // // //                                                     <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // // //                                                     <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // // //                                                 </div>
// // // // //                                             </div>
// // // // //                                         </td>

// // // // //                                         {/* Workplace Cell */}
// // // // //                                         <td>
// // // // //                                             <span className="cdp-placement__employer">{p.employerName}</span>
// // // // //                                             <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#64748b' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: p.hasMentor ? 500 : 700 }}>
// // // // //                                                 {p.hasMentor ? (
// // // // //                                                     <><User size={12} /> {p.mentorName}</>
// // // // //                                                 ) : (
// // // // //                                                     <><AlertTriangle size={12} /> No Mentor Assigned</>
// // // // //                                                 )}
// // // // //                                             </div>
// // // // //                                         </td>

// // // // //                                         {/* Placement Type & ETI LIVE Cell */}
// // // // //                                         <td>
// // // // //                                             <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// // // // //                                                 <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>{p.placementType}</span>

// // // // //                                                 {/* 🚀 LIVE STIPEND BADGE */}
// // // // //                                                 {p.stipendAmount && p.stipendAmount > 0 && (
// // // // //                                                     <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                         <Coins size={10} /> R{p.stipendAmount}/mo
// // // // //                                                     </span>
// // // // //                                                 )}

// // // // //                                                 {/* 🚀 LIVE ETI BADGE (NO HARDCODING) & AUDIT BUTTON */}
// // // // //                                                 {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// // // // //                                                     <button
// // // // //                                                         type="button"
// // // // //                                                         onClick={() => setEtiBreakdownLearner(p)}
// // // // //                                                         style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// // // // //                                                         title="Click to view exact SARS mathematical breakdown"
// // // // //                                                     >
// // // // //                                                         <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// // // // //                                                     </button>
// // // // //                                                 ) : (
// // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}>
// // // // //                                                         <AlertCircle size={10} /> Ineligible for ETI
// // // // //                                                     </span>
// // // // //                                                 )}
// // // // //                                             </div>
// // // // //                                         </td>

// // // // //                                         {/* Timeline Cell */}
// // // // //                                         <td>
// // // // //                                             <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // // // //                                                 {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>&rarr;</span> {formatDate(p.endDate)}
// // // // //                                             </div>
// // // // //                                             {p.status.toLowerCase().includes('active') && moment(p.endDate).isBefore(moment().add(30, 'days')) && (
// // // // //                                                 <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                     <AlertTriangle size={10} /> Ends &lt; 30 days
// // // // //                                                 </div>
// // // // //                                             )}
// // // // //                                         </td>

// // // // //                                         {/* Status Cell */}
// // // // //                                         <td>
// // // // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>

// // // // //                                                 {/* Main Operational Status Badge */}
// // // // //                                                 <span
// // // // //                                                     className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
// // // // //                                                         p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
// // // // //                                                         }`}
// // // // //                                                     style={
// // // // //                                                         p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } :
// // // // //                                                             p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}
// // // // //                                                     }
// // // // //                                                 >
// // // // //                                                     {p.status.replace('_', ' ')}
// // // // //                                                 </span>

// // // // //                                                 {/* Tripartite Contract Compliance Badge (WBLPA Tracking) */}
// // // // //                                                 {p.compliance.isAgreementFullyExecuted ? (
// // // // //                                                     p.compliance.wblpaAgreementUrl ? (
// // // // //                                                         <a
// // // // //                                                             href={p.compliance.wblpaAgreementUrl}
// // // // //                                                             target="_blank"
// // // // //                                                             rel="noopener noreferrer"
// // // // //                                                             style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
// // // // //                                                             title="Click to view signed contract document"
// // // // //                                                         >
// // // // //                                                             <CheckCircle size={10} /> WBLPA Signed & On File
// // // // //                                                         </a>
// // // // //                                                     ) : (
// // // // //                                                         <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // //                                                             <CheckCircle size={10} /> WBLPA Signed (No Link)
// // // // //                                                         </span>
// // // // //                                                     )
// // // // //                                                 ) : (
// // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // //                                                         <AlertCircle size={10} /> No WBLPA Uploaded
// // // // //                                                     </span>
// // // // //                                                 )}

// // // // //                                                 {/* Mentor Supervision Status Badge */}
// // // // //                                                 {!p.hasMentor && (
// // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // //                                                         <User size={10} /> Mentor Required
// // // // //                                                     </span>
// // // // //                                                 )}
// // // // //                                             </div>
// // // // //                                         </td>

// // // // //                                         <td className="cdp-td--right">
// // // // //                                             <div className="cdp-actions">
// // // // //                                                 <button
// // // // //                                                     type="button"
// // // // //                                                     onClick={() => setEditingPlacement(p)}
// // // // //                                                     style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// // // // //                                                     title="Edit Placement Details"
// // // // //                                                 >
// // // // //                                                     <Edit size={14} />
// // // // //                                                 </button>
// // // // //                                                 <button
// // // // //                                                     type="button"
// // // // //                                                     onClick={() => setOptionsPlacement(p)}
// // // // //                                                     style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// // // // //                                                     title="Placement Options"
// // // // //                                                 >
// // // // //                                                     <MoreVertical size={14} />
// // // // //                                                 </button>
// // // // //                                             </div>
// // // // //                                         </td>
// // // // //                                     </tr>
// // // // //                                 )) : (
// // // // //                                     <tr>
// // // // //                                         <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
// // // // //                                             <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// // // // //                                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// // // // //                                             <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// // // // //                                                 {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// // // // //                                                     ? "Try adjusting your filters or search query."
// // // // //                                                     : "You haven't assigned any learners to host companies yet."}
// // // // //                                             </p>
// // // // //                                         </td>
// // // // //                                     </tr>
// // // // //                                 )}
// // // // //                             </tbody>
// // // // //                         </table>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };


// // // // // // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // // // // // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // // // // // import { createPortal } from 'react-dom';
// // // // // // import { useSearchParams } from 'react-router-dom';
// // // // // // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // // // // // import { db, storage } from '../../../lib/firebase';
// // // // // // import {
// // // // // //     Briefcase, Search, Plus, Filter, AlertTriangle,
// // // // // //     CheckCircle, Clock, Building2, User, FileText,
// // // // // //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// // // // // //     ShieldAlert, Save, Loader2, Award, Trash2,
// // // // // //     LinkIcon, UploadCloud, FileSpreadsheet, ShieldCheck, Network, Coins,
// // // // // //     Landmark, Activity, Wallet, Percent, Lightbulb, Info,
// // // // // //     Calculator,
// // // // // //     Accessibility
// // // // // // } from 'lucide-react';
// // // // // // import moment from 'moment';
// // // // // // import * as XLSX from 'xlsx';
// // // // // // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // // // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // // // import type { DashboardLearner, Employer, PlacementContract } from '../../../types';
// // // // // // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // // // // // import Loader from '../../common/Loader/Loader';

// // // // // // import '../WorkplacesManager/WorkplacesManager.css';

// // // // // // /* ─── INTERFACES ─────────────────────────────────────────────────────────────── */
// // // // // // interface EnrichedPlacement extends PlacementContract {
// // // // // //     placementType: string;
// // // // // //     bbbeeSpendCategory: string;
// // // // // //     compliance: {
// // // // // //         isAgreementFullyExecuted: boolean;
// // // // // //         wblpaAgreementUrl?: string;
// // // // // //     };
// // // // // //     learnerName: string;
// // // // // //     idNumber: string;
// // // // // //     equityGroup: string;
// // // // // //     hasDisability: boolean;
// // // // // //     employerName: string;
// // // // // //     mentorName: string;
// // // // // //     hasMentor: boolean;
// // // // // //     isEtiEligible: boolean;
// // // // // //     etiMonthlyValue: number;
// // // // // //     projectedStipendSpend: number;
// // // // // // }

// // // // // // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // // // // // interface MentorModalProps {
// // // // // //     employerId: string;
// // // // // //     onClose: () => void;
// // // // // //     onSaved: () => void;
// // // // // //     addStaff: (m: StaffMember) => Promise<void>;
// // // // // // }
// // // // // // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// // // // // //     const toast = useToast();
// // // // // //     const [saving, setSaving] = useState(false);
// // // // // //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // //         e.preventDefault();
// // // // // //         setSaving(true);
// // // // // //         try {
// // // // // //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // // // // //             toast.success('Mentor created successfully!');
// // // // // //             onSaved();
// // // // // //             onClose();
// // // // // //         } catch (err) {
// // // // // //             console.error('Mentor save error:', err);
// // // // // //         } finally {
// // // // // //             setSaving(false);
// // // // // //         }
// // // // // //     };

// // // // // //     return createPortal(
// // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// // // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // // //                 <div className="wm-modal__header wm-modal__header--green">
// // // // // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // // // // //                     <div>
// // // // // //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// // // // // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // // // // //                     </div>
// // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // //                 </div>

// // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // // //                     <div className="wm-modal__body">
// // // // // //                         <div className="wm-form-grid">
// // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// // // // // //                                 <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
// // // // // //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// // // // // //                             </div>
// // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // // // // //                                 <input className="wm-form-input" required type="email" placeholder="john@company.com"
// // // // // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// // // // // //                             </div>
// // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // //                                 <label className="wm-form-label">Phone Number</label>
// // // // // //                                 <input className="wm-form-input" type="tel" placeholder="082 123 4567"
// // // // // //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// // // // // //                             </div>
// // // // // //                         </div>
// // // // // //                     </div>
// // // // // //                     <div className="wm-modal__footer">
// // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// // // // // //                         </button>
// // // // // //                     </div>
// // // // // //                 </form>
// // // // // //             </div>
// // // // // //         </div>,
// // // // // //         document.body
// // // // // //     );
// // // // // // };

// // // // // // /* ─── GLOBAL CREATE PLACEMENT MODAL ──────────────────────────────────────────── */
// // // // // // const GlobalCreatePlacementModal: React.FC<{
// // // // // //     employers: Employer[],
// // // // // //     mentors: StaffMember[],
// // // // // //     learners: DashboardLearner[],
// // // // // //     placements: PlacementContract[],
// // // // // //     onClose: () => void,
// // // // // //     onCreate: (data: any) => Promise<void>,
// // // // // //     onAddNewMentor: (employerId: string) => void
// // // // // // }> = ({ employers, mentors, learners, placements, onClose, onCreate, onAddNewMentor }) => {
// // // // // //     const toast = useToast();
// // // // // //     const [saving, setSaving] = useState(false);

// // // // // //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// // // // // //     const [learnerSearch, setLearnerSearch] = useState('');
// // // // // //     const [selectedLearners, setSelectedLearners] = useState<DashboardLearner[]>([]);

// // // // // //     const [form, setForm] = useState({
// // // // // //         mentorId: '',
// // // // // //         placementType: 'QCTO Workplace Module',
// // // // // //         startDate: '',
// // // // // //         endDate: '',
// // // // // //         fundingSource: 'Corporate Funded',
// // // // // //         bbbeeSpendCategory: 'Category C',
// // // // // //         stipendAmount: ''
// // // // // //     });

// // // // // //     const availableMentors = useMemo(() => {
// // // // // //         if (!selectedEmployerId) return [];
// // // // // //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// // // // // //     }, [selectedEmployerId, mentors]);

// // // // // //     const filteredLearners = useMemo(() => {
// // // // // //         if (!learnerSearch) return [];
// // // // // //         return learners.filter(l =>
// // // // // //             (l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) ||
// // // // // //                 l.idNumber?.includes(learnerSearch)) &&
// // // // // //             !selectedLearners.find(sl => sl.id === l.id)
// // // // // //         ).slice(0, 5);
// // // // // //     }, [learnerSearch, learners, selectedLearners]);

// // // // // //     const handleRemoveLearner = (id: string) => {
// // // // // //         setSelectedLearners(prev => prev.filter(l => l.id !== id));
// // // // // //     };

// // // // // //     const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
// // // // // //     const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));
// // // // // //     const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
// // // // // //     const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.length) > internCapacity;

// // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // //         e.preventDefault();
// // // // // //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// // // // // //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");

// // // // // //         if (isOverCapacity) {
// // // // // //             if (!window.confirm(`WARNING: You are exceeding the stated capacity for ${selectedEmployer?.name}. Are you sure you want to force this placement?`)) return;
// // // // // //         }

// // // // // //         setSaving(true);
// // // // // //         try {
// // // // // //             await Promise.all(selectedLearners.map(learner =>
// // // // // //                 onCreate({
// // // // // //                     learnerId: learner.id,
// // // // // //                     employerId: selectedEmployerId,
// // // // // //                     ...form,
// // // // // //                     stipendAmount: Number(form.stipendAmount) || 0,
// // // // // //                     status: 'Active Placement'
// // // // // //                 })
// // // // // //             ));

// // // // // //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// // // // // //             onClose();
// // // // // //         } catch (err: any) {
// // // // // //             toast.error(err.message || "Failed to create placements.");
// // // // // //         } finally {
// // // // // //             setSaving(false);
// // // // // //         }
// // // // // //     };

// // // // // //     return createPortal(
// // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
// // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><Network size={20} /></div>
// // // // // //                     <div>
// // // // // //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// // // // // //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// // // // // //                     </div>
// // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // //                 </div>

// // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // // //                     <div className="wm-modal__body">

// // // // // //                         <div className="wm-form-section">
// // // // // //                             <div className="wm-form-section__label"><Building2 size={12} /> 1. Select Host Company</div>
// // // // // //                             <select
// // // // // //                                 className="wm-form-input"
// // // // // //                                 required
// // // // // //                                 value={selectedEmployerId}
// // // // // //                                 onChange={e => {
// // // // // //                                     setSelectedEmployerId(e.target.value);
// // // // // //                                     setForm(p => ({ ...p, mentorId: '' }));
// // // // // //                                 }}
// // // // // //                             >
// // // // // //                                 <option value="">-- Choose Host Company --</option>
// // // // // //                                 {employers.filter(emp => emp.status !== 'archived').map(emp => (
// // // // // //                                     <option key={emp.id} value={emp.id}>{emp.name}</option>
// // // // // //                                 ))}
// // // // // //                             </select>

// // // // // //                             {selectedEmployer && (
// // // // // //                                 <div style={{ marginTop: '0.75rem', padding: '0.5rem', borderRadius: '4px', background: isOverCapacity ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fecaca' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: isOverCapacity ? '#b91c1c' : '#15803d' }}>
// // // // // //                                     {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
// // // // // //                                     Capacity Check: {currentEmployerPlacements.length + selectedLearners.length} / {internCapacity} filled
// // // // // //                                 </div>
// // // // // //                             )}
// // // // // //                         </div>

// // // // // //                         <div className="wm-form-section">
// // // // // //                             <div className="wm-form-section__label"><Search size={12} /> 2. Select Learner(s)</div>

// // // // // //                             {selectedLearners.length > 0 && (
// // // // // //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
// // // // // //                                     {selectedLearners.map(l => (
// // // // // //                                         <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
// // // // // //                                             {l.fullName}
// // // // // //                                             <button type="button" onClick={() => handleRemoveLearner(l.id)} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove">
// // // // // //                                                 <X size={12} />
// // // // // //                                             </button>
// // // // // //                                         </div>
// // // // // //                                     ))}
// // // // // //                                 </div>
// // // // // //                             )}

// // // // // //                             <div style={{ position: 'relative' }}>
// // // // // //                                 <input
// // // // // //                                     type="text"
// // // // // //                                     className="wm-form-input"
// // // // // //                                     placeholder="Search by Name or ID Number to add interns..."
// // // // // //                                     value={learnerSearch}
// // // // // //                                     onChange={e => setLearnerSearch(e.target.value)}
// // // // // //                                 />
// // // // // //                                 {learnerSearch && (
// // // // // //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // // // // //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// // // // // //                                             <div
// // // // // //                                                 key={l.id}
// // // // // //                                                 onClick={() => { setSelectedLearners(prev => [...prev, l]); setLearnerSearch(''); }}
// // // // // //                                                 style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
// // // // // //                                             >
// // // // // //                                                 <div>
// // // // // //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// // // // // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// // // // // //                                                 </div>
// // // // // //                                             </div>
// // // // // //                                         )) : (
// // // // // //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
// // // // // //                                         )}
// // // // // //                                     </div>
// // // // // //                                 )}
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// // // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> 3. Placement & Compliance Details</div>
// // // // // //                             <div className="wm-form-grid">
// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // // // //                                         {selectedEmployerId && (
// // // // // //                                             <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
// // // // // //                                                 <Plus size={12} /> Quick Add Mentor
// // // // // //                                             </button>
// // // // // //                                         )}
// // // // // //                                     </div>
// // // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))}>
// // // // // //                                         <option value="">-- No Mentor Assigned (Flag as Missing) --</option>
// // // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">Placement Type</label>
// // // // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))}>
// // // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // // // //                                         <option value="External WIL">External WIL</option>
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// // // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // // // //                                     <div style={{ position: 'relative' }}>
// // // // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // // // //                                         <input
// // // // // //                                             className="wm-form-input"
// // // // // //                                             type="number"
// // // // // //                                             min="0"
// // // // // //                                             style={{ paddingLeft: '28px' }}
// // // // // //                                             placeholder="e.g. 4500"
// // // // // //                                             value={form.stipendAmount}
// // // // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // // // //                                         />
// // // // // //                                     </div>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
// // // // // //                                 </div>
// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
// // // // // //                                 </div>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                     </div>
// // // // // //                     <div className="wm-modal__footer">
// // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving || selectedLearners.length === 0 || !selectedEmployerId}>
// // // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// // // // // //                         </button>
// // // // // //                     </div>
// // // // // //                 </form>
// // // // // //             </div>
// // // // // //         </div>,
// // // // // //         document.body
// // // // // //     );
// // // // // // };

// // // // // // /* ─── EDIT PLACEMENT MODAL ───────────────────────────────────────────────────── */
// // // // // // const EditPlacementModal: React.FC<{
// // // // // //     placement: any;
// // // // // //     mentors: StaffMember[];
// // // // // //     onClose: () => void;
// // // // // //     onSaved: () => void;
// // // // // // }> = ({ placement, mentors, onClose, onSaved }) => {
// // // // // //     const toast = useToast();
// // // // // //     const [saving, setSaving] = useState(false);
// // // // // //     const [uploadingDoc, setUploadingDoc] = useState(false);

// // // // // //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// // // // // //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// // // // // //     const [form, setForm] = useState({
// // // // // //         mentorId: placement.mentorId || '',
// // // // // //         placementType: placement.placementType || 'QCTO Workplace Module',
// // // // // //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// // // // // //         stipendAmount: placement.stipendAmount || '',
// // // // // //         startDate: placement.startDate || '',
// // // // // //         endDate: placement.endDate || '',
// // // // // //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// // // // // //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// // // // // //     });

// // // // // //     const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');

// // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // //         e.preventDefault();
// // // // // //         setSaving(true);
// // // // // //         try {
// // // // // //             let finalDocumentUrl = form.wblpaAgreementUrl;

// // // // // //             if (uploadMode === 'upload' && selectedFile) {
// // // // // //                 setUploadingDoc(true);
// // // // // //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
// // // // // //                 await uploadBytes(fileRef, selectedFile);
// // // // // //                 finalDocumentUrl = await getDownloadURL(fileRef);
// // // // // //                 setUploadingDoc(false);
// // // // // //             }

// // // // // //             const batch = writeBatch(db);
// // // // // //             const placementRef = doc(db, 'placements', placement.id);
// // // // // //             const learnerRef = doc(db, 'learners', placement.learnerId);

// // // // // //             batch.update(placementRef, {
// // // // // //                 mentorId: form.mentorId,
// // // // // //                 placementType: form.placementType,
// // // // // //                 stipendAmount: Number(form.stipendAmount) || 0,
// // // // // //                 startDate: form.startDate,
// // // // // //                 endDate: form.endDate,
// // // // // //                 compliance: {
// // // // // //                     ...(placement.compliance || {}),
// // // // // //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// // // // // //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// // // // // //                     wblpaAgreementUrl: finalDocumentUrl
// // // // // //                 },
// // // // // //                 updatedAt: new Date().toISOString()
// // // // // //             });

// // // // // //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

// // // // // //             await batch.commit();

// // // // // //             toast.success("Placement details and compliance updated successfully!");

// // // // // //             setTimeout(() => {
// // // // // //                 onSaved();
// // // // // //                 onClose();
// // // // // //             }, 1200);

// // // // // //         } catch (err: any) {
// // // // // //             console.error(err);
// // // // // //             toast.error(err.message || "Failed to update placement details.");
// // // // // //             setUploadingDoc(false);
// // // // // //             setSaving(false);
// // // // // //         }
// // // // // //     };

// // // // // //     return createPortal(
// // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
// // // // // //                     <div>
// // // // // //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// // // // // //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// // // // // //                     </div>
// // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // //                 </div>

// // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// // // // // //                     <div className="wm-modal__body">
// // // // // //                         <div className="wm-form-section">
// // // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// // // // // //                             <div className="wm-form-grid">
// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <label className="wm-form-label">Workplace Mentor</label>
// // // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// // // // // //                                         <option value="">-- No Mentor Assigned --</option>
// // // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
// // // // // //                                     <div style={{ position: 'relative' }}>
// // // // // //                                         <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
// // // // // //                                         <input
// // // // // //                                             className="wm-form-input"
// // // // // //                                             type="number"
// // // // // //                                             min="0"
// // // // // //                                             style={{ paddingLeft: '28px' }}
// // // // // //                                             placeholder="e.g. 4500"
// // // // // //                                             value={form.stipendAmount}
// // // // // //                                             onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))}
// // // // // //                                             disabled={saving}
// // // // // //                                         />
// // // // // //                                     </div>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} />
// // // // // //                                 </div>
// // // // // //                                 <div className="wm-form-group">
// // // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} />
// // // // // //                                 </div>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// // // // // //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// // // // // //                             <div className="wm-form-grid">
// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <label className="wm-form-label">Placement Type</label>
// // // // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))} disabled={saving}>
// // // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // // // //                                         <option value="External WIL">External WIL</option>
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// // // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // // //                                     </select>
// // // // // //                                 </div>

// // // // // //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// // // // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// // // // // //                                         <input
// // // // // //                                             type="checkbox"
// // // // // //                                             checked={form.isAgreementFullyExecuted}
// // // // // //                                             onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))}
// // // // // //                                             style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }}
// // // // // //                                             disabled={saving}
// // // // // //                                         />
// // // // // //                                         WBLPA Signed & On File
// // // // // //                                     </label>
// // // // // //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginTop: '12px' }}>
// // // // // //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// // // // // //                                             <button
// // // // // //                                                 type="button"
// // // // // //                                                 onClick={() => setUploadMode('link')}
// // // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // // //                                                 disabled={saving}
// // // // // //                                             >
// // // // // //                                                 <LinkIcon size={12} /> Paste Link
// // // // // //                                             </button>
// // // // // //                                             <button
// // // // // //                                                 type="button"
// // // // // //                                                 onClick={() => setUploadMode('upload')}
// // // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // // //                                                 disabled={saving}
// // // // // //                                             >
// // // // // //                                                 <UploadCloud size={12} /> Upload File
// // // // // //                                             </button>
// // // // // //                                         </div>

// // // // // //                                         <div style={{ padding: '12px' }}>
// // // // // //                                             {uploadMode === 'link' ? (
// // // // // //                                                 <>
// // // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link</label>
// // // // // //                                                     <input
// // // // // //                                                         className="wm-form-input"
// // // // // //                                                         type="url"
// // // // // //                                                         placeholder="https://drive.google.com/file/d/..."
// // // // // //                                                         value={form.wblpaAgreementUrl}
// // // // // //                                                         onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))}
// // // // // //                                                         disabled={saving}
// // // // // //                                                     />
// // // // // //                                                 </>
// // // // // //                                             ) : (
// // // // // //                                                 <>
// // // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract</label>
// // // // // //                                                     <input
// // // // // //                                                         className="wm-form-input"
// // // // // //                                                         type="file"
// // // // // //                                                         accept=".pdf,image/*,.doc,.docx"
// // // // // //                                                         onChange={e => {
// // // // // //                                                             if (e.target.files && e.target.files.length > 0) {
// // // // // //                                                                 setSelectedFile(e.target.files[0]);
// // // // // //                                                             }
// // // // // //                                                         }}
// // // // // //                                                         style={{ padding: '6px' }}
// // // // // //                                                         disabled={saving}
// // // // // //                                                     />
// // // // // //                                                 </>
// // // // // //                                             )}
// // // // // //                                         </div>
// // // // // //                                     </div>
// // // // // //                                 </div>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                     </div>
// // // // // //                     <div className="wm-modal__footer">
// // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // // //                             {saving ? (
// // // // // //                                 <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</>
// // // // // //                             ) : (
// // // // // //                                 <><Save size={13} /> Save Changes</>
// // // // // //                             )}
// // // // // //                         </button>
// // // // // //                     </div>
// // // // // //                 </form>
// // // // // //             </div>
// // // // // //         </div>,
// // // // // //         document.body
// // // // // //     );
// // // // // // };

// // // // // // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────────────────────────── */
// // // // // // const PlacementOptionsModal: React.FC<{
// // // // // //     placement: any;
// // // // // //     onClose: () => void;
// // // // // //     onSaved: () => void;
// // // // // // }> = ({ placement, onClose, onSaved }) => {
// // // // // //     const toast = useToast();
// // // // // //     const [processing, setProcessing] = useState(false);

// // // // // //     const handleChangeStatus = async (newStatus: string) => {
// // // // // //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// // // // // //         setProcessing(true);
// // // // // //         try {
// // // // // //             await updateDoc(doc(db, 'placements', placement.id), {
// // // // // //                 status: newStatus,
// // // // // //                 updatedAt: new Date().toISOString()
// // // // // //             });
// // // // // //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// // // // // //             onSaved();
// // // // // //             onClose();
// // // // // //         } catch (err: any) {
// // // // // //             toast.error(err.message || "Failed to update status.");
// // // // // //         } finally {
// // // // // //             setProcessing(false);
// // // // // //         }
// // // // // //     };

// // // // // //     const handleDeleteRecord = async () => {
// // // // // //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// // // // // //         setProcessing(true);
// // // // // //         try {
// // // // // //             await deleteDoc(doc(db, 'placements', placement.id));
// // // // // //             toast.success("Placement record permanently deleted.");
// // // // // //             onSaved();
// // // // // //             onClose();
// // // // // //         } catch (err: any) {
// // // // // //             toast.error(err.message || "Failed to delete record.");
// // // // // //         } finally {
// // // // // //             setProcessing(false);
// // // // // //         }
// // // // // //     };

// // // // // //     return createPortal(
// // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706' }}><MoreVertical size={20} /></div>
// // // // // //                     <div>
// // // // // //                         <h2 className="wm-modal__title">Placement Options</h2>
// // // // // //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// // // // // //                     </div>
// // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// // // // // //                 </div>

// // // // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // // //                     <button
// // // // // //                         type="button"
// // // // // //                         disabled={processing || placement.status === 'Completed'}
// // // // // //                         onClick={() => handleChangeStatus('Completed')}
// // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // // // //                     >
// // // // // //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// // // // // //                     </button>
// // // // // //                     <button
// // // // // //                         type="button"
// // // // // //                         disabled={processing || placement.status === 'Pending Match'}
// // // // // //                         onClick={() => handleChangeStatus('Pending Match')}
// // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)' }}
// // // // // //                     >
// // // // // //                         <Clock size={16} color="#d97706" /> Revert to Pending Match
// // // // // //                     </button>
// // // // // //                     <button
// // // // // //                         type="button"
// // // // // //                         disabled={processing || placement.status === 'Terminated'}
// // // // // //                         onClick={() => handleChangeStatus('Terminated')}
// // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c' }}
// // // // // //                     >
// // // // // //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// // // // // //                     </button>
// // // // // //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />
// // // // // //                     <button
// // // // // //                         type="button"
// // // // // //                         disabled={processing}
// // // // // //                         onClick={handleDeleteRecord}
// // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// // // // // //                     >
// // // // // //                         <Trash2 size={16} /> Delete Record Permanently
// // // // // //                     </button>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //         </div>,
// // // // // //         document.body
// // // // // //     );
// // // // // // };

// // // // // // /* ─── REUSABLE INSIGHT POPUP COMPONENT ───────────────────────────────────────── */
// // // // // // const InsightPopup = ({ title, currentValue, actionSteps, onClose }: { title: string, currentValue: string, actionSteps: React.ReactNode[], onClose: () => void }) => (
// // // // // //     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', width: '360px', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} className="animate-fade-in">
// // // // // //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
// // // // // //             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-midnight)', fontWeight: 800, fontSize: '0.85rem' }}>
// // // // // //                 <Activity size={16} color="#d97706" /> {title}
// // // // // //             </div>
// // // // // //             <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}><X size={14} /></button>
// // // // // //         </div>
// // // // // //         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
// // // // // //             {actionSteps.map((step, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{step}</div>)}
// // // // // //         </div>
// // // // // //     </div>
// // // // // // );

// // // // // // /* ═══════════════════════════════════════════════════════════════════════════
// // // // // //    MAIN COMPONENT: PLACEMENTS DASHBOARD 
// // // // // // ═══════════════════════════════════════════════════════════════════════════ */
// // // // // // export const PlacementsDashboard: React.FC = () => {
// // // // // //     const toast = useToast();
// // // // // //     const [searchParams] = useSearchParams();
// // // // // //     const employerUrlParam = searchParams.get('employer');

// // // // // //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// // // // // //     const placements = (useStore(s => (s as unknown as { placements?: PlacementContract[] }).placements) || []);
// // // // // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// // // // // //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// // // // // //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// // // // // //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// // // // // //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// // // // // //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// // // // // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// // // // // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// // // // // //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);
// // // // // //     const [activeInsight, setActiveInsight] = useState<'transformation' | 'absorption' | 'eti' | 'disability' | 'spend' | null>(null);

// // // // // //     // 🚀 NEW: State for detailed ETI Math breakdown popup
// // // // // //     const [etiBreakdownLearner, setEtiBreakdownLearner] = useState<EnrichedPlacement | null>(null);

// // // // // //     const [searchQuery, setSearchQuery] = useState('');
// // // // // //     const [filterType, setFilterType] = useState('all');
// // // // // //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// // // // // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// // // // // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // // // // //     const exportMenuRef = useRef<HTMLDivElement>(null);

// // // // // //     useEffect(() => {
// // // // // //         const handleClickOutside = (event: MouseEvent) => {
// // // // // //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// // // // // //                 setShowExportMenu(false);
// // // // // //             }
// // // // // //         };
// // // // // //         document.addEventListener('mousedown', handleClickOutside);
// // // // // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // // // // //     }, []);

// // // // // //     useEffect(() => {
// // // // // //         if (employerUrlParam) setFilterEmployer(employerUrlParam);
// // // // // //     }, [employerUrlParam]);

// // // // // //     useEffect(() => {
// // // // // //         const loadEcosystem = async () => {
// // // // // //             try {
// // // // // //                 await Promise.all([fetchPlacements(), fetchEmployers(), fetchLearners(), fetchStaff()]);
// // // // // //             } catch (err) {
// // // // // //                 toast.error("Failed to synchronize placement ecosystem data.");
// // // // // //             } finally {
// // // // // //                 setIsInitialLoad(false);
// // // // // //             }
// // // // // //         };
// // // // // //         loadEcosystem();
// // // // // //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff]);

// // // // // //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// // // // // //     const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

// // // // // //     // MAP AND ENRICH DATA DYNAMICALLY FROM DATABASE
// // // // // //     const enrichedAndFilteredPlacements = useMemo<EnrichedPlacement[]>(() => {
// // // // // //         return placements
// // // // // //             .map(p => {
// // // // // //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // // // //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);

// // // // // //                 const placementRecord = p as PlacementContract & {
// // // // // //                     placementType?: string,
// // // // // //                     compliance?: { isAgreementFullyExecuted?: boolean, wblpaAgreementUrl?: string, bbbeeSpendCategory?: string },
// // // // // //                     bbbeeSpendCategory?: string,
// // // // // //                     mentorId?: string
// // // // // //                 };

// // // // // //                 const mentor = mentors.find(m =>
// // // // // //                     (p.assignedMentorName && m.fullName === p.assignedMentorName) ||
// // // // // //                     (placementRecord.mentorId && m.id === placementRecord.mentorId)
// // // // // //                 ) || ({} as Partial<StaffMember>);

// // // // // //                 const extendedLearner = learner as Partial<DashboardLearner> & { equityGroup?: string, disabilityStatus?: string };
// // // // // //                 const equity = learner.demographics?.equityCode || extendedLearner.equityGroup || 'Unknown';
// // // // // //                 const disability = learner.demographics?.disabilityStatusCode || extendedLearner.disabilityStatus || 'No Disability';

// // // // // //                 // 🚀 LIVE AGE RESOLUTION FROM SA NATIONAL ID
// // // // // //                 let isEtiEligible = false;
// // // // // //                 if (learner.idNumber && learner.idNumber.length >= 6) {
// // // // // //                     const yearNum = parseInt(learner.idNumber.substring(0, 2), 10);
// // // // // //                     const birthYear = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
// // // // // //                     const age = new Date().getFullYear() - birthYear;
// // // // // //                     if (age >= 18 && age <= 29) isEtiEligible = true;
// // // // // //                 }

// // // // // //                 // 🚀 LIVE STIPEND MATHEMATICAL MONTH DURATION CALCULATOR
// // // // // //                 const monthsDuration = moment(p.endDate).diff(moment(p.startDate), 'months', true);
// // // // // //                 const verifiedTimeline = monthsDuration > 0 ? monthsDuration : 0;

// // // // // //                 // 🚀 LIVE STATUTORY SLIDING-SCALE SARS ETI ENGINE DEPLOYED
// // // // // //                 let etiMonthlyValue = 0;
// // // // // //                 const wage = Number(p.stipendAmount) || 0;

// // // // // //                 if (isEtiEligible && wage > 0) {
// // // // // //                     if (wage < 2500) {
// // // // // //                         etiMonthlyValue = wage * 0.60; // 60% rule
// // // // // //                     } else if (wage >= 2500 && wage <= 5499) {
// // // // // //                         etiMonthlyValue = 1500; // Cap rule
// // // // // //                     } else if (wage >= 5500 && wage < 7500) {
// // // // // //                         etiMonthlyValue = Math.max(1500 - (0.75 * (wage - 5500)), 0); // Taper rule
// // // // // //                     } else {
// // // // // //                         etiMonthlyValue = 0; // Disqualified over R7500
// // // // // //                     }
// // // // // //                 }

// // // // // //                 const structuredCompliance = {
// // // // // //                     isAgreementFullyExecuted: typeof placementRecord.compliance?.isAgreementFullyExecuted === 'boolean'
// // // // // //                         ? placementRecord.compliance.isAgreementFullyExecuted
// // // // // //                         : p.wblAgreementSigned,
// // // // // //                     wblpaAgreementUrl: placementRecord.compliance?.wblpaAgreementUrl || p.wblAgreementUrl
// // // // // //                 };

// // // // // //                 return {
// // // // // //                     ...p,
// // // // // //                     placementType: placementRecord.placementType || 'QCTO Workplace Module',
// // // // // //                     bbbeeSpendCategory: placementRecord.compliance?.bbbeeSpendCategory || placementRecord.bbbeeSpendCategory || 'Uncategorized',
// // // // // //                     compliance: structuredCompliance,
// // // // // //                     learnerName: learner.fullName || 'Unknown Learner',
// // // // // //                     idNumber: learner.idNumber || '—',
// // // // // //                     equityGroup: equity,
// // // // // //                     hasDisability: disability !== 'No Disability' && disability !== 'None' && disability !== 'N/A' && disability !== 'No',
// // // // // //                     employerName: employer.name || 'Unknown Company',
// // // // // //                     mentorName: mentor.fullName || p.assignedMentorName || 'Unassigned',
// // // // // //                     isEtiEligible,
// // // // // //                     etiMonthlyValue,
// // // // // //                     projectedStipendSpend: wage * verifiedTimeline,
// // // // // //                     hasMentor: !!(p.assignedMentorName || placementRecord.mentorId || mentor.id)
// // // // // //                 } as EnrichedPlacement;
// // // // // //             });
// // // // // //     }, [placements, learners, employers, mentors]);

// // // // // //     // FILTER APPLIED LIST
// // // // // //     const displayedPlacements = useMemo(() => {
// // // // // //         return enrichedAndFilteredPlacements
// // // // // //             .filter(p => {
// // // // // //                 const sLower = p.status.toLowerCase();

// // // // // //                 if (activeTab === 'active' && !sLower.includes('active') && !sLower.includes('pending') && !sLower.includes('interview')) return false;
// // // // // //                 if (activeTab === 'history' && !sLower.includes('complete') && !sLower.includes('terminate') && !sLower.includes('absorb')) return false;

// // // // // //                 if (searchQuery) {
// // // // // //                     const q = searchQuery.toLowerCase();
// // // // // //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// // // // // //                 }
// // // // // //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// // // // // //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// // // // // //                 return true;
// // // // // //             })
// // // // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // // // //     }, [enrichedAndFilteredPlacements, searchQuery, filterType, filterEmployer, activeTab]);


// // // // // //     // KPI & CAPACITY INTELLIGENCE
// // // // // //     const {
// // // // // //         activeCount, expiringSoonCount, missingContractsCount, completedCount, droppedCount, openSeats,
// // // // // //         transformationPercentage, disabilityPercentage, monthlyETITotal, annualizedETIEstimate, totalProjectedSpend, absorptionRate
// // // // // //     } = useMemo(() => {
// // // // // //         const thirtyDaysFromNow = moment().add(30, 'days');
// // // // // //         let active = 0, expiring = 0, missingContracts = 0, completed = 0, dropped = 0, absorbed = 0;

// // // // // //         let blackACI = 0;
// // // // // //         let disabilityCount = 0;
// // // // // //         let monthlyEtiSum = 0;
// // // // // //         let accumulatedSpend = 0;

// // // // // //         enrichedAndFilteredPlacements.forEach(p => {
// // // // // //             const statusLower = p.status.toLowerCase();
// // // // // //             const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');

// // // // // //             // Ops counts
// // // // // //             if (isLive) {
// // // // // //                 active++;
// // // // // //                 if (statusLower.includes('active')) {
// // // // // //                     if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;
// // // // // //                     if (!p.compliance.isAgreementFullyExecuted) missingContracts++;
// // // // // //                 }
// // // // // //             } else if (statusLower.includes('complete')) {
// // // // // //                 completed++;
// // // // // //             } else if (statusLower.includes('terminate') || statusLower.includes('drop')) {
// // // // // //                 dropped++;
// // // // // //             }
// // // // // //             if (p.isAbsorbedPostPlacement || statusLower.includes('absorb')) absorbed++;

// // // // // //             // Financial & B-BBEE
// // // // // //             if (['African', 'Coloured', 'Indian', 'Black', 'ACI'].includes(p.equityGroup)) blackACI++;
// // // // // //             if (p.hasDisability) disabilityCount++;
// // // // // //             if (isLive) {
// // // // // //                 monthlyEtiSum += p.etiMonthlyValue;
// // // // // //                 accumulatedSpend += p.projectedStipendSpend;
// // // // // //             }
// // // // // //         });

// // // // // //         // Capacity Logic
// // // // // //         const approvedEmployers = employers.filter(e => e.status === 'active' || e.status === 'Approved');
// // // // // //         const totalCap = approvedEmployers.reduce((acc, emp) => acc + ((emp as any).internCapacity || 1), 0);
// // // // // //         const open = totalCap - active;

// // // // // //         return {
// // // // // //             activeCount: active,
// // // // // //             expiringSoonCount: expiring,
// // // // // //             missingContractsCount: missingContracts,
// // // // // //             completedCount: completed,
// // // // // //             droppedCount: dropped,
// // // // // //             openSeats: Math.max(open, 0),

// // // // // //             transformationPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((blackACI / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // // // //             disabilityPercentage: enrichedAndFilteredPlacements.length > 0 ? Math.round((disabilityCount / enrichedAndFilteredPlacements.length) * 100) : 0,
// // // // // //             monthlyETITotal: monthlyEtiSum,
// // // // // //             annualizedETIEstimate: monthlyEtiSum * 12,
// // // // // //             absorptionRate: completed > 0 ? Math.round((absorbed / completed) * 100) : 0,
// // // // // //             totalProjectedSpend: accumulatedSpend
// // // // // //         };
// // // // // //     }, [enrichedAndFilteredPlacements, employers]);

// // // // // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // // // // //     const getExportData = () => {
// // // // // //         return displayedPlacements.map(p => ({
// // // // // //             "Learner Name": p.learnerName,
// // // // // //             "ID Number": p.idNumber,
// // // // // //             "Host Company": p.employerName,
// // // // // //             "Demographic": p.equityGroup,
// // // // // //             "Placement Type": p.placementType,
// // // // // //             "B-BBEE Category": p.bbbeeSpendCategory,
// // // // // //             "Monthly Stipend": p.stipendAmount || 0,
// // // // // //             "ETI Claim Value": p.etiMonthlyValue > 0 ? `Yes (R${p.etiMonthlyValue}/mo)` : "No", // 🚀 DYNAMIC NO HARDCODING
// // // // // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // // // // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // // // // //             "Assigned Mentor": p.mentorName,
// // // // // //             "WBLPA Contract Status": p.compliance.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // // // //             "Contract Link": p.compliance.wblpaAgreementUrl || 'Not Uploaded',
// // // // // //             "Operational Status": p.status.toUpperCase()
// // // // // //         }));
// // // // // //     };

// // // // // //     const generateFileName = (extension: string) => {
// // // // // //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// // // // // //     };

// // // // // //     const handleExportCSV = () => {
// // // // // //         const data = getExportData();
// // // // // //         if (data.length === 0) return;
// // // // // //         const headers = Object.keys(data[0]);
// // // // // //         const csvRows = data.map(row => headers.map(header => `"${(row as Record<string, unknown>)[header]}"`).join(','));
// // // // // //         const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
// // // // // //         const link = document.createElement('a');
// // // // // //         link.href = URL.createObjectURL(blob);
// // // // // //         link.setAttribute('download', generateFileName('csv'));
// // // // // //         document.body.appendChild(link);
// // // // // //         link.click();
// // // // // //         document.body.removeChild(link);
// // // // // //         setShowExportMenu(false);
// // // // // //     };

// // // // // //     const handleExportExcel = () => {
// // // // // //         const data = getExportData();
// // // // // //         if (data.length === 0) return;
// // // // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // // // //         const workbook = XLSX.utils.book_new();
// // // // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");
// // // // // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // // // // //         setShowExportMenu(false);
// // // // // //     };

// // // // // //     // 🚀 THE SARS ETI BREAKDOWN MODAL (PER LEARNER)
// // // // // //     const EtiBreakdownModal = () => {
// // // // // //         if (!etiBreakdownLearner) return null;
// // // // // //         const wage = Number(etiBreakdownLearner.stipendAmount) || 0;
// // // // // //         const eti = etiBreakdownLearner.etiMonthlyValue;
// // // // // //         const annualEti = eti * 12;

// // // // // //         let mathString = "";
// // // // // //         if (wage < 2500) {
// // // // // //             mathString = `${formatCurrency(wage)} (Stipend) × 60% = ${formatCurrency(eti)}/mo`;
// // // // // //         } else if (wage >= 2500 && wage <= 5499) {
// // // // // //             mathString = `${formatCurrency(wage)} falls in Bracket 2 -> Maximized Claim = ${formatCurrency(eti)}/mo`;
// // // // // //         } else if (wage >= 5500 && wage < 7500) {
// // // // // //             mathString = `R1,500 - (75% × (${formatCurrency(wage)} - R5,500)) = ${formatCurrency(eti)}/mo`;
// // // // // //         }

// // // // // //         return (
// // // // // //             <div className="wm-overlay animate-fade-in" onClick={() => setEtiBreakdownLearner(null)} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// // // // // //                 <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ width: '480px', background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>

// // // // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
// // // // // //                         <div>
// // // // // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800, fontSize: '1.1rem' }}>
// // // // // //                                 <Landmark size={20} /> SARS ETI Tax Rebate Audit
// // // // // //                             </div>
// // // // // //                             <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Calculated for {etiBreakdownLearner.learnerName}</div>
// // // // // //                         </div>
// // // // // //                         <button type="button" onClick={() => setEtiBreakdownLearner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
// // // // // //                     </div>

// // // // // //                     <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
// // // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Database Stipend Value:</span>
// // // // // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(wage)}</strong>
// // // // // //                         </div>
// // // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '8px' }}>
// // // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Official ETI Calculation:</span>
// // // // // //                             <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{formatCurrency(eti)} /mo</strong>
// // // // // //                         </div>
// // // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
// // // // // //                             <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Annualized Value:</span>
// // // // // //                             <strong style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)' }}>{formatCurrency(annualEti)}</strong>
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>Mathematical Formula Check:</div>
// // // // // //                     <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#3730a3', fontFamily: 'monospace', fontWeight: 600, marginBottom: '1rem' }}>
// // // // // //                         {mathString}
// // // // // //                     </div>

// // // // // //                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 700, marginBottom: '8px' }}>The SARS 2025/2026 Rules (Ages 18-29):</div>
// // // // // //                     <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // // // //                         <li style={{ color: wage > 0 && wage < 2500 ? '#16a34a' : 'inherit', fontWeight: wage > 0 && wage < 2500 ? 700 : 400 }}>
// // // // // //                             If stipend is R0 – R2,499: ETI = 60% of stipend
// // // // // //                         </li>
// // // // // //                         <li style={{ color: wage >= 2500 && wage <= 5499 ? '#16a34a' : 'inherit', fontWeight: wage >= 2500 && wage <= 5499 ? 700 : 400 }}>
// // // // // //                             If stipend is R2,500 – R5,499: ETI = R1,500 (Maximized)
// // // // // //                         </li>
// // // // // //                         <li style={{ color: wage >= 5500 && wage < 7500 ? '#16a34a' : 'inherit', fontWeight: wage >= 5500 && wage < 7500 ? 700 : 400 }}>
// // // // // //                             If stipend is R5,500 – R7,499: ETI = R1,500 - (75% of [Stipend - R5,500])
// // // // // //                         </li>
// // // // // //                         <li style={{ color: wage >= 7500 ? '#dc2626' : 'inherit', fontWeight: wage >= 7500 ? 700 : 400 }}>
// // // // // //                             If stipend is R7,500 or more: ETI = R0
// // // // // //                         </li>
// // // // // //                     </ul>

// // // // // //                     <button type="button" onClick={() => setEtiBreakdownLearner(null)} className="wm-btn wm-btn--outline" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
// // // // // //                         Close Audit Trail
// // // // // //                     </button>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //         );
// // // // // //     };

// // // // // //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// // // // // //     return (
// // // // // //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // //             {/* ACTION MODALS */}
// // // // // //             {etiBreakdownLearner && <EtiBreakdownModal />}

// // // // // //             {editingPlacement && (
// // // // // //                 <EditPlacementModal
// // // // // //                     placement={editingPlacement}
// // // // // //                     mentors={mentors}
// // // // // //                     onClose={() => setEditingPlacement(null)}
// // // // // //                     onSaved={() => fetchPlacements(true)}
// // // // // //                 />
// // // // // //             )}

// // // // // //             {optionsPlacement && (
// // // // // //                 <PlacementOptionsModal
// // // // // //                     placement={optionsPlacement}
// // // // // //                     onClose={() => setOptionsPlacement(null)}
// // // // // //                     onSaved={() => fetchPlacements(true)}
// // // // // //                 />
// // // // // //             )}

// // // // // //             {/* QUICK-ADD MENTOR MODAL */}
// // // // // //             {isMentorModalOpen && (
// // // // // //                 <MentorModal
// // // // // //                     employerId={activeMentorEmpId}
// // // // // //                     onClose={() => setIsMentorModalOpen(false)}
// // // // // //                     onSaved={async () => {
// // // // // //                         await fetchStaff(true);
// // // // // //                     }}
// // // // // //                     addStaff={addStaff}
// // // // // //                 />
// // // // // //             )}

// // // // // //             {/* MAIN PLACEMENT MODAL */}
// // // // // //             {isCreateModalOpen && (
// // // // // //                 <GlobalCreatePlacementModal
// // // // // //                     employers={employers}
// // // // // //                     mentors={mentors}
// // // // // //                     learners={learners.filter(l => !l.isArchived)}
// // // // // //                     placements={placements}
// // // // // //                     onClose={() => setIsCreateModalOpen(false)}
// // // // // //                     onCreate={createPlacement}
// // // // // //                     onAddNewMentor={(empId) => {
// // // // // //                         setActiveMentorEmpId(empId);
// // // // // //                         setIsMentorModalOpen(true);
// // // // // //                     }}
// // // // // //                 />
// // // // // //             )}

// // // // // //             {/* ── CDP STYLED METRICS RIBBON ── */}
// // // // // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // // // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // // // //                     <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
// // // // // //                     <div className="cdp-stat-card__body">
// // // // // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // // // // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // // // // //                     </div>
// // // // // //                 </div>

// // // // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // // // //                     <div className="cdp-stat-card__body">
// // // // // //                         <span className="cdp-stat-card__value">{openSeats}</span>
// // // // // //                         <span className="cdp-stat-card__label">Open Ecosystem Seats</span>
// // // // // //                     </div>
// // // // // //                 </div>

// // // // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // // // //                     <div className="cdp-stat-card__icon">
// // // // // //                         {missingContractsCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// // // // // //                     </div>
// // // // // //                     <div className="cdp-stat-card__body">
// // // // // //                         <span className="cdp-stat-card__value" style={{ color: missingContractsCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// // // // // //                             {missingContractsCount}
// // // // // //                         </span>
// // // // // //                         <span className="cdp-stat-card__label">Missing Signatures</span>
// // // // // //                     </div>
// // // // // //                 </div>

// // // // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // // // //                     <div className="cdp-stat-card__icon">
// // // // // //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// // // // // //                     </div>
// // // // // //                     <div className="cdp-stat-card__body">
// // // // // //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// // // // // //                             {expiringSoonCount}
// // // // // //                         </span>
// // // // // //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             </div>

// // // // // //             {/* ── COMPLIANCE & REBATE INTELLIGENCE GRID ── */}
// // // // // //             <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
// // // // // //                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // // // //                     <Calculator size={18} /> Ecosystem Financial & B-BBEE Scorecard Intelligence
// // // // // //                 </div>

// // // // // //                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

// // // // // //                     {/* SARS ETI Yield Framework */}
// // // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // // //                         <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '50%', color: '#16a34a', height: 'fit-content' }}>
// // // // // //                             <Landmark size={22} />
// // // // // //                         </div>
// // // // // //                         <div style={{ flex: 1 }}>
// // // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>SARS ETI Write-offs</span>
// // // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'eti' ? null : 'eti')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // // //                             </div>
// // // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // // //                                 {formatCurrency(monthlyETITotal)}<span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}> /mo</span>
// // // // // //                             </div>
// // // // // //                             <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#475569', fontWeight: 700, display: 'inline-block', marginTop: '4px' }}>
// // // // // //                                 Annually: {formatCurrency(annualizedETIEstimate)}
// // // // // //                             </div>
// // // // // //                             {activeInsight === 'eti' && (
// // // // // //                                 <InsightPopup
// // // // // //                                     title="SARS Employment Tax Incentive"
// // // // // //                                     currentValue={`${formatCurrency(monthlyETITotal)}/mo`}
// // // // // //                                     actionSteps={[
// // // // // //                                         <span key="1"><strong>Live Calculation:</strong> This value is compiled dynamically by evaluating every active learner's recorded stipend against the official SARS ETI sliding scale.</span>,
// // // // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure interns fall within the 18-29 age bracket and earn between R2,000 and R6,500 to trigger the algorithm.</span>
// // // // // //                                     ]}
// // // // // //                                     onClose={() => setActiveInsight(null)}
// // // // // //                                 />
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {/* B-BBEE Skills Development Spend Tracker */}
// // // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // // //                         <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%', color: '#4338ca', height: 'fit-content' }}>
// // // // // //                             <Wallet size={22} />
// // // // // //                         </div>
// // // // // //                         <div style={{ flex: 1 }}>
// // // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // // //                                 <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700, textTransform: 'uppercase' }}>Recognized Spend</span>
// // // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'spend' ? null : 'spend')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', display: 'flex' }}><Info size={14} /></button>
// // // // // //                             </div>
// // // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // // //                                 {formatCurrency(totalProjectedSpend)}
// // // // // //                             </div>
// // // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Projected stipend capital applied to training elements.</span>
// // // // // //                             {activeInsight === 'spend' && (
// // // // // //                                 <InsightPopup
// // // // // //                                     title="Skills Target Spend"
// // // // // //                                     currentValue={formatCurrency(totalProjectedSpend)}
// // // // // //                                     actionSteps={[
// // // // // //                                         <span key="1"><strong>Live Calculation:</strong> Multiplying recorded stipends by duration timelines.</span>,
// // // // // //                                         <span key="2"><strong>To Optimize:</strong> Ensure all placements have an accurate Stipend Amount logged in the ledger, as this counts directly toward your B-BBEE 3-6% payroll skills target.</span>
// // // // // //                                     ]}
// // // // // //                                     onClose={() => setActiveInsight(null)}
// // // // // //                                 />
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {/* Equity Transformation Tracker */}
// // // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // // // // //                             <Percent size={22} />
// // // // // //                         </div>
// // // // // //                         <div style={{ flex: 1 }}>
// // // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</span>
// // // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'transformation' ? null : 'transformation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // // //                             </div>
// // // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // // //                                 {transformationPercentage}%
// // // // // //                             </div>
// // // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Black representation allocation (ACI standard indices).</span>
// // // // // //                             {activeInsight === 'transformation' && (
// // // // // //                                 <InsightPopup
// // // // // //                                     title="Transformation Demographic Metrics"
// // // // // //                                     currentValue={`${transformationPercentage}%`}
// // // // // //                                     actionSteps={[
// // // // // //                                         <span key="1"><strong>Target:</strong> &gt; 80% Distribution.</span>,
// // // // // //                                         <span key="2"><strong>To Optimize:</strong> Scale target allocations by requesting candidates from ACI demographic pools during future cohort intake cycles.</span>
// // // // // //                                     ]}
// // // // // //                                     onClose={() => setActiveInsight(null)}
// // // // // //                                 />
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {/* Disability Inclusion Metric */}
// // // // // //                     <div style={{ position: 'relative', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', gap: '1rem' }}>
// // // // // //                         <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '50%', color: '#b45309', height: 'fit-content' }}>
// // // // // //                             <Accessibility size={22} />
// // // // // //                         </div>
// // // // // //                         <div style={{ flex: 1 }}>
// // // // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // // //                                 <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Disability Index</span>
// // // // // //                                 <button type="button" onClick={() => setActiveInsight(activeInsight === 'disability' ? null : 'disability')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', display: 'flex' }}><Info size={14} /></button>
// // // // // //                             </div>
// // // // // //                             <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', marginTop: '4px' }}>
// // // // // //                                 {disabilityPercentage}%
// // // // // //                             </div>
// // // // // //                             <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Headcount ratio meeting disability sub-quotas.</span>
// // // // // //                             {activeInsight === 'disability' && (
// // // // // //                                 <InsightPopup
// // // // // //                                     title="Disability Inclusion Framework"
// // // // // //                                     currentValue={`${disabilityPercentage}%`}
// // // // // //                                     actionSteps={[
// // // // // //                                         <span key="1"><strong>Target:</strong> &gt; 2% National Benchmark.</span>,
// // // // // //                                         <span key="2"><strong>To Optimize:</strong> B-BBEE assigns 4 critical bonus points for training disabled Black people. Ensure candidates upload medical certificates into their digital profiles.</span>
// // // // // //                                     ]}
// // // // // //                                     onClose={() => setActiveInsight(null)}
// // // // // //                                 />
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             </div>

// // // // // //             {/* ── ADVANCED TOOLBAR ── */}
// // // // // //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// // // // // //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // //                     <Search size={15} color="var(--mlab-grey)" />
// // // // // //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// // // // // //                     {searchQuery && <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// // // // // //                 </div>

// // // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // //                     <Briefcase size={14} color="var(--mlab-grey)" />
// // // // // //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// // // // // //                         <option value="all">All Placement Types</option>
// // // // // //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// // // // // //                         <option value="Alumni Internship">Alumni Internships</option>
// // // // // //                         <option value="External WIL">External WIL</option>
// // // // // //                     </select>
// // // // // //                 </div>

// // // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // //                     <Building2 size={14} color="var(--mlab-grey)" />
// // // // // //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// // // // // //                         <option value="all">All Host Companies</option>
// // // // // //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// // // // // //                     </select>
// // // // // //                 </div>

// // // // // //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>

// // // // // //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// // // // // //                         <button
// // // // // //                             type="button"
// // // // // //                             onClick={() => setShowExportMenu(!showExportMenu)}
// // // // // //                             disabled={enrichedAndFilteredPlacements.length === 0}
// // // // // //                             className="cdp-btn cdp-btn--outline"
// // // // // //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // // // // //                         >
// // // // // //                             <DownloadCloud size={14} /> Export Options
// // // // // //                         </button>

// // // // // //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// // // // // //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // // // // //                                 <button
// // // // // //                                     type="button"
// // // // // //                                     onClick={handleExportCSV}
// // // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // // //                                 >
// // // // // //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// // // // // //                                 </button>
// // // // // //                                 <button
// // // // // //                                     type="button"
// // // // // //                                     onClick={handleExportExcel}
// // // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // // //                                 >
// // // // // //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // // // // //                                 </button>
// // // // // //                             </div>
// // // // // //                         )}
// // // // // //                     </div>

// // // // // //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
// // // // // //                         <Plus size={14} /> New Placement
// // // // // //                     </button>
// // // // // //                 </div>
// // // // // //             </div>

// // // // // //             {/* ── CDP STYLED DATA GRID ── */}
// // // // // //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// // // // // //                 <div className="vp-card" style={{ marginBottom: 0, background: 'whitesmoke' }}>

// // // // // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // // // // //                         <div className="vp-card-title-group">
// // // // // //                             <Briefcase size={18} color="var(--mlab-blue)" />
// // // // // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // // // // //                                 Global Placement Ledger
// // // // // //                             </h3>
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc' }}>
// // // // // //                         <button
// // // // // //                             type="button"
// // // // // //                             onClick={() => setActiveTab('active')}
// // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // //                         >
// // // // // //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // // // // //                         </button>
// // // // // //                         <button
// // // // // //                             type="button"
// // // // // //                             onClick={() => setActiveTab('history')}
// // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // //                         >
// // // // // //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // // // // //                         </button>
// // // // // //                         <button
// // // // // //                             type="button"
// // // // // //                             onClick={() => setActiveTab('all')}
// // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // //                         >
// // // // // //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedAndFilteredPlacements.length}</span>
// // // // // //                         </button>
// // // // // //                     </div>

// // // // // //                     <div className="mlab-table-wrap">
// // // // // //                         <table className="mlab-table">
// // // // // //                             <thead>
// // // // // //                                 <tr>
// // // // // //                                     <th>Learner Profile</th>
// // // // // //                                     <th>Host Workplace & Mentor</th>
// // // // // //                                     <th>Placement Details</th>
// // // // // //                                     <th>Timeline</th>
// // // // // //                                     <th>Status</th>
// // // // // //                                     <th className="cdp-th--right">Actions</th>
// // // // // //                                 </tr>
// // // // // //                             </thead>
// // // // // //                             <tbody>
// // // // // //                                 {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
// // // // // //                                     <tr key={p.id}>
// // // // // //                                         {/* Learner Name & Identity */}
// // // // // //                                         <td>
// // // // // //                                             <div className="cdp-learner-cell">
// // // // // //                                                 <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // // // //                                                 <div className="cdp-learner-cell__info">
// // // // // //                                                     <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // // // //                                                     <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // // // //                                                 </div>
// // // // // //                                             </div>
// // // // // //                                         </td>

// // // // // //                                         {/* Workplace Cell */}
// // // // // //                                         <td>
// // // // // //                                             <span className="cdp-placement__employer">{p.employerName}</span>
// // // // // //                                             <div style={{ fontSize: '0.75rem', color: p.hasMentor ? '#64748b' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: p.hasMentor ? 500 : 700 }}>
// // // // // //                                                 {p.hasMentor ? (
// // // // // //                                                     <><User size={12} /> {p.mentorName}</>
// // // // // //                                                 ) : (
// // // // // //                                                     <><AlertTriangle size={12} /> No Mentor Assigned</>
// // // // // //                                                 )}
// // // // // //                                             </div>
// // // // // //                                         </td>

// // // // // //                                         {/* Placement Type & ETI LIVE Cell */}
// // // // // //                                         <td>
// // // // // //                                             <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// // // // // //                                                 <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>{p.placementType}</span>

// // // // // //                                                 {/* 🚀 LIVE STIPEND BADGE */}
// // // // // //                                                 {p.stipendAmount && p.stipendAmount > 0 && (
// // // // // //                                                     <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // // //                                                         <Coins size={10} /> R{p.stipendAmount}/mo
// // // // // //                                                     </span>
// // // // // //                                                 )}

// // // // // //                                                 {/* 🚀 LIVE ETI BADGE (NO HARDCODING) & AUDIT BUTTON */}
// // // // // //                                                 {p.isEtiEligible && p.etiMonthlyValue > 0 ? (
// // // // // //                                                     <button
// // // // // //                                                         type="button"
// // // // // //                                                         onClick={() => setEtiBreakdownLearner(p)}
// // // // // //                                                         style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, cursor: 'pointer' }}
// // // // // //                                                         title="Click to view exact SARS mathematical breakdown"
// // // // // //                                                     >
// // // // // //                                                         <Coins size={10} /> ETI: {formatCurrency(p.etiMonthlyValue)}/mo
// // // // // //                                                     </button>
// // // // // //                                                 ) : (
// // // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, width: 'fit-content' }}>
// // // // // //                                                         <AlertCircle size={10} /> Ineligible for ETI
// // // // // //                                                     </span>
// // // // // //                                                 )}
// // // // // //                                             </div>
// // // // // //                                         </td>

// // // // // //                                         {/* Timeline Cell */}
// // // // // //                                         <td>
// // // // // //                                             <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // // // // //                                                 {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
// // // // // //                                             </div>
// // // // // //                                             {p.status.toLowerCase().includes('active') && moment(p.endDate).isBefore(moment().add(30, 'days')) && (
// // // // // //                                                 <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // // //                                                     <AlertTriangle size={10} /> Ends &lt; 30 days
// // // // // //                                                 </div>
// // // // // //                                             )}
// // // // // //                                         </td>

// // // // // //                                         {/* Status Cell */}
// // // // // //                                         <td>
// // // // // //                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>

// // // // // //                                                 {/* Main Operational Status Badge */}
// // // // // //                                                 <span
// // // // // //                                                     className={`cdp-status-badge ${p.status.toLowerCase().includes('active') ? 'cdp-status-badge--active' :
// // // // // //                                                             p.status.toLowerCase().includes('terminate') ? 'cdp-status-badge--dropped' : ''
// // // // // //                                                         }`}
// // // // // //                                                     style={
// // // // // //                                                         p.status.toLowerCase().includes('pending') ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } :
// // // // // //                                                             p.status.toLowerCase().includes('complete') || p.status.toLowerCase().includes('absorb') ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}
// // // // // //                                                     }
// // // // // //                                                 >
// // // // // //                                                     {p.status.replace('_', ' ')}
// // // // // //                                                 </span>

// // // // // //                                                 {/* Tripartite Contract Compliance Badge (WBLPA Tracking) */}
// // // // // //                                                 {p.compliance.isAgreementFullyExecuted ? (
// // // // // //                                                     p.compliance.wblpaAgreementUrl ? (
// // // // // //                                                         <a
// // // // // //                                                             href={p.compliance.wblpaAgreementUrl}
// // // // // //                                                             target="_blank"
// // // // // //                                                             rel="noopener noreferrer"
// // // // // //                                                             style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
// // // // // //                                                             title="Click to view signed contract document"
// // // // // //                                                         >
// // // // // //                                                             <CheckCircle size={10} /> WBLPA Signed & On File
// // // // // //                                                         </a>
// // // // // //                                                     ) : (
// // // // // //                                                         <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // //                                                             <CheckCircle size={10} /> WBLPA Signed (No Link)
// // // // // //                                                         </span>
// // // // // //                                                     )
// // // // // //                                                 ) : (
// // // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // //                                                         <AlertCircle size={10} /> No WBLPA Uploaded
// // // // // //                                                     </span>
// // // // // //                                                 )}

// // // // // //                                                 {/* Mentor Supervision Status Badge */}
// // // // // //                                                 {!p.hasMentor && (
// // // // // //                                                     <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // //                                                         <User size={10} /> Mentor Required
// // // // // //                                                     </span>
// // // // // //                                                 )}
// // // // // //                                             </div>
// // // // // //                                         </td>

// // // // // //                                         <td className="cdp-td--right">
// // // // // //                                             <div className="cdp-actions">
// // // // // //                                                 <button
// // // // // //                                                     type="button"
// // // // // //                                                     onClick={() => setEditingPlacement(p)}
// // // // // //                                                     style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// // // // // //                                                     title="Edit Placement Details"
// // // // // //                                                 >
// // // // // //                                                     <Edit size={14} />
// // // // // //                                                 </button>
// // // // // //                                                 <button
// // // // // //                                                     type="button"
// // // // // //                                                     onClick={() => setOptionsPlacement(p)}
// // // // // //                                                     style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// // // // // //                                                     title="Placement Options"
// // // // // //                                                 >
// // // // // //                                                     <MoreVertical size={14} />
// // // // // //                                                 </button>
// // // // // //                                             </div>
// // // // // //                                         </td>
// // // // // //                                     </tr>
// // // // // //                                 )) : (
// // // // // //                                     <tr>
// // // // // //                                         <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
// // // // // //                                             <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// // // // // //                                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// // // // // //                                             <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// // // // // //                                                 {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// // // // // //                                                     ? "Try adjusting your filters or search query."
// // // // // //                                                     : "You haven't assigned any learners to host companies yet."}
// // // // // //                                             </p>
// // // // // //                                         </td>
// // // // // //                                     </tr>
// // // // // //                                 )}
// // // // // //                             </tbody>
// // // // // //                         </table>
// // // // // //                     </div>
// // // // // //                 </div>
// // // // // //             </div>
// // // // // //         </div>
// // // // // //     );
// // // // // // };


// // // // // // // // src/components/admin/PlacementsDashboard/PlacementsDashboard.tsx

// // // // // // // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // // // // // // import { createPortal } from 'react-dom';
// // // // // // // import { useSearchParams } from 'react-router-dom';
// // // // // // // import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
// // // // // // // import { db, storage } from '../../../lib/firebase';
// // // // // // // import {
// // // // // // //     Briefcase, Search, Plus, Filter, AlertTriangle,
// // // // // // //     CheckCircle, Clock, Building2, User, FileText,
// // // // // // //     MoreVertical, Edit, X, DownloadCloud, AlertCircle,
// // // // // // //     ShieldAlert, Save, Loader2, Award, Trash2,
// // // // // // //     LinkIcon, UploadCloud, FileSpreadsheet
// // // // // // // } from 'lucide-react';
// // // // // // // import moment from 'moment';
// // // // // // // import * as XLSX from 'xlsx';

// // // // // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // // // // import type { DashboardLearner, Employer } from '../../../types';
// // // // // // // import { useToast, ToastContainer } from '../../common/Toast/Toast';
// // // // // // // import Loader from '../../common/Loader/Loader';
// // // // // // // import type { PlacementRecord } from '../../../store/slices/placementSlice';
// // // // // // // import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

// // // // // // // /* ─── QUICK-ADD MENTOR MODAL ─────────────────────────────────────────────────── */
// // // // // // // interface MentorModalProps {
// // // // // // //     employerId: string;
// // // // // // //     onClose: () => void;
// // // // // // //     onSaved: () => void;
// // // // // // //     addStaff: (m: StaffMember) => Promise<void>;
// // // // // // // }
// // // // // // // const MentorModal: React.FC<MentorModalProps> = ({ employerId, onClose, onSaved, addStaff }) => {
// // // // // // //     const toast = useToast();
// // // // // // //     const [saving, setSaving] = useState(false);
// // // // // // //     const [form, setForm] = useState({ fullName: '', email: '', phone: '' });

// // // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // // //         e.preventDefault();
// // // // // // //         setSaving(true);
// // // // // // //         try {
// // // // // // //             await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // // // // // //             toast.success('Mentor created successfully!');
// // // // // // //             onSaved();
// // // // // // //             onClose();
// // // // // // //         } catch (err) {
// // // // // // //             console.error('Mentor save error:', err);
// // // // // // //         } finally {
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     return createPortal(
// // // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
// // // // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // // // //                 <div className="wm-modal__header wm-modal__header--green">
// // // // // // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // // // // // //                     <div>
// // // // // // //                         <h2 className="wm-modal__title">Quick-Add Mentor</h2>
// // // // // // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // // // // // //                     </div>
// // // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // // //                 </div>

// // // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // // // //                     <div className="wm-modal__body">
// // // // // // //                         <div className="wm-form-grid">
// // // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // // //                                 <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
// // // // // // //                                 <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
// // // // // // //                                     value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
// // // // // // //                             </div>
// // // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // // //                                 <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // // // // // //                                 <input className="wm-form-input" required type="email" placeholder="john@company.com"
// // // // // // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
// // // // // // //                             </div>
// // // // // // //                             <div className="wm-form-group wm-form-group--full">
// // // // // // //                                 <label className="wm-form-label">Phone Number</label>
// // // // // // //                                 <input className="wm-form-input" type="tel" placeholder="082 123 4567"
// // // // // // //                                     value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
// // // // // // //                             </div>
// // // // // // //                         </div>
// // // // // // //                     </div>
// // // // // // //                     <div className="wm-modal__footer">
// // // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
// // // // // // //                         </button>
// // // // // // //                     </div>
// // // // // // //                 </form>
// // // // // // //             </div>
// // // // // // //         </div>,
// // // // // // //         document.body
// // // // // // //     );
// // // // // // // };

// // // // // // // /* ─── GLOBAL CREATE PLACEMENT MODAL (MULTI-SELECT) ───────────────────────────── */
// // // // // // // const GlobalCreatePlacementModal: React.FC<{
// // // // // // //     employers: Employer[],
// // // // // // //     mentors: StaffMember[],
// // // // // // //     learners: DashboardLearner[],
// // // // // // //     onClose: () => void,
// // // // // // //     onCreate: (data: any) => Promise<void>,
// // // // // // //     onAddNewMentor: (employerId: string) => void
// // // // // // // }> = ({ employers, mentors, learners, onClose, onCreate, onAddNewMentor }) => {
// // // // // // //     const toast = useToast();
// // // // // // //     const [saving, setSaving] = useState(false);

// // // // // // //     const [selectedEmployerId, setSelectedEmployerId] = useState('');
// // // // // // //     const [learnerSearch, setLearnerSearch] = useState('');
// // // // // // //     const [selectedLearners, setSelectedLearners] = useState<DashboardLearner[]>([]);

// // // // // // //     const [form, setForm] = useState({
// // // // // // //         mentorId: '',
// // // // // // //         placementType: 'QCTO Workplace Module',
// // // // // // //         startDate: '',
// // // // // // //         endDate: '',
// // // // // // //         fundingSource: 'Corporate Funded',
// // // // // // //         bbbeeSpendCategory: 'Category C'
// // // // // // //     });

// // // // // // //     const availableMentors = useMemo(() => {
// // // // // // //         if (!selectedEmployerId) return [];
// // // // // // //         return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
// // // // // // //     }, [selectedEmployerId, mentors]);

// // // // // // //     const filteredLearners = useMemo(() => {
// // // // // // //         if (!learnerSearch) return [];
// // // // // // //         return learners.filter(l =>
// // // // // // //             (l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) ||
// // // // // // //                 l.idNumber?.includes(learnerSearch)) &&
// // // // // // //             !selectedLearners.find(sl => sl.id === l.id)
// // // // // // //         ).slice(0, 5);
// // // // // // //     }, [learnerSearch, learners, selectedLearners]);

// // // // // // //     const handleRemoveLearner = (id: string) => {
// // // // // // //         setSelectedLearners(prev => prev.filter(l => l.id !== id));
// // // // // // //     };

// // // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // // //         e.preventDefault();
// // // // // // //         if (!selectedEmployerId) return toast.error("Please select a Host Company.");
// // // // // // //         if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");

// // // // // // //         setSaving(true);
// // // // // // //         try {
// // // // // // //             await Promise.all(selectedLearners.map(learner =>
// // // // // // //                 onCreate({
// // // // // // //                     learnerId: learner.id,
// // // // // // //                     employerId: selectedEmployerId,
// // // // // // //                     ...form,
// // // // // // //                     status: 'active'
// // // // // // //                 })
// // // // // // //             ));

// // // // // // //             toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
// // // // // // //             onClose();
// // // // // // //         } catch (err: any) {
// // // // // // //             toast.error(err.message || "Failed to create placements.");
// // // // // // //         } finally {
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     return createPortal(
// // // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
// // // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><Briefcase size={20} /></div>
// // // // // // //                     <div>
// // // // // // //                         <h2 className="wm-modal__title">Create Global Placement</h2>
// // // // // // //                         <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
// // // // // // //                     </div>
// // // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // // //                 </div>

// // // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // // // // //                     <div className="wm-modal__body">

// // // // // // //                         <div className="wm-form-section">
// // // // // // //                             <div className="wm-form-section__label"><Building2 size={12} /> 1. Select Host Company</div>
// // // // // // //                             <select
// // // // // // //                                 className="wm-form-input"
// // // // // // //                                 required
// // // // // // //                                 value={selectedEmployerId}
// // // // // // //                                 onChange={e => {
// // // // // // //                                     setSelectedEmployerId(e.target.value);
// // // // // // //                                     setForm(p => ({ ...p, mentorId: '' }));
// // // // // // //                                 }}
// // // // // // //                             >
// // // // // // //                                 <option value="">-- Choose Host Company --</option>
// // // // // // //                                 {employers.filter(emp => emp.status !== 'archived').map(emp => (
// // // // // // //                                     <option key={emp.id} value={emp.id}>{emp.name}</option>
// // // // // // //                                 ))}
// // // // // // //                             </select>
// // // // // // //                         </div>

// // // // // // //                         <div className="wm-form-section">
// // // // // // //                             <div className="wm-form-section__label"><Search size={12} /> 2. Select Learner(s)</div>

// // // // // // //                             {selectedLearners.length > 0 && (
// // // // // // //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
// // // // // // //                                     {selectedLearners.map(l => (
// // // // // // //                                         <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
// // // // // // //                                             {l.fullName}
// // // // // // //                                             <button type="button" onClick={() => handleRemoveLearner(l.id)} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove">
// // // // // // //                                                 <X size={12} />
// // // // // // //                                             </button>
// // // // // // //                                         </div>
// // // // // // //                                     ))}
// // // // // // //                                 </div>
// // // // // // //                             )}

// // // // // // //                             <div style={{ position: 'relative' }}>
// // // // // // //                                 <input
// // // // // // //                                     type="text"
// // // // // // //                                     className="wm-form-input"
// // // // // // //                                     placeholder="Search by Name or ID Number to add interns..."
// // // // // // //                                     value={learnerSearch}
// // // // // // //                                     onChange={e => setLearnerSearch(e.target.value)}
// // // // // // //                                 />
// // // // // // //                                 {learnerSearch && (
// // // // // // //                                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
// // // // // // //                                         {filteredLearners.length > 0 ? filteredLearners.map(l => (
// // // // // // //                                             <div
// // // // // // //                                                 key={l.id}
// // // // // // //                                                 onClick={() => { setSelectedLearners(prev => [...prev, l]); setLearnerSearch(''); }}
// // // // // // //                                                 style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
// // // // // // //                                             >
// // // // // // //                                                 <div>
// // // // // // //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
// // // // // // //                                                     <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
// // // // // // //                                                 </div>
// // // // // // //                                                 <div style={{ fontSize: '0.7rem', padding: '2px 6px', background: l.enrollmentId ? '#ecfccb' : '#f1f5f9', color: l.enrollmentId ? '#4d7c0f' : '#64748b', borderRadius: '4px' }}>
// // // // // // //                                                     {l.enrollmentId ? 'Active Student' : 'External / Alumni'}
// // // // // // //                                                 </div>
// // // // // // //                                             </div>
// // // // // // //                                         )) : (
// // // // // // //                                             <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
// // // // // // //                                         )}
// // // // // // //                                     </div>
// // // // // // //                                 )}
// // // // // // //                             </div>
// // // // // // //                         </div>

// // // // // // //                         <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
// // // // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> 3. Placement & Compliance Details</div>
// // // // // // //                             <div className="wm-form-grid">
// // // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
// // // // // // //                                         <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
// // // // // // //                                         {selectedEmployerId && (
// // // // // // //                                             <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
// // // // // // //                                                 <Plus size={12} /> Quick Add Mentor
// // // // // // //                                             </button>
// // // // // // //                                         )}
// // // // // // //                                     </div>
// // // // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))}>
// // // // // // //                                         <option value="">-- No Mentor Assigned (Flag as Missing) --</option>
// // // // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // // // //                                     </select>
// // // // // // //                                     {selectedEmployerId && availableMentors.length === 0 && (
// // // // // // //                                         <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px', display: 'block' }}>This company has no mentors. You can assign one later or quick-add one above.</span>
// // // // // // //                                     )}
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">Placement Type</label>
// // // // // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))}>
// // // // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // // // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // // // // //                                         <option value="External WIL">External WIL</option>
// // // // // // //                                     </select>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
// // // // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // // // //                                     </select>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
// // // // // // //                                 </div>
// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
// // // // // // //                                 </div>
// // // // // // //                             </div>
// // // // // // //                         </div>

// // // // // // //                     </div>
// // // // // // //                     <div className="wm-modal__footer">
// // // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving || selectedLearners.length === 0 || !selectedEmployerId}>
// // // // // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
// // // // // // //                         </button>
// // // // // // //                     </div>
// // // // // // //                 </form>
// // // // // // //             </div>
// // // // // // //         </div>,
// // // // // // //         document.body
// // // // // // //     );
// // // // // // // };

// // // // // // // /* ─── EDIT PLACEMENT MODAL ─────────────────────────────────── */
// // // // // // // const EditPlacementModal: React.FC<{
// // // // // // //     placement: any;
// // // // // // //     mentors: StaffMember[];
// // // // // // //     onClose: () => void;
// // // // // // //     onSaved: () => void;
// // // // // // // }> = ({ placement, mentors, onClose, onSaved }) => {
// // // // // // //     const toast = useToast();
// // // // // // //     const [saving, setSaving] = useState(false);
// // // // // // //     const [uploadingDoc, setUploadingDoc] = useState(false);

// // // // // // //     const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
// // // // // // //     const [selectedFile, setSelectedFile] = useState<File | null>(null);

// // // // // // //     const [form, setForm] = useState({
// // // // // // //         mentorId: placement.mentorId || '',
// // // // // // //         placementType: placement.placementType || 'QCTO Workplace Module',
// // // // // // //         bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
// // // // // // //         startDate: placement.startDate || '',
// // // // // // //         endDate: placement.endDate || '',
// // // // // // //         isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
// // // // // // //         wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
// // // // // // //     });

// // // // // // //     const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');

// // // // // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // // // // //         e.preventDefault();
// // // // // // //         setSaving(true);
// // // // // // //         try {
// // // // // // //             let finalDocumentUrl = form.wblpaAgreementUrl;

// // // // // // //             if (uploadMode === 'upload' && selectedFile) {
// // // // // // //                 setUploadingDoc(true);
// // // // // // //                 const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);

// // // // // // //                 await uploadBytes(fileRef, selectedFile);
// // // // // // //                 finalDocumentUrl = await getDownloadURL(fileRef);
// // // // // // //                 setUploadingDoc(false);
// // // // // // //             }

// // // // // // //             const batch = writeBatch(db);
// // // // // // //             const placementRef = doc(db, 'placements', placement.id);
// // // // // // //             const learnerRef = doc(db, 'learners', placement.learnerId);

// // // // // // //             batch.update(placementRef, {
// // // // // // //                 mentorId: form.mentorId,
// // // // // // //                 placementType: form.placementType,
// // // // // // //                 startDate: form.startDate,
// // // // // // //                 endDate: form.endDate,
// // // // // // //                 compliance: {
// // // // // // //                     ...(placement.compliance || {}),
// // // // // // //                     bbbeeSpendCategory: form.bbbeeSpendCategory,
// // // // // // //                     isAgreementFullyExecuted: form.isAgreementFullyExecuted,
// // // // // // //                     wblpaAgreementUrl: finalDocumentUrl
// // // // // // //                 },
// // // // // // //                 updatedAt: new Date().toISOString()
// // // // // // //             });

// // // // // // //             batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

// // // // // // //             await batch.commit();

// // // // // // //             toast.success("Placement details and compliance updated successfully!");

// // // // // // //             setTimeout(() => {
// // // // // // //                 onSaved();
// // // // // // //                 onClose();
// // // // // // //             }, 1200);

// // // // // // //         } catch (err: any) {
// // // // // // //             console.error(err);
// // // // // // //             toast.error(err.message || "Failed to update placement details.");
// // // // // // //             setUploadingDoc(false);
// // // // // // //             setSaving(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     return createPortal(
// // // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // // //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
// // // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// // // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
// // // // // // //                     <div>
// // // // // // //                         <h2 className="wm-modal__title">Edit Placement Details</h2>
// // // // // // //                         <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
// // // // // // //                     </div>
// // // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // // // // //                 </div>

// // // // // // //                 <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
// // // // // // //                     <div className="wm-modal__body">

// // // // // // //                         <div className="wm-form-section">
// // // // // // //                             <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
// // // // // // //                             <div className="wm-form-grid">
// // // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // // //                                     <label className="wm-form-label">Workplace Mentor</label>
// // // // // // //                                     <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
// // // // // // //                                         <option value="">-- No Mentor Assigned --</option>
// // // // // // //                                         {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
// // // // // // //                                     </select>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
// // // // // // //                                     <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} />
// // // // // // //                                 </div>
// // // // // // //                                 <div className="wm-form-group">
// // // // // // //                                     <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
// // // // // // //                                     <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} />
// // // // // // //                                 </div>
// // // // // // //                             </div>
// // // // // // //                         </div>

// // // // // // //                         <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
// // // // // // //                             <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
// // // // // // //                             <div className="wm-form-grid">
// // // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // // //                                     <label className="wm-form-label">Placement Type</label>
// // // // // // //                                     <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))} disabled={saving}>
// // // // // // //                                         <option value="QCTO Workplace Module">QCTO Workplace Module</option>
// // // // // // //                                         <option value="Alumni Internship">Alumni Internship</option>
// // // // // // //                                         <option value="External WIL">External WIL</option>
// // // // // // //                                     </select>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group wm-form-group--full">
// // // // // // //                                     <label className="wm-form-label">B-BBEE Spend Category</label>
// // // // // // //                                     <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
// // // // // // //                                         <option value="Category B">Category B (Degree/Diploma)</option>
// // // // // // //                                         <option value="Category C">Category C (Certificate/Occupational)</option>
// // // // // // //                                         <option value="Category D">Category D (Apprenticeship)</option>
// // // // // // //                                         <option value="Category E">Category E (Work-integrated learning)</option>
// // // // // // //                                     </select>
// // // // // // //                                 </div>

// // // // // // //                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
// // // // // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
// // // // // // //                                         <input
// // // // // // //                                             type="checkbox"
// // // // // // //                                             checked={form.isAgreementFullyExecuted}
// // // // // // //                                             onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))}
// // // // // // //                                             style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }}
// // // // // // //                                             disabled={saving}
// // // // // // //                                         />
// // // // // // //                                         WBLPA Signed & On File
// // // // // // //                                     </label>
// // // // // // //                                     <p style={{ margin: '4px 0 12px 24px', fontSize: '0.75rem', color: '#64748b' }}>
// // // // // // //                                         Check this box if the tripartite agreement has been signed by the learner, employer, and institution.
// // // // // // //                                     </p>

// // // // // // //                                     <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
// // // // // // //                                         <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
// // // // // // //                                             <button
// // // // // // //                                                 type="button"
// // // // // // //                                                 onClick={() => setUploadMode('link')}
// // // // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // // // //                                                 disabled={saving}
// // // // // // //                                             >
// // // // // // //                                                 <LinkIcon size={12} /> Paste Link
// // // // // // //                                             </button>
// // // // // // //                                             <button
// // // // // // //                                                 type="button"
// // // // // // //                                                 onClick={() => setUploadMode('upload')}
// // // // // // //                                                 style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
// // // // // // //                                                 disabled={saving}
// // // // // // //                                             >
// // // // // // //                                                 <UploadCloud size={12} /> Upload File
// // // // // // //                                             </button>
// // // // // // //                                         </div>

// // // // // // //                                         <div style={{ padding: '12px' }}>
// // // // // // //                                             {uploadMode === 'link' ? (
// // // // // // //                                                 <>
// // // // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link (Google Drive, OneDrive, etc.)</label>
// // // // // // //                                                     <input
// // // // // // //                                                         className="wm-form-input"
// // // // // // //                                                         type="url"
// // // // // // //                                                         placeholder="https://drive.google.com/file/d/..."
// // // // // // //                                                         value={form.wblpaAgreementUrl}
// // // // // // //                                                         onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))}
// // // // // // //                                                         disabled={saving}
// // // // // // //                                                     />
// // // // // // //                                                 </>
// // // // // // //                                             ) : (
// // // // // // //                                                 <>
// // // // // // //                                                     <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract (PDF, PNG, JPG)</label>
// // // // // // //                                                     <input
// // // // // // //                                                         className="wm-form-input"
// // // // // // //                                                         type="file"
// // // // // // //                                                         accept=".pdf,image/*,.doc,.docx"
// // // // // // //                                                         onChange={e => {
// // // // // // //                                                             if (e.target.files && e.target.files.length > 0) {
// // // // // // //                                                                 setSelectedFile(e.target.files[0]);
// // // // // // //                                                             }
// // // // // // //                                                         }}
// // // // // // //                                                         style={{ padding: '6px' }}
// // // // // // //                                                         disabled={saving}
// // // // // // //                                                     />
// // // // // // //                                                     {form.wblpaAgreementUrl && !selectedFile && (
// // // // // // //                                                         <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // // // //                                                             <CheckCircle size={12} /> A file is already attached to this record.
// // // // // // //                                                         </div>
// // // // // // //                                                     )}
// // // // // // //                                                 </>
// // // // // // //                                             )}
// // // // // // //                                         </div>
// // // // // // //                                     </div>
// // // // // // //                                 </div>
// // // // // // //                             </div>
// // // // // // //                         </div>

// // // // // // //                     </div>
// // // // // // //                     <div className="wm-modal__footer">
// // // // // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // // // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // // // // //                             {saving ? (
// // // // // // //                                 <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</>
// // // // // // //                             ) : (
// // // // // // //                                 <><Save size={13} /> Save Changes</>
// // // // // // //                             )}
// // // // // // //                         </button>
// // // // // // //                     </div>
// // // // // // //                 </form>
// // // // // // //             </div>
// // // // // // //         </div>,
// // // // // // //         document.body
// // // // // // //     );
// // // // // // // };

// // // // // // // /* ─── PLACEMENT OPTIONS MODAL ────────────────────────────── */
// // // // // // // const PlacementOptionsModal: React.FC<{
// // // // // // //     placement: any;
// // // // // // //     onClose: () => void;
// // // // // // //     onSaved: () => void;
// // // // // // // }> = ({ placement, onClose, onSaved }) => {
// // // // // // //     const toast = useToast();
// // // // // // //     const [processing, setProcessing] = useState(false);

// // // // // // //     const handleChangeStatus = async (newStatus: string) => {
// // // // // // //         if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

// // // // // // //         setProcessing(true);
// // // // // // //         try {
// // // // // // //             await updateDoc(doc(db, 'placements', placement.id), {
// // // // // // //                 status: newStatus,
// // // // // // //                 updatedAt: new Date().toISOString()
// // // // // // //             });
// // // // // // //             toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
// // // // // // //             onSaved();
// // // // // // //             onClose();
// // // // // // //         } catch (err: any) {
// // // // // // //             toast.error(err.message || "Failed to update status.");
// // // // // // //         } finally {
// // // // // // //             setProcessing(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     const handleDeleteRecord = async () => {
// // // // // // //         if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

// // // // // // //         setProcessing(true);
// // // // // // //         try {
// // // // // // //             await deleteDoc(doc(db, 'placements', placement.id));
// // // // // // //             toast.success("Placement record permanently deleted.");
// // // // // // //             onSaved();
// // // // // // //             onClose();
// // // // // // //         } catch (err: any) {
// // // // // // //             toast.error(err.message || "Failed to delete record.");
// // // // // // //         } finally {
// // // // // // //             setProcessing(false);
// // // // // // //         }
// // // // // // //     };

// // // // // // //     return createPortal(
// // // // // // //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// // // // // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // // // // //                 <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
// // // // // // //                     <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706' }}><MoreVertical size={20} /></div>
// // // // // // //                     <div>
// // // // // // //                         <h2 className="wm-modal__title">Placement Options</h2>
// // // // // // //                         <p className="wm-modal__subtitle">{placement.learnerName}</p>
// // // // // // //                     </div>
// // // // // // //                     <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
// // // // // // //                 </div>

// // // // // // //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // // // //                     <button
// // // // // // //                         type="button"
// // // // // // //                         disabled={processing || placement.status === 'completed'}
// // // // // // //                         onClick={() => handleChangeStatus('completed')}
// // // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', opacity: placement.status === 'completed' ? 0.5 : 1 }}
// // // // // // //                     >
// // // // // // //                         <CheckCircle size={16} color="#16a34a" /> Mark as Completed
// // // // // // //                     </button>

// // // // // // //                     <button
// // // // // // //                         type="button"
// // // // // // //                         disabled={processing || placement.status === 'pending_signatures'}
// // // // // // //                         onClick={() => handleChangeStatus('pending_signatures')}
// // // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', opacity: placement.status === 'pending_signatures' ? 0.5 : 1 }}
// // // // // // //                     >
// // // // // // //                         <Clock size={16} color="#d97706" /> Revert to Pending Signatures
// // // // // // //                     </button>

// // // // // // //                     <button
// // // // // // //                         type="button"
// // // // // // //                         disabled={processing || placement.status === 'terminated'}
// // // // // // //                         onClick={() => handleChangeStatus('terminated')}
// // // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c', opacity: placement.status === 'terminated' ? 0.5 : 1 }}
// // // // // // //                     >
// // // // // // //                         <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
// // // // // // //                     </button>

// // // // // // //                     <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />

// // // // // // //                     <button
// // // // // // //                         type="button"
// // // // // // //                         disabled={processing}
// // // // // // //                         onClick={handleDeleteRecord}
// // // // // // //                         style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
// // // // // // //                     >
// // // // // // //                         <Trash2 size={16} /> Delete Record Permanently
// // // // // // //                     </button>
// // // // // // //                 </div>

// // // // // // //                 <div className="wm-modal__footer" style={{ justifyContent: 'center' }}>
// // // // // // //                     <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={processing}>Close Options</button>
// // // // // // //                 </div>
// // // // // // //             </div>
// // // // // // //         </div>,
// // // // // // //         document.body
// // // // // // //     );
// // // // // // // };

// // // // // // // /* ═══════════════════════════════════════════════════════════════════════════
// // // // // // //    MAIN COMPONENT: PLACEMENTS DASHBOARD
// // // // // // // ═══════════════════════════════════════════════════════════════════════════ */
// // // // // // // export const PlacementsDashboard: React.FC = () => {
// // // // // // //     const toast = useToast();
// // // // // // //     const [searchParams] = useSearchParams();
// // // // // // //     const employerUrlParam = searchParams.get('employer');

// // // // // // //     const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

// // // // // // //     const placements = (useStore(s => (s as any).placements) || []) as PlacementRecord[];
// // // // // // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
// // // // // // //     const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
// // // // // // //     const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

// // // // // // //     const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

// // // // // // //     // UI Modals
// // // // // // //     const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
// // // // // // //     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
// // // // // // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
// // // // // // //     const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
// // // // // // //     const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);

// // // // // // //     // Filtering State
// // // // // // //     const [searchQuery, setSearchQuery] = useState('');
// // // // // // //     const [filterType, setFilterType] = useState('all');
// // // // // // //     const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
// // // // // // //     const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

// // // // // // //     // Export State
// // // // // // //     const [showExportMenu, setShowExportMenu] = useState(false);
// // // // // // //     const exportMenuRef = useRef<HTMLDivElement>(null);

// // // // // // //     useEffect(() => {
// // // // // // //         const handleClickOutside = (event: MouseEvent) => {
// // // // // // //             if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
// // // // // // //                 setShowExportMenu(false);
// // // // // // //             }
// // // // // // //         };
// // // // // // //         document.addEventListener('mousedown', handleClickOutside);
// // // // // // //         return () => document.removeEventListener('mousedown', handleClickOutside);
// // // // // // //     }, []);

// // // // // // //     useEffect(() => {
// // // // // // //         if (employerUrlParam) setFilterEmployer(employerUrlParam);
// // // // // // //     }, [employerUrlParam]);

// // // // // // //     useEffect(() => {
// // // // // // //         const loadEcosystem = async () => {
// // // // // // //             try {
// // // // // // //                 await Promise.all([fetchPlacements(), fetchEmployers(), fetchLearners(), fetchStaff()]);
// // // // // // //             } catch (err) {
// // // // // // //                 toast.error("Failed to synchronize placement ecosystem data.");
// // // // // // //             } finally {
// // // // // // //                 setIsInitialLoad(false);
// // // // // // //             }
// // // // // // //         };
// // // // // // //         loadEcosystem();
// // // // // // //     }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff]);

// // // // // // //     const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

// // // // // // //     const { activeCount, expiringSoonCount, missingContractsCount, completedCount, droppedCount } = useMemo(() => {
// // // // // // //         const thirtyDaysFromNow = moment().add(30, 'days');
// // // // // // //         let active = 0, expiring = 0, missingContracts = 0, completed = 0, dropped = 0;

// // // // // // //         placements.forEach(p => {
// // // // // // //             if (p.status === 'active' || p.status === 'pending_signatures') {
// // // // // // //                 active++;
// // // // // // //                 if (p.status === 'active') {
// // // // // // //                     if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;
// // // // // // //                     if (!p.compliance?.isAgreementFullyExecuted) missingContracts++;
// // // // // // //                 }
// // // // // // //             } else if (p.status === 'completed') {
// // // // // // //                 completed++;
// // // // // // //             } else if (p.status === 'terminated') {
// // // // // // //                 dropped++;
// // // // // // //             }
// // // // // // //         });
// // // // // // //         return { activeCount: active, expiringSoonCount: expiring, missingContractsCount: missingContracts, completedCount: completed, droppedCount: dropped };
// // // // // // //     }, [placements]);

// // // // // // //     const enrichedAndFilteredPlacements = useMemo(() => {
// // // // // // //         return placements
// // // // // // //             .map(p => {
// // // // // // //                 const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
// // // // // // //                 const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);
// // // // // // //                 const mentor = mentors.find(m => m.id === p.mentorId) || ({} as Partial<StaffMember>);

// // // // // // //                 return {
// // // // // // //                     ...p,
// // // // // // //                     learnerName: learner.fullName || 'Unknown Learner',
// // // // // // //                     idNumber: learner.idNumber || '—',
// // // // // // //                     employerName: employer.name || 'Unknown Company',
// // // // // // //                     mentorName: mentor.fullName || 'Unassigned',
// // // // // // //                 };
// // // // // // //             })
// // // // // // //             .filter(p => {
// // // // // // //                 // Apply Tab Filter
// // // // // // //                 if (activeTab === 'active' && p.status !== 'active' && p.status !== 'pending_signatures') return false;
// // // // // // //                 if (activeTab === 'history' && p.status !== 'completed' && p.status !== 'terminated') return false;

// // // // // // //                 // Apply Search & Dropdown Filters
// // // // // // //                 if (searchQuery) {
// // // // // // //                     const q = searchQuery.toLowerCase();
// // // // // // //                     if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
// // // // // // //                 }
// // // // // // //                 if (filterType !== 'all' && p.placementType !== filterType) return false;
// // // // // // //                 if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

// // // // // // //                 return true;
// // // // // // //             })
// // // // // // //             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
// // // // // // //     }, [placements, learners, employers, mentors, searchQuery, filterType, filterEmployer, activeTab]);

// // // // // // //     const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

// // // // // // //     // EXPORT LOGIC FOR MASTER PLACEMENT DASHBOARD
// // // // // // //     const getExportData = () => {
// // // // // // //         return enrichedAndFilteredPlacements.map(p => ({
// // // // // // //             "Learner Name": p.learnerName,
// // // // // // //             "ID Number": p.idNumber,
// // // // // // //             "Host Company": p.employerName,
// // // // // // //             "Placement Type": p.placementType,
// // // // // // //             "B-BBEE Category": p.compliance?.bbbeeSpendCategory || (p as any).bbbeeSpendCategory || 'Uncategorized',
// // // // // // //             "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
// // // // // // //             "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
// // // // // // //             "Assigned Mentor": p.mentorName,
// // // // // // //             "WBLPA Contract Status": p.compliance?.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
// // // // // // //             "Contract Link": p.compliance?.wblpaAgreementUrl || 'Not Uploaded',
// // // // // // //             "Operational Status": p.status.replace('_', ' ').toUpperCase()
// // // // // // //         }));
// // // // // // //     };

// // // // // // //     const generateFileName = (extension: string) => {
// // // // // // //         return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
// // // // // // //     };

// // // // // // //     const handleExportCSV = () => {
// // // // // // //         const data = getExportData();
// // // // // // //         if (data.length === 0) return;

// // // // // // //         const headers = Object.keys(data[0]);
// // // // // // //         const csvRows = data.map(row =>
// // // // // // //             headers.map(header => `"${(row as any)[header]}"`).join(',')
// // // // // // //         );
// // // // // // //         const csvString = [headers.join(','), ...csvRows].join('\n');

// // // // // // //         const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
// // // // // // //         const link = document.createElement('a');
// // // // // // //         link.href = URL.createObjectURL(blob);
// // // // // // //         link.setAttribute('download', generateFileName('csv'));
// // // // // // //         document.body.appendChild(link);
// // // // // // //         link.click();
// // // // // // //         document.body.removeChild(link);
// // // // // // //         setShowExportMenu(false);
// // // // // // //     };

// // // // // // //     const handleExportExcel = () => {
// // // // // // //         const data = getExportData();
// // // // // // //         if (data.length === 0) return;

// // // // // // //         const worksheet = XLSX.utils.json_to_sheet(data);
// // // // // // //         const workbook = XLSX.utils.book_new();
// // // // // // //         XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");

// // // // // // //         XLSX.writeFile(workbook, generateFileName('xlsx'));
// // // // // // //         setShowExportMenu(false);
// // // // // // //     };

// // // // // // //     if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

// // // // // // //     return (
// // // // // // //         <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
// // // // // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // // // // //             {/* ACTION MODALS */}
// // // // // // //             {editingPlacement && (
// // // // // // //                 <EditPlacementModal
// // // // // // //                     placement={editingPlacement}
// // // // // // //                     mentors={mentors}
// // // // // // //                     onClose={() => setEditingPlacement(null)}
// // // // // // //                     onSaved={() => fetchPlacements(true)}
// // // // // // //                 />
// // // // // // //             )}

// // // // // // //             {optionsPlacement && (
// // // // // // //                 <PlacementOptionsModal
// // // // // // //                     placement={optionsPlacement}
// // // // // // //                     onClose={() => setOptionsPlacement(null)}
// // // // // // //                     onSaved={() => fetchPlacements(true)}
// // // // // // //                 />
// // // // // // //             )}

// // // // // // //             {/* QUICK-ADD MENTOR MODAL */}
// // // // // // //             {isMentorModalOpen && (
// // // // // // //                 <MentorModal
// // // // // // //                     employerId={activeMentorEmpId}
// // // // // // //                     onClose={() => setIsMentorModalOpen(false)}
// // // // // // //                     onSaved={async () => {
// // // // // // //                         await fetchStaff(true);
// // // // // // //                     }}
// // // // // // //                     addStaff={addStaff}
// // // // // // //                 />
// // // // // // //             )}

// // // // // // //             {/* MAIN PLACEMENT MODAL */}
// // // // // // //             {isCreateModalOpen && (
// // // // // // //                 <GlobalCreatePlacementModal
// // // // // // //                     employers={employers}
// // // // // // //                     mentors={mentors}
// // // // // // //                     learners={learners.filter(l => !l.isArchived)}
// // // // // // //                     onClose={() => setIsCreateModalOpen(false)}
// // // // // // //                     onCreate={createPlacement}
// // // // // // //                     onAddNewMentor={(empId) => {
// // // // // // //                         setActiveMentorEmpId(empId);
// // // // // // //                         setIsMentorModalOpen(true);
// // // // // // //                     }}
// // // // // // //                 />
// // // // // // //             )}

// // // // // // //             {/* ── CDP STYLED METRICS RIBBON ── */}
// // // // // // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
// // // // // // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // // // // // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // // // // // //                     <div className="cdp-stat-card__body">
// // // // // // //                         <span className="cdp-stat-card__value">{activeCount}</span>
// // // // // // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // // // // // //                     </div>
// // // // // // //                 </div>

// // // // // // //                 <div className="cdp-stat-card cdp-stat-card--amber">
// // // // // // //                     <div className="cdp-stat-card__icon">
// // // // // // //                         {missingContractsCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
// // // // // // //                     </div>
// // // // // // //                     <div className="cdp-stat-card__body">
// // // // // // //                         <span className="cdp-stat-card__value" style={{ color: missingContractsCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
// // // // // // //                             {missingContractsCount}
// // // // // // //                         </span>
// // // // // // //                         <span className="cdp-stat-card__label">Missing Signatures</span>
// // // // // // //                     </div>
// // // // // // //                 </div>

// // // // // // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // // // // // //                     <div className="cdp-stat-card__icon">
// // // // // // //                         <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
// // // // // // //                     </div>
// // // // // // //                     <div className="cdp-stat-card__body">
// // // // // // //                         <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
// // // // // // //                             {expiringSoonCount}
// // // // // // //                         </span>
// // // // // // //                         <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
// // // // // // //                     </div>
// // // // // // //                 </div>

// // // // // // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // // // // // //                     <div className="cdp-stat-card__icon"><Award size={20} /></div>
// // // // // // //                     <div className="cdp-stat-card__body">
// // // // // // //                         <span className="cdp-stat-card__value">{completedCount}</span>
// // // // // // //                         <span className="cdp-stat-card__label">Completed</span>
// // // // // // //                     </div>
// // // // // // //                 </div>
// // // // // // //             </div>

// // // // // // //             {/* ── ADVANCED TOOLBAR ── */}
// // // // // // //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
// // // // // // //                 <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // // //                     <Search size={15} color="var(--mlab-grey)" />
// // // // // // //                     <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
// // // // // // //                     {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
// // // // // // //                 </div>

// // // // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // // //                     <Briefcase size={14} color="var(--mlab-grey)" />
// // // // // // //                     <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
// // // // // // //                         <option value="all">All Placement Types</option>
// // // // // // //                         <option value="QCTO Workplace Module">QCTO Practicals</option>
// // // // // // //                         <option value="Alumni Internship">Alumni Internships</option>
// // // // // // //                         <option value="External WIL">External WIL</option>
// // // // // // //                     </select>
// // // // // // //                 </div>

// // // // // // //                 <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
// // // // // // //                     <Building2 size={14} color="var(--mlab-grey)" />
// // // // // // //                     <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
// // // // // // //                         <option value="all">All Host Companies</option>
// // // // // // //                         {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
// // // // // // //                     </select>
// // // // // // //                 </div>

// // // // // // //                 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>

// // // // // // //                     <div style={{ position: 'relative' }} ref={exportMenuRef}>
// // // // // // //                         <button
// // // // // // //                             onClick={() => setShowExportMenu(!showExportMenu)}
// // // // // // //                             disabled={enrichedAndFilteredPlacements.length === 0}
// // // // // // //                             className="cdp-btn cdp-btn--outline"
// // // // // // //                             style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
// // // // // // //                         >
// // // // // // //                             <DownloadCloud size={14} /> Export Ledger
// // // // // // //                         </button>

// // // // // // //                         {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
// // // // // // //                             <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
// // // // // // //                                 <button
// // // // // // //                                     onClick={handleExportCSV}
// // // // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // // // //                                 >
// // // // // // //                                     <FileText size={14} color="#0ea5e9" /> Download as CSV
// // // // // // //                                 </button>
// // // // // // //                                 <button
// // // // // // //                                     onClick={handleExportExcel}
// // // // // // //                                     style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
// // // // // // //                                 >
// // // // // // //                                     <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
// // // // // // //                                 </button>
// // // // // // //                             </div>
// // // // // // //                         )}
// // // // // // //                     </div>

// // // // // // //                     <button type="button" className="mlab-btn mlab-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
// // // // // // //                         <Plus size={14} /> New Placement
// // // // // // //                     </button>
// // // // // // //                 </div>
// // // // // // //             </div>

// // // // // // //             {/* ── CDP STYLED DATA GRID ── */}
// // // // // // //             <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
// // // // // // //                 <div className="vp-card" style={{ marginBottom: 0, background: 'whitesmoke' }}>

// // // // // // //                     <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
// // // // // // //                         <div className="vp-card-title-group">
// // // // // // //                             <Briefcase size={18} color="var(--mlab-blue)" />
// // // // // // //                             <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // // // // // //                                 Global Placement Ledger
// // // // // // //                             </h3>
// // // // // // //                         </div>
// // // // // // //                     </div>

// // // // // // //                     <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc' }}>
// // // // // // //                         <button
// // // // // // //                             onClick={() => setActiveTab('active')}
// // // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // // //                         >
// // // // // // //                             Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
// // // // // // //                         </button>
// // // // // // //                         <button
// // // // // // //                             onClick={() => setActiveTab('history')}
// // // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // // //                         >
// // // // // // //                             History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
// // // // // // //                         </button>
// // // // // // //                         <button
// // // // // // //                             onClick={() => setActiveTab('all')}
// // // // // // //                             style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // // // // // //                         >
// // // // // // //                             All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{placements.length}</span>
// // // // // // //                         </button>
// // // // // // //                     </div>

// // // // // // //                     <div className="mlab-table-wrap">
// // // // // // //                         <table className="mlab-table">
// // // // // // //                             <thead>
// // // // // // //                                 <tr>
// // // // // // //                                     <th>Learner Profile</th>
// // // // // // //                                     <th>Host Workplace & Mentor</th>
// // // // // // //                                     <th>Placement Details</th>
// // // // // // //                                     <th>Timeline</th>
// // // // // // //                                     <th>Status</th>
// // // // // // //                                     <th className="cdp-th--right">Actions</th>
// // // // // // //                                 </tr>
// // // // // // //                             </thead>
// // // // // // //                             <tbody>
// // // // // // //                                 {enrichedAndFilteredPlacements.length > 0 ? enrichedAndFilteredPlacements.map(p => {
// // // // // // //                                     const isExpiringSoon = p.status === 'active' && moment(p.endDate).isBefore(moment().add(30, 'days'));

// // // // // // //                                     return (
// // // // // // //                                         <tr key={p.id}>
// // // // // // //                                             {/* Learner Cell */}
// // // // // // //                                             <td>
// // // // // // //                                                 <div className="cdp-learner-cell">
// // // // // // //                                                     <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
// // // // // // //                                                     <div className="cdp-learner-cell__info">
// // // // // // //                                                         <span className="cdp-learner-cell__name">{p.learnerName}</span>
// // // // // // //                                                         <span className="cdp-learner-cell__id">{p.idNumber}</span>
// // // // // // //                                                     </div>
// // // // // // //                                                 </div>
// // // // // // //                                             </td>

// // // // // // //                                             {/* Workplace Cell */}
// // // // // // //                                             <td>
// // // // // // //                                                 <span className="cdp-placement__employer">{p.employerName}</span>
// // // // // // //                                                 <div style={{ fontSize: '0.75rem', color: p.mentorId ? '#64748b' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: p.mentorId ? 500 : 700 }}>
// // // // // // //                                                     {p.mentorId ? (
// // // // // // //                                                         <><User size={12} /> {p.mentorName}</>
// // // // // // //                                                     ) : (
// // // // // // //                                                         <><AlertTriangle size={12} /> No Mentor Assigned</>
// // // // // // //                                                     )}
// // // // // // //                                                 </div>
// // // // // // //                                             </td>

// // // // // // //                                             {/* Placement Type Cell */}
// // // // // // //                                             <td>
// // // // // // //                                                 <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
// // // // // // //                                                     <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>{p.placementType}</span>
// // // // // // //                                                     <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
// // // // // // //                                                         {p.compliance?.bbbeeSpendCategory || (p as any).bbbeeSpendCategory || 'Uncategorized'}
// // // // // // //                                                     </span>
// // // // // // //                                                 </div>
// // // // // // //                                             </td>

// // // // // // //                                             {/* Timeline Cell */}
// // // // // // //                                             <td>
// // // // // // //                                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
// // // // // // //                                                     {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
// // // // // // //                                                 </div>
// // // // // // //                                                 {isExpiringSoon && (
// // // // // // //                                                     <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // // // //                                                         <AlertTriangle size={10} /> Ends &lt; 30 days
// // // // // // //                                                     </div>
// // // // // // //                                                 )}
// // // // // // //                                             </td>

// // // // // // //                                             {/* Status Cell */}
// // // // // // //                                             <td>
// // // // // // //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>

// // // // // // //                                                     {/* Main Operational Status Badge */}
// // // // // // //                                                     <span className={`cdp-status-badge ${p.status === 'active' ? 'cdp-status-badge--active' : p.status === 'terminated' ? 'cdp-status-badge--dropped' : ''}`} style={p.status === 'pending_signatures' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : p.status === 'completed' ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}}>
// // // // // // //                                                         {p.status.replace('_', ' ')}
// // // // // // //                                                     </span>

// // // // // // //                                                     {/* Tripartite Contract Compliance Badge (WBLPA Tracking) */}
// // // // // // //                                                     {p.compliance?.isAgreementFullyExecuted ? (
// // // // // // //                                                         p.compliance?.wblpaAgreementUrl ? (
// // // // // // //                                                             <a
// // // // // // //                                                                 href={p.compliance.wblpaAgreementUrl}
// // // // // // //                                                                 target="_blank"
// // // // // // //                                                                 rel="noopener noreferrer"
// // // // // // //                                                                 style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
// // // // // // //                                                                 title="Click to view signed contract document"
// // // // // // //                                                             >
// // // // // // //                                                                 <CheckCircle size={10} /> WBLPA Signed & On File
// // // // // // //                                                             </a>
// // // // // // //                                                         ) : (
// // // // // // //                                                             <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // // //                                                                 <CheckCircle size={10} /> WBLPA Signed (No Link)
// // // // // // //                                                             </span>
// // // // // // //                                                         )
// // // // // // //                                                     ) : (
// // // // // // //                                                         <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // // //                                                             <AlertCircle size={10} /> No WBLPA Uploaded
// // // // // // //                                                         </span>
// // // // // // //                                                     )}

// // // // // // //                                                     {/* Mentor Supervision Status Badge */}
// // // // // // //                                                     {!p.mentorId && (
// // // // // // //                                                         <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
// // // // // // //                                                             <User size={10} /> Mentor Required
// // // // // // //                                                         </span>
// // // // // // //                                                     )}
// // // // // // //                                                 </div>
// // // // // // //                                             </td>

// // // // // // //                                             <td className="cdp-td--right">
// // // // // // //                                                 <div className="cdp-actions">
// // // // // // //                                                     <button
// // // // // // //                                                         type="button"
// // // // // // //                                                         onClick={() => setEditingPlacement(p)}
// // // // // // //                                                         style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-blue)' }}
// // // // // // //                                                         title="Edit Placement Details"
// // // // // // //                                                     >
// // // // // // //                                                         <Edit size={14} />
// // // // // // //                                                     </button>
// // // // // // //                                                     <button
// // // // // // //                                                         type="button"
// // // // // // //                                                         onClick={() => setOptionsPlacement(p)}
// // // // // // //                                                         style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-amber)' }}
// // // // // // //                                                         title="Placement Options"
// // // // // // //                                                     >
// // // // // // //                                                         <MoreVertical size={14} />
// // // // // // //                                                     </button>
// // // // // // //                                                 </div>
// // // // // // //                                             </td>
// // // // // // //                                         </tr>
// // // // // // //                                     );
// // // // // // //                                 }) : (
// // // // // // //                                     <tr>
// // // // // // //                                         <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
// // // // // // //                                             <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
// // // // // // //                                             <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
// // // // // // //                                             <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
// // // // // // //                                                 {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
// // // // // // //                                                     ? "Try adjusting your filters or search query."
// // // // // // //                                                     : "You haven't assigned any learners to host companies yet."}
// // // // // // //                                             </p>
// // // // // // //                                         </td>
// // // // // // //                                     </tr>
// // // // // // //                                 )}
// // // // // // //                             </tbody>
// // // // // // //                         </table>
// // // // // // //                     </div>
// // // // // // //                 </div>
// // // // // // //             </div>
// // // // // // //         </div>
// // // // // // //     );
// // // // // // // };
