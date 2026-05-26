// src/components/admin/WorkplacesManager/WorkplacesManager.tsx

import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import Autocomplete from 'react-google-autocomplete';
import { db } from '../../../lib/firebase';
import {
    Building2, MapPin, User, Search, Plus, Edit2, Trash2,
    ShieldCheck, X, Loader2, Briefcase, Save, ExternalLink,
    Mail, Phone, Hash, UserPlus
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { useStore, type StaffMember } from '../../../store/useStore';
import type { Employer } from '../../../types';
import './WorkplacesManager.css';

/* ─── EMPLOYER MODAL ─────────────────────────────────────────────────────────── */
interface EmployerModalProps {
    editing: Employer | null;
    onClose: () => void;
    onSaved: () => void;
}
const EmployerModal: React.FC<EmployerModalProps> = ({ editing, onClose, onSaved }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: editing?.name || '',
        registrationNumber: editing?.registrationNumber || '',
        physicalAddress: editing?.physicalAddress || '',
        contactPerson: editing?.contactPerson || '',
        contactEmail: editing?.contactEmail || '',
        contactPhone: editing?.contactPhone || '',
        lat: editing?.lat || null as number | null,
        lng: editing?.lng || null as number | null,
    });

    const handlePlaceSelected = (place: any) => {
        if (!place.geometry) return;
        setForm(p => ({
            ...p,
            physicalAddress: place.formatted_address || p.physicalAddress,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(doc(db, 'employers', editing.id), { ...form });
                toast.success('Workplace updated successfully!');
            } else {
                const ref = doc(collection(db, 'employers'));
                await setDoc(ref, { ...form, id: ref.id, status: 'active', createdAt: new Date().toISOString() });
                toast.success('New workplace added successfully!');
            }
            onSaved();
            onClose();
        } catch { toast.error('Failed to save workplace.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="wm-overlay" onClick={onClose}>
            <div className="wm-modal" onClick={e => e.stopPropagation()}>
                <div className="wm-modal__header">
                    <div className="wm-modal__header-icon"><Building2 size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">{editing ? 'Edit Workplace' : 'Add New Workplace'}</h2>
                        <p className="wm-modal__subtitle">Host company registration and contact details</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form">
                    <div className="wm-modal__body">

                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><Building2 size={12} /> Company Details</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Host Company Name <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="text" placeholder="e.g. Acme Tech Solutions"
                                        value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                                </div>
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Company Registration / SETA Number</label>
                                    <input className="wm-form-input" type="text" placeholder="e.g. 2021/123456/07"
                                        value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
                                </div>
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label"><MapPin size={11} /> Physical Address (Google Verified)</label>
                                    <Autocomplete
                                        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                        onPlaceSelected={handlePlaceSelected}
                                        options={{ types: [], componentRestrictions: { country: 'za' } }}
                                        className="wm-form-input"
                                        defaultValue={form.physicalAddress}
                                        placeholder="Start typing the street name…"
                                    />
                                    {form.physicalAddress && (
                                        <div className="wm-verified-address">
                                            <ShieldCheck size={12} />
                                            <span>{form.physicalAddress}</span>
                                            {form.lat && form.lng && (
                                                <button type="button" className="wm-maps-link"
                                                    onClick={() => window.open(`https://www.google.com/maps?q=${form.lat},${form.lng}`, '_blank', 'noopener')}>
                                                    <ExternalLink size={11} /> Map
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="wm-form-section">
                            <div className="wm-form-section__label"><User size={12} /> Primary Contact Person</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Full Name <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="text" placeholder="e.g. Jane Doe"
                                        value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
                                    <input className="wm-form-input" required type="email" placeholder="jane@company.com"
                                        value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Contact Number</label>
                                    <input className="wm-form-input" type="tel" placeholder="082 123 4567"
                                        value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="wm-modal__footer">
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Workplace</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─── MENTOR MODAL ───────────────────────────────────────────────────────────── */
interface MentorModalProps {
    editing: StaffMember | null;
    employerId: string;
    onClose: () => void;
    onSaved: () => void;
    addStaff: (m: StaffMember) => Promise<void>;
}
const MentorModal: React.FC<MentorModalProps> = ({ editing, employerId, onClose, onSaved, addStaff }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        fullName: editing?.fullName || '',
        email: editing?.email || '',
        phone: editing?.phone || '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(doc(db, 'users', editing.id), { fullName: form.fullName, phone: form.phone, updatedAt: new Date().toISOString() });
                toast.success('Mentor updated successfully!');
            } else {
                await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
                toast.success('Mentor created — invite sent!');
            }
            onSaved();
            onClose();
        } catch (err) { console.error('Mentor save error:', err); }
        finally { setSaving(false); }
    };

    return (
        <div className="wm-overlay" onClick={onClose}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
                <div className="wm-modal__header wm-modal__header--green">
                    <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
                    <div>
                        <h2 className="wm-modal__title">{editing ? 'Edit Mentor' : 'Add Workplace Mentor'}</h2>
                        <p className="wm-modal__subtitle">Workplace supervision contact</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
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
                                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                    disabled={!!editing} />
                                {editing && <span className="wm-form-hint">Email cannot be changed after creation.</span>}
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
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export const WorkplacesManager: React.FC = () => {
    const { employers, fetchEmployers, addStaff } = useStore();
    const toast = useToast();

    const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
    const [searchQuery, setSearchQuery] = useState('');
    const [mentors, setMentors] = useState<StaffMember[]>([]);

    // Employer modal
    const [employerModalOpen, setEmployerModalOpen] = useState(false);
    const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

    // Mentor modal
    const [mentorModalOpen, setMentorModalOpen] = useState(false);
    const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
    const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

    const loadData = async () => {
        try {
            await fetchEmployers();
            const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
            setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
        } catch { toast.error('Failed to load workplaces.'); }
        finally { setIsInitialLoad(false); }
    };

    useEffect(() => { loadData(); }, []);

    const refreshMentors = async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
        setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
    };

    const handleArchiveEmployer = async (id: string, name: string) => {
        if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
        try {
            await updateDoc(doc(db, 'employers', id), { status: 'archived' });
            toast.info(`${name} archived.`);
            await fetchEmployers();
        } catch { toast.error('Failed to archive.'); }
    };

    const handleArchiveMentor = async (id: string, name: string) => {
        if (!window.confirm(`Remove mentor access for ${name}?`)) return;
        try {
            await updateDoc(doc(db, 'users', id), { status: 'archived' });
            setMentors(p => p.filter(m => m.id !== id));
            toast.info('Mentor access removed.');
        } catch { toast.error('Failed to remove mentor.'); }
    };

    const openEmployerModal = (emp?: Employer) => {
        setEditingEmployer(emp || null);
        setEmployerModalOpen(true);
    };
    const openMentorModal = (empId: string, mentor?: StaffMember) => {
        setActiveMentorEmpId(empId);
        setEditingMentor(mentor || null);
        setMentorModalOpen(true);
    };

    const filteredEmployers = employers.filter(emp =>
        emp.status !== 'archived' && (
            emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    return (
        <div className="wm-root animate-fade-in">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* Modals */}
            {employerModalOpen && (
                <EmployerModal
                    editing={editingEmployer}
                    onClose={() => setEmployerModalOpen(false)}
                    onSaved={fetchEmployers}
                />
            )}
            {mentorModalOpen && (
                <MentorModal
                    editing={editingMentor}
                    employerId={activeMentorEmpId}
                    onClose={() => setMentorModalOpen(false)}
                    onSaved={refreshMentors}
                    addStaff={addStaff}
                />
            )}

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Building2 size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Workplaces & Mentors</h1>
                        <p className="wm-page-header__desc">Host companies and assigned workplace supervision contacts.</p>
                    </div>
                </div>
                <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()}>
                    <Plus size={14} /> Add Workplace
                </button>
            </div>

            {/* ── TOOLBAR ── */}
            <div className="wm-toolbar">
                <div className="wm-search">
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search workplaces or contact persons…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
                    )}
                </div>
                <div className="wm-toolbar__count">
                    {filteredEmployers.length} workplace{filteredEmployers.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ── CONTENT ── */}
            {isInitialLoad ? (
                <div className="wm-loading">
                    <div className="ap-spinner" />
                    <span className="wm-loading__label">Loading Workplaces…</span>
                </div>
            ) : filteredEmployers.length === 0 ? (
                <div className="wm-empty">
                    <div className="wm-empty__icon"><Building2 size={36} /></div>
                    <p className="wm-empty__title">{searchQuery ? 'No Results Found' : 'No Workplaces Yet'}</p>
                    <p className="wm-empty__desc">
                        {searchQuery ? 'Try a different search term.' : 'Add your first host company to get started.'}
                    </p>
                    {!searchQuery && (
                        <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()}>
                            <Plus size={14} /> Add First Workplace
                        </button>
                    )}
                </div>
            ) : (
                <div className="wm-grid">
                    {filteredEmployers.map(emp => {
                        const companyMentors = mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');
                        return (
                            <div key={emp.id} className="wm-card">
                                {/* Card header — name + actions */}
                                <div className="wm-card__header">
                                    <h3 className="wm-card__name">{emp.name}</h3>
                                    <div className="wm-card__actions">
                                        <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit"><Edit2 size={13} /></button>
                                        <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive"><Trash2 size={13} /></button>
                                    </div>
                                </div>

                                {/* Registration number chip */}
                                <div className="wm-card__reg">
                                    <Hash size={11} />
                                    <span>{emp.registrationNumber || 'Registration not provided'}</span>
                                </div>

                                {/* Address row */}
                                <div className="wm-card__address">
                                    <MapPin size={12} className="wm-card__address-icon" />
                                    <span className="wm-card__address-text">{emp.physicalAddress || 'No address on record'}</span>
                                    {emp.lat && emp.lng && (
                                        <button
                                            className="wm-maps-link wm-maps-link--inline"
                                            onClick={() => window.open(`https://www.google.com/maps?q=${emp.lat},${emp.lng}`, '_blank', 'noopener')}
                                            title="Open in Google Maps"
                                        >
                                            <ExternalLink size={11} />
                                        </button>
                                    )}
                                </div>

                                {/* Contact person rows */}
                                <div className="wm-card__contact">
                                    <div className="wm-contact-row">
                                        <User size={12} className="wm-contact-row__icon" />
                                        <span className="wm-contact-row__label">Contact</span>
                                        <span className="wm-contact-row__value">{emp.contactPerson || 'TBC'}</span>
                                    </div>
                                    {emp.contactEmail && (
                                        <div className="wm-contact-row">
                                            <Mail size={12} className="wm-contact-row__icon" />
                                            <span className="wm-contact-row__label">Email</span>
                                            <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactEmail}</span>
                                        </div>
                                    )}
                                    {emp.contactPhone && (
                                        <div className="wm-contact-row">
                                            <Phone size={12} className="wm-contact-row__icon" />
                                            <span className="wm-contact-row__label">Phone</span>
                                            <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactPhone}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Mentors section */}
                                <div className="wm-card__mentors">
                                    <div className="wm-mentors__header">
                                        <div className="wm-mentors__title">
                                            <Briefcase size={13} />
                                            Mentors
                                            {companyMentors.length > 0 && (
                                                <span className="wm-mentors__count">{companyMentors.length}</span>
                                            )}
                                        </div>
                                        <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
                                            <UserPlus size={12} /> Add
                                        </button>
                                    </div>

                                    {companyMentors.length === 0 ? (
                                        <div className="wm-mentor-empty">No mentors assigned yet.</div>
                                    ) : (
                                        <div className="wm-mentor-list">
                                            {companyMentors.map(mentor => (
                                                <div key={mentor.id} className="wm-mentor-item">
                                                    <div className="wm-mentor-item__avatar">
                                                        {mentor.fullName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="wm-mentor-item__info">
                                                        <span className="wm-mentor-item__name">{mentor.fullName}</span>
                                                        <span className="wm-mentor-item__email">{mentor.email}</span>
                                                    </div>
                                                    <div className="wm-mentor-item__actions">
                                                        <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
                                                        <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
