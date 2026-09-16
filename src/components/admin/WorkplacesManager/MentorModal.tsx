// src/components/admin/WorkplacesManager/MentorModal.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { Briefcase, X, Loader2, Save, Users, UserPlus, ShieldCheck, Search, ChevronDown, User, Mail, Phone } from 'lucide-react';
import { useStore, type StaffMember } from '../../../store/useStore';
import { useToast } from '../../common/Toast/Toast';
import { db } from '../../../lib/firebase';

interface MentorModalProps {
    editing?: StaffMember | null;
    employerId: string;
    onClose: () => void;
    onSaved: () => void;
    addStaff: (m: StaffMember) => Promise<void>;
}

export const MentorModal: React.FC<MentorModalProps> = ({ editing, employerId, onClose, onSaved, addStaff }) => {
    const toast = useToast();
    const { staff, fetchStaff, user, setUser } = useStore() as any;
    const [saving, setSaving] = useState(false);

    // Mode Selector: 'existing' = Search & Select Staff | 'external' = Manual Creation
    const [sourceMode, setSourceMode] = useState<'existing' | 'external'>(editing ? 'external' : 'existing');
    const [selectedStaffId, setSelectedStaffId] = useState<string>('');

    // Searchable Dropdown UI State
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [staffSearchQuery, setStaffSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [form, setForm] = useState({
        fullName: editing?.fullName || '',
        email: editing?.email || '',
        phone: editing?.phone || '',
    });

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter available staff options dynamically based on search query
    const filteredStaffOptions = useMemo(() => {
        const activeStaff = (staff || []).filter((s: StaffMember) => s.status !== 'archived');
        if (!staffSearchQuery.trim()) return activeStaff;
        const lower = staffSearchQuery.toLowerCase().trim();
        return activeStaff.filter((s: StaffMember) =>
            s.fullName?.toLowerCase().includes(lower) ||
            s.email?.toLowerCase().includes(lower) ||
            s.role?.replace('_', ' ').toLowerCase().includes(lower)
        );
    }, [staff, staffSearchQuery]);

    const selectedStaffObj = useMemo(() => {
        return (staff || []).find((s: StaffMember) => s.id === selectedStaffId);
    }, [staff, selectedStaffId]);

    // Single-select choice handler
    const handleSelectStaff = (selectedMember: StaffMember) => {
        setSelectedStaffId(selectedMember.id);
        setForm({
            fullName: selectedMember.fullName || '',
            email: selectedMember.email || '',
            phone: selectedMember.phone || '',
        });
        setIsDropdownOpen(false);
        setStaffSearchQuery('');
    };

    // Helper to sync local store if modifying current user
    const syncActiveSessionUser = (targetUserId: string, extraUpdates: Record<string, any> = {}) => {
        if (user && (user.uid === targetUserId || user.id === targetUserId) && typeof setUser === 'function') {
            setUser({
                ...user,
                isMentor: true,
                ...extraUpdates
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const cleanEmail = form.email.trim().toLowerCase();

        try {
            if (editing) {
                // 1. UPDATE EXISTING MENTOR RECORD
                const userRef = doc(db, 'users', editing.id);
                const userSnap = await getDoc(userRef);
                const currentRole = userSnap.exists() ? (userSnap.data()?.role || 'mentor') : 'mentor';

                const updates = {
                    fullName: form.fullName.trim(),
                    phone: form.phone.trim(),
                    isMentor: true,
                    role: currentRole,
                    updatedAt: new Date().toISOString()
                };

                await updateDoc(userRef, updates);
                syncActiveSessionUser(editing.id, updates);
                toast.success('Mentor profile updated & flagged as mentor!');
            } else if (sourceMode === 'existing' && selectedStaffId) {
                // 2. LINK EXISTING STAFF MEMBER (e.g. Facilitator/Admin) AS A MENTOR
                const userRef = doc(db, 'users', selectedStaffId);
                const userSnap = await getDoc(userRef);
                const existingRole = userSnap.exists() ? (userSnap.data()?.role || selectedStaffObj?.role || 'mentor') : 'mentor';

                const updates = {
                    employerId: employerId,
                    isMentor: true,
                    role: existingRole,
                    phone: form.phone.trim() || selectedStaffObj?.phone || '',
                    updatedAt: new Date().toISOString()
                };

                await updateDoc(userRef, updates);
                syncActiveSessionUser(selectedStaffId, updates);
                toast.success(`Assigned ${form.fullName} (${existingRole}) as Workplace Mentor!`);
            } else {
                // 3. ADD EXTERNAL MENTOR OR LINK BY EMAIL
                const existingStaff = (staff || []).find((s: StaffMember) => s.email?.trim().toLowerCase() === cleanEmail);

                if (existingStaff) {
                    const userRef = doc(db, 'users', existingStaff.id);
                    const userSnap = await getDoc(userRef);
                    const existingRole = userSnap.exists() ? (userSnap.data()?.role || existingStaff.role) : existingStaff.role;

                    const updates = {
                        employerId: employerId,
                        isMentor: true,
                        role: existingRole,
                        phone: form.phone.trim() || existingStaff.phone || '',
                        updatedAt: new Date().toISOString()
                    };

                    await updateDoc(userRef, updates);
                    syncActiveSessionUser(existingStaff.id, updates);
                    toast.success(`Linked ${existingStaff.fullName} (${existingRole}) as a Workplace Mentor!`);
                } else {
                    const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        const userDoc = snap.docs[0];
                        const userData = userDoc.data();

                        const updates = {
                            employerId: employerId,
                            isMentor: true,
                            role: userData.role || 'mentor',
                            phone: form.phone.trim() || userData.phone || '',
                            updatedAt: new Date().toISOString()
                        };

                        await updateDoc(doc(db, 'users', userDoc.id), updates);
                        syncActiveSessionUser(userDoc.id, updates);
                        toast.success(`Linked ${userData.fullName || form.fullName} as a Workplace Mentor!`);
                    } else {
                        // Truly New User -> Cast via unknown to satisfy TypeScript
                        await addStaff({
                            fullName: form.fullName.trim(),
                            email: cleanEmail,
                            phone: form.phone.trim(),
                            role: 'mentor',
                            isMentor: true,
                            employerId,
                            status: 'active'
                        } as unknown as StaffMember);
                        toast.success('External Mentor created — invite sent!');
                    }
                }
            }

            if (fetchStaff) {
                await fetchStaff(true);
            }
            onSaved();
            onClose();
        } catch (err: any) {
            console.error('Mentor save error:', err);
            if (err.message?.includes('already in use') || err.code === 'auth/email-already-in-use') {
                toast.error('This email is already in use by another user account.');
            } else {
                toast.error('Failed to save mentor details.');
            }
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()} style={{ borderRadius: '0', maxWidth: '520px', overflow: 'visible' }}>

                {/* 🚀 STACKING CONTEXT & OPAQUE DROPDOWN FIXES */}
                <style>{`
                    .sm-dropdown { 
                        position: absolute !important; 
                        top: 100% !important; 
                        left: 0 !important; 
                        right: 0 !important; 
                        background-color: #ffffff !important; 
                        border: 1px solid #cbd5e1 !important; 
                        box-shadow: 0 12px 30px rgba(0,0,0,0.25) !important; 
                        z-index: 999999 !important; 
                        max-height: 220px !important; 
                        overflow-y: auto !important; 
                        margin-top: 4px !important;
                    }
                    .sm-dropdown-search { 
                        position: sticky !important; 
                        top: 0 !important; 
                        background-color: #f8fafc !important; 
                        padding: 8px 10px !important; 
                        border-bottom: 1px solid #cbd5e1 !important; 
                        display: flex !important; 
                        align-items: center !important; 
                        gap: 8px !important; 
                        z-index: 1000000 !important; 
                    }
                    .sm-dropdown-item { 
                        padding: 10px 12px !important; 
                        border-bottom: 1px solid #f1f5f9 !important; 
                        cursor: pointer !important; 
                        transition: background 0.15s !important; 
                        font-size: 0.82rem !important; 
                        background-color: #ffffff !important;
                        position: relative !important;
                        z-index: 999999 !important;
                    }
                    .sm-dropdown-item:hover { 
                        background-color: #e0f2fe !important; 
                    }
                    .sm-dropdown-item.active { 
                        background-color: #0284c7 !important; 
                        color: #ffffff !important; 
                    }
                    .sm-dropdown-item.active .text-sub { 
                        color: #e0f2fe !important; 
                    }
                `}</style>

                <div className="wm-modal__header wm-modal__header--green">
                    <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
                    <div>
                        <h2 className="wm-modal__title">{editing ? 'Edit Mentor' : 'Add Workplace Supervisor / Mentor'}</h2>
                        <p className="wm-modal__subtitle">Workplace supervision contact</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="wm-modal__form" style={{ overflow: 'visible' }}>
                    <div className="wm-modal__body" style={{ overflow: 'visible' }}>

                        {/* MODE TOGGLE (Assign Existing vs Add External) */}
                        {!editing && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', background: '#f1f5f9', padding: '4px', border: '1px solid #cbd5e1' }}>
                                <button
                                    type="button"
                                    onClick={() => { setSourceMode('existing'); setSelectedStaffId(''); setForm({ fullName: '', email: '', phone: '' }); }}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        border: 'none',
                                        background: sourceMode === 'existing' ? 'white' : 'transparent',
                                        color: sourceMode === 'existing' ? 'var(--mlab-blue)' : '#64748b',
                                        fontWeight: sourceMode === 'existing' ? 700 : 500,
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: sourceMode === 'existing' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Users size={14} /> Assign Existing Staff
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSourceMode('external'); setSelectedStaffId(''); setForm({ fullName: '', email: '', phone: '' }); }}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        border: 'none',
                                        background: sourceMode === 'external' ? 'white' : 'transparent',
                                        color: sourceMode === 'external' ? 'var(--mlab-blue)' : '#64748b',
                                        fontWeight: sourceMode === 'external' ? 700 : 500,
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: sourceMode === 'external' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <UserPlus size={14} /> Add External Mentor
                                </button>
                            </div>
                        )}

                        {/* MODE A: SEARCHABLE SINGLE-SELECT DROPDOWN WITH ELEVATED Z-INDEX */}
                        {!editing && sourceMode === 'existing' && (
                            <div className="wm-form-group wm-form-group--full animate-fade-in" style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 100 }}>
                                <label className="wm-form-label">Select Staff Member / Facilitator <span className="wm-form-required">*</span></label>

                                <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="wm-form-input"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#fff', borderRadius: 0 }}
                                        disabled={saving}
                                    >
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: selectedStaffObj ? 700 : 400, color: selectedStaffObj ? 'var(--mlab-blue)' : '#94a3b8' }}>
                                            {selectedStaffObj
                                                ? `${selectedStaffObj.fullName} (${selectedStaffObj.role ? selectedStaffObj.role.replace('_', ' ').toUpperCase() : 'Staff'})`
                                                : '-- Search & Select Existing Staff --'}
                                        </span>
                                        <ChevronDown size={14} color="#64748b" />
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="sm-dropdown">
                                            <div className="sm-dropdown-search">
                                                <Search size={14} color="#64748b" />
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={staffSearchQuery}
                                                    onChange={e => setStaffSearchQuery(e.target.value)}
                                                    placeholder="Search by name, email, or role..."
                                                    style={{ border: 'none', background: 'transparent', color: 'var(--mlab-blue)', outline: 'none', width: '100%', fontSize: '0.82rem' }}
                                                />
                                            </div>

                                            {filteredStaffOptions.length > 0 ? (
                                                filteredStaffOptions.map((s: StaffMember) => (
                                                    <div
                                                        key={s.id}
                                                        className={`sm-dropdown-item ${selectedStaffId === s.id ? 'active' : ''}`}
                                                        onClick={() => handleSelectStaff(s)}
                                                    >
                                                        <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{s.fullName}</div>
                                                        <div className="text-sub" style={{ fontSize: '0.72rem', color: selectedStaffId === s.id ? '#e0f2fe' : '#64748b' }}>
                                                            {s.role ? s.role.replace('_', ' ').toUpperCase() : 'STAFF'} • {s.email}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div style={{ padding: '12px', fontSize: '0.8rem', color: '#64748b', textAlign: 'center', backgroundColor: '#ffffff' }}>
                                                    No staff members match "{staffSearchQuery}".
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {selectedStaffObj && (
                                    <div className="animate-fade-in" style={{ marginTop: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '0', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <ShieldCheck size={16} color="#166534" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <div style={{ fontSize: '0.75rem', color: '#14532d', lineHeight: 1.4 }}>
                                            <strong>Role Preservation:</strong> {selectedStaffObj.fullName} is registered as <strong>{selectedStaffObj.role?.replace('_', ' ')}</strong>.
                                            <span style={{ display: 'block', color: '#15803d', fontWeight: 600, marginTop: '2px' }}>
                                                ✔️ Primary role will remain intact. Mentorship capability (<code style={{ background: '#dcfce7', padding: '1px 4px' }}>isMentor: true</code>) will be appended.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MODE B: FORM INPUT FIELDS WITH LOWER Z-INDEX LAYER */}
                        <div className="wm-form-grid" style={{ position: 'relative', zIndex: 1 }}>
                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Mentor Full Name <span className="wm-form-required">*</span></label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="wm-form-input"
                                        style={{ borderRadius: '0', paddingLeft: '32px', background: (!editing && sourceMode === 'existing') ? '#f8fafc' : 'white' }}
                                        required
                                        type="text"
                                        placeholder="e.g. John Smith"
                                        value={form.fullName}
                                        onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                                        disabled={!editing && sourceMode === 'existing' && !!selectedStaffId}
                                    />
                                    <User size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                </div>
                            </div>

                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="wm-form-input"
                                        style={{ borderRadius: '0', paddingLeft: '32px', background: (editing || (!editing && sourceMode === 'existing')) ? '#f8fafc' : 'white' }}
                                        required
                                        type="email"
                                        placeholder="john@company.com"
                                        value={form.email}
                                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                        disabled={!!editing || (sourceMode === 'existing' && !!selectedStaffId)}
                                    />
                                    <Mail size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                </div>
                                {editing && <span className="wm-form-hint">Email cannot be changed after creation.</span>}
                            </div>

                            <div className="wm-form-group wm-form-group--full">
                                <label className="wm-form-label">Phone Number</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="wm-form-input"
                                        style={{ borderRadius: '0', paddingLeft: '32px' }}
                                        type="tel"
                                        placeholder="082 123 4567"
                                        value={form.phone}
                                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                        disabled={saving}
                                    />
                                    <Phone size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="wm-modal__footer" style={{ position: 'relative', zIndex: 1 }}>
                        <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="wm-btn wm-btn--primary" style={{ borderRadius: '0' }} disabled={saving || !form.fullName || !form.email || (sourceMode === 'existing' && !selectedStaffId && !editing)}>
                            {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> {editing ? 'Save Changes' : (sourceMode === 'existing' ? 'Assign Mentorship Access' : 'Save External Mentor')}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default MentorModal;