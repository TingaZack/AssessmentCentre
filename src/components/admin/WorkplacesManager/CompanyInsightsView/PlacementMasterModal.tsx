// src/components/admin/PlacementsDashboard/PlacementMasterModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import {
    Building2, Briefcase, Users, Layers, Wallet,
    ShieldCheck, AlertTriangle, Network, X, Plus, Save, Edit, Loader2
} from 'lucide-react';
import type { ComplianceSchema, DashboardLearner, Employer, PlacementContract } from '../../../../types';
import { useStore, type StaffMember } from '../../../../store/useStore';
import { useToast } from '../../../common/Toast/Toast';
import { db } from '../../../../lib/firebase';


/* ─── FALLBACK COMPLIANCE SCHEMAS ───────────────────────────────────────────── */
const GENERIC_3_PHASE_SCHEMA: ComplianceSchema = {
    schemaId: 'generic_3_phase',
    schemaName: 'Standard 3-Phase Presets',
    tranches: [
        { trancheId: 'phase_1', title: 'Phase 1: Onboarding', percentage: 33, dueAtMonth: 1, requirements: [{ id: 'req_1', label: 'Employment Contract', type: 'document', required: true, systemTag: 'employmentContractUrl' }] },
        { trancheId: 'phase_2', title: 'Phase 2: Mid-Point Review', percentage: 33, dueAtMonth: 6, requirements: [{ id: 'req_2', label: 'Mid-Term Site Visit', type: 'site_visit', required: true }] },
        { trancheId: 'phase_3', title: 'Phase 3: Offboarding', percentage: 34, dueAtMonth: 12, requirements: [{ id: 'req_3', label: 'Final Completion Letter', type: 'document', required: true }] }
    ]
};

const MONTHLY_PAYROLL_SCHEMA: ComplianceSchema = {
    schemaId: 'monthly_payroll_only',
    schemaName: 'Pure Monthly Compliance',
    tranches: [
        { trancheId: 'onboarding', title: 'Initial HR Onboarding', percentage: 0, dueAtMonth: 0, requirements: [{ id: 'req_1', label: 'Signed SLA/Contract', type: 'document', required: true }] }
    ]
};

interface SelectedLearner {
    learner: DashboardLearner;
    mentorId: string;
    isExisting?: boolean;
}

export const PlacementMasterModal: React.FC<{
    editPlacement?: any | null; // Pass placement object to Edit, or null/undefined to Create
    employers: Employer[];
    mentors: StaffMember[];
    learners: DashboardLearner[];
    placements: PlacementContract[];
    cohorts: any[];
    programmes: any[];
    onClose: () => void;
    onSaved: () => void;
    onCreate?: (data: any) => Promise<void>;
    onAddNewMentor: (employerId: string) => void;
}> = ({ editPlacement, employers, mentors, learners, placements, cohorts, programmes, onClose, onSaved, onCreate, onAddNewMentor }) => {
    const toast = useToast();
    const { fetchEmployers } = useStore() as any;
    const [saving, setSaving] = useState(false);

    const isEditMode = !!editPlacement;

    // Inline Capacity Editor
    const [isEditingCap, setIsEditingCap] = useState(false);
    const [tempCap, setTempCap] = useState(1);

    // Identifiers
    const [selectedEmployerId, setSelectedEmployerId] = useState(isEditMode ? editPlacement.employerId : '');
    const [selectedCohortId, setSelectedCohortId] = useState(isEditMode ? (editPlacement.cohortId || '') : '');
    const [learnerSearch, setLearnerSearch] = useState('');

    // Selected Learners State (Initializes existing learner in Edit mode, allows adding new ones)
    const [selectedLearners, setSelectedLearners] = useState<SelectedLearner[]>(() => {
        if (isEditMode) {
            const targetLearner = learners.find(l => l.id === editPlacement.learnerId) || ({
                id: editPlacement.learnerId,
                fullName: editPlacement.learnerName || 'Learner',
                idNumber: editPlacement.idNumber || '—'
            } as DashboardLearner);
            return [{ learner: targetLearner, mentorId: editPlacement.mentorId || '', isExisting: true }];
        }
        return [];
    });

    const [fallbackSchemaId, setFallbackSchemaId] = useState(isEditMode ? (editPlacement.complianceSchema?.schemaId || 'generic_3_phase') : 'generic_3_phase');
    const [customPlacementType, setCustomPlacementType] = useState(isEditMode ? (editPlacement.customPlacementType || '') : '');
    const [linkToExistingCohort, setLinkToExistingCohort] = useState(false);
    const [forceShowAllProgrammes, setForceShowAllProgrammes] = useState(false);

    const [form, setForm] = useState({
        placementType: isEditMode ? (editPlacement.placementType || 'SETA Funded (Programme Linked)') : 'SETA Funded (Programme Linked)',
        startDate: isEditMode ? editPlacement.startDate : '',
        endDate: isEditMode ? editPlacement.endDate : '',
        fundingSource: 'Corporate Funded',
        bbbeeSpendCategory: isEditMode ? (editPlacement.compliance?.bbbeeSpendCategory || editPlacement.bbbeeSpendCategory || 'N/A') : 'N/A',
        stipendAmount: isEditMode ? (editPlacement.stipendAmount || '') : '',
        isAgreementFullyExecuted: isEditMode ? (editPlacement.compliance?.isAgreementFullyExecuted || false) : false
    });

    const isRegulatedTrack = form.placementType === 'QCTO Workplace Module' || form.placementType === 'SETA Funded (Programme Linked)';

    const availableMentors = useMemo(() => {
        if (!selectedEmployerId) return [];
        return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
    }, [selectedEmployerId, mentors]);

    const filteredLearners = useMemo(() => {
        if (!learnerSearch) return [];
        return learners.filter(l => {
            const matchesSearch = l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) || l.idNumber?.includes(learnerSearch);
            const notSelected = !selectedLearners.find(sl => sl.learner.id === l.id);
            return matchesSearch && notSelected;
        }).slice(0, 5);
    }, [learnerSearch, learners, selectedLearners]);

    const displayedCohorts = useMemo(() => {
        if (forceShowAllProgrammes || !isEditMode) return cohorts;
        const relevantIds = new Set<string>();
        if (selectedLearners[0]?.learner?.cohortId) relevantIds.add(selectedLearners[0].learner.cohortId);
        if (selectedCohortId) relevantIds.add(selectedCohortId);
        if (relevantIds.size === 0) return cohorts;
        const matchingTracks = cohorts.filter(c => relevantIds.has(c.id));
        return matchingTracks.length === 0 ? cohorts : matchingTracks;
    }, [cohorts, selectedLearners, selectedCohortId, forceShowAllProgrammes, isEditMode]);

    const handleRemoveLearner = (id: string) => {
        setSelectedLearners(prev => prev.filter(sl => sl.learner.id !== id));
    };

    const handleLearnerMentorChange = (learnerId: string, mentorId: string) => {
        setSelectedLearners(prev => prev.map(sl => sl.learner.id === learnerId ? { ...sl, mentorId } : sl));
    };

    const selectedEmployer = employers.find(e => e.id === selectedEmployerId);
    const currentEmployerPlacements = placements.filter(p => p.employerId === selectedEmployerId && (p.status === 'Active Placement' || p.status === 'Pending Match'));

    const internCapacity = selectedEmployer ? ((selectedEmployer as any).internCapacity || 1) : 0;
    const isOverCapacity = selectedEmployer && (currentEmployerPlacements.length + selectedLearners.filter(sl => !sl.isExisting).length) > internCapacity;

    useEffect(() => {
        if (selectedEmployer && !isEditMode) {
            setTempCap((selectedEmployer as any).internCapacity || 1);
            setIsEditingCap(false);
        }
    }, [selectedEmployer, isEditMode]);

    const handleSaveCapacity = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedEmployerId) return;
        try {
            await updateDoc(doc(db, 'employers', selectedEmployerId), {
                internCapacity: Number(tempCap)
            });
            await fetchEmployers(true);
            setIsEditingCap(false);
            toast.success("Host Company capacity updated!");
        } catch (err) {
            toast.error("Failed to update capacity.");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployerId) return toast.error("Please select a Host Company.");
        if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");
        if (form.placementType === 'Other' && !customPlacementType.trim()) return toast.error("Please specify the custom placement type.");

        if (isRegulatedTrack && linkToExistingCohort && !isEditMode) {
            const missingCohorts = selectedLearners.filter(sl => !sl.learner.cohortId);
            if (missingCohorts.length > 0) {
                return toast.error(`Cannot auto-bind: ${missingCohorts.map(sl => sl.learner.fullName).join(', ')} do not have an active classroom cohort.`);
            }
        } else if (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId) {
            return toast.error("Please select a target Programme/Cohort from the dropdown.");
        }

        if (isOverCapacity) {
            if (!window.confirm(`WARNING: Exceeding stated capacity for ${selectedEmployer?.name}. Force placement?`)) return;
        }

        setSaving(true);
        try {
            const finalPlacementType = form.placementType === 'Other' ? customPlacementType.trim() : form.placementType;

            // Resolve Compliance Schema Blueprint
            let schemaToApply: ComplianceSchema | null = isEditMode ? (editPlacement.complianceSchema || null) : null;

            if (isRegulatedTrack && selectedCohortId) {
                const matchedCohort = cohorts.find(c => c.id === selectedCohortId);
                if (matchedCohort) {
                    if (matchedCohort.complianceSchema) schemaToApply = matchedCohort.complianceSchema;
                    else if (matchedCohort.programmeId || matchedCohort.qualificationId) {
                        const templateId = matchedCohort.programmeId || matchedCohort.qualificationId;
                        const matchedProg = programmes.find(p => p.id === templateId);
                        if (matchedProg && matchedProg.complianceSchema) schemaToApply = matchedProg.complianceSchema;
                    }
                }
            } else if (!isRegulatedTrack && fallbackSchemaId) {
                if (fallbackSchemaId === 'generic_3_phase') schemaToApply = GENERIC_3_PHASE_SCHEMA;
                else if (fallbackSchemaId === 'monthly_payroll_only') schemaToApply = MONTHLY_PAYROLL_SCHEMA;
                else {
                    const custom = programmes.find(p => p.id === fallbackSchemaId);
                    if (custom?.complianceSchema) schemaToApply = custom.complianceSchema;
                }
            }

            if (isEditMode) {
                const batch = writeBatch(db);

                // 1. Update Existing Target Placement Record
                const existingSL = selectedLearners.find(sl => sl.isExisting) || selectedLearners[0];
                const placementRef = doc(db, 'placements', editPlacement.id);
                const learnerRef = doc(db, 'learners', editPlacement.learnerId);

                batch.update(placementRef, {
                    mentorId: existingSL.mentorId,
                    cohortId: isRegulatedTrack ? selectedCohortId : '',
                    placementType: finalPlacementType,
                    customPlacementType: finalPlacementType,
                    stipendAmount: Number(form.stipendAmount) || 0,
                    startDate: form.startDate,
                    endDate: form.endDate,
                    complianceSchema: schemaToApply,
                    compliance: {
                        ...(editPlacement.compliance || {}),
                        bbbeeSpendCategory: form.bbbeeSpendCategory,
                        isAgreementFullyExecuted: form.isAgreementFullyExecuted
                    },
                    updatedAt: new Date().toISOString()
                });
                batch.update(learnerRef, { mentorId: existingSL.mentorId, updatedAt: new Date().toISOString() });
                await batch.commit();

                // 2. Provision new placements for learners added to cohort during edit session
                const newLearners = selectedLearners.filter(sl => !sl.isExisting);
                if (newLearners.length > 0 && onCreate) {
                    await Promise.all(newLearners.map(sl => {
                        const targetCohortId = isRegulatedTrack ? selectedCohortId : '';
                        return onCreate({
                            learnerId: sl.learner.id,
                            employerId: selectedEmployerId,
                            cohortId: targetCohortId,
                            mentorId: sl.mentorId,
                            startDate: form.startDate,
                            endDate: form.endDate,
                            placementType: finalPlacementType,
                            customPlacementType: finalPlacementType,
                            stipendAmount: Number(form.stipendAmount) || 0,
                            bbbeeSpendCategory: form.bbbeeSpendCategory,
                            status: 'Active Placement',
                            complianceSchema: schemaToApply,
                            compliance: {
                                bbbeeSpendCategory: form.bbbeeSpendCategory,
                                isAgreementFullyExecuted: form.isAgreementFullyExecuted
                            },
                            evidenceMap: {}
                        });
                    }));
                }

            } else {
                // CREATE BRAND NEW PLACEMENTS FOR ALL SELECTED LEARNERS
                await Promise.all(selectedLearners.map(sl => {
                    const targetCohortId = isRegulatedTrack ? (linkToExistingCohort ? sl.learner.cohortId : selectedCohortId) : '';

                    return onCreate!({
                        learnerId: sl.learner.id,
                        employerId: selectedEmployerId,
                        cohortId: targetCohortId,
                        mentorId: sl.mentorId,
                        startDate: form.startDate,
                        endDate: form.endDate,
                        placementType: finalPlacementType,
                        customPlacementType: finalPlacementType,
                        stipendAmount: Number(form.stipendAmount) || 0,
                        bbbeeSpendCategory: form.bbbeeSpendCategory,
                        status: 'Active Placement',
                        complianceSchema: schemaToApply,
                        compliance: {
                            bbbeeSpendCategory: form.bbbeeSpendCategory,
                            isAgreementFullyExecuted: form.isAgreementFullyExecuted
                        },
                        evidenceMap: {}
                    });
                }));
            }

            const newCount = selectedLearners.filter(sl => !sl.isExisting).length;
            toast.success(isEditMode ? `Ecosystem updated! ${newCount > 0 ? `Added ${newCount} new intern(s) to cohort.` : ''}` : `Placed ${selectedLearners.length} learner(s)!`);
            setTimeout(() => {
                onSaved();
                onClose();
            }, 1200);

        } catch (err: any) {
            toast.error(err.message || "Failed to process placement details.");
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', borderRadius: '0' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1', borderRadius: '0' }}><Network size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">{isEditMode ? 'Manage Placement Ecosystem & Cohort' : 'Create Global Placement'}</h2>
                        <p className="wm-modal__subtitle">{isEditMode ? `Updating placement cohort at ${selectedEmployer?.name || 'Host Company'}` : 'Assign learner(s) to a host company from the master ledger.'}</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                    <div className="wm-modal__body">

                        {/* SECTION 1: WORKSPACE CONFIGURATION */}
                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><Building2 size={12} /> 1. Setup Placement Ecosystem</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Host Company <span className="wm-form-required">*</span></label>
                                    <select className="wm-form-input" style={{ borderRadius: '0', background: isEditMode ? '#f1f5f9' : 'white' }} required value={selectedEmployerId} onChange={e => setSelectedEmployerId(e.target.value)} disabled={isEditMode || saving}>
                                        <option value="">-- Choose Host Company --</option>
                                        {employers.filter(emp => emp.status !== 'archived').map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Placement Track / Type <span className="wm-form-required">*</span></label>
                                    <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.placementType} onChange={e => {
                                        const val = e.target.value;
                                        setForm(p => ({ ...p, placementType: val }));
                                        if (val !== 'QCTO Workplace Module' && val !== 'SETA Funded (Programme Linked)') setSelectedCohortId('');
                                    }} disabled={saving}>
                                        <option value="SETA Funded (Programme Linked)">SETA Funded (Linked to Training)</option>
                                        <option value="QCTO Workplace Module">QCTO Workplace Module (Regulated)</option>
                                        <option value="Independent SETA Internship">SETA Funded (Independent / Uni Grads)</option>
                                        <option value="Alumni Internship">Alumni Internship (Unregulated)</option>
                                        <option value="External WIL">External WIL (Unregulated)</option>
                                        <option value="Other">Other (Custom)</option>
                                    </select>
                                </div>

                                {form.placementType === 'Other' && (
                                    <div className="wm-form-group wm-form-group--full animate-fade-in" style={{ marginTop: '-4px', background: '#f8fafc', padding: '10px', borderRadius: '0', border: '1px dashed #cbd5e1' }}>
                                        <label className="wm-form-label">Specify Custom Placement Type <span className="wm-form-required">*</span></label>
                                        <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} required value={customPlacementType} onChange={e => setCustomPlacementType(e.target.value)} placeholder="e.g. Corporate CSI Initiative" disabled={saving} />
                                    </div>
                                )}

                                {selectedEmployer && (
                                    <div className="wm-form-group wm-form-group--full" style={{ marginTop: '-0.5rem' }}>
                                        <div style={{ padding: '0.5rem', borderRadius: '0', background: isOverCapacity ? '#fff1f2' : '#f0fdf4', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isOverCapacity ? '#991b1b' : '#15803d', fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {isOverCapacity ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                                                Placement Capacity: {currentEmployerPlacements.length + selectedLearners.filter(sl => !sl.isExisting).length} /
                                                {isEditingCap ? (
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={tempCap}
                                                        onChange={(e) => setTempCap(Number(e.target.value))}
                                                        style={{ width: '60px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '0', outline: 'none', marginLeft: '4px' }}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span>{internCapacity}</span>
                                                )}
                                                allocations utilized.
                                            </div>

                                            {isEditingCap ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button type="button" onClick={() => setIsEditingCap(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                                                    <button type="button" onClick={handleSaveCapacity} style={{ background: 'var(--mlab-green)', border: 'none', color: 'white', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Save size={10} /> Save
                                                    </button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={() => setIsEditingCap(true)} style={{ background: 'none', border: `1px solid ${isOverCapacity ? '#fca5a5' : '#bbf7d0'}`, color: isOverCapacity ? '#991b1b' : '#15803d', padding: '2px 8px', borderRadius: '0', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
                                                    <Edit size={10} /> Update Cap
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SECTION 2: PARTICIPANTS & SUPERVISORS */}
                        <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
                            <div className="wm-form-section__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span><Users size={12} /> 2. Participants & Workplace Supervisors</span>
                                {isEditMode && <span style={{ fontSize: '0.65rem', color: 'var(--mlab-blue)', textTransform: 'none', fontWeight: 600 }}>+ Search below to add more interns to this placement cohort</span>}
                            </div>

                            <div style={{ position: 'relative', marginBottom: selectedLearners.length > 0 ? '16px' : '0' }}>
                                <input type="text" className="wm-form-input" style={{ borderRadius: '0' }} placeholder="Search by name or ID to add intern(s)..." value={learnerSearch} onChange={e => setLearnerSearch(e.target.value)} disabled={saving} />
                                {learnerSearch && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {filteredLearners.length > 0 ? filteredLearners.map(l => (
                                            <div key={l.id} onClick={() => { setSelectedLearners(prev => [...prev, { learner: l, mentorId: '', isExisting: false }]); setLearnerSearch(''); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {selectedLearners.length > 0 && (
                                <div className="animate-fade-in" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', overflow: 'hidden' }}>
                                    <div style={{ background: '#f1f5f9', padding: '8px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
                                        <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>LEARNER PROFILE</div>
                                        <div style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            ASSIGNED MENTOR
                                            {selectedEmployerId && (
                                                <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
                                                    <Plus size={10} /> Quick Add
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ width: '30px' }}></div>
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {selectedLearners.map((sl, i) => (
                                            <div key={sl.learner.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: i === selectedLearners.length - 1 ? 'none' : '1px solid #e2e8f0', background: sl.isExisting ? '#f8fafc' : 'white' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {sl.learner.fullName}
                                                        {sl.isExisting && <span style={{ fontSize: '0.55rem', background: '#e0e7ff', color: 'var(--mlab-blue)', padding: '2px 6px', borderRadius: '0', fontWeight: 700 }}>Existing</span>}
                                                        {!sl.isExisting && <span style={{ fontSize: '0.55rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '0', fontWeight: 700 }}>+ Adding</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sl.learner.idNumber}</div>
                                                </div>
                                                <div style={{ flex: 1, paddingRight: '12px' }}>
                                                    <select
                                                        className="wm-form-input"
                                                        style={{ padding: '6px 8px', borderRadius: '0', fontSize: '0.75rem', height: 'auto', background: sl.mentorId ? 'white' : '#fff7ed', borderColor: sl.mentorId ? '#cbd5e1' : '#fed7aa' }}
                                                        value={sl.mentorId}
                                                        onChange={e => handleLearnerMentorChange(sl.learner.id, e.target.value)}
                                                        disabled={saving}
                                                    >
                                                        <option value="">-- Flag as Missing --</option>
                                                        {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ width: '30px', textAlign: 'right' }}>
                                                    {!sl.isExisting && (
                                                        <button type="button" onClick={() => handleRemoveLearner(sl.learner.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={16} /></button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SECTION 3: COMPLIANCE ROUTING & SCHEMA MAPPING */}
                        {isRegulatedTrack ? (
                            selectedLearners.length > 0 && (
                                <div className="wm-form-section animate-fade-in">
                                    <div className="wm-form-section__label" style={{ marginBottom: '10px' }}><Layers size={12} /> 3. Regulated Program Verification</div>

                                    {!isEditMode && (
                                        <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '0', marginBottom: '12px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.8rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={linkToExistingCohort}
                                                    onChange={e => setLinkToExistingCohort(e.target.checked)}
                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }}
                                                />
                                                Auto-bind placement to the learner's currently enrolled class/cohort
                                            </label>
                                            <p style={{ margin: '4px 0 0 24px', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>
                                                Check this if the learner is doing workplace practicals for their existing class. Uncheck to place them into a completely new Programme/Cohort.
                                            </p>

                                            {linkToExistingCohort && (
                                                <div style={{ marginTop: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0', padding: '8px' }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-midnight)', marginBottom: '8px', textTransform: 'uppercase' }}>Auto-Resolved Cohort Mapping:</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {selectedLearners.map(sl => {
                                                            const linkedCohort = cohorts.find(c => c.id === sl.learner.cohortId);
                                                            return (
                                                                <div key={sl.learner.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', padding: '4px', background: '#f8fafc', borderRadius: '0' }}>
                                                                    <span style={{ color: '#475569', fontWeight: 600 }}>{sl.learner.fullName}</span>
                                                                    {linkedCohort ? (
                                                                        <span style={{ color: 'var(--mlab-blue)', fontWeight: 700 }}>{linkedCohort.name}</span>
                                                                    ) : (
                                                                        <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> Unassigned Error</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(!linkToExistingCohort || isEditMode) && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {isEditMode && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <label className="wm-form-label" style={{ margin: 0 }}>Programme / Qualification Linked <span className="wm-form-required">*</span></label>
                                                    <button type="button" onClick={() => setForceShowAllProgrammes(!forceShowAllProgrammes)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                                                        {forceShowAllProgrammes ? "Restrict Track" : "Extend Registry"}
                                                    </button>
                                                </div>
                                            )}
                                            <select className="wm-form-input animate-fade-in" required={isRegulatedTrack && (!linkToExistingCohort || isEditMode)} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)} style={{ borderRadius: '0', borderLeft: '4px solid var(--mlab-amber)' }} disabled={saving}>
                                                <option value="">-- Assign Target Qualification / Programme Record --</option>
                                                {displayedCohorts.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
                                        * Note: Placements will automatically inherit the Tranche & Funding Blueprint attached to the selected programme.
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="wm-form-section animate-fade-in" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px' }}>
                                <div className="wm-form-section__label" style={{ marginBottom: '8px' }}><Wallet size={12} /> 3. Independent Compliance Mode</div>
                                <select className="wm-form-input" value={fallbackSchemaId} onChange={e => setFallbackSchemaId(e.target.value)} style={{ borderRadius: 0 }} disabled={saving}>
                                    <optgroup label="System Defaults">
                                        <option value="generic_3_phase">Standard 3-Phase Lifecycle (Onboard, Mid-Point, Offboard)</option>
                                        <option value="monthly_payroll_only">Unstructured (Monthly Payroll & HR Only)</option>
                                    </optgroup>
                                    {programmes && programmes.length > 0 && (
                                        <optgroup label="Custom Qualification Templates">
                                            {programmes.map((prog: any) => (
                                                <option key={prog.id} value={prog.id}>{prog.name || 'Custom Blueprint'}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                        )}

                        {/* SECTION 4: LOGISTICS & FINANCIAL SETTINGS */}
                        <div className="wm-form-section" style={{ opacity: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId || isEditMode) ? 1 : 0.5, pointerEvents: selectedLearners.length > 0 && (!isRegulatedTrack || linkToExistingCohort || selectedCohortId || isEditMode) ? 'auto' : 'none' }}>
                            <div className="wm-form-section__label"><Briefcase size={12} /> {isRegulatedTrack ? '4' : '3'}. Global Placement Settings</div>
                            <div className="wm-form-grid">

                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">B-BBEE Spend Category</label>
                                    <select className="wm-form-input" style={{ borderRadius: '0' }} value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
                                        <option value="N/A">Not Applicable (Non-B-BBEE / Unregulated)</option>
                                        <option value="Category B">Category B (Degree/Diploma)</option>
                                        <option value="Category C">Category C (Certificate/Occupational)</option>
                                        <option value="Category D">Category D (Apprenticeship)</option>
                                        <option value="Category E">Category E (Work-integrated learning)</option>
                                    </select>
                                </div>

                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Monthly Stipend (ZAR) <span style={{ color: '#94a3b8', fontWeight: 400 }}>- Drives live B-BBEE & ETI Data</span></label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>R</div>
                                        <input className="wm-form-input" type="number" min="0" style={{ paddingLeft: '28px', borderRadius: '0' }} placeholder="e.g. 4500" value={form.stipendAmount} onChange={e => setForm(p => ({ ...p, stipendAmount: e.target.value }))} disabled={saving} />
                                    </div>
                                </div>

                                <div className="wm-form-group"><label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label><input className="wm-form-input" style={{ borderRadius: '0' }} required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} /></div>

                                {/* <div className="wm-form-group wm-form-group--full" style={{ marginTop: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={form.isAgreementFullyExecuted} onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }} disabled={saving} />
                                        WBLPA Signed & On File
                                    </label>
                                </div> */}
                            </div>
                        </div>

                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving || selectedLearners.length === 0 || !selectedEmployerId || (isRegulatedTrack && !linkToExistingCohort && !selectedCohortId && !isEditMode)}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Processing…</> : <><Save size={13} /> {isEditMode ? 'Save Contract Changes' : `Place ${selectedLearners.length} Learner(s)`}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};