// src/components/admin/WorkplacesManager/WorkplacesManager.tsx

import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import Autocomplete from "react-google-autocomplete";
import { db } from '../../../lib/firebase';
import {
    Building2, MapPin, Mail, User, Search,
    Plus, Edit2, Trash2, ShieldCheck, X, Loader2, Briefcase,
    Save
} from 'lucide-react';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import './WorkplacesManager.css';
import { useStore, type StaffMember } from '../../../store/useStore';
import type { Employer } from '../../../types';

export const WorkplacesManager: React.FC = () => {
    const { employers, fetchEmployers, addStaff } = useStore();
    const toast = useToast();

    // 🚀 FIX: Only show loading screen if the global store is empty
    const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
    const [searchQuery, setSearchQuery] = useState('');

    // We fetch and store mentors locally in this component
    const [mentors, setMentors] = useState<StaffMember[]>([]);

    // Employer Modal States
    const [isEmployerModalOpen, setIsEmployerModalOpen] = useState(false);
    const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);
    const [empFormData, setEmpFormData] = useState({
        name: '',
        registrationNumber: '',
        physicalAddress: '',
        contactPerson: '',
        contactEmail: '',
        contactPhone: '',
        lat: null as number | null,
        lng: null as number | null
    });

    // Mentor Modal States
    const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
    const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
    const [activeEmployerId, setActiveEmployerId] = useState<string>('');
    const [mentorFormData, setMentorFormData] = useState({
        fullName: '', email: '', phone: ''
    });

    const [saving, setSaving] = useState(false);

    // Fetch Employers & Mentors (Silently if data already exists)
    const fetchData = async () => {
        try {
            await fetchEmployers();

            // Fetch all users who are mentors
            const q = query(collection(db, 'users'), where('role', '==', 'mentor'));
            const snap = await getDocs(q);
            const mentorsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
            setMentors(mentorsData);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Failed to load workplaces data.");
        } finally {
            setIsInitialLoad(false); // Turn off the loader
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ─── EMPLOYER LOGIC ───
    const openEmployerModal = (employer?: Employer) => {
        if (employer) {
            setEditingEmployer(employer);
            setEmpFormData({
                name: employer.name,
                registrationNumber: employer.registrationNumber || '',
                physicalAddress: employer.physicalAddress || '',
                contactPerson: employer.contactPerson || '',
                contactEmail: employer.contactEmail || '',
                contactPhone: employer.contactPhone || '',
                lat: employer.lat || null,
                lng: employer.lng || null
            });
        } else {
            setEditingEmployer(null);
            setEmpFormData({
                name: '', registrationNumber: '', physicalAddress: '',
                contactPerson: '', contactEmail: '', contactPhone: '',
                lat: null, lng: null
            });
        }
        setIsEmployerModalOpen(true);
    };

    // Google Places Autocomplete Handler (Captures Lat/Lng silently)
    const handlePlaceSelected = (place: any) => {
        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        const streetNumber = getComp("street_number");
        const route = getComp("route");
        const city = getComp("locality") || getComp("sublocality_level_1");
        const province = getComp("administrative_area_level_1");
        const postalCode = getComp("postal_code");

        // Extract Coordinates securely
        let newLat = null;
        let newLng = null;
        if (place.geometry && place.geometry.location) {
            newLat = place.geometry.location.lat();
            newLng = place.geometry.location.lng();
        }

        // Format a nice, clean address string
        const formattedAddress = `${streetNumber} ${route}, ${city}, ${province}, ${postalCode}`.trim().replace(/^,\s*/, '');

        setEmpFormData(prev => ({
            ...prev,
            physicalAddress: formattedAddress,
            lat: newLat,
            lng: newLng
        }));
    };

    const handleSaveEmployer = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingEmployer) {
                await updateDoc(doc(db, 'employers', editingEmployer.id), { ...empFormData });
                toast.success("Workplace updated successfully!");
            } else {
                const empRef = doc(collection(db, 'employers'));
                await setDoc(empRef, { ...empFormData, id: empRef.id, status: 'active', createdAt: new Date().toISOString() });
                toast.success("New Workplace added successfully!");
            }
            await fetchEmployers();
            setIsEmployerModalOpen(false);
        } catch (error) {
            toast.error("Failed to save workplace.");
        } finally {
            setSaving(false);
        }
    };

    const handleArchiveEmployer = async (id: string, name: string) => {
        if (window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) {
            try {
                await updateDoc(doc(db, 'employers', id), { status: 'archived' });
                toast.info(`${name} archived.`);
                await fetchEmployers();
            } catch (error) { toast.error("Failed to archive workplace."); }
        }
    };

    // ─── MENTOR LOGIC ───
    const openMentorModal = (employerId: string, mentor?: StaffMember) => {
        setActiveEmployerId(employerId);
        if (mentor) {
            setEditingMentor(mentor);
            setMentorFormData({ fullName: mentor.fullName, email: mentor.email, phone: mentor.phone || '' });
        } else {
            setEditingMentor(null);
            setMentorFormData({ fullName: '', email: '', phone: '' });
        }
        setIsMentorModalOpen(true);
    };

    const handleSaveMentor = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingMentor) {
                // If editing, we just update the Firestore document (Auth doesn't need to change unless email changes)
                const mentorRef = doc(db, 'users', editingMentor.id);
                await updateDoc(mentorRef, {
                    fullName: mentorFormData.fullName,
                    phone: mentorFormData.phone,
                    updatedAt: new Date().toISOString()
                });
                toast.success("Mentor updated successfully!");
            } else {
                // Route it through your global addStaff action to trigger the Cloud Function!
                await addStaff({
                    email: mentorFormData.email,
                    fullName: mentorFormData.fullName,
                    phone: mentorFormData.phone,
                    role: 'mentor',
                    employerId: activeEmployerId, // Maps them to the company
                } as StaffMember);

                toast.success("Mentor created and invite sent!");
            }

            // Refresh mentors list
            const q = query(collection(db, 'users'), where('role', '==', 'mentor'));
            const snap = await getDocs(q);
            setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));

            setIsMentorModalOpen(false);
        } catch (error) {
            console.error("Mentor save error:", error);
            // Don't show generic toast if addStaff already threw a specific alert
        } finally {
            setSaving(false);
        }
    };

    const handleArchiveMentor = async (id: string, name: string) => {
        if (window.confirm(`Remove mentor access for ${name}?`)) {
            try {
                await updateDoc(doc(db, 'users', id), { status: 'archived' });
                setMentors(prev => prev.filter(m => m.id !== id));
                toast.info(`Mentor access removed.`);
            } catch (error) { toast.error("Failed to remove mentor."); }
        }
    };

    const filteredEmployers = employers.filter(emp =>
        emp.status !== 'archived' &&
        (emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="wm-roo">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="mlab-cohorts__header">
                <h1 className="wm-title">Host Companies & Mentors</h1>
                <button className="wm-btn-primary" onClick={() => openEmployerModal()}>
                    <Plus size={18} /> Add Workplace
                </button>
            </div>

            {/* 🚀 FIX: Uses isInitialLoad so it only blocks UI on the very first load */}
            {isInitialLoad ? (
                <div className="ap-fullscreen" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <div className="ap-spinner" />
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Verifying Access...</span>
                    </div>
                </div>
            ) : filteredEmployers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <Building2 size={48} color="#cbd5e1" style={{ margin: '0 auto 15px' }} />
                    <h3 style={{ color: '#334155', margin: '0 0 10px 0' }}>No Workplaces Found</h3>
                    <p style={{ color: '#64748b', margin: 0 }}>{searchQuery ? "No companies match your search." : "You haven't added any host companies yet."}</p>
                </div>
            ) : (
                <div className="wm-grid">
                    {filteredEmployers.map(emp => {
                        const companyMentors = mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');

                        return (
                            <div key={emp.id} className="wm-card">
                                <div className="wm-card-actions">
                                    <button className="wm-icon-btn" onClick={() => openEmployerModal(emp)} title="Edit Workplace"><Edit2 size={14} /></button>
                                    <button className="wm-icon-btn danger" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive Workplace"><Trash2 size={14} /></button>
                                </div>

                                <h3 className="wm-card-title">{emp.name}</h3>

                                <div className="wm-detail">
                                    <ShieldCheck size={14} className="wm-detail-icon" />
                                    <span><strong>Reg No:</strong> {emp.registrationNumber || <em style={{ opacity: 0.5 }}>Not Provided</em>}</span>
                                </div>
                                <div className="wm-detail">
                                    <MapPin size={14} className="wm-detail-icon" />
                                    <span>{emp.physicalAddress || <em style={{ opacity: 0.5 }}>No address provided</em>}</span>
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', margin: '15px 0', paddingTop: '15px' }}>
                                    <div className="wm-detail">
                                        <User size={14} className="wm-detail-icon" />
                                        <span><strong>Contact:</strong> {emp.contactPerson || <em style={{ opacity: 0.5 }}>TBC</em>}</span>
                                    </div>
                                    <div className="wm-detail">
                                        <Mail size={14} className="wm-detail-icon" />
                                        <span>{emp.contactEmail || <em style={{ opacity: 0.5 }}>No email</em>}</span>
                                    </div>
                                </div>

                                <div className="wm-mentors-section">
                                    <div className="wm-mentors-header">
                                        <h4><Briefcase size={12} style={{ display: 'inline', marginRight: '4px' }} /> Company Mentors</h4>
                                        <button className="wm-btn-text" onClick={() => openMentorModal(emp.id)}>
                                            <Plus size={12} /> Add Mentor
                                        </button>
                                    </div>

                                    {companyMentors.length === 0 ? (
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No mentors assigned yet.</p>
                                    ) : (
                                        <ul className="wm-mentor-list">
                                            {companyMentors.map(mentor => (
                                                <li key={mentor.id} className="wm-mentor-item">
                                                    <div className="wm-mentor-info">
                                                        <span className="wm-mentor-name">{mentor.fullName}</span>
                                                        <span className="wm-mentor-email">{mentor.email}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="wm-icon-btn" style={{ width: '24px', height: '24px' }} onClick={() => openMentorModal(emp.id, mentor)}><Edit2 size={12} /></button>
                                                        <button className="wm-icon-btn danger" style={{ width: '24px', height: '24px' }} onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)}><Trash2 size={12} /></button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* EMPLOYER MODAL */}
            {isEmployerModalOpen && (
                <div className="wm-modal-overlay" onClick={() => setIsEmployerModalOpen(false)}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()}>
                        <div className="wm-modal-header">
                            <h2>{editingEmployer ? 'Edit Workplace' : 'Add New Workplace'}</h2>
                            <button className="wm-icon-btn" onClick={() => setIsEmployerModalOpen(false)}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSaveEmployer}>
                            <div className="wm-modal-body">
                                <div className="wm-input-group full-width">
                                    <label>Host Company Name *</label>
                                    <input required type="text" placeholder="e.g. Acme Tech Solutions" value={empFormData.name} onChange={e => setEmpFormData({ ...empFormData, name: e.target.value })} />
                                </div>
                                <div className="wm-input-group full-width">
                                    <label>Company Registration / SETA Number</label>
                                    <input type="text" placeholder="e.g. 2021/123456/07" value={empFormData.registrationNumber} onChange={e => setEmpFormData({ ...empFormData, registrationNumber: e.target.value })} />
                                </div>

                                {/* GOOGLE AUTOCOMPLETE ADDRESS FIELD */}
                                <div className="wm-input-group full-width">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MapPin size={14} color="#64748b" /> Physical Address (Google Verified) *
                                    </label>
                                    <Autocomplete
                                        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                        onPlaceSelected={handlePlaceSelected}
                                        options={{ types: ["address"], componentRestrictions: { country: "za" } }}
                                        style={{
                                            padding: '0.75rem',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}
                                        defaultValue={empFormData.physicalAddress}
                                        placeholder="Start typing the street name..."
                                    />
                                    {empFormData.physicalAddress && (
                                        <textarea
                                            readOnly
                                            rows={2}
                                            value={empFormData.physicalAddress}
                                            style={{ marginTop: '8px', background: '#f8fafc', color: '#64748b' }}
                                        />
                                    )}
                                </div>

                                <div className="wm-input-group full-width" style={{ marginTop: '10px', paddingBottom: '5px', borderBottom: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: 0, color: '#0f172a' }}>Primary Contact Person</h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Usually the HR Manager or Director.</p>
                                </div>
                                <div className="wm-input-group full-width">
                                    <label>Full Name *</label>
                                    <input required type="text" placeholder="e.g. Jane Doe" value={empFormData.contactPerson} onChange={e => setEmpFormData({ ...empFormData, contactPerson: e.target.value })} />
                                </div>
                                <div className="wm-input-group">
                                    <label>Email Address *</label>
                                    <input required type="email" placeholder="jane@company.com" value={empFormData.contactEmail} onChange={e => setEmpFormData({ ...empFormData, contactEmail: e.target.value })} />
                                </div>
                                <div className="wm-input-group">
                                    <label>Contact Number</label>
                                    <input type="tel" placeholder="082 123 4567" value={empFormData.contactPhone} onChange={e => setEmpFormData({ ...empFormData, contactPhone: e.target.value })} />
                                </div>
                            </div>
                            <div className="wm-modal-footer">
                                <button type="button" className="wm-btn-ghost" onClick={() => setIsEmployerModalOpen(false)} disabled={saving}>Cancel</button>
                                <button type="submit" className="wm-btn-primary" disabled={saving}>
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Workplace
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MENTOR MODAL */}
            {isMentorModalOpen && (
                <div className="wm-modal-overlay" onClick={() => setIsMentorModalOpen(false)}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="wm-modal-header" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                            <h2 style={{ color: '#b45309' }}>{editingMentor ? 'Edit Mentor' : 'Add Workplace Mentor'}</h2>
                            <button className="wm-icon-btn" onClick={() => setIsMentorModalOpen(false)}><X size={20} color="#b45309" /></button>
                        </div>

                        <form onSubmit={handleSaveMentor}>
                            <div className="wm-modal-body" style={{ display: 'flex', flexDirection: 'column' }}>
                                <div className="wm-input-group full-width">
                                    <label>Mentor Full Name *</label>
                                    <input required type="text" placeholder="e.g. John Smith" value={mentorFormData.fullName} onChange={e => setMentorFormData({ ...mentorFormData, fullName: e.target.value })} />
                                </div>
                                <div className="wm-input-group full-width">
                                    <label>Mentor Email Address *</label>
                                    <input required type="email" placeholder="john@company.com" value={mentorFormData.email} onChange={e => setMentorFormData({ ...mentorFormData, email: e.target.value })} disabled={!!editingMentor} />
                                    {!editingMentor && <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>This email will be used for the mentor to log in.</span>}
                                </div>
                                <div className="wm-input-group full-width">
                                    <label>Phone Number (Optional)</label>
                                    <input type="tel" placeholder="082 123 4567" value={mentorFormData.phone} onChange={e => setMentorFormData({ ...mentorFormData, phone: e.target.value })} />
                                </div>
                            </div>
                            <div className="wm-modal-footer">
                                <button type="button" className="wm-btn-ghost" onClick={() => setIsMentorModalOpen(false)} disabled={saving}>Cancel</button>
                                <button type="submit" className="wm-btn-primary" style={{ background: '#f59e0b' }} disabled={saving}>
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Mentor
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};