// src/components/admin/WorkplacesManager/WorkplacesManager.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, updateDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import * as XLSX from 'xlsx';
import {
    Building2, MapPin, User, Search, Plus, Edit2, Trash2,
    X, Briefcase, ExternalLink, Mail, Phone, Hash, UserPlus,
    LayoutList, AlertTriangle, Users, LinkIcon, CheckCircle, ListPlus, LayoutTemplate, UploadCloud,
    Loader2
} from 'lucide-react';

import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { useStore, type StaffMember } from '../../../store/useStore';
import type { Employer } from '../../../types';

// Modals & Sub-views
import { EmployerModal } from './EmployerModal';
import { MentorModal } from './MentorModal';
import './WorkplacesManager.css';
import { EmployerFormBuilderModal } from './EmployerFormBuilderPage';

export const WorkplacesManager: React.FC = () => {
    const { employers, fetchEmployers, addStaff, learners, fetchLearners } = useStore();

    // Type casting to bypass TS errors
    const placements = ((useStore(s => (s as any).placements) || []) as any[]);
    const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;

    // 🚀 INJECTED MISSING FETCHERS FOR AUDIT LEDGER DATA
    const fetchAttendanceRecords = (useStore(s => (s as any).fetchAttendanceRecords) || (async () => { })) as any;
    const fetchAttendanceLogs = (useStore(s => (s as any).fetchAttendanceLogs) || (async () => { })) as any;
    const fetchWorkplaceLogs = (useStore(s => (s as any).fetchWorkplaceLogs) || (async () => { })) as any;

    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
    const [isImporting, setIsImporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [mentors, setMentors] = useState<StaffMember[]>([]);

    // View States (Pages & Tabs)
    const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');
    const [showFormBuilder, setShowFormBuilder] = useState(false);

    // Modals State
    const [employerModalOpen, setEmployerModalOpen] = useState(false);
    const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

    const [mentorModalOpen, setMentorModalOpen] = useState(false);
    const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
    const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

    const loadData = async () => {
        try {
            // 🚀 BATCH FETCH ALL COMPLIANCE DATA REQUIRED FOR THE DASHBOARDS
            await Promise.all([
                fetchEmployers(),
                fetchLearners(),
                fetchPlacements(),
                fetchAttendanceRecords(),
                fetchAttendanceLogs(),
                fetchWorkplaceLogs()
            ]);
            const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
            setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
        } catch {
            toast.error('Failed to load workplace tracking data.');
        } finally {
            setIsInitialLoad(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const refreshMentors = async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
        setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
    };

    const handleCopyPublicLink = () => {
        const url = `${window.location.origin}/apply/host-learners`;
        navigator.clipboard.writeText(url);
        toast.success('Public Application Link copied to clipboard!');
    };

    const handleArchiveEmployer = async (id: string, name: string) => {
        if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
        try {
            await updateDoc(doc(db, 'employers', id), { status: 'archived' });
            toast.info(`${name} archived.`);
            await fetchEmployers();
        } catch { toast.error('Failed to archive partner.'); }
    };

    const handleApproveEmployer = async (id: string, name: string) => {
        if (!window.confirm(`Approve ${name} as a Host Employer Partner?`)) return;
        try {
            await updateDoc(doc(db, 'employers', id), { status: 'active' });
            toast.success(`${name} approved successfully!`);
            await fetchEmployers();
        } catch { toast.error('Failed to approve partner.'); }
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

    // 🚀 Event dispatcher to open Company Insights safely in AdminDashboard
    const handleViewCompanyInsights = (company: Employer) => {
        const event = new CustomEvent('openCompanyInsights', { detail: company });
        window.dispatchEvent(event);
    };

    // Keep backwards compatibility for the active placements "View Ledger" button
    const openViewPlacements = (emp: Employer) => {
        handleViewCompanyInsights(emp);
    };

    // ── BULK IMPORT EXCEL/CSV LOGIC ──
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to array of objects (using the first row as keys)
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, any>[];

                let importCount = 0;

                for (const row of rows) {
                    // Intelligent Mapping: Try to find common column headers regardless of exact casing
                    const getVal = (keywords: string[]) => {
                        const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
                        return key ? String(row[key]).trim() : "";
                    };

                    const companyName = getVal(['company', 'organisation', 'business', 'employer']);
                    if (!companyName) continue; // Skip rows without a company name

                    const contactName = getVal(['contact', 'person', 'name', 'representative']);
                    const contactEmail = getVal(['email', 'e-mail']);
                    const contactPhone = getVal(['phone', 'mobile', 'cell', 'tel']);
                    const physicalAddress = getVal(['address', 'location', 'physical']);
                    const regNumber = getVal(['registration', 'cipc', 'reg']);

                    const newEmployer = {
                        name: companyName,
                        contactPerson: contactName || "TBC",
                        contactEmail: contactEmail || "",
                        contactPhone: contactPhone || "",
                        physicalAddress: physicalAddress || "",
                        registrationNumber: regNumber || "",
                        status: 'active', // Automatically approve bulk imported partners
                        internCapacity: 1, // Default baseline
                        mlabTier: 'Tier 2 (Established SME)',
                        mlabRiskRating: 'Medium',
                        internalNotes: 'Bulk imported via spreadsheet.',
                        createdAt: new Date().toISOString()
                    };

                    const ref = doc(collection(db, 'employers'));
                    await setDoc(ref, { ...newEmployer, id: ref.id });
                    importCount++;
                }

                toast.success(`Successfully imported ${importCount} Employer Partners!`);
                await fetchEmployers(); // Refresh list

            } catch (err) {
                console.error("Import Error", err);
                toast.error("Failed to parse file. Ensure it is a valid CSV or Excel document with a 'Company Name' column.");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // Filter Lists based on search and status
    const allVisibleEmployers = employers.filter(emp =>
        emp.status !== 'archived' && (
            emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    const approvedEmployers = allVisibleEmployers.filter(emp => emp.status === 'active' || emp.status === 'Approved');
    const pendingEmployers = allVisibleEmployers.filter(emp => emp.status === 'Pending Review');

    // Compute Ecosystem KPIs based on APPROVED partners only
    const ecosystemMetrics = useMemo(() => {
        let totalCapacity = 0;
        let highRiskCount = 0;

        approvedEmployers.forEach(emp => {
            totalCapacity += ((emp as any).internCapacity || 1);
            if ((emp as any).mlabRiskRating === 'High' || (emp as any).mlabRiskRating === 'Critical') {
                highRiskCount++;
            }
        });

        return { totalCapacity, highRiskCount };
    }, [approvedEmployers]);

    return (
        <div className="wm-root animate-fade-in">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* Hidden File Input for Bulk Import */}
            <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: "none" }}
            />

            {/* MODALS */}
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
            {/* Form Builder Modal rendered properly */}
            {showFormBuilder && (
                <EmployerFormBuilderModal onClose={() => setShowFormBuilder(false)} />
            )}

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Building2 size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">Employer Partner Ecosystem</h1>
                        <p className="wm-page-header__desc">Manage host companies, inbound applications, and placement capacity.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

                    <button className="cdp-btn cdp-btn--outline" onClick={handleCopyPublicLink} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
                        <LinkIcon size={14} /> Copy Public Link
                    </button>

                    <button className="cdp-btn cdp-btn--outline" onClick={() => setShowFormBuilder(true)} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
                        <LayoutTemplate size={14} /> Form Builder
                    </button>

                    <button className="cdp-btn cdp-btn--outline" onClick={() => fileInputRef.current?.click()} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }} disabled={isImporting}>
                        {isImporting ? <Loader2 size={14} className="wm-spin" /> : <UploadCloud size={14} />}
                        {isImporting ? "Importing..." : "Bulk Import"}
                    </button>

                    <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()} disabled={isImporting}>
                        <Plus size={14} /> Manually Add
                    </button>
                </div>
            </div>

            {/* ── ECOSYSTEM METRICS RIBBON ── */}
            <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', padding: '0 1.5rem' }}>
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{approvedEmployers.length}</span>
                        <span className="cdp-stat-card__label">Approved Partners</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><Users size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{ecosystemMetrics.totalCapacity}</span>
                        <span className="cdp-stat-card__label">Total Network Capacity</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{placements.filter(p => p.status === 'active').length}</span>
                        <span className="cdp-stat-card__label">Active Placements</span>
                    </div>
                </div>
                <div className="cdp-stat-card" style={{ background: '#fff1f2', borderLeftColor: '#ef4444' }}>
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="#ef4444" /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: ecosystemMetrics.highRiskCount > 0 ? '#ef4444' : 'inherit' }}>{ecosystemMetrics.highRiskCount}</span>
                        <span className="cdp-stat-card__label">High Risk Workplaces</span>
                    </div>
                </div>
            </div>

            {/* ── TABS & TOOLBAR ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <button
                        onClick={() => setActiveTab('approved')}
                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'approved' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'approved' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Building2 size={16} /> Approved Partners <span style={{ background: activeTab === 'approved' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{approvedEmployers.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('pending')}
                        style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'pending' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'pending' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <ListPlus size={16} /> Pending Applications
                        <span style={{ background: pendingEmployers.length > 0 ? '#ef4444' : '#f1f5f9', color: pendingEmployers.length > 0 ? 'white' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingEmployers.length}</span>
                    </button>
                </div>

                <div className="wm-search" style={{ maxWidth: '300px', marginBottom: '8px' }}>
                    <Search size={15} className="wm-search__icon" />
                    <input
                        type="text"
                        className="wm-search__input"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
                    )}
                </div>
            </div>

            {/* ── CONTENT GRID ── */}
            {isInitialLoad ? (
                <div className="wm-loading">
                    <div className="ap-spinner" />
                    <span className="wm-loading__label">Loading Ecosystem Blueprint…</span>
                </div>
            ) : (activeTab === 'approved' ? approvedEmployers : pendingEmployers).length === 0 ? (
                <div className="wm-empty" style={{ margin: '0 1.5rem' }}>
                    {activeTab === 'pending' ? <ListPlus size={36} color="var(--mlab-grey-light)" /> : <Building2 size={36} color="var(--mlab-grey-light)" />}
                    <p className="wm-empty__title">{searchQuery ? 'No Results Found' : activeTab === 'pending' ? 'No Pending Applications' : 'No Approved Partners'}</p>
                    <p className="wm-empty__desc">
                        {searchQuery ? 'Try a different search term.' : activeTab === 'pending' ? 'Share your public link to start receiving applications.' : 'Onboard your first host company to unlock the placement matchmaking engine.'}
                    </p>
                </div>
            ) : (
                <div className="wm-grid" style={{ padding: '0 1.5rem' }}>
                    {(activeTab === 'approved' ? approvedEmployers : pendingEmployers).map(emp => {
                        const isPending = emp.status === 'Pending Review';

                        // Calculate metrics only for approved partners
                        const companyMentors = isPending ? [] : mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');
                        const companyPlacements = isPending ? [] : placements.filter(p => p.employerId === emp.id);
                        const activePlacements = isPending ? [] : companyPlacements.filter(p => p.status === 'active');

                        const internCapacity = (emp as any).internCapacity || 1;
                        const isOverCapacity = activePlacements.length > internCapacity;
                        const riskRating = (emp as any).mlabRiskRating || 'Pending';

                        return (
                            <div key={emp.id} className="wm-card" style={{ borderTopColor: isPending ? 'var(--mlab-amber)' : riskRating === 'High' || riskRating === 'Critical' ? '#ef4444' : riskRating === 'Medium' ? '#f59e0b' : 'var(--mlab-blue)', display: 'flex', flexDirection: 'column' }}>

                                {/* Header */}
                                <div className="wm-card__header">
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
                                        <h3 className="wm-card__name">{emp.name}</h3>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {isPending ? (
                                                <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>New Application</span>
                                            ) : (
                                                <>
                                                    <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                        {(emp as any).mlabTier || 'Tier 2 SME'}
                                                    </span>
                                                    {riskRating === 'Low' ? (
                                                        <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Low Risk</span>
                                                    ) : riskRating === 'Medium' ? (
                                                        <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Medium Risk</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{riskRating} Risk</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="wm-card__actions">
                                        {!isPending && (
                                            <button
                                                type="button"
                                                onClick={() => handleViewCompanyInsights(emp)}
                                                className="mlab-icon-btn"
                                                style={{ border: '1px solid #cbd5e1', color: 'var(--mlab-green)' }}
                                                title="View Company Insights & Ledger"
                                            >
                                                <Briefcase size={13} />
                                            </button>
                                        )}
                                        {!isPending && <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit Profile"><Edit2 size={13} /></button>}
                                        <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive/Reject"><Trash2 size={13} /></button>
                                    </div>
                                </div>

                                {/* Address row */}
                                <div className="wm-card__address" style={{ marginTop: '0.5rem' }}>
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

                                {/* Contact Person */}
                                <div className="wm-card__contact" style={{ marginTop: '0.5rem', marginBottom: isPending ? '0' : '1rem' }}>
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

                                {isPending ? (
                                    /* PENDING APPLICATION ACTIONS */
                                    <div style={{ display: 'flex', gap: '8px', padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
                                        <button className="wm-btn wm-btn--primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleApproveEmployer(emp.id, emp.name)}>
                                            <CheckCircle size={14} /> Approve
                                        </button>
                                        <button className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', background: 'white' }} onClick={() => openEmployerModal(emp)}>
                                            <Search size={14} /> Review Data
                                        </button>
                                    </div>
                                ) : (
                                    /* APPROVED PARTNER METRICS & MENTORS */
                                    <>
                                        {/* CAPACITY & PLACEMENTS */}
                                        <div style={{ margin: '0 1.25rem', padding: '1rem', background: isOverCapacity ? '#fef2f2' : '#f8fafc', borderRadius: '8px', border: `1px solid ${isOverCapacity ? '#fecaca' : '#e2e8f0'}`, borderLeft: `4px solid ${isOverCapacity ? '#ef4444' : 'var(--mlab-blue)'}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    <LayoutList size={12} /> Active Placements
                                                </div>
                                                {companyPlacements.length > 0 && (
                                                    <button onClick={() => openViewPlacements(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        View Ledger →
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                                                <div>
                                                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isOverCapacity ? '#ef4444' : 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{activePlacements.length}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: 500 }}>/ {internCapacity} Max Capacity</span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', background: isOverCapacity ? '#fca5a5' : '#cbd5e1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.min((activePlacements.length / internCapacity) * 100, 100)}%`, background: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', height: '100%' }}></div>
                                            </div>
                                            {isOverCapacity && <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}><AlertTriangle size={10} /> Overcapacity Warning</p>}
                                        </div>

                                        {/* MENTORS SECTION */}
                                        <div className="wm-card__mentors" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
                                            <div className="wm-mentors__header">
                                                <div className="wm-mentors__title">
                                                    <Briefcase size={13} />
                                                    Workplace Mentors
                                                    {companyMentors.length > 0 && (
                                                        <span className="wm-mentors__count">{companyMentors.length}</span>
                                                    )}
                                                </div>
                                                <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
                                                    <UserPlus size={12} /> Add
                                                </button>
                                            </div>

                                            {companyMentors.length === 0 ? (
                                                <div className="wm-mentor-empty">No mentors assigned yet. Add a mentor before placing learners.</div>
                                            ) : (
                                                <div className="wm-mentor-list">
                                                    {companyMentors.map(mentor => {
                                                        const mentorLoad = activePlacements.filter(p => p.mentorId === mentor.id).length;
                                                        const isOverloaded = mentorLoad >= 5;

                                                        return (
                                                            <div key={mentor.id} className="wm-mentor-item">
                                                                <div className="wm-mentor-item__avatar" style={{ border: isOverloaded ? '2px solid #ef4444' : 'none' }}>
                                                                    {mentor.fullName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="wm-mentor-item__info">
                                                                    <span className="wm-mentor-item__name">{mentor.fullName}</span>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                        <span style={{ fontSize: '0.65rem', color: isOverloaded ? '#ef4444' : '#64748b', fontWeight: isOverloaded ? 700 : 500 }}>
                                                                            Supervising: {mentorLoad} Intern(s)
                                                                        </span>
                                                                        {isOverloaded && <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '1px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>RATIO HIGH</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="wm-mentor-item__actions">
                                                                    <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
                                                                    <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


// // src/components/admin/WorkplacesManager/WorkplacesManager.tsx

// import React, { useState, useEffect, useMemo, useRef } from 'react';
// import { collection, doc, updateDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import * as XLSX from 'xlsx';
// import {
//     Building2, MapPin, User, Search, Plus, Edit2, Trash2,
//     X, Briefcase, ExternalLink, Mail, Phone, Hash, UserPlus,
//     LayoutList, AlertTriangle, Users, LinkIcon, CheckCircle, ListPlus, LayoutTemplate, UploadCloud,
//     Loader2
// } from 'lucide-react';

// import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// import { useStore, type StaffMember } from '../../../store/useStore';
// import type { Employer } from '../../../types';

// // Modals & Sub-views
// import { EmployerModal } from './EmployerModal';
// import { MentorModal } from './MentorModal';
// import './WorkplacesManager.css';
// import { EmployerFormBuilderModal } from './EmployerFormBuilderPage';

// export const WorkplacesManager: React.FC = () => {
//     const { employers, fetchEmployers, addStaff, learners, fetchLearners } = useStore();

//     // Type casting to bypass TS errors
//     const placements = ((useStore(s => (s as any).placements) || []) as any[]);
//     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;

//     const toast = useToast();
//     const fileInputRef = useRef<HTMLInputElement>(null);

//     const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
//     const [isImporting, setIsImporting] = useState(false);
//     const [searchQuery, setSearchQuery] = useState('');
//     const [mentors, setMentors] = useState<StaffMember[]>([]);

//     // View States (Pages & Tabs)
//     const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');
//     const [showFormBuilder, setShowFormBuilder] = useState(false);

//     // Modals State
//     const [employerModalOpen, setEmployerModalOpen] = useState(false);
//     const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

//     const [mentorModalOpen, setMentorModalOpen] = useState(false);
//     const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
//     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

//     const loadData = async () => {
//         try {
//             await Promise.all([
//                 fetchEmployers(),
//                 fetchLearners(),
//                 fetchPlacements()
//             ]);
//             const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
//             setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
//         } catch {
//             toast.error('Failed to load workplace tracking data.');
//         } finally {
//             setIsInitialLoad(false);
//         }
//     };

//     useEffect(() => { loadData(); }, []);

//     const refreshMentors = async () => {
//         const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
//         setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
//     };

//     const handleCopyPublicLink = () => {
//         const url = `${window.location.origin}/apply/host-learners`;
//         navigator.clipboard.writeText(url);
//         toast.success('Public Application Link copied to clipboard!');
//     };

//     const handleArchiveEmployer = async (id: string, name: string) => {
//         if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
//         try {
//             await updateDoc(doc(db, 'employers', id), { status: 'archived' });
//             toast.info(`${name} archived.`);
//             await fetchEmployers();
//         } catch { toast.error('Failed to archive partner.'); }
//     };

//     const handleApproveEmployer = async (id: string, name: string) => {
//         if (!window.confirm(`Approve ${name} as a Host Employer Partner?`)) return;
//         try {
//             await updateDoc(doc(db, 'employers', id), { status: 'active' });
//             toast.success(`${name} approved successfully!`);
//             await fetchEmployers();
//         } catch { toast.error('Failed to approve partner.'); }
//     };

//     const handleArchiveMentor = async (id: string, name: string) => {
//         if (!window.confirm(`Remove mentor access for ${name}?`)) return;
//         try {
//             await updateDoc(doc(db, 'users', id), { status: 'archived' });
//             setMentors(p => p.filter(m => m.id !== id));
//             toast.info('Mentor access removed.');
//         } catch { toast.error('Failed to remove mentor.'); }
//     };

//     const openEmployerModal = (emp?: Employer) => {
//         setEditingEmployer(emp || null);
//         setEmployerModalOpen(true);
//     };

//     const openMentorModal = (empId: string, mentor?: StaffMember) => {
//         setActiveMentorEmpId(empId);
//         setEditingMentor(mentor || null);
//         setMentorModalOpen(true);
//     };

//     // 🚀 NEW: Event dispatcher to open Company Insights safely in AdminDashboard
//     const handleViewCompanyInsights = (company: Employer) => {
//         const event = new CustomEvent('openCompanyInsights', { detail: company });
//         window.dispatchEvent(event);
//     };

//     // Keep backwards compatibility for the active placements "View Ledger" button
//     const openViewPlacements = (emp: Employer) => {
//         handleViewCompanyInsights(emp);
//     };

//     // ── BULK IMPORT EXCEL/CSV LOGIC ──
//     const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         setIsImporting(true);
//         const reader = new FileReader();

//         reader.onload = async (event) => {
//             try {
//                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
//                 const workbook = XLSX.read(data, { type: 'array' });
//                 const firstSheetName = workbook.SheetNames[0];
//                 const worksheet = workbook.Sheets[firstSheetName];

//                 // Convert to array of objects (using the first row as keys)
//                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, any>[];

//                 let importCount = 0;

//                 for (const row of rows) {
//                     // Intelligent Mapping: Try to find common column headers regardless of exact casing
//                     const getVal = (keywords: string[]) => {
//                         const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
//                         return key ? String(row[key]).trim() : "";
//                     };

//                     const companyName = getVal(['company', 'organisation', 'business', 'employer']);
//                     if (!companyName) continue; // Skip rows without a company name

//                     const contactName = getVal(['contact', 'person', 'name', 'representative']);
//                     const contactEmail = getVal(['email', 'e-mail']);
//                     const contactPhone = getVal(['phone', 'mobile', 'cell', 'tel']);
//                     const physicalAddress = getVal(['address', 'location', 'physical']);
//                     const regNumber = getVal(['registration', 'cipc', 'reg']);

//                     const newEmployer = {
//                         name: companyName,
//                         contactPerson: contactName || "TBC",
//                         contactEmail: contactEmail || "",
//                         contactPhone: contactPhone || "",
//                         physicalAddress: physicalAddress || "",
//                         registrationNumber: regNumber || "",
//                         status: 'active', // Automatically approve bulk imported partners
//                         internCapacity: 1, // Default baseline
//                         mlabTier: 'Tier 2 (Established SME)',
//                         mlabRiskRating: 'Medium',
//                         internalNotes: 'Bulk imported via spreadsheet.',
//                         createdAt: new Date().toISOString()
//                     };

//                     const ref = doc(collection(db, 'employers'));
//                     await setDoc(ref, { ...newEmployer, id: ref.id });
//                     importCount++;
//                 }

//                 toast.success(`Successfully imported ${importCount} Employer Partners!`);
//                 await fetchEmployers(); // Refresh list

//             } catch (err) {
//                 console.error("Import Error", err);
//                 toast.error("Failed to parse file. Ensure it is a valid CSV or Excel document with a 'Company Name' column.");
//             } finally {
//                 setIsImporting(false);
//                 if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
//             }
//         };

//         reader.readAsArrayBuffer(file);
//     };

//     // Filter Lists based on search and status
//     const allVisibleEmployers = employers.filter(emp =>
//         emp.status !== 'archived' && (
//             emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//             (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
//         )
//     );

//     const approvedEmployers = allVisibleEmployers.filter(emp => emp.status === 'active' || emp.status === 'Approved');
//     const pendingEmployers = allVisibleEmployers.filter(emp => emp.status === 'Pending Review');

//     // Compute Ecosystem KPIs based on APPROVED partners only
//     const ecosystemMetrics = useMemo(() => {
//         let totalCapacity = 0;
//         let highRiskCount = 0;

//         approvedEmployers.forEach(emp => {
//             totalCapacity += ((emp as any).internCapacity || 1);
//             if ((emp as any).mlabRiskRating === 'High' || (emp as any).mlabRiskRating === 'Critical') {
//                 highRiskCount++;
//             }
//         });

//         return { totalCapacity, highRiskCount };
//     }, [approvedEmployers]);

//     return (
//         <div className="wm-root animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* Hidden File Input for Bulk Import */}
//             <input
//                 type="file"
//                 accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
//                 ref={fileInputRef}
//                 onChange={handleFileUpload}
//                 style={{ display: "none" }}
//             />

//             {/* MODALS */}
//             {employerModalOpen && (
//                 <EmployerModal
//                     editing={editingEmployer}
//                     onClose={() => setEmployerModalOpen(false)}
//                     onSaved={fetchEmployers}
//                 />
//             )}
//             {mentorModalOpen && (
//                 <MentorModal
//                     editing={editingMentor}
//                     employerId={activeMentorEmpId}
//                     onClose={() => setMentorModalOpen(false)}
//                     onSaved={refreshMentors}
//                     addStaff={addStaff}
//                 />
//             )}
//             {/* Form Builder Modal rendered properly */}
//             {showFormBuilder && (
//                 <EmployerFormBuilderModal onClose={() => setShowFormBuilder(false)} />
//             )}

//             {/* ── PAGE HEADER ── */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><Building2 size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">Employer Partner Ecosystem</h1>
//                         <p className="wm-page-header__desc">Manage host companies, inbound applications, and placement capacity.</p>
//                     </div>
//                 </div>
//                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

//                     <button className="cdp-btn cdp-btn--outline" onClick={handleCopyPublicLink} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
//                         <LinkIcon size={14} /> Copy Public Link
//                     </button>

//                     <button className="cdp-btn cdp-btn--outline" onClick={() => setShowFormBuilder(true)} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
//                         <LayoutTemplate size={14} /> Form Builder
//                     </button>

//                     <button className="cdp-btn cdp-btn--outline" onClick={() => fileInputRef.current?.click()} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }} disabled={isImporting}>
//                         {isImporting ? <Loader2 size={14} className="wm-spin" /> : <UploadCloud size={14} />}
//                         {isImporting ? "Importing..." : "Bulk Import"}
//                     </button>

//                     <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()} disabled={isImporting}>
//                         <Plus size={14} /> Manually Add
//                     </button>
//                 </div>
//             </div>

//             {/* ── ECOSYSTEM METRICS RIBBON ── */}
//             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', padding: '0 1.5rem' }}>
//                 <div className="cdp-stat-card cdp-stat-card--blue">
//                     <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{approvedEmployers.length}</span>
//                         <span className="cdp-stat-card__label">Approved Partners</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--green">
//                     <div className="cdp-stat-card__icon"><Users size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{ecosystemMetrics.totalCapacity}</span>
//                         <span className="cdp-stat-card__label">Total Network Capacity</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card cdp-stat-card--grey">
//                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value">{placements.filter(p => p.status === 'active').length}</span>
//                         <span className="cdp-stat-card__label">Active Placements</span>
//                     </div>
//                 </div>
//                 <div className="cdp-stat-card" style={{ background: '#fff1f2', borderLeftColor: '#ef4444' }}>
//                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="#ef4444" /></div>
//                     <div className="cdp-stat-card__body">
//                         <span className="cdp-stat-card__value" style={{ color: ecosystemMetrics.highRiskCount > 0 ? '#ef4444' : 'inherit' }}>{ecosystemMetrics.highRiskCount}</span>
//                         <span className="cdp-stat-card__label">High Risk Workplaces</span>
//                     </div>
//                 </div>
//             </div>

//             {/* ── TABS & TOOLBAR ── */}
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
//                 <div style={{ display: 'flex', gap: '1.5rem' }}>
//                     <button
//                         onClick={() => setActiveTab('approved')}
//                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'approved' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'approved' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
//                     >
//                         <Building2 size={16} /> Approved Partners <span style={{ background: activeTab === 'approved' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{approvedEmployers.length}</span>
//                     </button>
//                     <button
//                         onClick={() => setActiveTab('pending')}
//                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'pending' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'pending' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
//                     >
//                         <ListPlus size={16} /> Pending Applications
//                         <span style={{ background: pendingEmployers.length > 0 ? '#ef4444' : '#f1f5f9', color: pendingEmployers.length > 0 ? 'white' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingEmployers.length}</span>
//                     </button>
//                 </div>

//                 <div className="wm-search" style={{ maxWidth: '300px', marginBottom: '8px' }}>
//                     <Search size={15} className="wm-search__icon" />
//                     <input
//                         type="text"
//                         className="wm-search__input"
//                         placeholder="Search..."
//                         value={searchQuery}
//                         onChange={e => setSearchQuery(e.target.value)}
//                     />
//                     {searchQuery && (
//                         <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
//                     )}
//                 </div>
//             </div>

//             {/* ── CONTENT GRID ── */}
//             {isInitialLoad ? (
//                 <div className="wm-loading">
//                     <div className="ap-spinner" />
//                     <span className="wm-loading__label">Loading Ecosystem Blueprint…</span>
//                 </div>
//             ) : (activeTab === 'approved' ? approvedEmployers : pendingEmployers).length === 0 ? (
//                 <div className="wm-empty" style={{ margin: '0 1.5rem' }}>
//                     {activeTab === 'pending' ? <ListPlus size={36} color="var(--mlab-grey-light)" /> : <Building2 size={36} color="var(--mlab-grey-light)" />}
//                     <p className="wm-empty__title">{searchQuery ? 'No Results Found' : activeTab === 'pending' ? 'No Pending Applications' : 'No Approved Partners'}</p>
//                     <p className="wm-empty__desc">
//                         {searchQuery ? 'Try a different search term.' : activeTab === 'pending' ? 'Share your public link to start receiving applications.' : 'Onboard your first host company to unlock the placement matchmaking engine.'}
//                     </p>
//                 </div>
//             ) : (
//                 <div className="wm-grid" style={{ padding: '0 1.5rem' }}>
//                     {(activeTab === 'approved' ? approvedEmployers : pendingEmployers).map(emp => {
//                         const isPending = emp.status === 'Pending Review';

//                         // Calculate metrics only for approved partners
//                         const companyMentors = isPending ? [] : mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');
//                         const companyPlacements = isPending ? [] : placements.filter(p => p.employerId === emp.id);
//                         const activePlacements = isPending ? [] : companyPlacements.filter(p => p.status === 'active');

//                         const internCapacity = (emp as any).internCapacity || 1;
//                         const isOverCapacity = activePlacements.length > internCapacity;
//                         const riskRating = (emp as any).mlabRiskRating || 'Pending';

//                         return (
//                             <div key={emp.id} className="wm-card" style={{ borderTopColor: isPending ? 'var(--mlab-amber)' : riskRating === 'High' || riskRating === 'Critical' ? '#ef4444' : riskRating === 'Medium' ? '#f59e0b' : 'var(--mlab-blue)', display: 'flex', flexDirection: 'column' }}>

//                                 {/* Header */}
//                                 <div className="wm-card__header">
//                                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
//                                         <h3 className="wm-card__name">{emp.name}</h3>
//                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
//                                             {isPending ? (
//                                                 <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>New Application</span>
//                                             ) : (
//                                                 <>
//                                                     <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
//                                                         {(emp as any).mlabTier || 'Tier 2 SME'}
//                                                     </span>
//                                                     {riskRating === 'Low' ? (
//                                                         <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Low Risk</span>
//                                                     ) : riskRating === 'Medium' ? (
//                                                         <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Medium Risk</span>
//                                                     ) : (
//                                                         <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{riskRating} Risk</span>
//                                                     )}
//                                                 </>
//                                             )}
//                                         </div>
//                                     </div>
//                                     <div className="wm-card__actions">
//                                         {!isPending && (
//                                             <button
//                                                 type="button"
//                                                 onClick={() => handleViewCompanyInsights(emp)}
//                                                 className="mlab-icon-btn"
//                                                 style={{ border: '1px solid #cbd5e1', color: 'var(--mlab-green)' }}
//                                                 title="View Company Insights & Ledger"
//                                             >
//                                                 <Briefcase size={13} />
//                                             </button>
//                                         )}
//                                         {!isPending && <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit Profile"><Edit2 size={13} /></button>}
//                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive/Reject"><Trash2 size={13} /></button>
//                                     </div>
//                                 </div>

//                                 {/* Address row */}
//                                 <div className="wm-card__address" style={{ marginTop: '0.5rem' }}>
//                                     <MapPin size={12} className="wm-card__address-icon" />
//                                     <span className="wm-card__address-text">{emp.physicalAddress || 'No address on record'}</span>
//                                     {emp.lat && emp.lng && (
//                                         <button
//                                             className="wm-maps-link wm-maps-link--inline"
//                                             onClick={() => window.open(`https://www.google.com/maps?q=${emp.lat},${emp.lng}`, '_blank', 'noopener')}
//                                             title="Open in Google Maps"
//                                         >
//                                             <ExternalLink size={11} />
//                                         </button>
//                                     )}
//                                 </div>

//                                 {/* Contact Person */}
//                                 <div className="wm-card__contact" style={{ marginTop: '0.5rem', marginBottom: isPending ? '0' : '1rem' }}>
//                                     <div className="wm-contact-row">
//                                         <User size={12} className="wm-contact-row__icon" />
//                                         <span className="wm-contact-row__label">Contact</span>
//                                         <span className="wm-contact-row__value">{emp.contactPerson || 'TBC'}</span>
//                                     </div>
//                                     {emp.contactEmail && (
//                                         <div className="wm-contact-row">
//                                             <Mail size={12} className="wm-contact-row__icon" />
//                                             <span className="wm-contact-row__label">Email</span>
//                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactEmail}</span>
//                                         </div>
//                                     )}
//                                     {emp.contactPhone && (
//                                         <div className="wm-contact-row">
//                                             <Phone size={12} className="wm-contact-row__icon" />
//                                             <span className="wm-contact-row__label">Phone</span>
//                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactPhone}</span>
//                                         </div>
//                                     )}
//                                 </div>

//                                 {isPending ? (
//                                     /* PENDING APPLICATION ACTIONS */
//                                     <div style={{ display: 'flex', gap: '8px', padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
//                                         <button className="wm-btn wm-btn--primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleApproveEmployer(emp.id, emp.name)}>
//                                             <CheckCircle size={14} /> Approve
//                                         </button>
//                                         <button className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', background: 'white' }} onClick={() => openEmployerModal(emp)}>
//                                             <Search size={14} /> Review Data
//                                         </button>
//                                     </div>
//                                 ) : (
//                                     /* APPROVED PARTNER METRICS & MENTORS */
//                                     <>
//                                         {/* CAPACITY & PLACEMENTS */}
//                                         <div style={{ margin: '0 1.25rem', padding: '1rem', background: isOverCapacity ? '#fef2f2' : '#f8fafc', borderRadius: '8px', border: `1px solid ${isOverCapacity ? '#fecaca' : '#e2e8f0'}`, borderLeft: `4px solid ${isOverCapacity ? '#ef4444' : 'var(--mlab-blue)'}` }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                                     <LayoutList size={12} /> Active Placements
//                                                 </div>
//                                                 {companyPlacements.length > 0 && (
//                                                     <button onClick={() => openViewPlacements(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                         View Ledger →
//                                                     </button>
//                                                 )}
//                                             </div>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
//                                                 <div>
//                                                     <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isOverCapacity ? '#ef4444' : 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{activePlacements.length}</span>
//                                                     <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: 500 }}>/ {internCapacity} Max Capacity</span>
//                                                 </div>
//                                             </div>
//                                             <div style={{ width: '100%', background: isOverCapacity ? '#fca5a5' : '#cbd5e1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
//                                                 <div style={{ width: `${Math.min((activePlacements.length / internCapacity) * 100, 100)}%`, background: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', height: '100%' }}></div>
//                                             </div>
//                                             {isOverCapacity && <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}><AlertTriangle size={10} /> Overcapacity Warning</p>}
//                                         </div>

//                                         {/* MENTORS SECTION */}
//                                         <div className="wm-card__mentors" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
//                                             <div className="wm-mentors__header">
//                                                 <div className="wm-mentors__title">
//                                                     <Briefcase size={13} />
//                                                     Workplace Mentors
//                                                     {companyMentors.length > 0 && (
//                                                         <span className="wm-mentors__count">{companyMentors.length}</span>
//                                                     )}
//                                                 </div>
//                                                 <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
//                                                     <UserPlus size={12} /> Add
//                                                 </button>
//                                             </div>

//                                             {companyMentors.length === 0 ? (
//                                                 <div className="wm-mentor-empty">No mentors assigned yet. Add a mentor before placing learners.</div>
//                                             ) : (
//                                                 <div className="wm-mentor-list">
//                                                     {companyMentors.map(mentor => {
//                                                         const mentorLoad = activePlacements.filter(p => p.mentorId === mentor.id).length;
//                                                         const isOverloaded = mentorLoad >= 5;

//                                                         return (
//                                                             <div key={mentor.id} className="wm-mentor-item">
//                                                                 <div className="wm-mentor-item__avatar" style={{ border: isOverloaded ? '2px solid #ef4444' : 'none' }}>
//                                                                     {mentor.fullName.charAt(0).toUpperCase()}
//                                                                 </div>
//                                                                 <div className="wm-mentor-item__info">
//                                                                     <span className="wm-mentor-item__name">{mentor.fullName}</span>
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
//                                                                         <span style={{ fontSize: '0.65rem', color: isOverloaded ? '#ef4444' : '#64748b', fontWeight: isOverloaded ? 700 : 500 }}>
//                                                                             Supervising: {mentorLoad} Intern(s)
//                                                                         </span>
//                                                                         {isOverloaded && <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '1px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>RATIO HIGH</span>}
//                                                                     </div>
//                                                                 </div>
//                                                                 <div className="wm-mentor-item__actions">
//                                                                     <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
//                                                                     <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
//                                                                 </div>
//                                                             </div>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}
//                                         </div>
//                                     </>
//                                 )}
//                             </div>
//                         );
//                     })}
//                 </div>
//             )}
//         </div>
//     );
// };


// // // src/components/admin/WorkplacesManager/WorkplacesManager.tsx

// // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // import { collection, doc, updateDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import * as XLSX from 'xlsx';
// // import {
// //     Building2, MapPin, User, Search, Plus, Edit2, Trash2,
// //     X, Briefcase, ExternalLink, Mail, Phone, Hash, UserPlus,
// //     LayoutList, AlertTriangle, Users, LinkIcon, CheckCircle, ListPlus, LayoutTemplate, UploadCloud,
// //     Loader2
// // } from 'lucide-react';

// // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // import { useStore, type StaffMember } from '../../../store/useStore';
// // import type { Employer } from '../../../types';

// // // Modals & Sub-views
// // import { EmployerModal } from './EmployerModal';
// // import { MentorModal } from './MentorModal';
// // import { CompanyInsightsView } from './CompanyInsightsView';
// // import './WorkplacesManager.css';
// // import { EmployerFormBuilderModal } from './EmployerFormBuilderPage';

// // export const WorkplacesManager: React.FC = () => {
// //     const { employers, fetchEmployers, addStaff, learners, fetchLearners } = useStore();

// //     // Type casting to bypass TS errors
// //     const placements = ((useStore(s => (s as any).placements) || []) as any[]);
// //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;

// //     const toast = useToast();
// //     const fileInputRef = useRef<HTMLInputElement>(null);

// //     const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
// //     const [isImporting, setIsImporting] = useState(false);
// //     const [searchQuery, setSearchQuery] = useState('');
// //     const [mentors, setMentors] = useState<StaffMember[]>([]);

// //     // View States (Pages & Tabs)
// //     const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');
// //     const [viewingCompanyInsights, setViewingCompanyInsights] = useState<Employer | null>(null);
// //     const [showFormBuilder, setShowFormBuilder] = useState(false);

// //     // Modals State
// //     const [employerModalOpen, setEmployerModalOpen] = useState(false);
// //     const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

// //     const [mentorModalOpen, setMentorModalOpen] = useState(false);
// //     const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
// //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

// //     const loadData = async () => {
// //         try {
// //             await Promise.all([
// //                 fetchEmployers(),
// //                 fetchLearners(),
// //                 fetchPlacements()
// //             ]);
// //             const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// //             setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// //         } catch {
// //             toast.error('Failed to load workplace tracking data.');
// //         } finally {
// //             setIsInitialLoad(false);
// //         }
// //     };

// //     useEffect(() => { loadData(); }, []);

// //     const refreshMentors = async () => {
// //         const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// //         setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// //     };

// //     const handleCopyPublicLink = () => {
// //         const url = `${window.location.origin}/apply/host-learners`;
// //         navigator.clipboard.writeText(url);
// //         toast.success('Public Application Link copied to clipboard!');
// //     };

// //     const handleArchiveEmployer = async (id: string, name: string) => {
// //         if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
// //         try {
// //             await updateDoc(doc(db, 'employers', id), { status: 'archived' });
// //             toast.info(`${name} archived.`);
// //             await fetchEmployers();
// //         } catch { toast.error('Failed to archive partner.'); }
// //     };

// //     const handleApproveEmployer = async (id: string, name: string) => {
// //         if (!window.confirm(`Approve ${name} as a Host Employer Partner?`)) return;
// //         try {
// //             await updateDoc(doc(db, 'employers', id), { status: 'active' });
// //             toast.success(`${name} approved successfully!`);
// //             await fetchEmployers();
// //         } catch { toast.error('Failed to approve partner.'); }
// //     };

// //     const handleArchiveMentor = async (id: string, name: string) => {
// //         if (!window.confirm(`Remove mentor access for ${name}?`)) return;
// //         try {
// //             await updateDoc(doc(db, 'users', id), { status: 'archived' });
// //             setMentors(p => p.filter(m => m.id !== id));
// //             toast.info('Mentor access removed.');
// //         } catch { toast.error('Failed to remove mentor.'); }
// //     };

// //     const openEmployerModal = (emp?: Employer) => {
// //         setEditingEmployer(emp || null);
// //         setEmployerModalOpen(true);
// //     };

// //     const openMentorModal = (empId: string, mentor?: StaffMember) => {
// //         setActiveMentorEmpId(empId);
// //         setEditingMentor(mentor || null);
// //         setMentorModalOpen(true);
// //     };

// //     const openViewPlacements = (emp: Employer) => {
// //         setViewingCompanyInsights(emp);
// //     };

// //     // ── BULK IMPORT EXCEL/CSV LOGIC ──
// //     const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setIsImporting(true);
// //         const reader = new FileReader();

// //         reader.onload = async (event) => {
// //             try {
// //                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
// //                 const workbook = XLSX.read(data, { type: 'array' });
// //                 const firstSheetName = workbook.SheetNames[0];
// //                 const worksheet = workbook.Sheets[firstSheetName];

// //                 // Convert to array of objects (using the first row as keys)
// //                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, any>[];

// //                 let importCount = 0;

// //                 for (const row of rows) {
// //                     // Intelligent Mapping: Try to find common column headers regardless of exact casing
// //                     const getVal = (keywords: string[]) => {
// //                         const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
// //                         return key ? String(row[key]).trim() : "";
// //                     };

// //                     const companyName = getVal(['company', 'organisation', 'business', 'employer']);
// //                     if (!companyName) continue; // Skip rows without a company name

// //                     const contactName = getVal(['contact', 'person', 'name', 'representative']);
// //                     const contactEmail = getVal(['email', 'e-mail']);
// //                     const contactPhone = getVal(['phone', 'mobile', 'cell', 'tel']);
// //                     const physicalAddress = getVal(['address', 'location', 'physical']);
// //                     const regNumber = getVal(['registration', 'cipc', 'reg']);

// //                     const newEmployer = {
// //                         name: companyName,
// //                         contactPerson: contactName || "TBC",
// //                         contactEmail: contactEmail || "",
// //                         contactPhone: contactPhone || "",
// //                         physicalAddress: physicalAddress || "",
// //                         registrationNumber: regNumber || "",
// //                         status: 'active', // Automatically approve bulk imported partners
// //                         internCapacity: 1, // Default baseline
// //                         mlabTier: 'Tier 2 (Established SME)',
// //                         mlabRiskRating: 'Medium',
// //                         internalNotes: 'Bulk imported via spreadsheet.',
// //                         createdAt: new Date().toISOString()
// //                     };

// //                     const ref = doc(collection(db, 'employers'));
// //                     await setDoc(ref, { ...newEmployer, id: ref.id });
// //                     importCount++;
// //                 }

// //                 toast.success(`Successfully imported ${importCount} Employer Partners!`);
// //                 await fetchEmployers(); // Refresh list

// //             } catch (err) {
// //                 console.error("Import Error", err);
// //                 toast.error("Failed to parse file. Ensure it is a valid CSV or Excel document with a 'Company Name' column.");
// //             } finally {
// //                 setIsImporting(false);
// //                 if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
// //             }
// //         };

// //         reader.readAsArrayBuffer(file);
// //     };

// //     // Filter Lists based on search and status
// //     const allVisibleEmployers = employers.filter(emp =>
// //         emp.status !== 'archived' && (
// //             emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
// //             (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
// //         )
// //     );

// //     const approvedEmployers = allVisibleEmployers.filter(emp => emp.status === 'active' || emp.status === 'Approved');
// //     const pendingEmployers = allVisibleEmployers.filter(emp => emp.status === 'Pending Review');

// //     // Compute Ecosystem KPIs based on APPROVED partners only
// //     const ecosystemMetrics = useMemo(() => {
// //         let totalCapacity = 0;
// //         let highRiskCount = 0;

// //         approvedEmployers.forEach(emp => {
// //             totalCapacity += ((emp as any).internCapacity || 1);
// //             if ((emp as any).mlabRiskRating === 'High' || (emp as any).mlabRiskRating === 'Critical') {
// //                 highRiskCount++;
// //             }
// //         });

// //         return { totalCapacity, highRiskCount };
// //     }, [approvedEmployers]);

// //     // If we are looking at a specific company's ledger, render that full screen
// //     if (viewingCompanyInsights) {
// //         return (
// //             <CompanyInsightsView
// //                 company={viewingCompanyInsights}
// //                 onBack={() => setViewingCompanyInsights(null)}
// //             />
// //         );
// //     }

// //     return (
// //         <div className="wm-root animate-fade-in">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* Hidden File Input for Bulk Import */}
// //             <input
// //                 type="file"
// //                 accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
// //                 ref={fileInputRef}
// //                 onChange={handleFileUpload}
// //                 style={{ display: "none" }}
// //             />

// //             {/* MODALS */}
// //             {employerModalOpen && (
// //                 <EmployerModal
// //                     editing={editingEmployer}
// //                     onClose={() => setEmployerModalOpen(false)}
// //                     onSaved={fetchEmployers}
// //                 />
// //             )}
// //             {mentorModalOpen && (
// //                 <MentorModal
// //                     editing={editingMentor}
// //                     employerId={activeMentorEmpId}
// //                     onClose={() => setMentorModalOpen(false)}
// //                     onSaved={refreshMentors}
// //                     addStaff={addStaff}
// //                 />
// //             )}
// //             {/* Form Builder Modal rendered properly */}
// //             {showFormBuilder && (
// //                 <EmployerFormBuilderModal onClose={() => setShowFormBuilder(false)} />
// //             )}

// //             {/* ── PAGE HEADER ── */}
// //             <div className="wm-page-header">
// //                 <div className="wm-page-header__left">
// //                     <div className="wm-page-header__icon"><Building2 size={22} /></div>
// //                     <div>
// //                         <h1 className="wm-page-header__title">Employer Partner Ecosystem</h1>
// //                         <p className="wm-page-header__desc">Manage host companies, inbound applications, and placement capacity.</p>
// //                     </div>
// //                 </div>
// //                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

// //                     <button className="cdp-btn cdp-btn--outline" onClick={handleCopyPublicLink} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
// //                         <LinkIcon size={14} /> Copy Public Link
// //                     </button>

// //                     <button className="cdp-btn cdp-btn--outline" onClick={() => setShowFormBuilder(true)} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }} disabled={isImporting}>
// //                         <LayoutTemplate size={14} /> Form Builder
// //                     </button>

// //                     <button className="cdp-btn cdp-btn--outline" onClick={() => fileInputRef.current?.click()} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }} disabled={isImporting}>
// //                         {isImporting ? <Loader2 size={14} className="wm-spin" /> : <UploadCloud size={14} />}
// //                         {isImporting ? "Importing..." : "Bulk Import"}
// //                     </button>

// //                     <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()} disabled={isImporting}>
// //                         <Plus size={14} /> Manually Add
// //                     </button>
// //                 </div>
// //             </div>

// //             {/* ── ECOSYSTEM METRICS RIBBON ── */}
// //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', padding: '0 1.5rem' }}>
// //                 <div className="cdp-stat-card cdp-stat-card--blue">
// //                     <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{approvedEmployers.length}</span>
// //                         <span className="cdp-stat-card__label">Approved Partners</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--green">
// //                     <div className="cdp-stat-card__icon"><Users size={20} /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{ecosystemMetrics.totalCapacity}</span>
// //                         <span className="cdp-stat-card__label">Total Network Capacity</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card cdp-stat-card--grey">
// //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value">{placements.filter(p => p.status === 'active').length}</span>
// //                         <span className="cdp-stat-card__label">Active Placements</span>
// //                     </div>
// //                 </div>
// //                 <div className="cdp-stat-card" style={{ background: '#fff1f2', borderLeftColor: '#ef4444' }}>
// //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="#ef4444" /></div>
// //                     <div className="cdp-stat-card__body">
// //                         <span className="cdp-stat-card__value" style={{ color: ecosystemMetrics.highRiskCount > 0 ? '#ef4444' : 'inherit' }}>{ecosystemMetrics.highRiskCount}</span>
// //                         <span className="cdp-stat-card__label">High Risk Workplaces</span>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── TABS & TOOLBAR ── */}
// //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
// //                 <div style={{ display: 'flex', gap: '1.5rem' }}>
// //                     <button
// //                         onClick={() => setActiveTab('approved')}
// //                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'approved' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'approved' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// //                     >
// //                         <Building2 size={16} /> Approved Partners <span style={{ background: activeTab === 'approved' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{approvedEmployers.length}</span>
// //                     </button>
// //                     <button
// //                         onClick={() => setActiveTab('pending')}
// //                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'pending' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'pending' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// //                     >
// //                         <ListPlus size={16} /> Pending Applications
// //                         <span style={{ background: pendingEmployers.length > 0 ? '#ef4444' : '#f1f5f9', color: pendingEmployers.length > 0 ? 'white' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingEmployers.length}</span>
// //                     </button>
// //                 </div>

// //                 <div className="wm-search" style={{ maxWidth: '300px', marginBottom: '8px' }}>
// //                     <Search size={15} className="wm-search__icon" />
// //                     <input
// //                         type="text"
// //                         className="wm-search__input"
// //                         placeholder="Search..."
// //                         value={searchQuery}
// //                         onChange={e => setSearchQuery(e.target.value)}
// //                     />
// //                     {searchQuery && (
// //                         <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
// //                     )}
// //                 </div>
// //             </div>

// //             {/* ── CONTENT GRID ── */}
// //             {isInitialLoad ? (
// //                 <div className="wm-loading">
// //                     <div className="ap-spinner" />
// //                     <span className="wm-loading__label">Loading Ecosystem Blueprint…</span>
// //                 </div>
// //             ) : (activeTab === 'approved' ? approvedEmployers : pendingEmployers).length === 0 ? (
// //                 <div className="wm-empty" style={{ margin: '0 1.5rem' }}>
// //                     {activeTab === 'pending' ? <ListPlus size={36} color="var(--mlab-grey-light)" /> : <Building2 size={36} color="var(--mlab-grey-light)" />}
// //                     <p className="wm-empty__title">{searchQuery ? 'No Results Found' : activeTab === 'pending' ? 'No Pending Applications' : 'No Approved Partners'}</p>
// //                     <p className="wm-empty__desc">
// //                         {searchQuery ? 'Try a different search term.' : activeTab === 'pending' ? 'Share your public link to start receiving applications.' : 'Onboard your first host company to unlock the placement matchmaking engine.'}
// //                     </p>
// //                 </div>
// //             ) : (
// //                 <div className="wm-grid" style={{ padding: '0 1.5rem' }}>
// //                     {(activeTab === 'approved' ? approvedEmployers : pendingEmployers).map(emp => {
// //                         const isPending = emp.status === 'Pending Review';

// //                         // Calculate metrics only for approved partners
// //                         const companyMentors = isPending ? [] : mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');
// //                         const companyPlacements = isPending ? [] : placements.filter(p => p.employerId === emp.id);
// //                         const activePlacements = isPending ? [] : companyPlacements.filter(p => p.status === 'active');

// //                         const internCapacity = (emp as any).internCapacity || 1;
// //                         const isOverCapacity = activePlacements.length > internCapacity;
// //                         const riskRating = (emp as any).mlabRiskRating || 'Pending';

// //                         return (
// //                             <div key={emp.id} className="wm-card" style={{ borderTopColor: isPending ? 'var(--mlab-amber)' : riskRating === 'High' || riskRating === 'Critical' ? '#ef4444' : riskRating === 'Medium' ? '#f59e0b' : 'var(--mlab-blue)', display: 'flex', flexDirection: 'column' }}>

// //                                 {/* Header */}
// //                                 <div className="wm-card__header">
// //                                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
// //                                         <h3 className="wm-card__name">{emp.name}</h3>
// //                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
// //                                             {isPending ? (
// //                                                 <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>New Application</span>
// //                                             ) : (
// //                                                 <>
// //                                                     <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
// //                                                         {(emp as any).mlabTier || 'Tier 2 SME'}
// //                                                     </span>
// //                                                     {riskRating === 'Low' ? (
// //                                                         <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Low Risk</span>
// //                                                     ) : riskRating === 'Medium' ? (
// //                                                         <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Medium Risk</span>
// //                                                     ) : (
// //                                                         <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{riskRating} Risk</span>
// //                                                     )}
// //                                                 </>
// //                                             )}
// //                                         </div>
// //                                     </div>
// //                                     <div className="wm-card__actions">
// //                                         {!isPending && <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit Profile"><Edit2 size={13} /></button>}
// //                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive/Reject"><Trash2 size={13} /></button>
// //                                     </div>
// //                                 </div>

// //                                 {/* Address row */}
// //                                 <div className="wm-card__address" style={{ marginTop: '0.5rem' }}>
// //                                     <MapPin size={12} className="wm-card__address-icon" />
// //                                     <span className="wm-card__address-text">{emp.physicalAddress || 'No address on record'}</span>
// //                                     {emp.lat && emp.lng && (
// //                                         <button
// //                                             className="wm-maps-link wm-maps-link--inline"
// //                                             onClick={() => window.open(`https://www.google.com/maps?q=${emp.lat},${emp.lng}`, '_blank', 'noopener')}
// //                                             title="Open in Google Maps"
// //                                         >
// //                                             <ExternalLink size={11} />
// //                                         </button>
// //                                     )}
// //                                 </div>

// //                                 {/* Contact Person */}
// //                                 <div className="wm-card__contact" style={{ marginTop: '0.5rem', marginBottom: isPending ? '0' : '1rem' }}>
// //                                     <div className="wm-contact-row">
// //                                         <User size={12} className="wm-contact-row__icon" />
// //                                         <span className="wm-contact-row__label">Contact</span>
// //                                         <span className="wm-contact-row__value">{emp.contactPerson || 'TBC'}</span>
// //                                     </div>
// //                                     {emp.contactEmail && (
// //                                         <div className="wm-contact-row">
// //                                             <Mail size={12} className="wm-contact-row__icon" />
// //                                             <span className="wm-contact-row__label">Email</span>
// //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactEmail}</span>
// //                                         </div>
// //                                     )}
// //                                     {emp.contactPhone && (
// //                                         <div className="wm-contact-row">
// //                                             <Phone size={12} className="wm-contact-row__icon" />
// //                                             <span className="wm-contact-row__label">Phone</span>
// //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactPhone}</span>
// //                                         </div>
// //                                     )}
// //                                 </div>

// //                                 {isPending ? (
// //                                     /* PENDING APPLICATION ACTIONS */
// //                                     <div style={{ display: 'flex', gap: '8px', padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
// //                                         <button className="wm-btn wm-btn--primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleApproveEmployer(emp.id, emp.name)}>
// //                                             <CheckCircle size={14} /> Approve
// //                                         </button>
// //                                         <button className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', background: 'white' }} onClick={() => openEmployerModal(emp)}>
// //                                             <Search size={14} /> Review Data
// //                                         </button>
// //                                     </div>
// //                                 ) : (
// //                                     /* APPROVED PARTNER METRICS & MENTORS */
// //                                     <>
// //                                         {/* CAPACITY & PLACEMENTS */}
// //                                         <div style={{ margin: '0 1.25rem', padding: '1rem', background: isOverCapacity ? '#fef2f2' : '#f8fafc', borderRadius: '8px', border: `1px solid ${isOverCapacity ? '#fecaca' : '#e2e8f0'}`, borderLeft: `4px solid ${isOverCapacity ? '#ef4444' : 'var(--mlab-blue)'}` }}>
// //                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
// //                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                                     <LayoutList size={12} /> Active Placements
// //                                                 </div>
// //                                                 {companyPlacements.length > 0 && (
// //                                                     <button onClick={() => openViewPlacements(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                         View Ledger →
// //                                                     </button>
// //                                                 )}
// //                                             </div>
// //                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
// //                                                 <div>
// //                                                     <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isOverCapacity ? '#ef4444' : 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{activePlacements.length}</span>
// //                                                     <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: 500 }}>/ {internCapacity} Max Capacity</span>
// //                                                 </div>
// //                                             </div>
// //                                             <div style={{ width: '100%', background: isOverCapacity ? '#fca5a5' : '#cbd5e1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                 <div style={{ width: `${Math.min((activePlacements.length / internCapacity) * 100, 100)}%`, background: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', height: '100%' }}></div>
// //                                             </div>
// //                                             {isOverCapacity && <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}><AlertTriangle size={10} /> Overcapacity Warning</p>}
// //                                         </div>

// //                                         {/* MENTORS SECTION */}
// //                                         <div className="wm-card__mentors" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
// //                                             <div className="wm-mentors__header">
// //                                                 <div className="wm-mentors__title">
// //                                                     <Briefcase size={13} />
// //                                                     Workplace Mentors
// //                                                     {companyMentors.length > 0 && (
// //                                                         <span className="wm-mentors__count">{companyMentors.length}</span>
// //                                                     )}
// //                                                 </div>
// //                                                 <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
// //                                                     <UserPlus size={12} /> Add
// //                                                 </button>
// //                                             </div>

// //                                             {companyMentors.length === 0 ? (
// //                                                 <div className="wm-mentor-empty">No mentors assigned yet. Add a mentor before placing learners.</div>
// //                                             ) : (
// //                                                 <div className="wm-mentor-list">
// //                                                     {companyMentors.map(mentor => {
// //                                                         const mentorLoad = activePlacements.filter(p => p.mentorId === mentor.id).length;
// //                                                         const isOverloaded = mentorLoad >= 5;

// //                                                         return (
// //                                                             <div key={mentor.id} className="wm-mentor-item">
// //                                                                 <div className="wm-mentor-item__avatar" style={{ border: isOverloaded ? '2px solid #ef4444' : 'none' }}>
// //                                                                     {mentor.fullName.charAt(0).toUpperCase()}
// //                                                                 </div>
// //                                                                 <div className="wm-mentor-item__info">
// //                                                                     <span className="wm-mentor-item__name">{mentor.fullName}</span>
// //                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
// //                                                                         <span style={{ fontSize: '0.65rem', color: isOverloaded ? '#ef4444' : '#64748b', fontWeight: isOverloaded ? 700 : 500 }}>
// //                                                                             Supervising: {mentorLoad} Intern(s)
// //                                                                         </span>
// //                                                                         {isOverloaded && <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '1px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>RATIO HIGH</span>}
// //                                                                     </div>
// //                                                                 </div>
// //                                                                 <div className="wm-mentor-item__actions">
// //                                                                     <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
// //                                                                     <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
// //                                                                 </div>
// //                                                             </div>
// //                                                         );
// //                                                     })}
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     </>
// //                                 )}
// //                             </div>
// //                         );
// //                     })}
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };



// // // // src/components/admin/WorkplacesManager/WorkplacesManager.tsx

// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { collection, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import {
// // //     Building2, MapPin, User, Search, Plus, Edit2, Trash2,
// // //     X, Briefcase, ExternalLink, Mail, Phone, Hash, UserPlus,
// // //     LayoutList, AlertTriangle, Users, LinkIcon, CheckCircle, ListPlus, LayoutTemplate
// // // } from 'lucide-react';

// // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // import type { Employer } from '../../../types';

// // // // Modals & Sub-views
// // // import { EmployerModal } from './EmployerModal';
// // // import { MentorModal } from './MentorModal';
// // // import { CompanyInsightsView } from './CompanyInsightsView';

// // // import './WorkplacesManager.css';
// // // import { EmployerFormBuilderModal } from './EmployerFormBuilderPage';

// // // export const WorkplacesManager: React.FC = () => {
// // //     const { employers, fetchEmployers, addStaff, learners, fetchLearners } = useStore();

// // //     // Type casting to bypass TS errors
// // //     const placements = ((useStore(s => (s as any).placements) || []) as any[]);
// // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;

// // //     const toast = useToast();

// // //     const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
// // //     const [searchQuery, setSearchQuery] = useState('');
// // //     const [mentors, setMentors] = useState<StaffMember[]>([]);

// // //     // View States (Pages & Tabs)
// // //     const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');
// // //     const [viewingCompanyInsights, setViewingCompanyInsights] = useState<Employer | null>(null);
// // //     const [showFormBuilder, setShowFormBuilder] = useState(false);

// // //     // Modals State
// // //     const [employerModalOpen, setEmployerModalOpen] = useState(false);
// // //     const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

// // //     const [mentorModalOpen, setMentorModalOpen] = useState(false);
// // //     const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
// // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

// // //     const loadData = async () => {
// // //         try {
// // //             await Promise.all([
// // //                 fetchEmployers(),
// // //                 fetchLearners(),
// // //                 fetchPlacements()
// // //             ]);
// // //             const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// // //             setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// // //         } catch {
// // //             toast.error('Failed to load workplace tracking data.');
// // //         } finally {
// // //             setIsInitialLoad(false);
// // //         }
// // //     };

// // //     useEffect(() => { loadData(); }, []);

// // //     const refreshMentors = async () => {
// // //         const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// // //         setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// // //     };

// // //     const handleCopyPublicLink = () => {
// // //         const url = `${window.location.origin}/apply/host-learners`;
// // //         navigator.clipboard.writeText(url);
// // //         toast.success('Public Application Link copied to clipboard!');
// // //     };

// // //     const handleArchiveEmployer = async (id: string, name: string) => {
// // //         if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
// // //         try {
// // //             await updateDoc(doc(db, 'employers', id), { status: 'archived' });
// // //             toast.info(`${name} archived.`);
// // //             await fetchEmployers();
// // //         } catch { toast.error('Failed to archive partner.'); }
// // //     };

// // //     const handleApproveEmployer = async (id: string, name: string) => {
// // //         if (!window.confirm(`Approve ${name} as a Host Employer Partner?`)) return;
// // //         try {
// // //             await updateDoc(doc(db, 'employers', id), { status: 'active' });
// // //             toast.success(`${name} approved successfully!`);
// // //             await fetchEmployers();
// // //         } catch { toast.error('Failed to approve partner.'); }
// // //     };

// // //     const handleArchiveMentor = async (id: string, name: string) => {
// // //         if (!window.confirm(`Remove mentor access for ${name}?`)) return;
// // //         try {
// // //             await updateDoc(doc(db, 'users', id), { status: 'archived' });
// // //             setMentors(p => p.filter(m => m.id !== id));
// // //             toast.info('Mentor access removed.');
// // //         } catch { toast.error('Failed to remove mentor.'); }
// // //     };

// // //     const openEmployerModal = (emp?: Employer) => {
// // //         setEditingEmployer(emp || null);
// // //         setEmployerModalOpen(true);
// // //     };

// // //     const openMentorModal = (empId: string, mentor?: StaffMember) => {
// // //         setActiveMentorEmpId(empId);
// // //         setEditingMentor(mentor || null);
// // //         setMentorModalOpen(true);
// // //     };

// // //     const openViewPlacements = (emp: Employer) => {
// // //         setViewingCompanyInsights(emp);
// // //     };

// // //     // Filter Lists based on search and status
// // //     const allVisibleEmployers = employers.filter(emp =>
// // //         emp.status !== 'archived' && (
// // //             emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
// // //             (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
// // //         )
// // //     );

// // //     const approvedEmployers = allVisibleEmployers.filter(emp => emp.status === 'active' || emp.status === 'Approved');
// // //     const pendingEmployers = allVisibleEmployers.filter(emp => emp.status === 'Pending Review');

// // //     // Compute Ecosystem KPIs based on APPROVED partners only
// // //     const ecosystemMetrics = useMemo(() => {
// // //         let totalCapacity = 0;
// // //         let highRiskCount = 0;

// // //         approvedEmployers.forEach(emp => {
// // //             totalCapacity += ((emp as any).internCapacity || 1);
// // //             if ((emp as any).mlabRiskRating === 'High' || (emp as any).mlabRiskRating === 'Critical') {
// // //                 highRiskCount++;
// // //             }
// // //         });

// // //         return { totalCapacity, highRiskCount };
// // //     }, [approvedEmployers]);

// // //     // If we are looking at a specific company's ledger, render that full screen
// // //     if (viewingCompanyInsights) {
// // //         return (
// // //             <CompanyInsightsView
// // //                 company={viewingCompanyInsights}
// // //                 onBack={() => setViewingCompanyInsights(null)}
// // //             />
// // //         );
// // //     }

// // //     return (
// // //         <div className="wm-root animate-fade-in">
// // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // //             {/* MODALS */}
// // //             {employerModalOpen && (
// // //                 <EmployerModal
// // //                     editing={editingEmployer}
// // //                     onClose={() => setEmployerModalOpen(false)}
// // //                     onSaved={fetchEmployers}
// // //                 />
// // //             )}
// // //             {mentorModalOpen && (
// // //                 <MentorModal
// // //                     editing={editingMentor}
// // //                     employerId={activeMentorEmpId}
// // //                     onClose={() => setMentorModalOpen(false)}
// // //                     onSaved={refreshMentors}
// // //                     addStaff={addStaff}
// // //                 />
// // //             )}
// // //             {/* Form Builder Modal rendered properly */}
// // //             {showFormBuilder && (
// // //                 <EmployerFormBuilderModal onClose={() => setShowFormBuilder(false)} />
// // //             )}

// // //             {/* ── PAGE HEADER ── */}
// // //             <div className="wm-page-header">
// // //                 <div className="wm-page-header__left">
// // //                     <div className="wm-page-header__icon"><Building2 size={22} /></div>
// // //                     <div>
// // //                         <h1 className="wm-page-header__title">Employer Partner Ecosystem</h1>
// // //                         <p className="wm-page-header__desc">Manage host companies, inbound applications, and placement capacity.</p>
// // //                     </div>
// // //                 </div>
// // //                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
// // //                     <button className="cdp-btn cdp-btn--outline" onClick={handleCopyPublicLink} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }}>
// // //                         <LinkIcon size={14} /> Copy Public Link
// // //                     </button>
// // //                     <button className="cdp-btn cdp-btn--outline" onClick={() => setShowFormBuilder(true)} style={{ background: 'white', color: 'var(--mlab-midnight)', border: '1px solid #cbd5e1' }}>
// // //                         <LayoutTemplate size={14} /> Form Builder
// // //                     </button>
// // //                     <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()}>
// // //                         <Plus size={14} /> Manually Add
// // //                     </button>
// // //                 </div>
// // //             </div>

// // //             {/* ── ECOSYSTEM METRICS RIBBON ── */}
// // //             <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', padding: '0 1.5rem' }}>
// // //                 <div className="cdp-stat-card cdp-stat-card--blue">
// // //                     <div className="cdp-stat-card__icon"><Building2 size={20} /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value">{approvedEmployers.length}</span>
// // //                         <span className="cdp-stat-card__label">Approved Partners</span>
// // //                     </div>
// // //                 </div>
// // //                 <div className="cdp-stat-card cdp-stat-card--green">
// // //                     <div className="cdp-stat-card__icon"><Users size={20} /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value">{ecosystemMetrics.totalCapacity}</span>
// // //                         <span className="cdp-stat-card__label">Total Network Capacity</span>
// // //                     </div>
// // //                 </div>
// // //                 <div className="cdp-stat-card cdp-stat-card--grey">
// // //                     <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value">{placements.filter(p => p.status === 'active').length}</span>
// // //                         <span className="cdp-stat-card__label">Active Placements</span>
// // //                     </div>
// // //                 </div>
// // //                 <div className="cdp-stat-card" style={{ background: '#fff1f2', borderLeftColor: '#ef4444' }}>
// // //                     <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="#ef4444" /></div>
// // //                     <div className="cdp-stat-card__body">
// // //                         <span className="cdp-stat-card__value" style={{ color: ecosystemMetrics.highRiskCount > 0 ? '#ef4444' : 'inherit' }}>{ecosystemMetrics.highRiskCount}</span>
// // //                         <span className="cdp-stat-card__label">High Risk Workplaces</span>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {/* ── TABS & TOOLBAR ── */}
// // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
// // //                 <div style={{ display: 'flex', gap: '1.5rem' }}>
// // //                     <button
// // //                         onClick={() => setActiveTab('approved')}
// // //                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'approved' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'approved' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                     >
// // //                         <Building2 size={16} /> Approved Partners <span style={{ background: activeTab === 'approved' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'approved' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{approvedEmployers.length}</span>
// // //                     </button>
// // //                     <button
// // //                         onClick={() => setActiveTab('pending')}
// // //                         style={{ padding: '12px 0', border: 'none', background: 'none', color: activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b', fontWeight: activeTab === 'pending' ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === 'pending' ? '2px solid var(--mlab-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
// // //                     >
// // //                         <ListPlus size={16} /> Pending Applications
// // //                         <span style={{ background: pendingEmployers.length > 0 ? '#ef4444' : '#f1f5f9', color: pendingEmployers.length > 0 ? 'white' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingEmployers.length}</span>
// // //                     </button>
// // //                 </div>

// // //                 <div className="wm-search" style={{ maxWidth: '300px', marginBottom: '8px' }}>
// // //                     <Search size={15} className="wm-search__icon" />
// // //                     <input
// // //                         type="text"
// // //                         className="wm-search__input"
// // //                         placeholder="Search..."
// // //                         value={searchQuery}
// // //                         onChange={e => setSearchQuery(e.target.value)}
// // //                     />
// // //                     {searchQuery && (
// // //                         <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
// // //                     )}
// // //                 </div>
// // //             </div>

// // //             {/* ── CONTENT GRID ── */}
// // //             {isInitialLoad ? (
// // //                 <div className="wm-loading">
// // //                     <div className="ap-spinner" />
// // //                     <span className="wm-loading__label">Loading Ecosystem Blueprint…</span>
// // //                 </div>
// // //             ) : (activeTab === 'approved' ? approvedEmployers : pendingEmployers).length === 0 ? (
// // //                 <div className="wm-empty" style={{ margin: '0 1.5rem' }}>
// // //                     {activeTab === 'pending' ? <ListPlus size={36} color="var(--mlab-grey-light)" /> : <Building2 size={36} color="var(--mlab-grey-light)" />}
// // //                     <p className="wm-empty__title">{searchQuery ? 'No Results Found' : activeTab === 'pending' ? 'No Pending Applications' : 'No Approved Partners'}</p>
// // //                     <p className="wm-empty__desc">
// // //                         {searchQuery ? 'Try a different search term.' : activeTab === 'pending' ? 'Share your public link to start receiving applications.' : 'Onboard your first host company to unlock the placement matchmaking engine.'}
// // //                     </p>
// // //                 </div>
// // //             ) : (
// // //                 <div className="wm-grid" style={{ padding: '0 1.5rem' }}>
// // //                     {(activeTab === 'approved' ? approvedEmployers : pendingEmployers).map(emp => {
// // //                         const isPending = emp.status === 'Pending Review';

// // //                         // Calculate metrics only for approved partners
// // //                         const companyMentors = isPending ? [] : mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');
// // //                         const companyPlacements = isPending ? [] : placements.filter(p => p.employerId === emp.id);
// // //                         const activePlacements = isPending ? [] : companyPlacements.filter(p => p.status === 'active');

// // //                         const internCapacity = (emp as any).internCapacity || 1;
// // //                         const isOverCapacity = activePlacements.length > internCapacity;
// // //                         const riskRating = (emp as any).mlabRiskRating || 'Pending';

// // //                         return (
// // //                             <div key={emp.id} className="wm-card" style={{ borderTopColor: isPending ? 'var(--mlab-amber)' : riskRating === 'High' || riskRating === 'Critical' ? '#ef4444' : riskRating === 'Medium' ? '#f59e0b' : 'var(--mlab-blue)', display: 'flex', flexDirection: 'column' }}>

// // //                                 {/* Header */}
// // //                                 <div className="wm-card__header">
// // //                                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
// // //                                         <h3 className="wm-card__name">{emp.name}</h3>
// // //                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
// // //                                             {isPending ? (
// // //                                                 <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>New Application</span>
// // //                                             ) : (
// // //                                                 <>
// // //                                                     <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
// // //                                                         {(emp as any).mlabTier || 'Tier 2 SME'}
// // //                                                     </span>
// // //                                                     {riskRating === 'Low' ? (
// // //                                                         <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Low Risk</span>
// // //                                                     ) : riskRating === 'Medium' ? (
// // //                                                         <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Medium Risk</span>
// // //                                                     ) : (
// // //                                                         <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{riskRating} Risk</span>
// // //                                                     )}
// // //                                                 </>
// // //                                             )}
// // //                                         </div>
// // //                                     </div>
// // //                                     <div className="wm-card__actions">
// // //                                         {!isPending && <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit Profile"><Edit2 size={13} /></button>}
// // //                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive/Reject"><Trash2 size={13} /></button>
// // //                                     </div>
// // //                                 </div>

// // //                                 {/* Address row */}
// // //                                 <div className="wm-card__address" style={{ marginTop: '0.5rem' }}>
// // //                                     <MapPin size={12} className="wm-card__address-icon" />
// // //                                     <span className="wm-card__address-text">{emp.physicalAddress || 'No address on record'}</span>
// // //                                     {emp.lat && emp.lng && (
// // //                                         <button
// // //                                             className="wm-maps-link wm-maps-link--inline"
// // //                                             onClick={() => window.open(`https://www.google.com/maps?q=${emp.lat},${emp.lng}`, '_blank', 'noopener')}
// // //                                             title="Open in Google Maps"
// // //                                         >
// // //                                             <ExternalLink size={11} />
// // //                                         </button>
// // //                                     )}
// // //                                 </div>

// // //                                 {/* Contact Person */}
// // //                                 <div className="wm-card__contact" style={{ marginTop: '0.5rem', marginBottom: isPending ? '0' : '1rem' }}>
// // //                                     <div className="wm-contact-row">
// // //                                         <User size={12} className="wm-contact-row__icon" />
// // //                                         <span className="wm-contact-row__label">Contact</span>
// // //                                         <span className="wm-contact-row__value">{emp.contactPerson || 'TBC'}</span>
// // //                                     </div>
// // //                                     {emp.contactEmail && (
// // //                                         <div className="wm-contact-row">
// // //                                             <Mail size={12} className="wm-contact-row__icon" />
// // //                                             <span className="wm-contact-row__label">Email</span>
// // //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactEmail}</span>
// // //                                         </div>
// // //                                     )}
// // //                                     {emp.contactPhone && (
// // //                                         <div className="wm-contact-row">
// // //                                             <Phone size={12} className="wm-contact-row__icon" />
// // //                                             <span className="wm-contact-row__label">Phone</span>
// // //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactPhone}</span>
// // //                                         </div>
// // //                                     )}
// // //                                 </div>

// // //                                 {isPending ? (
// // //                                     /* PENDING APPLICATION ACTIONS */
// // //                                     <div style={{ display: 'flex', gap: '8px', padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
// // //                                         <button className="wm-btn wm-btn--primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleApproveEmployer(emp.id, emp.name)}>
// // //                                             <CheckCircle size={14} /> Approve
// // //                                         </button>
// // //                                         <button className="wm-btn wm-btn--ghost" style={{ flex: 1, justifyContent: 'center', background: 'white' }} onClick={() => openEmployerModal(emp)}>
// // //                                             <Search size={14} /> Review Data
// // //                                         </button>
// // //                                     </div>
// // //                                 ) : (
// // //                                     /* APPROVED PARTNER METRICS & MENTORS */
// // //                                     <>
// // //                                         {/* CAPACITY & PLACEMENTS */}
// // //                                         <div style={{ margin: '0 1.25rem', padding: '1rem', background: isOverCapacity ? '#fef2f2' : '#f8fafc', borderRadius: '8px', border: `1px solid ${isOverCapacity ? '#fecaca' : '#e2e8f0'}`, borderLeft: `4px solid ${isOverCapacity ? '#ef4444' : 'var(--mlab-blue)'}` }}>
// // //                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
// // //                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                                                     <LayoutList size={12} /> Active Placements
// // //                                                 </div>
// // //                                                 {companyPlacements.length > 0 && (
// // //                                                     <button onClick={() => openViewPlacements(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                         View Ledger →
// // //                                                     </button>
// // //                                                 )}
// // //                                             </div>
// // //                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
// // //                                                 <div>
// // //                                                     <span style={{ fontSize: '1.5rem', fontWeight: 800, color: isOverCapacity ? '#ef4444' : 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{activePlacements.length}</span>
// // //                                                     <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: 500 }}>/ {internCapacity} Max Capacity</span>
// // //                                                 </div>
// // //                                             </div>
// // //                                             <div style={{ width: '100%', background: isOverCapacity ? '#fca5a5' : '#cbd5e1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
// // //                                                 <div style={{ width: `${Math.min((activePlacements.length / internCapacity) * 100, 100)}%`, background: isOverCapacity ? '#b91c1c' : 'var(--mlab-blue)', height: '100%' }}></div>
// // //                                             </div>
// // //                                             {isOverCapacity && <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}><AlertTriangle size={10} /> Overcapacity Warning</p>}
// // //                                         </div>

// // //                                         {/* MENTORS SECTION */}
// // //                                         <div className="wm-card__mentors" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
// // //                                             <div className="wm-mentors__header">
// // //                                                 <div className="wm-mentors__title">
// // //                                                     <Briefcase size={13} />
// // //                                                     Workplace Mentors
// // //                                                     {companyMentors.length > 0 && (
// // //                                                         <span className="wm-mentors__count">{companyMentors.length}</span>
// // //                                                     )}
// // //                                                 </div>
// // //                                                 <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
// // //                                                     <UserPlus size={12} /> Add
// // //                                                 </button>
// // //                                             </div>

// // //                                             {companyMentors.length === 0 ? (
// // //                                                 <div className="wm-mentor-empty">No mentors assigned yet. Add a mentor before placing learners.</div>
// // //                                             ) : (
// // //                                                 <div className="wm-mentor-list">
// // //                                                     {companyMentors.map(mentor => {
// // //                                                         const mentorLoad = activePlacements.filter(p => p.mentorId === mentor.id).length;
// // //                                                         const isOverloaded = mentorLoad >= 5;

// // //                                                         return (
// // //                                                             <div key={mentor.id} className="wm-mentor-item">
// // //                                                                 <div className="wm-mentor-item__avatar" style={{ border: isOverloaded ? '2px solid #ef4444' : 'none' }}>
// // //                                                                     {mentor.fullName.charAt(0).toUpperCase()}
// // //                                                                 </div>
// // //                                                                 <div className="wm-mentor-item__info">
// // //                                                                     <span className="wm-mentor-item__name">{mentor.fullName}</span>
// // //                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
// // //                                                                         <span style={{ fontSize: '0.65rem', color: isOverloaded ? '#ef4444' : '#64748b', fontWeight: isOverloaded ? 700 : 500 }}>
// // //                                                                             Supervising: {mentorLoad} Intern(s)
// // //                                                                         </span>
// // //                                                                         {isOverloaded && <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '1px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>RATIO HIGH</span>}
// // //                                                                     </div>
// // //                                                                 </div>
// // //                                                                 <div className="wm-mentor-item__actions">
// // //                                                                     <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
// // //                                                                     <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
// // //                                                                 </div>
// // //                                                             </div>
// // //                                                         );
// // //                                                     })}
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>
// // //                                     </>
// // //                                 )}
// // //                             </div>
// // //                         );
// // //                     })}
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // // // src/components/admin/WorkplacesManager/WorkplacesManager.tsx

// // // // import React, { useState, useEffect, useRef } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import { collection, doc, setDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
// // // // import { db } from '../../../lib/firebase';
// // // // import {
// // // //     Building2, MapPin, User, Search, Plus, Edit2, Trash2,
// // // //     ShieldCheck, X, Loader2, Briefcase, Save, ExternalLink,
// // // //     Mail, Phone, Hash, UserPlus, GraduationCap, LayoutList
// // // // } from 'lucide-react';
// // // // import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
// // // // import { useStore, type StaffMember } from '../../../store/useStore';
// // // // import type { Employer } from '../../../types';
// // // // import './WorkplacesManager.css';
// // // // import { CompanyInsightsView } from './CompanyInsightsView';

// // // // /* ─── UPGRADED EMPLOYER MODAL (MANUAL GEO-VALIDATION PATTERN) ─────────────────── */
// // // // interface EmployerModalProps {
// // // //     editing: Employer | null;
// // // //     onClose: () => void;
// // // //     onSaved: () => void;
// // // // }
// // // // const EmployerModal: React.FC<EmployerModalProps> = ({ editing, onClose, onSaved }) => {
// // // //     const toast = useToast();
// // // //     const [saving, setSaving] = useState(false);

// // // //     // Address Search State Variables
// // // //     const [addressQuery, setAddressQuery] = useState(editing?.physicalAddress || '');
// // // //     const [predictions, setPredictions] = useState<any[]>([]);
// // // //     const [showDropdown, setShowDropdown] = useState(false);
// // // //     const [isValidatingAddress, setIsValidatingAddress] = useState(false);
// // // //     const dropdownRef = useRef<HTMLDivElement>(null);

// // // //     const [form, setForm] = useState({
// // // //         name: editing?.name || '',
// // // //         registrationNumber: editing?.registrationNumber || '',
// // // //         physicalAddress: editing?.physicalAddress || '',
// // // //         contactPerson: editing?.contactPerson || '',
// // // //         contactEmail: editing?.contactEmail || '',
// // // //         contactPhone: editing?.contactPhone || '',
// // // //         lat: editing?.lat || null as number | null,
// // // //         lng: editing?.lng || null as number | null,
// // // //     });

// // // //     // Close predictive dropdown upon clicking out of bounds
// // // //     useEffect(() => {
// // // //         const handleClickOutside = (event: MouseEvent) => {
// // // //             if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
// // // //                 setShowDropdown(false);
// // // //             }
// // // //         };
// // // //         document.addEventListener("mousedown", handleClickOutside);
// // // //         return () => document.removeEventListener("mousedown", handleClickOutside);
// // // //     }, []);

// // // //     // Live Trigger for Google Autocomplete Predictions Service
// // // //     useEffect(() => {
// // // //         if (!addressQuery || addressQuery.trim().length < 3 || form.physicalAddress === addressQuery) {
// // // //             setPredictions([]);
// // // //             return;
// // // //         }

// // // //         const delayDebounceFn = setTimeout(() => {
// // // //             if (!window.google || !window.google.maps || !window.google.maps.places) return;

// // // //             const service = new window.google.maps.places.AutocompleteService();
// // // //             service.getPlacePredictions(
// // // //                 { input: addressQuery, componentRestrictions: { country: 'za' } },
// // // //                 (results, status) => {
// // // //                     if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
// // // //                         setPredictions(results);
// // // //                         setShowDropdown(true);
// // // //                     } else {
// // // //                         setPredictions([]);
// // // //                     }
// // // //                 }
// // // //             );
// // // //         }, 300);

// // // //         return () => clearTimeout(delayDebounceFn);
// // // //     }, [addressQuery, form.physicalAddress]);

// // // //     const handleSelectPrediction = (prediction: any) => {
// // // //         setShowDropdown(false);
// // // //         setAddressQuery(prediction.description);
// // // //         setIsValidatingAddress(true);

// // // //         if (!window.google || !window.google.maps || !window.google.maps.places) return;

// // // //         // Use standard PlacesService to resolve coordinates without raising library constraint warnings
// // // //         const dummyElement = document.createElement('div');
// // // //         const service = new window.google.maps.places.PlacesService(dummyElement);

// // // //         service.getDetails(
// // // //             { placeId: prediction.place_id, fields: ['geometry', 'formatted_address'] },
// // // //             (place, status) => {
// // // //                 setIsValidatingAddress(false);
// // // //                 if (status === window.google.maps.places.PlacesServiceStatus.OK && place && place.geometry?.location) {
// // // //                     const extractedLat = place.geometry.location.lat();
// // // //                     const extractedLng = place.geometry.location.lng();
// // // //                     const finalAddress = place.formatted_address || prediction.description;

// // // //                     setAddressQuery(finalAddress);
// // // //                     setForm(p => ({
// // // //                         ...p,
// // // //                         physicalAddress: finalAddress,
// // // //                         lat: extractedLat,
// // // //                         lng: extractedLng
// // // //                     }));
// // // //                 } else {
// // // //                     toast.error("Could not resolve location metrics from this choice.");
// // // //                 }
// // // //             }
// // // //         );
// // // //     };

// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         setSaving(true);
// // // //         try {
// // // //             const finalForm = { ...form, physicalAddress: addressQuery };
// // // //             if (editing) {
// // // //                 await updateDoc(doc(db, 'employers', editing.id), finalForm);
// // // //                 toast.success('Workplace updated successfully!');
// // // //             } else {
// // // //                 const ref = doc(collection(db, 'employers'));
// // // //                 await setDoc(ref, { ...finalForm, id: ref.id, status: 'active', createdAt: new Date().toISOString() });
// // // //                 toast.success('New workplace added successfully!');
// // // //             }
// // // //             onSaved();
// // // //             onClose();
// // // //         } catch { toast.error('Failed to save workplace details.'); }
// // // //         finally { setSaving(false); }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
// // // //             <div className="wm-modal" onClick={e => e.stopPropagation()}>
// // // //                 <div className="wm-modal__header">
// // // //                     <div className="wm-modal__header-icon"><Building2 size={20} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">{editing ? 'Edit Workplace' : 'Add New Workplace'}</h2>
// // // //                         <p className="wm-modal__subtitle">Host company registration and contact details</p>
// // // //                     </div>
// // // //                     <button className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// // // //                     <div className="wm-modal__body">
// // // //                         <div className="wm-form-section">
// // // //                             <div className="wm-form-section__label"><Building2 size={12} /> Company Details</div>
// // // //                             <div className="wm-form-grid">
// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Host Company Name <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="text" placeholder="e.g. Acme Tech Solutions"
// // // //                                         value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
// // // //                                 </div>
// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Company Registration / SETA Number</label>
// // // //                                     <input className="wm-form-input" type="text" placeholder="e.g. 2021/123456/07"
// // // //                                         value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
// // // //                                 </div>

// // // //                                 {/* INTERACTION WRAPPER FOR PREDICTIVE LOCATION MANAGEMENT */}
// // // //                                 <div className="wm-form-group wm-form-group--full" ref={dropdownRef} style={{ position: 'relative' }}>
// // // //                                     <label className="wm-form-label"><MapPin size={11} /> Physical Address (Google Verified)</label>
// // // //                                     <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
// // // //                                         <input
// // // //                                             type="text"
// // // //                                             className="wm-form-input"
// // // //                                             style={{ paddingRight: isValidatingAddress ? '40px' : '12px' }}
// // // //                                             placeholder="Search for the host company building or street name…"
// // // //                                             value={addressQuery}
// // // //                                             onChange={e => setAddressQuery(e.target.value)}
// // // //                                         />
// // // //                                         {isValidatingAddress && (
// // // //                                             <Loader2 size={16} className="wm-spin" style={{ position: 'absolute', right: '12px', color: 'var(--mlab-blue)' }} />
// // // //                                         )}
// // // //                                     </div>

// // // //                                     {showDropdown && predictions.length > 0 && (
// // // //                                         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px', zIndex: 10600, maxHeight: '240px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
// // // //                                             {predictions.map(p => (
// // // //                                                 <div
// // // //                                                     key={p.place_id}
// // // //                                                     onClick={() => handleSelectPrediction(p)}
// // // //                                                     style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#1e293b' }}
// // // //                                                     onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
// // // //                                                     onMouseLeave={e => e.currentTarget.style.background = 'white'}
// // // //                                                 >
// // // //                                                     {p.description}
// // // //                                                 </div>
// // // //                                             ))}
// // // //                                         </div>
// // // //                                     )}

// // // //                                     {form.physicalAddress && (
// // // //                                         <div className="wm-verified-address" style={{ marginTop: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#166534' }}>
// // // //                                             <ShieldCheck size={14} />
// // // //                                             <span style={{ flex: 1 }}>{form.physicalAddress}</span>
// // // //                                             {form.lat && form.lng && (
// // // //                                                 <button type="button" className="wm-maps-link"
// // // //                                                     style={{ background: 'white', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#15803d', fontWeight: 600 }}
// // // //                                                     onClick={() => window.open(`https://www.google.com/maps?q=${form.lat},${form.lng}`, '_blank', 'noopener')}>
// // // //                                                     <ExternalLink size={11} /> Map
// // // //                                                 </button>
// // // //                                             )}
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div className="wm-form-section">
// // // //                             <div className="wm-form-section__label"><User size={12} /> Primary Contact Person</div>
// // // //                             <div className="wm-form-grid">
// // // //                                 <div className="wm-form-group wm-form-group--full">
// // // //                                     <label className="wm-form-label">Full Name <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="text" placeholder="e.g. Jane Doe"
// // // //                                         value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
// // // //                                 </div>
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Email Address <span className="wm-form-required">*</span></label>
// // // //                                     <input className="wm-form-input" required type="email" placeholder="jane@company.com"
// // // //                                         value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
// // // //                                 </div>
// // // //                                 <div className="wm-form-group">
// // // //                                     <label className="wm-form-label">Contact Number</label>
// // // //                                     <input className="wm-form-input" type="tel" placeholder="082 123 4567"
// // // //                                         value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="wm-modal__footer">
// // // //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
// // // //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// // // //                             {saving ? <><Loader2 className="wm-spin" size={13} /> Saving…</> : <><Save size={13} /> Save Workplace</>}
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>,
// // // //         document.body
// // // //     );
// // // // };

// // // // /* ─── MENTOR MODAL ───────────────────────────────────────────────────────────── */
// // // // interface MentorModalProps {
// // // //     editing: StaffMember | null;
// // // //     employerId: string;
// // // //     onClose: () => void;
// // // //     onSaved: () => void;
// // // //     addStaff: (m: StaffMember) => Promise<void>;
// // // // }
// // // // const MentorModal: React.FC<MentorModalProps> = ({ editing, employerId, onClose, onSaved, addStaff }) => {
// // // //     const toast = useToast();
// // // //     const [saving, setSaving] = useState(false);
// // // //     const [form, setForm] = useState({
// // // //         fullName: editing?.fullName || '',
// // // //         email: editing?.email || '',
// // // //         phone: editing?.phone || '',
// // // //     });

// // // //     const handleSubmit = async (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         setSaving(true);
// // // //         try {
// // // //             if (editing) {
// // // //                 await updateDoc(doc(db, 'users', editing.id), { fullName: form.fullName, phone: form.phone, updatedAt: new Date().toISOString() });
// // // //                 toast.success('Mentor updated successfully!');
// // // //             } else {
// // // //                 await addStaff({ ...form, role: 'mentor', employerId } as StaffMember);
// // // //                 toast.success('Mentor created — invite sent!');
// // // //             }
// // // //             onSaved();
// // // //             onClose();
// // // //         } catch (err) { console.error('Mentor save error:', err); }
// // // //         finally { setSaving(false); }
// // // //     };

// // // //     return createPortal(
// // // //         <div className="wm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
// // // //             <div className="wm-modal wm-modal--sm" onClick={e => e.stopPropagation()}>
// // // //                 <div className="wm-modal__header wm-modal__header--green">
// // // //                     <div className="wm-modal__header-icon wm-modal__header-icon--green"><Briefcase size={18} /></div>
// // // //                     <div>
// // // //                         <h2 className="wm-modal__title">{editing ? 'Edit Mentor' : 'Add Workplace Mentor'}</h2>
// // // //                         <p className="wm-modal__subtitle">Workplace supervision contact</p>
// // // //                     </div>
// // // //                     <button className="wm-modal__close" onClick={onClose} disabled={saving}><X size={18} /></button>
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
// // // //                                     value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
// // // //                                     disabled={!!editing} />
// // // //                                 {editing && <span className="wm-form-hint">Email cannot be changed after creation.</span>}
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


// // // // /* ═══════════════════════════════════════════════════════════════════════════
// // // //    MAIN COMPONENT
// // // // ═══════════════════════════════════════════════════════════════════════════ */
// // // // export const WorkplacesManager: React.FC = () => {
// // // //     const { employers, fetchEmployers, addStaff, learners, fetchLearners } = useStore();

// // // //     const placements = ((useStore(s => (s as any).placements) || []) as any[]);
// // // //     const fetchPlacements = (useStore(s => (s as any).fetchPlacements) || (async () => { })) as any;

// // // //     const [viewingCompanyInsights, setViewingCompanyInsights] = useState<Employer | null>(null);

// // // //     const toast = useToast();
// // // //     const navigate = useNavigate();

// // // //     const [isInitialLoad, setIsInitialLoad] = useState(employers.length === 0);
// // // //     const [searchQuery, setSearchQuery] = useState('');
// // // //     const [mentors, setMentors] = useState<StaffMember[]>([]);

// // // //     // Modals State
// // // //     const [employerModalOpen, setEmployerModalOpen] = useState(false);
// // // //     const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);

// // // //     const [mentorModalOpen, setMentorModalOpen] = useState(false);
// // // //     const [editingMentor, setEditingMentor] = useState<StaffMember | null>(null);
// // // //     const [activeMentorEmpId, setActiveMentorEmpId] = useState('');

// // // //     const loadData = async () => {
// // // //         try {
// // // //             await Promise.all([
// // // //                 fetchEmployers(),
// // // //                 fetchLearners(),
// // // //                 fetchPlacements()
// // // //             ]);
// // // //             const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// // // //             setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// // // //         } catch { toast.error('Failed to load workplace tracking data.'); }
// // // //         finally { setIsInitialLoad(false); }
// // // //     };

// // // //     useEffect(() => { loadData(); }, []);

// // // //     const refreshMentors = async () => {
// // // //         const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
// // // //         setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
// // // //     };

// // // //     const handleArchiveEmployer = async (id: string, name: string) => {
// // // //         if (!window.confirm(`Archive ${name}? Assigned mentors and learners will remain linked.`)) return;
// // // //         try {
// // // //             await updateDoc(doc(db, 'employers', id), { status: 'archived' });
// // // //             toast.info(`${name} archived.`);
// // // //             await fetchEmployers();
// // // //         } catch { toast.error('Failed to archive.'); }
// // // //     };

// // // //     const handleArchiveMentor = async (id: string, name: string) => {
// // // //         if (!window.confirm(`Remove mentor access for ${name}?`)) return;
// // // //         try {
// // // //             await updateDoc(doc(db, 'users', id), { status: 'archived' });
// // // //             setMentors(p => p.filter(m => m.id !== id));
// // // //             toast.info('Mentor access removed.');
// // // //         } catch { toast.error('Failed to remove mentor.'); }
// // // //     };

// // // //     const openEmployerModal = (emp?: Employer) => {
// // // //         setEditingEmployer(emp || null);
// // // //         setEmployerModalOpen(true);
// // // //     };
// // // //     const openMentorModal = (empId: string, mentor?: StaffMember) => {
// // // //         setActiveMentorEmpId(empId);
// // // //         setEditingMentor(mentor || null);
// // // //         setMentorModalOpen(true);
// // // //     };

// // // //     const openViewPlacements = (emp: Employer) => {
// // // //         setViewingCompanyInsights(emp);
// // // //     };

// // // //     const filteredEmployers = employers.filter(emp =>
// // // //         emp.status !== 'archived' && (
// // // //             emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
// // // //             (emp.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
// // // //         )
// // // //     );

// // // //     if (viewingCompanyInsights) {
// // // //         return (
// // // //             <CompanyInsightsView
// // // //                 company={viewingCompanyInsights}
// // // //                 onBack={() => setViewingCompanyInsights(null)}
// // // //             />
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div className="wm-root animate-fade-in">
// // // //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// // // //             {/* Modals */}
// // // //             {employerModalOpen && (
// // // //                 <EmployerModal editing={editingEmployer} onClose={() => setEmployerModalOpen(false)} onSaved={fetchEmployers} />
// // // //             )}
// // // //             {mentorModalOpen && (
// // // //                 <MentorModal editing={editingMentor} employerId={activeMentorEmpId} onClose={() => setMentorModalOpen(false)} onSaved={refreshMentors} addStaff={addStaff} />
// // // //             )}

// // // //             {/* ── PAGE HEADER ── */}
// // // //             <div className="wm-page-header">
// // // //                 <div className="wm-page-header__left">
// // // //                     <div className="wm-page-header__icon"><Building2 size={22} /></div>
// // // //                     <div>
// // // //                         <h1 className="wm-page-header__title">Workplaces & Placements</h1>
// // // //                         <p className="wm-page-header__desc">Manage host companies, external internships, and supervision mentors.</p>
// // // //                     </div>
// // // //                 </div>
// // // //                 <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()}>
// // // //                     <Plus size={14} /> Add Workplace
// // // //                 </button>
// // // //             </div>

// // // //             {/* ── TOOLBAR ── */}
// // // //             <div className="wm-toolbar">
// // // //                 <div className="wm-search">
// // // //                     <Search size={15} className="wm-search__icon" />
// // // //                     <input
// // // //                         type="text"
// // // //                         className="wm-search__input"
// // // //                         placeholder="Search workplaces or contact persons…"
// // // //                         value={searchQuery}
// // // //                         onChange={e => setSearchQuery(e.target.value)}
// // // //                     />
// // // //                     {searchQuery && (
// // // //                         <button className="wm-search__clear" onClick={() => setSearchQuery('')}><X size={13} /></button>
// // // //                     )}
// // // //                 </div>
// // // //                 <div className="wm-toolbar__count">
// // // //                     {filteredEmployers.length} workplace{filteredEmployers.length !== 1 ? 's' : ''}
// // // //                 </div>
// // // //             </div>

// // // //             {/* ── CONTENT ── */}
// // // //             {isInitialLoad ? (
// // // //                 <div className="wm-loading">
// // // //                     <div className="ap-spinner" />
// // // //                     <span className="wm-loading__label">Loading Workplaces…</span>
// // // //                 </div>
// // // //             ) : filteredEmployers.length === 0 ? (
// // // //                 <div className="wm-empty">
// // // //                     <div className="wm-empty__icon"><Building2 size={36} /></div>
// // // //                     <p className="wm-empty__title">{searchQuery ? 'No Results Found' : 'No Workplaces Yet'}</p>
// // // //                     <p className="wm-empty__desc">
// // // //                         {searchQuery ? 'Try a different search term.' : 'Add your first host company to get started.'}
// // // //                     </p>
// // // //                     {!searchQuery && (
// // // //                         <button className="wm-btn wm-btn--primary" onClick={() => openEmployerModal()}>
// // // //                             <Plus size={14} /> Add First Workplace
// // // //                         </button>
// // // //                     )}
// // // //                 </div>
// // // //             ) : (
// // // //                 <div className="wm-grid">
// // // //                     {filteredEmployers.map(emp => {
// // // //                         const companyMentors = mentors.filter(m => m.employerId === emp.id && m.status !== 'archived');

// // // //                         // Calculate Active Placements
// // // //                         const companyPlacements = placements.filter(p => p.employerId === emp.id);
// // // //                         const activePlacements = companyPlacements.filter(p => p.status === 'active');

// // // //                         const qctoCount = activePlacements.filter(p => p.placementType.includes('QCTO')).length;
// // // //                         const alumniCount = activePlacements.filter(p => p.placementType.includes('Alumni')).length;
// // // //                         const externalCount = activePlacements.length - qctoCount - alumniCount;

// // // //                         return (
// // // //                             <div key={emp.id} className="wm-card">
// // // //                                 {/* Card header — name + actions */}
// // // //                                 <div className="wm-card__header">
// // // //                                     <h3 className="wm-card__name">{emp.name}</h3>
// // // //                                     <div className="wm-card__actions">
// // // //                                         <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => openEmployerModal(emp)} title="Edit"><Edit2 size={13} /></button>
// // // //                                         <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => handleArchiveEmployer(emp.id, emp.name)} title="Archive"><Trash2 size={13} /></button>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 {/* Registration number chip */}
// // // //                                 <div className="wm-card__reg">
// // // //                                     <Hash size={11} />
// // // //                                     <span>{emp.registrationNumber || 'Registration not provided'}</span>
// // // //                                 </div>

// // // //                                 {/* Address row */}
// // // //                                 <div className="wm-card__address">
// // // //                                     <MapPin size={12} className="wm-card__address-icon" />
// // // //                                     <span className="wm-card__address-text">{emp.physicalAddress || 'No address on record'}</span>
// // // //                                     {emp.lat && emp.lng && (
// // // //                                         <button
// // // //                                             className="wm-maps-link wm-maps-link--inline"
// // // //                                             onClick={() => window.open(`https://www.google.com/maps?q=${emp.lat},${emp.lng}`, '_blank', 'noopener')}
// // // //                                             title="Open in Google Maps"
// // // //                                         >
// // // //                                             <ExternalLink size={11} />
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {/* OPERATIONAL INSIGHTS (PLACEMENTS)  */}
// // // //                                 <div style={{ margin: '1.25rem 1.25rem 0', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', borderLeft: '4px solid var(--mlab-blue)' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
// // // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                                             <LayoutList size={12} /> Operational Insights
// // // //                                         </div>
// // // //                                         {companyPlacements.length > 0 && (
// // // //                                             <button onClick={() => openViewPlacements(emp)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 View Ledger →
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
// // // //                                         <div>
// // // //                                             <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{activePlacements.length}</span>
// // // //                                             <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: 500 }}>Active Placements</span>
// // // //                                         </div>
// // // //                                         {/* REMOVED INLINE CREATE BUTTON TO PREVENT MODAL IMPORT COLLISION */}
// // // //                                     </div>
// // // //                                     {activePlacements.length > 0 && (
// // // //                                         <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
// // // //                                             {qctoCount > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>{qctoCount} QCTO</span>}
// // // //                                             {alumniCount > 0 && <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>{alumniCount} Alumni</span>}
// // // //                                             {externalCount > 0 && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>{externalCount} External</span>}
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {/* Contact person rows */}
// // // //                                 <div className="wm-card__contact">
// // // //                                     <div className="wm-contact-row">
// // // //                                         <User size={12} className="wm-contact-row__icon" />
// // // //                                         <span className="wm-contact-row__label">Contact</span>
// // // //                                         <span className="wm-contact-row__value">{emp.contactPerson || 'TBC'}</span>
// // // //                                     </div>
// // // //                                     {emp.contactEmail && (
// // // //                                         <div className="wm-contact-row">
// // // //                                             <Mail size={12} className="wm-contact-row__icon" />
// // // //                                             <span className="wm-contact-row__label">Email</span>
// // // //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactEmail}</span>
// // // //                                         </div>
// // // //                                     )}
// // // //                                     {emp.contactPhone && (
// // // //                                         <div className="wm-contact-row">
// // // //                                             <Phone size={12} className="wm-contact-row__icon" />
// // // //                                             <span className="wm-contact-row__label">Phone</span>
// // // //                                             <span className="wm-contact-row__value wm-contact-row__value--muted">{emp.contactPhone}</span>
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {/* Mentors section */}
// // // //                                 <div className="wm-card__mentors" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
// // // //                                     <div className="wm-mentors__header">
// // // //                                         <div className="wm-mentors__title">
// // // //                                             <Briefcase size={13} />
// // // //                                             Workplace Mentors
// // // //                                             {companyMentors.length > 0 && (
// // // //                                                 <span className="wm-mentors__count">{companyMentors.length}</span>
// // // //                                             )}
// // // //                                         </div>
// // // //                                         <button className="wm-mentors__add-btn" onClick={() => openMentorModal(emp.id)}>
// // // //                                             <UserPlus size={12} /> Add
// // // //                                         </button>
// // // //                                     </div>

// // // //                                     {companyMentors.length === 0 ? (
// // // //                                         <div className="wm-mentor-empty">No mentors assigned yet. Add a mentor before placing learners.</div>
// // // //                                     ) : (
// // // //                                         <div className="wm-mentor-list">
// // // //                                             {companyMentors.map(mentor => {
// // // //                                                 const mentorLoad = activePlacements.filter(p => p.mentorId === mentor.id).length;
// // // //                                                 const isOverloaded = mentorLoad >= 5;

// // // //                                                 return (
// // // //                                                     <div key={mentor.id} className="wm-mentor-item">
// // // //                                                         <div className="wm-mentor-item__avatar" style={{ border: isOverloaded ? '2px solid #ef4444' : 'none' }}>
// // // //                                                             {mentor.fullName.charAt(0).toUpperCase()}
// // // //                                                         </div>
// // // //                                                         <div className="wm-mentor-item__info">
// // // //                                                             <span className="wm-mentor-item__name">{mentor.fullName}</span>
// // // //                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
// // // //                                                                 <span style={{ fontSize: '0.65rem', color: isOverloaded ? '#ef4444' : '#64748b', fontWeight: isOverloaded ? 700 : 500 }}>
// // // //                                                                     Supervising: {mentorLoad} Intern(s)
// // // //                                                                 </span>
// // // //                                                                 {isOverloaded && <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '1px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>RATIO HIGH</span>}
// // // //                                                             </div>
// // // //                                                         </div>
// // // //                                                         <div className="wm-mentor-item__actions">
// // // //                                                             <button className="mlab-icon-btn mlab-icon-btn--blue wm-mentor-item__btn" onClick={() => openMentorModal(emp.id, mentor)} title="Edit mentor"><Edit2 size={11} /></button>
// // // //                                                             <button className="mlab-icon-btn wm-mentor-item__btn wm-mentor-item__btn--red" onClick={() => handleArchiveMentor(mentor.id, mentor.fullName)} title="Remove mentor"><Trash2 size={11} /></button>
// // // //                                                         </div>
// // // //                                                     </div>
// // // //                                                 );
// // // //                                             })}
// // // //                                         </div>
// // // //                                     )}
// // // //                                 </div>
// // // //                             </div>
// // // //                         );
// // // //                     })}
// // // //                 </div>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

