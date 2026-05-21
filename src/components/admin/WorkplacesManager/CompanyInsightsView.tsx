// src/components/admin/WorkplacesManager/CompanyInsightsView.tsx

import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
    ArrowLeft, MapPin, Mail, Hash,
    Briefcase, CheckCircle, AlertTriangle, Users, Award,
    FileText, Search, X, DownloadCloud, AlertCircle, User,
    FileSpreadsheet
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useStore, type StaffMember } from '../../../store/useStore';
import type { Employer, DashboardLearner } from '../../../types';

interface CompanyInsightsViewProps {
    company: Employer;
    onBack: () => void;
}

export const CompanyInsightsView: React.FC<CompanyInsightsViewProps> = ({ company, onBack }) => {
    const { learners, staff } = useStore();
    const placements = (useStore(s => (s as any).placements) || []) as any[];

    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
    const [searchQuery, setSearchQuery] = useState('');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close export menu if clicked outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter Data for this specific company
    const companyPlacements = useMemo(() => placements.filter(p => p.employerId === company.id), [placements, company.id]);
    const companyMentors = useMemo(() => staff.filter(s => s.role === 'mentor' && s.employerId === company.id && s.status !== 'archived'), [staff, company.id]);

    // Calculate Metrics
    const { activeCount, completedCount, droppedCount, missingContracts } = useMemo(() => {
        let active = 0, completed = 0, dropped = 0, missing = 0;
        companyPlacements.forEach(p => {
            if (p.status === 'active' || p.status === 'pending_signatures') {
                active++;
                if (p.status === 'active' && !p.compliance?.isAgreementFullyExecuted) missing++;
            }
            if (p.status === 'completed') completed++;
            if (p.status === 'terminated') dropped++;
        });
        return { activeCount: active, completedCount: completed, droppedCount: dropped, missingContracts: missing };
    }, [companyPlacements]);

    // Enriched Placement Data
    const enrichedPlacements = useMemo(() => {
        return companyPlacements.map(p => {
            const learner = learners.find(l => l.id === p.learnerId) || ({} as Partial<DashboardLearner>);
            const mentor = companyMentors.find(m => m.id === p.mentorId) || ({} as Partial<StaffMember>);
            return {
                ...p,
                learnerName: learner.fullName || 'Unknown Learner',
                idNumber: learner.idNumber || '—',
                mentorName: mentor.fullName || 'Unassigned',
            };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [companyPlacements, learners, companyMentors]);

    // Apply Tab Filters & Search Query
    const displayedPlacements = useMemo(() => {
        return enrichedPlacements.filter(p => {
            if (activeTab === 'active' && p.status !== 'active' && p.status !== 'pending_signatures') return false;
            if (activeTab === 'history' && p.status !== 'completed' && p.status !== 'terminated') return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!p.learnerName.toLowerCase().includes(q) && !p.idNumber.includes(q)) return false;
            }
            return true;
        });
    }, [enrichedPlacements, activeTab, searchQuery]);

    const formatDate = (dateStr: string) => moment(dateStr).format('DD MMM YYYY');

    // EXPORT DATA PREPARATION
    const getExportData = () => {
        return displayedPlacements.map(p => ({
            "Learner Name": p.learnerName,
            "ID Number": p.idNumber,
            "Placement Type": p.placementType,
            "B-BBEE Category": p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized',
            "Start Date": moment(p.startDate).format('YYYY-MM-DD'),
            "Expected End Date": moment(p.endDate).format('YYYY-MM-DD'),
            "Assigned Mentor": p.mentorName,
            "WBLPA Contract Status": p.compliance?.isAgreementFullyExecuted ? "Signed & On File" : "Missing Contract",
            "Contract Link": p.compliance?.wblpaAgreementUrl || 'Not Uploaded',
            "Operational Status": p.status.replace('_', ' ').toUpperCase()
        }));
    };

    const generateFileName = (extension: string) => {
        const cleanCompanyName = company.name.replace(/[^a-zA-Z0-9]/g, '_');
        return `${cleanCompanyName}_${activeTab}_placements_${moment().format('YYYYMMDD')}.${extension}`;
    };

    // EXPORT TO CSV
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

    // EXPORT TO NATIVE EXCEL (.XLSX)
    const handleExportExcel = () => {
        const data = getExportData();
        if (data.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Placements Ledger");

        XLSX.writeFile(workbook, generateFileName('xlsx'));
        setShowExportMenu(false);
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

            {/* ── BREADCRUMB & HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <button
                    onClick={onBack}
                    style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Host Company Profile
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-midnight)', lineHeight: 1.2 }}>
                        {company.name}
                    </h1>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#475569' }}>
                        {company.registrationNumber && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={13} /> {company.registrationNumber}</span>}
                        {company.physicalAddress && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} /> {company.physicalAddress}</span>}
                        {company.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {company.contactEmail}</span>}
                    </div>
                </div>
            </div>

            {/* ── METRICS RIBBON ── */}
            <div className="cdp-stat-row">
                <div className="cdp-stat-card cdp-stat-card--blue">
                    <div className="cdp-stat-card__icon"><Briefcase size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{activeCount}</span>
                        <span className="cdp-stat-card__label">Active Interns</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--green">
                    <div className="cdp-stat-card__icon"><Award size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value">{completedCount}</span>
                        <span className="cdp-stat-card__label">Completed Programs</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--amber">
                    <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: missingContracts > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{missingContracts}</span>
                        <span className="cdp-stat-card__label">Missing Contracts</span>
                    </div>
                </div>
                <div className="cdp-stat-card cdp-stat-card--grey">
                    <div className="cdp-stat-card__icon"><AlertTriangle size={20} color="var(--mlab-red)" /></div>
                    <div className="cdp-stat-card__body">
                        <span className="cdp-stat-card__value" style={{ color: droppedCount > 0 ? 'var(--mlab-red)' : 'inherit' }}>{droppedCount}</span>
                        <span className="cdp-stat-card__label">Dropped / Terminated</span>
                    </div>
                </div>
            </div>

            {/* ── DATA GRID WITH TABS & SEARCH ── */}
            <div className="cdp-panel">
                <div className="vp-card" style={{ marginBottom: 0 }}>
                    <div className="vp-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div className="vp-card-title-group">
                            <Users size={18} color="var(--mlab-blue)" />
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                Placement Ledger
                            </h3>
                        </div>
                    </div>

                    {/* TOOLBAR: TABS + SEARCH + DUAL EXPORT */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 1.5rem', borderBottom: '1px solid var(--mlab-border)', marginTop: '1rem', background: '#f8fafc', flexWrap: 'wrap', gap: '1rem' }}>

                        <div style={{ display: 'flex', gap: '1.5rem' }}>
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
                                All Records <span style={{ background: activeTab === 'all' ? '#e0e7ff' : '#f1f5f9', color: activeTab === 'all' ? 'var(--mlab-blue)' : '#94a3b8', padding: '2px 6px', borderRadius: '12px', fontSize: '0.7rem' }}>{enrichedPlacements.length}</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 8px' }}>
                                <Search size={14} color="#64748b" />
                                <input
                                    type="text"
                                    placeholder="Search by learner or ID..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ border: 'none', padding: '8px', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '200px' }}
                                />
                                {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={12} /></button>}
                            </div>

                            <div style={{ position: 'relative' }} ref={menuRef}>
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    disabled={displayedPlacements.length === 0}
                                    className="cdp-btn cdp-btn--outline"
                                    style={{ background: 'white', fontSize: '0.8rem', padding: '6px 12px', opacity: displayedPlacements.length === 0 ? 0.5 : 1, cursor: displayedPlacements.length === 0 ? 'not-allowed' : 'pointer' }}
                                >
                                    <DownloadCloud size={14} /> Export Ledger
                                </button>

                                {showExportMenu && displayedPlacements.length > 0 && (
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
                        </div>

                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Learner Profile</th>
                                    <th>Placement Timeline</th>
                                    <th>Assigned Mentor</th>
                                    <th>Compliance Track & Contracts</th>
                                    <th>Operational Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedPlacements.length > 0 ? displayedPlacements.map(p => (
                                    <tr key={p.id}>
                                        {/* Learner Name & ID */}
                                        <td>
                                            <div className="cdp-learner-cell">
                                                <div className="cdp-learner-avatar">{p.learnerName.charAt(0)}</div>
                                                <div className="cdp-learner-cell__info">
                                                    <span className="cdp-learner-cell__name">{p.learnerName}</span>
                                                    <span className="cdp-learner-cell__id">{p.idNumber}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Timeline */}
                                        <td>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>
                                                {formatDate(p.startDate)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {formatDate(p.endDate)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{p.placementType}</div>
                                        </td>

                                        {/* Mentor Cell */}
                                        <td>
                                            <div style={{ fontSize: '0.8rem', color: p.mentorId ? 'var(--mlab-midnight)' : '#dc2626', fontWeight: p.mentorId ? 500 : 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {p.mentorId ? (
                                                    <><User size={12} /> {p.mentorName}</>
                                                ) : (
                                                    <><AlertTriangle size={12} /> No Mentor Assigned</>
                                                )}
                                            </div>
                                        </td>

                                        {/* Compliance Cell */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                                <span className="cdp-chip cdp-chip--k" style={{ width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                                                    {p.compliance?.bbbeeSpendCategory || p.bbbeeSpendCategory || 'Uncategorized'}
                                                </span>

                                                {p.compliance?.isAgreementFullyExecuted ? (
                                                    p.compliance?.wblpaAgreementUrl ? (
                                                        <a
                                                            href={p.compliance.wblpaAgreementUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, textDecoration: 'none' }}
                                                            title="Click to view signed contract document"
                                                        >
                                                            <FileText size={10} /> View WBLPA Contract
                                                        </a>
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <CheckCircle size={10} /> Signed (No File Link)
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ fontSize: '0.65rem', color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                        <AlertCircle size={10} /> No WBLPA Uploaded
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Operational Status */}
                                        <td>
                                            <span className={`cdp-status-badge ${p.status === 'active' ? 'cdp-status-badge--active' : p.status === 'terminated' ? 'cdp-status-badge--dropped' : ''}`} style={p.status === 'pending_signatures' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : p.status === 'completed' ? { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } : {}}>
                                                {p.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                            {searchQuery ? `No records matched your search for "${searchQuery}".` : `No ${activeTab === 'active' ? 'active' : activeTab === 'history' ? 'historical' : ''} placements found for this company.`}
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