import React, { useEffect, useState, useMemo } from 'react';
import {
    Plus, Upload, Download, Search, Filter, Edit, Trash2,
    Users, Award, CheckCircle, XCircle, Eye,
    LayoutDashboard, BookOpen, Settings, LogOut, AlertCircle,
    Share2, Check, Calendar, Archive
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';

// Store
import { useStore } from '../../store/useStore';

// Components
import { StatCard } from '../../components/common/StatCard';
import { LearnerFormModal } from '../../components/admin/LearnerFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal';
import { UploadModal } from '../../components/common/UploadModal';
import { DeleteConfirmModal } from '../../components/common/DeleteConfirmModal';

// Styles
import './AdminDashboard.css';
import type { DashboardLearner, ProgrammeTemplate } from '../../types';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();

    // ----- Local UI State -----
    const [currentNav, setCurrentNav] = useState<'learners' | 'qualifications' | 'dashboard'>('learners');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // NEW: Filter State
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [showArchived, setShowArchived] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedLearner, setSelectedLearner] = useState<DashboardLearner | null>(null);

    // Programme Modal states
    const [showProgModal, setShowProgModal] = useState(false);
    const [selectedProg, setSelectedProg] = useState<ProgrammeTemplate | null>(null);
    const [showProgUploadModal, setShowProgUploadModal] = useState(false);

    // Delete states
    const [learnerToDelete, setLearnerToDelete] = useState<DashboardLearner | null>(null);
    const [progToArchive, setProgToArchive] = useState<ProgrammeTemplate | null>(null);

    // ----- Global State from Store -----
    const {
        learners,
        fetchLearners,
        addLearner,
        updateLearner,
        deleteLearner,
        importUnifiedLearners,
        archiveCohort, // NEW: Archive action
        programmes,
        fetchProgrammes,
        addProgramme,
        updateProgramme,
        archiveProgramme,
        importProgrammesFromCSV,
    } = useStore();

    // ----- Load data on mount -----
    useEffect(() => {
        fetchLearners();
        fetchProgrammes();
    }, [fetchLearners, fetchProgrammes]);

    // ----- 1. Compute Available Years -----
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        learners.forEach(l => {
            if (l.trainingStartDate) {
                years.add(l.trainingStartDate.substring(0, 4));
            }
        });
        return Array.from(years).sort().reverse();
    }, [learners]);

    // ----- 2. Filter Logic -----
    const filteredLearners = learners.filter(learner => {
        // Search
        const matchesSearch = learner.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            learner.idNumber.includes(searchTerm) ||
            learner.email.toLowerCase().includes(searchTerm.toLowerCase());

        // Status
        const matchesStatus = filterStatus === 'all' || learner.status === filterStatus;

        // Year
        const learnerYear = learner.trainingStartDate ? learner.trainingStartDate.substring(0, 4) : 'Unknown';
        const matchesYear = selectedYear === 'all' || learnerYear === selectedYear;

        // Archive (Hide archived unless toggle is ON)
        const matchesArchived = showArchived ? true : !learner.isArchived;

        return matchesSearch && matchesStatus && matchesYear && matchesArchived;
    });

    const stats = {
        totalLearners: learners.length,
        eisaAdmitted: learners.filter(l => l.eisaAdmission).length,
        completedModules: learners.reduce(
            (acc, l) => acc + l.knowledgeModules.length + l.practicalModules.length + l.workExperienceModules.length,
            0
        ),
        pendingReview: learners.filter(l => l.status === 'in-progress').length,
    };

    // ----- Validation Helper -----
    const validateLearnerForSOR = (learner: DashboardLearner): { valid: boolean; reason?: string } => {
        if (!learner.fullName || !learner.idNumber) return { valid: false, reason: "Missing Personal Details" };
        if (!learner.qualification.name || !learner.qualification.saqaId) return { valid: false, reason: "Missing Qualification Details" };

        const allModules = [
            ...learner.knowledgeModules,
            ...learner.practicalModules,
            ...learner.workExperienceModules
        ];

        if (allModules.length === 0) return { valid: false, reason: "No modules found" };

        const hasIncompleteModules = allModules.some((m) => {
            const date = 'dateAssessed' in m ? m.dateAssessed : m.dateSignedOff;
            return !m.status || !date;
        });

        if (hasIncompleteModules) return { valid: false, reason: "Some modules are missing Results or Dates" };

        return { valid: true };
    };

    // ----- Action Handlers -----

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleViewSOR = (learner: DashboardLearner) => {
        const check = validateLearnerForSOR(learner);
        if (check.valid) {
            navigate(`/sor/${learner.id}`);
        } else {
            alert(`Cannot view Statement of Results:\n${check.reason}\n\nPlease update the learner details.`);
        }
    };

    const handleCopyLink = (learnerIdNumber: string) => {
        const link = `${window.location.origin}/portal?id=${learnerIdNumber}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedId(learnerIdNumber);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const handleArchiveCohort = async () => {
        if (selectedYear === 'all') {
            alert("Please select a specific year to archive.");
            return;
        }

        if (window.confirm(`Are you sure you want to ARCHIVE the entire ${selectedYear} cohort?\n\nThis will hide them from the main list.`)) {
            await archiveCohort(selectedYear);
        }
    };

    const handleAddLearner = async (newLearner: DashboardLearner) => {
        const { id, ...learnerData } = newLearner;
        await addLearner(learnerData);
        setShowAddModal(false);
    };

    const handleUpdateLearner = async (updatedLearner: DashboardLearner) => {
        await updateLearner(updatedLearner.id, updatedLearner);
        setShowEditModal(false);
        setSelectedLearner(null);
    };

    const handleDeleteLearner = async (id: string) => {
        await deleteLearner(id);
        setLearnerToDelete(null);
    };

    const handleAddProgramme = async (newProgramme: ProgrammeTemplate) => {
        const { id, ...programmeData } = newProgramme;
        await addProgramme(programmeData);
        setShowProgModal(false);
    };

    const handleUpdateProgramme = async (updatedProgramme: ProgrammeTemplate) => {
        await updateProgramme(updatedProgramme.id, updatedProgramme);
        setShowProgModal(false);
        setSelectedProg(null);
    };

    const handleArchiveProgramme = async (id: string) => {
        await archiveProgramme(id);
        setProgToArchive(null);
    };

    const handleUploadLearners = async (file: File) => {
        try {
            const result = await importUnifiedLearners(file);
            if (result.success > 0) {
                alert(`Successfully processed ${result.success} learners.`);
            }
            if (result.errors.length > 0) {
                const errorMsg = result.errors.slice(0, 5).join('\n') +
                    (result.errors.length > 5 ? `\n...and ${result.errors.length - 5} more.` : '');
                alert(`Import completed with warnings:\n${errorMsg}`);
            }
            setShowUploadModal(false);
        } catch (error) {
            alert('Import failed: ' + (error as Error).message);
        }
    };

    const handleUploadProgrammes = async (file: File) => {
        try {
            const result = await importProgrammesFromCSV(file);
            alert(`Imported ${result.success} programmes.`);
            setShowProgUploadModal(false);
        } catch (error) {
            alert('Import failed: ' + (error as Error).message);
        }
    };

    const exportToCSV = () => {
        const headers = ['Full Name', 'ID Number', 'Email', 'Start Date', 'Qualification', 'Status'];
        const rows = filteredLearners.map(l => [
            l.fullName,
            l.idNumber,
            l.email,
            l.trainingStartDate,
            l.qualification.name,
            l.status,
        ]);
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'learners-export.csv';
        a.click();
    };

    // ========================= RENDER =========================
    return (
        <div className="admin-layout">
            {/* SIDEBAR */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span className="m">m</span>
                        <span className="lab">lab</span>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <button
                        className={`nav-item ${currentNav === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setCurrentNav('dashboard')}
                    >
                        <LayoutDashboard size={20} />
                        <span>Overview</span>
                    </button>
                    <button
                        className={`nav-item ${currentNav === 'learners' ? 'active' : ''}`}
                        onClick={() => setCurrentNav('learners')}
                    >
                        <Users size={20} />
                        <span>Learner Results</span>
                    </button>
                    <button
                        className={`nav-item ${currentNav === 'qualifications' ? 'active' : ''}`}
                        onClick={() => setCurrentNav('qualifications')}
                    >
                        <BookOpen size={20} />
                        <span>Qualifications</span>
                    </button>
                </nav>
                <div className="sidebar-footer">
                    <button className="nav-item">
                        <Settings size={20} />
                        <span>Settings</span>
                    </button>
                    <button className="nav-item" style={{ color: '#ef4444' }} onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="main-wrapper">
                <header className="dashboard-header">
                    <div className="header-title">
                        <h1>
                            {currentNav === 'dashboard' && 'Dashboard Overview'}
                            {currentNav === 'learners' && 'Learner Results'}
                            {currentNav === 'qualifications' && 'Qualification Templates'}
                        </h1>
                        <p>Manage Statements of Results and EISA Admissions</p>
                    </div>
                    {currentNav === 'learners' && (
                        <div className="admin-actions">
                            <button className="btn btn-outline" onClick={exportToCSV}>
                                <Download size={18} />
                                <span>Export</span>
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                                <Upload size={18} />
                                <span>Upload Master CSV</span>
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={18} />
                                <span>Add Learner</span>
                            </button>
                        </div>
                    )}
                </header>

                <div className="admin-content">
                    {/* DASHBOARD OVERVIEW TAB */}
                    {currentNav === 'dashboard' && (
                        <div className="edit-grid" style={{ gap: '1rem', display: 'flex', flexWrap: 'wrap' }}>
                            <StatCard icon={<Users size={24} />} title="Total Learners" value={stats.totalLearners} color="blue" />
                            <StatCard icon={<CheckCircle size={24} />} title="EISA Admitted" value={stats.eisaAdmitted} color="green" />
                            <StatCard icon={<Award size={24} />} title="Completed Modules" value={stats.completedModules} color="purple" />
                            <StatCard icon={<AlertCircle size={24} />} title="Pending Review" value={stats.pendingReview} color="orange" />
                        </div>
                    )}

                    {/* LEARNERS TAB */}
                    {currentNav === 'learners' && (
                        <>
                            {/* --- NEW FILTER BAR --- */}
                            <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>

                                {/* Search Input */}
                                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
                                    <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
                                    <input
                                        type="text"
                                        placeholder="Search by name, ID, or email..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                {/* Year Filter */}
                                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
                                    <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        style={{ minWidth: '120px' }}
                                    >
                                        <option value="all">All Years</option>
                                        {availableYears.map(year => (
                                            <option key={year} value={year}>{year} Cohort</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Status Filter */}
                                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
                                    <Filter size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
                                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                        <option value="all">All Status</option>
                                        <option value="completed">Completed</option>
                                        <option value="in-progress">In Progress</option>
                                        <option value="pending">Pending</option>
                                    </select>
                                </div>

                                {/* Show Archived Toggle */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={showArchived}
                                        onChange={(e) => setShowArchived(e.target.checked)}
                                    />
                                    Show Archived
                                </label>

                                {/* Archive Button */}
                                {selectedYear !== 'all' && !showArchived && (
                                    <button
                                        className="btn btn-outline"
                                        onClick={handleArchiveCohort}
                                        style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                    >
                                        <Archive size={16} /> Archive {selectedYear}
                                    </button>
                                )}
                            </div>

                            {/* Learners Table */}
                            <div className="list-view">
                                <table className="assessment-table">
                                    <thead>
                                        <tr>
                                            <th>Learner Details</th>
                                            <th>Qualification</th>
                                            <th>Progress</th>
                                            <th>EISA Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLearners.map((learner) => (
                                            <tr key={learner.id} style={{ opacity: learner.isArchived ? 0.6 : 1, background: learner.isArchived ? '#7f6d3663' : 'transparent' }}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                            {learner.fullName.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>
                                                                {learner.fullName}
                                                                {learner.isArchived && <span style={{ fontSize: '0.7rem', background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#374151' }}>Archived</span>}
                                                            </div>
                                                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                                                {learner.idNumber} • {learner.trainingStartDate?.substring(0, 4) || "No Year"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{learner.qualification.name || "N/A"}</div>
                                                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                                                        SAQA: {learner.qualification.saqaId}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                            K: {learner.knowledgeModules.length}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                            P: {learner.practicalModules.length}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                            W: {learner.workExperienceModules.length}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500, color: learner.eisaAdmission ? '#16a34a' : '#ef4444' }}>
                                                        {learner.eisaAdmission ? (
                                                            <>
                                                                <CheckCircle size={16} /> Admitted
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle size={16} /> Pending
                                                            </>
                                                        )}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            className="icon-btn action-view"
                                                            title="View Statement"
                                                            onClick={() => handleViewSOR(learner)}
                                                        >
                                                            <Eye size={18} />
                                                        </button>

                                                        <button
                                                            className="icon-btn"
                                                            title="Copy Portal Link"
                                                            style={{ color: copiedId === learner.idNumber ? '#16a34a' : 'white' }}
                                                            onClick={() => handleCopyLink(learner.idNumber)}
                                                        >
                                                            {copiedId === learner.idNumber ? <Check size={18} /> : <Share2 size={18} />}
                                                        </button>

                                                        <button
                                                            className="icon-btn action-edit"
                                                            onClick={() => {
                                                                setSelectedLearner(learner);
                                                                setShowEditModal(true);
                                                            }}
                                                            title="Edit Learner"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            className="icon-btn delete"
                                                            onClick={() => setLearnerToDelete(learner)}
                                                            title="Delete Learner"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* QUALIFICATIONS TAB */}
                    {currentNav === 'qualifications' && (
                        <div className="list-view">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0 }}>Programme Templates</h2>
                                <div className="admin-actions">
                                    <button className="btn btn-outline" onClick={() => setShowProgUploadModal(true)}>
                                        <Upload size={18} /> Upload Programme CSV
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setSelectedProg(null);
                                            setShowProgModal(true);
                                        }}
                                    >
                                        <Plus size={18} /> Create Template
                                    </button>
                                </div>
                            </div>

                            <table className="assessment-table">
                                <thead>
                                    <tr>
                                        <th>Programme Name</th>
                                        <th>SAQA ID</th>
                                        <th>NQF Level</th>
                                        <th>Total Credits</th>
                                        <th>Modules (K / P / W)</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {programmes.filter(p => !p.isArchived).map((prog) => (
                                        <tr key={prog.id}>
                                            <td style={{ fontWeight: 600 }}>{prog.name}</td>
                                            <td>{prog.saqaId}</td>
                                            <td>Level {prog.nqfLevel}</td>
                                            <td>{prog.credits}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                        K: {prog.knowledgeModules.length}
                                                    </span>
                                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                        P: {prog.practicalModules.length}
                                                    </span>
                                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '4px' }}>
                                                        W: {prog.workExperienceModules.length}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="icon-btn action-edit"
                                                        onClick={() => {
                                                            setSelectedProg(prog);
                                                            setShowProgModal(true);
                                                        }}
                                                        title="Edit Template"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        className="icon-btn delete"
                                                        onClick={() => setProgToArchive(prog)}
                                                        title="Archive Template"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* MODALS */}
            {showAddModal && (
                <LearnerFormModal
                    onClose={() => setShowAddModal(false)}
                    onSave={handleAddLearner}
                    title="Add New Learner"
                    programmes={programmes}
                />
            )}
            {showEditModal && selectedLearner && (
                <LearnerFormModal
                    learner={selectedLearner}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedLearner(null);
                    }}
                    onSave={handleUpdateLearner}
                    title="Edit Learner"
                    programmes={programmes}
                />
            )}
            {showProgModal && (
                <ProgrammeFormModal
                    programme={selectedProg}
                    onClose={() => setShowProgModal(false)}
                    onSave={selectedProg ? handleUpdateProgramme : handleAddProgramme}
                    title={selectedProg ? 'Edit Template' : 'Create Template'}
                />
            )}
            {showUploadModal && (
                <UploadModal
                    onClose={() => setShowUploadModal(false)}
                    onUpload={handleUploadLearners}
                    title="Upload Master CSV"
                />
            )}
            {showProgUploadModal && (
                <UploadModal
                    onClose={() => setShowProgUploadModal(false)}
                    onUpload={handleUploadProgrammes}
                    title="Upload Programmes CSV"
                />
            )}
            {learnerToDelete && (
                <DeleteConfirmModal
                    itemName={learnerToDelete.fullName}
                    actionType="Delete"
                    onConfirm={() => handleDeleteLearner(learnerToDelete.id)}
                    onCancel={() => setLearnerToDelete(null)}
                />
            )}
            {progToArchive && (
                <DeleteConfirmModal
                    itemName={progToArchive.name}
                    actionType="Archive"
                    onConfirm={() => handleArchiveProgramme(progToArchive.id)}
                    onCancel={() => setProgToArchive(null)}
                />
            )}
        </div>
    );
};

export default AdminDashboard;