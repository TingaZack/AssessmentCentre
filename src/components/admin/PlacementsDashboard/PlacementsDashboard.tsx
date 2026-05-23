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
    LinkIcon, UploadCloud, FileSpreadsheet
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';

import { useStore, type StaffMember } from '../../../store/useStore';
import type { DashboardLearner, Employer } from '../../../types';
import { useToast, ToastContainer } from '../../common/Toast/Toast';
import Loader from '../../common/Loader/Loader';
import type { PlacementRecord } from '../../../store/slices/placementSlice';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

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
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
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
                                <input className="wm-form-input" required type="text" placeholder="e.g. John Smith"
                                    value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
                                <input className="wm-form-input" required type="email" placeholder="john@company.com"
                                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                            </div>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Phone Number</label>
                                <input className="wm-form-input" type="tel" placeholder="082 123 4567"
                                    value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Mentor</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

/* ─── GLOBAL CREATE PLACEMENT MODAL (MULTI-SELECT) ───────────────────────────── */
const GlobalCreatePlacementModal: React.FC<{
    employers: Employer[],
    mentors: StaffMember[],
    learners: DashboardLearner[],
    onClose: () => void,
    onCreate: (data: any) => Promise<void>,
    onAddNewMentor: (employerId: string) => void
}> = ({ employers, mentors, learners, onClose, onCreate, onAddNewMentor }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    const [selectedEmployerId, setSelectedEmployerId] = useState('');
    const [learnerSearch, setLearnerSearch] = useState('');
    const [selectedLearners, setSelectedLearners] = useState<DashboardLearner[]>([]);

    const [form, setForm] = useState({
        mentorId: '',
        placementType: 'QCTO Workplace Module',
        startDate: '',
        endDate: '',
        fundingSource: 'Corporate Funded',
        bbbeeSpendCategory: 'Category C'
    });

    const availableMentors = useMemo(() => {
        if (!selectedEmployerId) return [];
        return mentors.filter(m => m.employerId === selectedEmployerId && m.status !== 'archived');
    }, [selectedEmployerId, mentors]);

    const filteredLearners = useMemo(() => {
        if (!learnerSearch) return [];
        return learners.filter(l =>
            (l.fullName?.toLowerCase().includes(learnerSearch.toLowerCase()) ||
                l.idNumber?.includes(learnerSearch)) &&
            !selectedLearners.find(sl => sl.id === l.id)
        ).slice(0, 5);
    }, [learnerSearch, learners, selectedLearners]);

    const handleRemoveLearner = (id: string) => {
        setSelectedLearners(prev => prev.filter(l => l.id !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployerId) return toast.error("Please select a Host Company.");
        if (selectedLearners.length === 0) return toast.error("Please select at least one learner.");

        setSaving(true);
        try {
            await Promise.all(selectedLearners.map(learner =>
                onCreate({
                    learnerId: learner.id,
                    employerId: selectedEmployerId,
                    ...form,
                    status: 'active'
                })
            ));

            toast.success(`Successfully placed ${selectedLearners.length} learner(s) at the company.`);
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Failed to create placements.");
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}><Briefcase size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Create Global Placement</h2>
                        <p className="wm-modal__subtitle">Assign learner(s) to a host company from the master ledger.</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form">
                    <div className="wm-modal__body">

                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><Building2 size={12} /> 1. Select Host Company</div>
                            <select
                                className="wm-form-input"
                                required
                                value={selectedEmployerId}
                                onChange={e => {
                                    setSelectedEmployerId(e.target.value);
                                    setForm(p => ({ ...p, mentorId: '' }));
                                }}
                            >
                                <option value="">-- Choose Host Company --</option>
                                {employers.filter(emp => emp.status !== 'archived').map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><Search size={12} /> 2. Select Learner(s)</div>

                            {selectedLearners.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                    {selectedLearners.map(l => (
                                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                            {l.fullName}
                                            <button type="button" onClick={() => handleRemoveLearner(l.id)} style={{ background: 'none', border: 'none', color: '#4338ca', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    className="wm-form-input"
                                    placeholder="Search by Name or ID Number to add interns..."
                                    value={learnerSearch}
                                    onChange={e => setLearnerSearch(e.target.value)}
                                />
                                {learnerSearch && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {filteredLearners.length > 0 ? filteredLearners.map(l => (
                                            <div
                                                key={l.id}
                                                onClick={() => { setSelectedLearners(prev => [...prev, l]); setLearnerSearch(''); }}
                                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{l.fullName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.idNumber}</div>
                                                </div>
                                                <div style={{ fontSize: '0.7rem', padding: '2px 6px', background: l.enrollmentId ? '#ecfccb' : '#f1f5f9', color: l.enrollmentId ? '#4d7c0f' : '#64748b', borderRadius: '4px' }}>
                                                    {l.enrollmentId ? 'Active Student' : 'External / Alumni'}
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No matches found.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="wm-form-section" style={{ opacity: selectedEmployerId ? 1 : 0.5, pointerEvents: selectedEmployerId ? 'auto' : 'none' }}>
                            <div className="wm-form-section__label"><Briefcase size={12} /> 3. Placement & Compliance Details</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group wm-form-group--full">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <label className="wm-form-label" style={{ margin: 0 }}>Workplace Mentor</label>
                                        {selectedEmployerId && (
                                            <button type="button" onClick={() => onAddNewMentor(selectedEmployerId)} style={{ background: 'none', border: 'none', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                <Plus size={12} /> Quick Add Mentor
                                            </button>
                                        )}
                                    </div>
                                    <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))}>
                                        <option value="">-- No Mentor Assigned (Flag as Missing) --</option>
                                        {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
                                    </select>
                                    {selectedEmployerId && availableMentors.length === 0 && (
                                        <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px', display: 'block' }}>This company has no mentors. You can assign one later or quick-add one above.</span>
                                    )}
                                </div>

                                <div className="wm-form-group">
                                    <label className="wm-form-label">Placement Type</label>
                                    <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))}>
                                        <option value="QCTO Workplace Module">QCTO Workplace Module</option>
                                        <option value="Alumni Internship">Alumni Internship</option>
                                        <option value="External WIL">External WIL</option>
                                    </select>
                                </div>

                                <div className="wm-form-group">
                                    <label className="wm-form-label">B-BBEE Spend Category</label>
                                    <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))}>
                                        <option value="Category B">Category B (Degree/Diploma)</option>
                                        <option value="Category C">Category C (Certificate/Occupational)</option>
                                        <option value="Category D">Category D (Apprenticeship)</option>
                                        <option value="Category E">Category E (Work-integrated learning)</option>
                                    </select>
                                </div>

                                <div className="wm-form-group">
                                    <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" disabled={saving || selectedLearners.length === 0 || !selectedEmployerId}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Processing {selectedLearners.length} Interns…</> : <><Save size={13} /> Place {selectedLearners.length > 0 ? selectedLearners.length : ''} Learner(s)</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

/* ─── EDIT PLACEMENT MODAL ─────────────────────────────────── */
const EditPlacementModal: React.FC<{
    placement: any;
    mentors: StaffMember[];
    onClose: () => void;
    onSaved: () => void;
}> = ({ placement, mentors, onClose, onSaved }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    const [uploadMode, setUploadMode] = useState<'link' | 'upload'>('link');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [form, setForm] = useState({
        mentorId: placement.mentorId || '',
        placementType: placement.placementType || 'QCTO Workplace Module',
        bbbeeSpendCategory: placement.compliance?.bbbeeSpendCategory || placement.bbbeeSpendCategory || 'Category C',
        startDate: placement.startDate || '',
        endDate: placement.endDate || '',
        isAgreementFullyExecuted: placement.compliance?.isAgreementFullyExecuted || false,
        wblpaAgreementUrl: placement.compliance?.wblpaAgreementUrl || ''
    });

    const availableMentors = mentors.filter(m => m.employerId === placement.employerId && m.status !== 'archived');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            let finalDocumentUrl = form.wblpaAgreementUrl;

            if (uploadMode === 'upload' && selectedFile) {
                setUploadingDoc(true);
                const fileRef = ref(storage, `placements/${placement.id}/wblpa_${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);

                await uploadBytes(fileRef, selectedFile);
                finalDocumentUrl = await getDownloadURL(fileRef);
                setUploadingDoc(false);
            }

            const batch = writeBatch(db);
            const placementRef = doc(db, 'placements', placement.id);
            const learnerRef = doc(db, 'learners', placement.learnerId);

            batch.update(placementRef, {
                mentorId: form.mentorId,
                placementType: form.placementType,
                startDate: form.startDate,
                endDate: form.endDate,
                compliance: {
                    ...(placement.compliance || {}),
                    bbbeeSpendCategory: form.bbbeeSpendCategory,
                    isAgreementFullyExecuted: form.isAgreementFullyExecuted,
                    wblpaAgreementUrl: finalDocumentUrl
                },
                updatedAt: new Date().toISOString()
            });

            batch.update(learnerRef, { mentorId: form.mentorId, updatedAt: new Date().toISOString() });

            await batch.commit();

            toast.success("Placement details and compliance updated successfully!");

            setTimeout(() => {
                onSaved();
                onClose();
            }, 1200);

        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to update placement details.");
            setUploadingDoc(false);
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '2px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Edit Placement Details</h2>
                        <p className="wm-modal__subtitle">Updating {placement.learnerName} at {placement.employerName}</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                    <div className="wm-modal__body">

                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><Briefcase size={12} /> Logistics & Timeline</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Workplace Mentor</label>
                                    <select className="wm-form-input" value={form.mentorId} onChange={e => setForm(p => ({ ...p, mentorId: e.target.value }))} disabled={saving}>
                                        <option value="">-- No Mentor Assigned --</option>
                                        {availableMentors.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>)}
                                    </select>
                                </div>

                                <div className="wm-form-group">
                                    <label className="wm-form-label">Start Date <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} disabled={saving} />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Expected End Date <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} disabled={saving} />
                                </div>
                            </div>
                        </div>

                        <div className="wm-form-section" style={{ marginTop: '1.5rem' }}>
                            <div className="wm-form-section__label"><ShieldAlert size={12} /> Compliance & Contracts</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Placement Type</label>
                                    <select className="wm-form-input" value={form.placementType} onChange={e => setForm(p => ({ ...p, placementType: e.target.value }))} disabled={saving}>
                                        <option value="QCTO Workplace Module">QCTO Workplace Module</option>
                                        <option value="Alumni Internship">Alumni Internship</option>
                                        <option value="External WIL">External WIL</option>
                                    </select>
                                </div>

                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">B-BBEE Spend Category</label>
                                    <select className="wm-form-input" value={form.bbbeeSpendCategory} onChange={e => setForm(p => ({ ...p, bbbeeSpendCategory: e.target.value }))} disabled={saving}>
                                        <option value="Category B">Category B (Degree/Diploma)</option>
                                        <option value="Category C">Category C (Certificate/Occupational)</option>
                                        <option value="Category D">Category D (Apprenticeship)</option>
                                        <option value="Category E">Category E (Work-integrated learning)</option>
                                    </select>
                                </div>

                                <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', fontSize: '0.85rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={form.isAgreementFullyExecuted}
                                            onChange={e => setForm(p => ({ ...p, isAgreementFullyExecuted: e.target.checked }))}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-green)' }}
                                            disabled={saving}
                                        />
                                        WBLPA Signed & On File
                                    </label>
                                    <p style={{ margin: '4px 0 12px 24px', fontSize: '0.75rem', color: '#64748b' }}>
                                        Check this box if the tripartite agreement has been signed by the learner, employer, and institution.
                                    </p>

                                    <div style={{ marginLeft: '24px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9' }}>
                                            <button
                                                type="button"
                                                onClick={() => setUploadMode('link')}
                                                style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'link' ? 'white' : 'transparent', color: uploadMode === 'link' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'link' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
                                                disabled={saving}
                                            >
                                                <LinkIcon size={12} /> Paste Link
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setUploadMode('upload')}
                                                style={{ flex: 1, padding: '8px', border: 'none', background: uploadMode === 'upload' ? 'white' : 'transparent', color: uploadMode === 'upload' ? 'var(--mlab-blue)' : '#64748b', fontWeight: 600, fontSize: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: uploadMode === 'upload' ? '2px solid var(--mlab-blue)' : '2px solid transparent' }}
                                                disabled={saving}
                                            >
                                                <UploadCloud size={12} /> Upload File
                                            </button>
                                        </div>

                                        <div style={{ padding: '12px' }}>
                                            {uploadMode === 'link' ? (
                                                <>
                                                    <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Document Link (Google Drive, OneDrive, etc.)</label>
                                                    <input
                                                        className="wm-form-input"
                                                        type="url"
                                                        placeholder="https://drive.google.com/file/d/..."
                                                        value={form.wblpaAgreementUrl}
                                                        onChange={e => setForm(p => ({ ...p, wblpaAgreementUrl: e.target.value }))}
                                                        disabled={saving}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <label className="wm-form-label" style={{ fontSize: '0.7rem' }}>Upload Scanned Contract (PDF, PNG, JPG)</label>
                                                    <input
                                                        className="wm-form-input"
                                                        type="file"
                                                        accept=".pdf,image/*,.doc,.docx"
                                                        onChange={e => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                setSelectedFile(e.target.files[0]);
                                                            }
                                                        }}
                                                        style={{ padding: '6px' }}
                                                        disabled={saving}
                                                    />
                                                    {form.wblpaAgreementUrl && !selectedFile && (
                                                        <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <CheckCircle size={12} /> A file is already attached to this record.
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
                            {saving ? (
                                <><Loader2 className="wm-spin" size={13} /> {uploadingDoc ? 'Uploading File...' : 'Updating…'}</>
                            ) : (
                                <><Save size={13} /> Save Changes</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

/* ─── PLACEMENT OPTIONS MODAL ────────────────────────────── */
const PlacementOptionsModal: React.FC<{
    placement: any;
    onClose: () => void;
    onSaved: () => void;
}> = ({ placement, onClose, onSaved }) => {
    const toast = useToast();
    const [processing, setProcessing] = useState(false);

    const handleChangeStatus = async (newStatus: string) => {
        if (!window.confirm(`Are you sure you want to change this placement status to ${newStatus.replace('_', ' ')}?`)) return;

        setProcessing(true);
        try {
            await updateDoc(doc(db, 'placements', placement.id), {
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
            toast.success(`Placement status updated to ${newStatus.replace('_', ' ')}`);
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Failed to update status.");
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteRecord = async () => {
        if (!window.confirm("CRITICAL: Are you sure you want to completely delete this placement record? This cannot be undone.")) return;

        setProcessing(true);
        try {
            await deleteDoc(doc(db, 'placements', placement.id));
            toast.success("Placement record permanently deleted.");
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete record.");
        } finally {
            setProcessing(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
                <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#fffbeb', color: '#d97706' }}><MoreVertical size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">Placement Options</h2>
                        <p className="wm-modal__subtitle">{placement.learnerName}</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={processing}><X size={18} /></button>
                </div>

                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        type="button"
                        disabled={processing || placement.status === 'completed'}
                        onClick={() => handleChangeStatus('completed')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', opacity: placement.status === 'completed' ? 0.5 : 1 }}
                    >
                        <CheckCircle size={16} color="#16a34a" /> Mark as Completed
                    </button>

                    <button
                        type="button"
                        disabled={processing || placement.status === 'pending_signatures'}
                        onClick={() => handleChangeStatus('pending_signatures')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-midnight)', opacity: placement.status === 'pending_signatures' ? 0.5 : 1 }}
                    >
                        <Clock size={16} color="#d97706" /> Revert to Pending Signatures
                    </button>

                    <button
                        type="button"
                        disabled={processing || placement.status === 'terminated'}
                        onClick={() => handleChangeStatus('terminated')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#b91c1c', opacity: placement.status === 'terminated' ? 0.5 : 1 }}
                    >
                        <AlertTriangle size={16} color="#dc2626" /> Terminate Placement (Drop Intern)
                    </button>

                    <div style={{ height: '1px', background: 'var(--mlab-border)', margin: '8px 0' }} />

                    <button
                        type="button"
                        disabled={processing}
                        onClick={handleDeleteRecord}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 600, color: 'var(--mlab-grey)' }}
                    >
                        <Trash2 size={16} /> Delete Record Permanently
                    </button>
                </div>

                <div className="wm-modal__footer" style={{ justifyContent: 'center' }}>
                    <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={processing}>Close Options</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: PLACEMENTS DASHBOARD
═══════════════════════════════════════════════════════════════════════════ */
export const PlacementsDashboard: React.FC = () => {
    const toast = useToast();
    const [searchParams] = useSearchParams();
    const employerUrlParam = searchParams.get('employer');

    const { employers, fetchEmployers, learners, fetchLearners, staff, fetchStaff, addStaff } = useStore();

    const placements = (useStore(s => (s as any).placements) || []) as PlacementRecord[];
    const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;
    const createPlacement = (useStore(s => (s as any).createPlacement) || (async () => { })) as any;
    const placementsLoading = (useStore(s => (s as any).placementsLoading) || false) as boolean;

    const [isInitialLoad, setIsInitialLoad] = useState(placements.length === 0);

    // UI Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
    const [activeMentorEmpId, setActiveMentorEmpId] = useState('');
    const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
    const [optionsPlacement, setOptionsPlacement] = useState<any | null>(null);

    // Filtering State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterEmployer, setFilterEmployer] = useState(employerUrlParam || 'all');
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');

    // Export State
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
        if (employerUrlParam) setFilterEmployer(employerUrlParam);
    }, [employerUrlParam]);

    useEffect(() => {
        const loadEcosystem = async () => {
            try {
                await Promise.all([fetchPlacements(), fetchEmployers(), fetchLearners(), fetchStaff()]);
            } catch (err) {
                toast.error("Failed to synchronize placement ecosystem data.");
            } finally {
                setIsInitialLoad(false);
            }
        };
        loadEcosystem();
    }, [fetchPlacements, fetchEmployers, fetchLearners, fetchStaff]);

    const mentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.status !== 'archived'), [staff]);

    const { activeCount, expiringSoonCount, missingContractsCount, completedCount, droppedCount } = useMemo(() => {
        const thirtyDaysFromNow = moment().add(30, 'days');
        let active = 0, expiring = 0, missingContracts = 0, completed = 0, dropped = 0;

        placements.forEach(p => {
            if (p.status === 'active' || p.status === 'pending_signatures') {
                active++;
                if (p.status === 'active') {
                    if (moment(p.endDate).isBefore(thirtyDaysFromNow)) expiring++;
                    if (!p.compliance?.isAgreementFullyExecuted) missingContracts++;
                }
            } else if (p.status === 'completed') {
                completed++;
            } else if (p.status === 'terminated') {
                dropped++;
            }
        });
        return { activeCount: active, expiringSoonCount: expiring, missingContractsCount: missingContracts, completedCount: completed, droppedCount: dropped };
    }, [placements]);

    const enrichedAndFilteredPlacements = useMemo(() => {
        return placements
            .map(p => {
                const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
                const employer = employers.find(e => e.id === p.employerId) || ({} as Partial<Employer>);
                const mentor = mentors.find(m => m.id === p.mentorId) || ({} as Partial<StaffMember>);

                return {
                    ...p,
                    learnerName: learner.fullName || 'Unknown Learner',
                    idNumber: learner.idNumber || '—',
                    employerName: employer.name || 'Unknown Company',
                    mentorName: mentor.fullName || 'Unassigned',
                };
            })
            .filter(p => {
                // Apply Tab Filter
                if (activeTab === 'active' && p.status !== 'active' && p.status !== 'pending_signatures') return false;
                if (activeTab === 'history' && p.status !== 'completed' && p.status !== 'terminated') return false;

                // Apply Search & Dropdown Filters
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    if (!(p.learnerName.toLowerCase().includes(q) || p.idNumber.includes(q) || p.employerName.toLowerCase().includes(q))) return false;
                }
                if (filterType !== 'all' && p.placementType !== filterType) return false;
                if (filterEmployer !== 'all' && p.employerId !== filterEmployer) return false;

                return true;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [placements, learners, employers, mentors, searchQuery, filterType, filterEmployer, activeTab]);

    const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

    // EXPORT LOGIC FOR MASTER PLACEMENT DASHBOARD
    const getExportData = () => {
        return enrichedAndFilteredPlacements.map(p => ({
            "Learner Name": p.learnerName,
            "ID Number": p.idNumber,
            "Host Company": p.employerName,
            "Placement Type": p.placementType,
            "B-BBEE Category": p.compliance?.bbbeeSpendCategory || (p as any).bbbeeSpendCategory || 'Uncategorized',
            "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
            "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
            "Assigned Mentor": p.mentorName,
            "WBLPA Contract Status": p.compliance?.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Contract Link": p.compliance?.wblpaAgreementUrl || 'Not Uploaded',
            "Operational Status": p.status.replace('_', ' ').toUpperCase()
        }));
    };

    const generateFileName = (extension: string) => {
        return `Master_Placements_Ledger_${activeTab}_${moment().format('YYYYMMDD')}.${extension}`;
    };

    const handleExportCSV = () => {
        const data = getExportData();
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvRows = data.map(row =>
            headers.map(header => `"${(row as any)[header]}"`).join(',')
        );
        const csvString = [headers.join(','), ...csvRows].join('\n');

        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', generateFileName('csv'));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportMenu(false);
    };

    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Master Ledger");

        XLSX.writeFile(workbook, generateFileName('xlsx'));
        setShowExportMenu(false);
    };

    if (isInitialLoad || placementsLoading) return <div className="wm-loading"><Loader message="Synchronizing Tripartite Placements Ledger..." /></div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ACTION MODALS */}
            {editingPlacement && (
                <EditPlacementModal
                    placement={editingPlacement}
                    mentors={mentors}
                    onClose={() => setEditingPlacement(null)}
                    onSaved={() => fetchPlacements(true)}
                />
            )}

            {optionsPlacement && (
                <PlacementOptionsModal
                    placement={optionsPlacement}
                    onClose={() => setOptionsPlacement(null)}
                    onSaved={() => fetchPlacements(true)}
                />
            )}

            {/* QUICK-ADD MENTOR MODAL */}
            {isMentorModalOpen && (
                <MentorModal
                    employerId={activeMentorEmpId}
                    onClose={() => setIsMentorModalOpen(false)}
                    onSaved={async () => {
                        await fetchStaff(true);
                    }}
                    addStaff={addStaff}
                />
            )}

            {/* MAIN PLACEMENT MODAL */}
            {isCreateModalOpen && (
                <GlobalCreatePlacementModal
                    employers={employers}
                    mentors={mentors}
                    learners={learners.filter(l => !l.isArchived)}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={createPlacement}
                    onAddNewMentor={(empId) => {
                        setActiveMentorEmpId(empId);
                        setIsMentorModalOpen(true);
                    }}
                />
            )}

            {/* ── CDP STYLED METRICS RIBBON ── */}
            <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{activeCount}</span>
                        <span className="cdp-stat-card__label">Active Placements</span>
                    </div>
                </div>

                <div className="cdp-stat-card cdp-stat-card--amber">
                    <div className="cdp-stat-card__icon">
                        {missingContractsCount > 0 ? <ShieldAlert size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: missingContractsCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-green)' }}>
                            {missingContractsCount}
                        </span>
                        <span className="cdp-stat-card__label">Missing Signatures</span>
                    </div>
                </div>

                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon">
                        <AlertTriangle size={20} color={expiringSoonCount > 0 ? "var(--mlab-amber)" : "var(--mlab-grey)"} />
                    </div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: expiringSoonCount > 0 ? 'var(--mlab-amber)' : 'var(--mlab-grey)' }}>
                            {expiringSoonCount}
                        </span>
                        <span className="cdp-stat-card__label">Expiring &lt; 30 Days</span>
                    </div>
                </div>

                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><Award size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{completedCount}</span>
                        <span className="cdp-stat-card__label">Completed</span>
                    </div>
                </div>
            </div>

            {/* ── ADVANCED TOOLBAR ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', alignItems: 'center' }}>
                <div style={{ flex: '1 1 250px', position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
                    <Search size={15} color="var(--mlab-grey)" />
                    <input type="text" placeholder="Search by Learner Name, ID, or Host Company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', border: 'none', padding: '10px', outline: 'none', background: 'transparent' }} />
                    {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}><X size={13} /></button>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
                    <Briefcase size={14} color="var(--mlab-grey)" />
                    <select style={{ border: 'none', color: 'grey', padding: '10px', outline: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="all">All Placement Types</option>
                        <option value="QCTO Workplace Module">QCTO Practicals</option>
                        <option value="Alumni Internship">Alumni Internships</option>
                        <option value="External WIL">External WIL</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0 12px' }}>
                    <Building2 size={14} color="var(--mlab-grey)" />
                    <select style={{ border: 'none', padding: '10px', color: 'grey', outline: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '200px', fontSize: '0.85rem' }} value={filterEmployer} onChange={e => setFilterEmployer(e.target.value)}>
                        <option value="all">All Host Companies</option>
                        {employers.filter(e => e.status !== 'archived').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>

                    <div style={{ position: 'relative' }} ref={exportMenuRef}>
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            disabled={enrichedAndFilteredPlacements.length === 0}
                            className="cdp-btn cdp-btn--outline"
                            style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: enrichedAndFilteredPlacements.length === 0 ? 0.5 : 1, cursor: enrichedAndFilteredPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            <DownloadCloud size={14} /> Export Ledger
                        </button>

                        {showExportMenu && enrichedAndFilteredPlacements.length > 0 && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '180px', overflow: 'hidden' }} className="animate-fade-in">
                                <button
                                    onClick={handleExportCSV}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
                                >
                                    <FileText size={14} color="#0ea5e9" /> Download as CSV
                                </button>
                                <button
                                    onClick={handleExportExcel}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}
                                >
                                    <FileSpreadsheet size={14} color="#16a34a" /> Download as Excel (.xlsx)
                                </button>
                            </div>
                        )}
                    </div>

                    <button type="button" className="mlab-btn mlab-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
                        <Plus size={14} /> New Placement
                    </button>
                </div>
            </div>

            {/* ── CDP STYLED DATA GRID ── */}
            <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                <div className="vp-card" style={{ marginBottom: 0, background: 'whitesmoke' }}>

                    <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div className="vp-card-title-group">
                            <Briefcase size={18} color="var(--mlab-blue)" />
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                Global Placement Ledger
                            </h3>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc' }}>
                        <button
                            onClick={() => setActiveTab('active')}
                            style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'active' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            Active Interns <span style={{ background: activeTab === 'active' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'active' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{activeCount}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            History (Completed / Dropped) <span style={{ background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'history' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{completedCount + droppedCount}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('all')}
                            style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'all' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'all' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{placements.length}</span>
                        </button>
                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Learner Profile</th>
                                    <th>Host Workplace & Mentor</th>
                                    <th>Placement Details</th>
                                    <th>Timeline</th>
                                    <th>Status</th>
                                    <th className="cdp-th--right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enrichedAndFilteredPlacements.length > 0 ? enrichedAndFilteredPlacements.map(p => {
                                    const isExpiringSoon = p.status === 'active' && moment(p.endDate).isBefore(moment().add(30, 'days'));

                                    return (
                                        <tr key={p.id}>
                                            {/* Learner Cell */}
                                            <td>
                                                <div className="cdp-learner-cell">
                                                    <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
                                                    <div className="cdp-learner-cell__info">
                                                        <span className="cdp-learner-cell__name">{p.learnerName}</span>
                                                        <span className="cdp-learner-cell__id">{p.idNumber}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Workplace Cell */}
                                            <td>
                                                <span className="cdp-placement__employer">{p.employerName}</span>
                                                <div style={{ fontSize: '0.75rem', color: p.mentorId ? '#64748b' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: p.mentorId ? 500 : 700 }}>
                                                    {p.mentorId ? (
                                                        <><User size={12} /> {p.mentorName}</>
                                                    ) : (
                                                        <><AlertTriangle size={12} /> No Mentor Assigned</>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Placement Type Cell */}
                                            <td>
                                                <div className="cdp-chips" style={{ flexDirection: 'column', gap: '4px' }}>
                                                    <span className="cdp-chip cdp-chip--w" style={{ width: 'fit-content' }}>{p.placementType}</span>
                                                    <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                                                        {p.compliance?.bbbeeSpendCategory || (p as any).bbbeeSpendCategory || 'Uncategorized'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Timeline Cell */}
                                            <td>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
                                                    {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
                                                </div>
                                                {isExpiringSoon && (
                                                    <div style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <AlertTriangle size={10} /> Ends &lt; 30 days
                                                    </div>
                                                )}
                                            </td>

                                            {/* Status Cell */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>

                                                    {/* Main Operational Status Badge */}
                                                    <span className={`cdp-status-badge ${p.status === 'active' ? 'cdp-status-badge--active' : p.status === 'terminated' ? 'cdp-status-badge--dropped' : ''}`} style={p.status === 'pending_signatures' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : p.status === 'completed' ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}}>
                                                        {p.status.replace('_', ' ')}
                                                    </span>

                                                    {/* Tripartite Contract Compliance Badge (WBLPA Tracking) */}
                                                    {p.compliance?.isAgreementFullyExecuted ? (
                                                        p.compliance?.wblpaAgreementUrl ? (
                                                            <a
                                                                href={p.compliance.wblpaAgreementUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
                                                                title="Click to view signed contract document"
                                                            >
                                                                <CheckCircle size={10} /> WBLPA Signed & On File
                                                            </a>
                                                        ) : (
                                                            <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                <CheckCircle size={10} /> WBLPA Signed (No Link)
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <AlertCircle size={10} /> No WBLPA Uploaded
                                                        </span>
                                                    )}

                                                    {/* Mentor Supervision Status Badge */}
                                                    {!p.mentorId && (
                                                        <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <User size={10} /> Mentor Required
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="cdp-td--right">
                                                <div className="cdp-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingPlacement(p)}
                                                        style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-blue)' }}
                                                        title="Edit Placement Details"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOptionsPlacement(p)}
                                                        style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--mlab-amber)' }}
                                                        title="Placement Options"
                                                    >
                                                        <MoreVertical size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
                                            <Briefcase size={40} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--mlab-blue)' }} />
                                            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--mlab-midnight)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>No Placements Found</h3>
                                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                                {searchQuery || filterType !== 'all' || filterEmployer !== 'all' || activeTab !== 'active'
                                                    ? "Try adjusting your filters or search query."
                                                    : "You haven't assigned any learners to host companies yet."}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};