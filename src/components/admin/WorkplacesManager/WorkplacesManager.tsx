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



// // src/components/admin/WorkplacesManager/WorkplacesManager.tsx

// import React, { useState, useEffect } from 'react';
// import { collection, doc, setDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
// import Autocomplete from "react-google-autocomplete";
// import { db } from '../../../lib/firebase';
// import {
//     Building2, MapPin, User, Search,
//     Plus, Edit2, Trash2, ShieldCheck, X, Loader2, Briefcase,
//     Save
// } from 'lucide-react';
// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import { useStore, type StaffMember } from '../../../store/useStore';
// import type { Employer } from '../../../types';

// // Use standard styles for the grid/cards
// import '../../views/CohortsView/CohortsView.css'
// // Reusing the exact LearnerFormModal styling for the popups
// import '../LearnerFormModal/LearnerFormModal.css';


// export const WorkplacesManager: React.FC = () => {
//     const { employers, fetchEmployers, addStaff } = useStore();
//     const toast = useToast();

//     const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
//     const [searchQuery, setSearchQuery] = useState('');

//     // We fetch and store mentors locally in this component
//     const [mentors, setMentors] = useState<StaffMember[]>([]);

//     // Employer Modal States
//     const [isEmployerModalOpen, setIsEmployerModalOpen] = useState(false);
//     const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);
//     const [empFormData, setEmpFormData] = useState({
//         name: '',
//         registrationNumber: '',
//         physicalAddress: '',
//         contactPerson: '',
//         contactEmail: '',
//         contactPhone: '',
//         lat: null as number | null,
//         lng: null as number | null
//     });

//     // Mentor Modal States
//     const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
//     const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
//     const [activeEmployerId, setActiveEmployerId] = useState<string>('');
//     const [mentorFormData, setMentorFormData] = useState({
//         fullName: '', email: '', phone: ''
//     });

//     const [saving, setSaving] = useState(false);

//     // Fetch Employers & Mentors (Silently if data already exists)
//     const fetchData = async () => {
//         try {
//             await fetchEmployers();

//             // Fetch all users who are mentors
//             const q = query(collection(db, 'users'), where('role', '==', 'mentor'));
//             const snap = await getDocs(q);
//             const mentorsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
//             setMentors(mentorsData);
//         } catch (error) {
//             console.error("Error fetching data:", error);
//             toast.error("Failed to load workplaces data.");
//         } finally {
//             setIsInitialLoad(false); // Turn off the loader
//         }
//     };

//     useEffect(() => {
//         fetchData();
//     }, []);

//     // ─── EMPLOYER LOGIC ───
//     const openEmployerModal = (employer?: Employer) => {
//         if (employer) {
//             setEditingEmployer(employer);
//             setEmpFormData({
//                 name: employer.name,
//                 registrationNumber: employer.registrationNumber || '',
//                 physicalAddress: employer.physicalAddress || '',
//                 contactPerson: employer.contactPerson || '',
//                 contactEmail: employer.contactEmail || '',
//                 contactPhone: employer.contactPhone || '',
//                 lat: employer.lat || null,
//                 lng: employer.lng || null
//             });
//         } else {
//             setEditingEmployer(null);
//             setEmpFormData({
//                 name: '', registrationNumber: '', physicalAddress: '',
//                 contactPerson: '', contactEmail: '', contactPhone: '',
//                 lat: null, lng: null
//             });
//         }
//         setIsEmployerModalOpen(true);
//     };

//     // Google Places Autocomplete Handler (Captures Lat/Lng silently)
//     const handlePlaceSelected = (place: any) => {
//         const addressComponents = place.address_components;
//         const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

//         const streetNumber = getComp("street_number");
//         const route = getComp("route");
//         const city = getComp("locality") || getComp("sublocality_level_1");
//         const province = getComp("administrative_area_level_1");
//         const postalCode = getComp("postal_code");

//         // Extract Coordinates securely
//         let newLat = null;
//         let newLng = null;
//         if (place.geometry && place.geometry.location) {
//             newLat = place.geometry.location.lat();
//             newLng = place.geometry.location.lng();
//         }

//         // Format a nice, clean address string
//         const formattedAddress = `${streetNumber} ${route}, ${city}, ${province}, ${postalCode}`.trim().replace(/^,\s*/, '');

//         setEmpFormData(prev => ({
//             ...prev,
//             physicalAddress: formattedAddress,
//             lat: newLat,
//             lng: newLng
//         }));
//     };

//     const handleSaveEmployer = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setSaving(true);
//         try {
//             if (editingEmployer) {
//                 await updateDoc(doc(db, 'employers', editingEmployer.id), { ...empFormData });
//                 toast.success("Workplace updated successfully!");
//             } else {
//                 const empRef = doc(collection(db, 'employers'));
//                 await setDoc(empRef, { ...empFormData, id: empRef.id, status: 'active', createdAt: new Date().toISOString() });
//                 toast.success("New Workplace added successfully!");
//             }
//             await fetchEmployers();
//             setIsEmployerModalOpen(false);
//         } catch (error) {
//             toast.error("Failed to save workplace.");
//         } finally {
//             setSaving(false);
//         }
//     };

//     const handleArchiveEmployer = async (id: string, name: string) => {
//         if (window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) {
//             try {
//                 await updateDoc(doc(db, 'employers', id), { status: 'archived' });
//                 toast.info(`${name} archived.`);
//                 await fetchEmployers();
//             } catch (error) { toast.error("Failed to archive workplace."); }
//         }
//     };

//     // ─── MENTOR LOGIC ───
//     const openMentorModal = (employerId: string, mentor?: StaffMember) => {
//         setActiveEmployerId(employerId);
//         if (mentor) {
//             setEditingMentor(mentor);
//             setMentorFormData({ fullName: mentor.fullName, email: mentor.email, phone: mentor.phone || '' });
//         } else {
//             setEditingMentor(null);
//             setMentorFormData({ fullName: '', email: '', phone: '' });
//         }
//         setIsMentorModalOpen(true);
//     };

//     const handleSaveMentor = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setSaving(true);
//         try {
//             if (editingMentor) {
//                 // If editing, we just update the Firestore document (Auth doesn't need to change unless email changes)
//                 const mentorRef = doc(db, 'users', editingMentor.id);
//                 await updateDoc(mentorRef, {
//                     fullName: mentorFormData.fullName,
//                     phone: mentorFormData.phone,
//                     updatedAt: new Date().toISOString()
//                 });
//                 toast.success("Mentor updated successfully!");
//             } else {
//                 // Route it through your global addStaff action to trigger the Cloud Function!
//                 await addStaff({
//                     email: mentorFormData.email,
//                     fullName: mentorFormData.fullName,
//                     phone: mentorFormData.phone,
//                     role: 'mentor',
//                     employerId: activeEmployerId, // Maps them to the company
//                 } as StaffMember);

//                 toast.success("Mentor created and invite sent!");
//             }

//             // Refresh mentors list
//             const q = query(collection(db, 'users'), where('role', '==', 'mentor'));
//             const snap = await getDocs(q);
//             setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));

//             setIsMentorModalOpen(false);
//         } catch (error) {
//             console.error("Mentor save error:", error);
//         } finally {
//             setSaving(false);
//         }
//     };

//     const handleArchiveMentor = async (id: string, name: string) => {
//         if (window.confirm(`Remove mentor access for ${name}?`)) {
//             try {
//                 await updateDoc(doc(db, 'users', id), { status: 'archived' });
//                 setMentors(prev => prev.filter(m => m.id !== id));
//                 toast.info(`Mentor access removed.`);
//             } catch (error) { toast.error("Failed to remove mentor."); }
//         }
//     };

//     const filteredEmployers = employers.filter(emp =>
//         emp.status !== 'archived' &&
//         (emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//             (emp.contactPerson && emp.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())))
//     );

//     return (
//         <div className="mlab-cohorts animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* ── Header ─────────────────────────────────────────────────── */}
//             <div className="mlab-cohorts__header">
//                 <div className="mlab-cohorts__header-text">
//                     <h2 className="mlab-cohorts__title">Host Companies & Mentors</h2>
//                     <p className="mlab-cohorts__subtitle">Manage workplace providers and assigned mentors.</p>
//                 </div>
//                 <div style={{ display: 'flex', gap: '10px' }}>
//                     <button className="mlab-btn mlab-btn--green" onClick={() => openEmployerModal()}>
//                         <Plus size={16} /> Add Workplace
//                     </button>
//                 </div>
//             </div>

//             {/* ── Toolbar / Search ───────────────────────────────────────── */}
//             {!isInitialLoad && (
//                 <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '0.5rem 1rem' }}>
//                     <Search size={18} color="var(--mlab-grey)" style={{ marginRight: '10px' }} />
//                     <input
//                         type="text"
//                         placeholder="Search workplaces or contact persons..."
//                         value={searchQuery}
//                         onChange={e => setSearchQuery(e.target.value)}
//                         style={{ border: 'none', outline: 'none', color: 'grey', width: '100%', fontSize: '0.9rem', fontFamily: 'var(--font-body)', background: 'transparent' }}
//                     />
//                 </div>
//             )}

//             {/* ── Main Content ───────────────────────────────────────────── */}
//             {isInitialLoad ? (
//                 <div className="ap-fullscreen" style={{ position: 'relative', height: '300px' }}>
//                     <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '4rem' }}>
//                         <div className="ap-spinner" />
//                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Loading Workplaces...</span>
//                     </div>
//                 </div>
//             ) : filteredEmployers.length === 0 ? (
//                 <div className="mlab-cohort-empty">
//                     <Building2 size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
//                     <p className="mlab-cohort-empty__title">No Workplaces Found</p>
//                     <p className="mlab-cohort-empty__desc">{searchQuery ? "No companies match your search." : "You haven't added any host companies yet."}</p>
//                 </div>
//             ) : (
//                 <div className="mlab-cohort-grid">
//                     {filteredEmployers.map(emp => {
//                         const companyMentors = mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');

//                         return (
//                             <div key={emp.id} className="mlab-cohort-card animate-fade-in">
//                                 {/* Card Header */}
//                                 <div className="mlab-cohort-card__header">
//                                     <h3 className="mlab-cohort-card__name">{emp.name}</h3>
//                                     <div className="mlab-cohort-card__actions">
//                                         <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit Workplace"><Edit2 size={14} /></button>
//                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive Workplace"><Trash2 size={14} /></button>
//                                     </div>
//                                 </div>

//                                 {/* Company Details */}
//                                 <div className="mlab-cohort-card__dates" style={{ background: 'var(--mlab-light-blue)', borderLeft: '3px solid var(--mlab-blue)', marginBottom: '0.5rem' }}>
//                                     <ShieldCheck size={14} />
//                                     <span><strong>Reg No:</strong> {emp.registrationNumber || 'Not Provided'}</span>
//                                 </div>
//                                 <div className="mlab-cohort-card__dates" style={{ background: 'var(--mlab-bg)', borderLeft: '3px solid var(--mlab-grey)', marginBottom: '1rem' }}>
//                                     <MapPin size={14} style={{ flexShrink: 0 }} />
//                                     <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
//                                         {emp.physicalAddress || 'No address provided'}
//                                     </span>
//                                 </div>

//                                 {/* Contact Person Details */}
//                                 <div className="mlab-role-row-stack" style={{ marginBottom: '0' }}>
//                                     <div className="mlab-role-row">
//                                         <div className="mlab-role-dot mlab-role-dot--blue" />
//                                         <span className="mlab-role-label">Contact:</span>
//                                         <span className="mlab-role-name" style={{ fontWeight: 'normal' }}>{emp.contactPerson || 'TBC'}</span>
//                                     </div>
//                                     <div className="mlab-role-row">
//                                         <div className="mlab-role-dot mlab-role-dot--green" />
//                                         <span className="mlab-role-label">Email:</span>
//                                         <span className="mlab-role-name" style={{ fontWeight: 'normal', color: 'var(--mlab-grey)' }}>{emp.contactEmail || 'No email'}</span>
//                                     </div>
//                                 </div>

//                                 {/* Mentors Sub-Section */}
//                                 <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
//                                         <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                             <Briefcase size={14} /> Assigned Mentors
//                                         </h4>
//                                         <button
//                                             type="button"
//                                             style={{ background: 'none', border: 'none', color: 'var(--mlab-green-dark)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}
//                                             onClick={() => openMentorModal(emp.id)}
//                                         >
//                                             <Plus size={12} /> Add
//                                         </button>
//                                     </div>

//                                     {companyMentors.length === 0 ? (
//                                         <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No mentors assigned yet.</p>
//                                     ) : (
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//                                             {companyMentors.map(mentor => (
//                                                 <div key={mentor.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
//                                                     <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
//                                                         <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{mentor.fullName}</span>
//                                                         <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{mentor.email}</span>
//                                                     </div>
//                                                     <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
//                                                         <button className="mlab-icon-btn mlab-icon-btn--blue" style={{ width: '24px', height: '24px' }} onClick={() => openMentorModal(emp.id, mentor)}><Edit2 size={12} /></button>
//                                                         <button className="mlab-icon-btn mlab-icon-btn--amber" style={{ width: '24px', height: '24px', color: '#ef4444' }} onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)}><Trash2 size={12} /></button>
//                                                     </div>
//                                                 </div>
//                                             ))}
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         );
//                     })}
//                 </div>
//             )}

//             {/* EMPLOYER MODAL (Using lfm- Form Layout) */}
//             {isEmployerModalOpen && (
//                 <div className="lfm-overlay" onClick={() => setIsEmployerModalOpen(false)} style={{ zIndex: 9999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title"><Building2 size={16} /> {editingEmployer ? 'Edit Workplace' : 'Add New Workplace'}</h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setIsEmployerModalOpen(false)} disabled={saving}><X size={20} /></button>
//                         </div>

//                         <form onSubmit={handleSaveEmployer} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
//                             <div className="lfm-body">

//                                 <div className="lfm-section-hdr"><Building2 size={13} /> Company Details</div>
//                                 <div className="lfm-grid">
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Host Company Name *</label>
//                                         <input className="lfm-input" required type="text" placeholder="e.g. Acme Tech Solutions" value={empFormData.name} onChange={e => setEmpFormData({ ...empFormData, name: e.target.value })} />
//                                     </div>
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Company Registration / SETA Number</label>
//                                         <input className="lfm-input" type="text" placeholder="e.g. 2021/123456/07" value={empFormData.registrationNumber} onChange={e => setEmpFormData({ ...empFormData, registrationNumber: e.target.value })} />
//                                     </div>

//                                     {/* GOOGLE AUTOCOMPLETE ADDRESS FIELD */}
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <MapPin size={12} color="var(--mlab-green)" /> Physical Address (Google Verified) *
//                                         </label>
//                                         <Autocomplete
//                                             apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                             onPlaceSelected={handlePlaceSelected}
//                                             options={{ types: [], componentRestrictions: { country: "za" } }}
//                                             className="lfm-input"
//                                             defaultValue={empFormData.physicalAddress}
//                                             placeholder="Start typing the street name..."
//                                         />
//                                         {empFormData.physicalAddress && (
//                                             <textarea
//                                                 className="lfm-input"
//                                                 readOnly
//                                                 rows={2}
//                                                 value={empFormData.physicalAddress}
//                                                 style={{ marginTop: '8px', background: '#f8fafc', color: '#64748b' }}
//                                             />
//                                         )}
//                                     </div>
//                                 </div>

//                                 <div className="lfm-section-hdr" style={{ marginTop: '1rem' }}><User size={13} /> Primary Contact Person</div>
//                                 <p style={{ margin: '-0.5rem 0 1rem 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>Usually the HR Manager or Director.</p>

//                                 <div className="lfm-grid">
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Full Name *</label>
//                                         <input className="lfm-input" required type="text" placeholder="e.g. Jane Doe" value={empFormData.contactPerson} onChange={e => setEmpFormData({ ...empFormData, contactPerson: e.target.value })} />
//                                     </div>
//                                     <div className="lfm-fg">
//                                         <label>Email Address *</label>
//                                         <input className="lfm-input" required type="email" placeholder="jane@company.com" value={empFormData.contactEmail} onChange={e => setEmpFormData({ ...empFormData, contactEmail: e.target.value })} />
//                                     </div>
//                                     <div className="lfm-fg">
//                                         <label>Contact Number</label>
//                                         <input className="lfm-input" type="tel" placeholder="082 123 4567" value={empFormData.contactPhone} onChange={e => setEmpFormData({ ...empFormData, contactPhone: e.target.value })} />
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="lfm-footer">
//                                 <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsEmployerModalOpen(false)} disabled={saving}>Cancel</button>
//                                 <button type="submit" className="lfm-btn lfm-btn--primary" disabled={saving}>
//                                     {saving ? <><Loader2 className="lfm-spin" size={13} /> Saving...</> : <><Save size={13} /> Save Workplace</>}
//                                 </button>
//                             </div>
//                         </form>
//                     </div>
//                 </div>
//             )}

//             {/* MENTOR MODAL (Using lfm- Form Layout) */}
//             {isMentorModalOpen && (
//                 <div
//                     className="lfm-overlay"
//                     onClick={() => setIsMentorModalOpen(false)}
//                     style={{
//                         zIndex: 9999,
//                         position: 'fixed',
//                         top: 0,
//                         left: 0,
//                         width: '100vw',
//                         height: '100vh',
//                         display: 'flex',
//                         alignItems: 'center',
//                         justifyContent: 'center',
//                         backdropFilter: 'blur(4px)',
//                         background: 'rgba(0, 0, 0, 0.5)'
//                     }}
//                 >
//                     <div
//                         className="lfm-modal animate-fade-in"
//                         onClick={e => e.stopPropagation()}
//                         style={{ maxWidth: '450px', width: '95%', margin: 'auto' }}
//                     >
//                         {/* ... mentor form content ... */}
//                         <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
//                             <h2 className="lfm-header__title"><Briefcase size={16} /> {editingMentor ? 'Edit Mentor' : 'Add Workplace Mentor'}</h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setIsMentorModalOpen(false)} disabled={saving}><X size={20} /></button>
//                         </div>

//                         <form onSubmit={handleSaveMentor} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
//                             <div className="lfm-body">
//                                 <div className="lfm-grid">
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Mentor Full Name *</label>
//                                         <input className="lfm-input" required type="text" placeholder="e.g. John Smith" value={mentorFormData.fullName} onChange={e => setMentorFormData({ ...mentorFormData, fullName: e.target.value })} />
//                                     </div>
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Mentor Email Address *</label>
//                                         <input
//                                             className="lfm-input"
//                                             required
//                                             type="email"
//                                             placeholder="john@company.com"
//                                             value={mentorFormData.email}
//                                             onChange={e => setMentorFormData({ ...mentorFormData, email: e.target.value })}
//                                             disabled={!!editingMentor}
//                                             style={editingMentor ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
//                                         />
//                                     </div>
//                                     <div className="lfm-fg lfm-fg--full">
//                                         <label>Phone Number (Optional)</label>
//                                         <input className="lfm-input" type="tel" placeholder="082 123 4567" value={mentorFormData.phone} onChange={e => setMentorFormData({ ...mentorFormData, phone: e.target.value })} />
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="lfm-footer">
//                                 <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsMentorModalOpen(false)} disabled={saving}>Cancel</button>
//                                 <button type="submit" className="lfm-btn lfm-btn--primary" disabled={saving}>
//                                     {saving ? <><Loader2 className="lfm-spin" size={13} /> Saving...</> : <><Save size={13} /> Save Mentor</>}
//                                 </button>
//                             </div>
//                         </form>
//                     </div>
//                 </div>
//             )}

//         </div>
//     );
// };