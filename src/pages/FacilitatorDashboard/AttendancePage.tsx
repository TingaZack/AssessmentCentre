// src/pages/FacilitatorDashboard/AttendancePage.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
    ChevronLeft, Save,
    Calendar, Search, X,
    Download, FileDown, Edit3, ShieldAlert, Lock,
    Loader2,
    DownloadCloud, Paperclip
} from 'lucide-react';
import { collection, doc, getDocs, query, where, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { StatusModal } from '../../components/common/StatusModal/StatusModal';
import { ExpandableText } from '../../components/common/ExpandableText';
import type { DashboardLearner } from '../../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
import Loader from '../../components/common/Loader/Loader';

const ABSENCE_REASONS = [
    "Medical (Sick/Illness)",
    "Family Emergency",
    "Transport / Logistics Issues",
    "Bereavement",
    "Work Commitment",
    "Unauthorized / Unknown",
    "Other (Specify below)"
];

interface AttendanceStatus {
    present: boolean;
    reason?: string;
    proofUrl?: string;
}

export const AttendancePage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Parse the date from the URL parameters (e.g., ?date=2023-10-25)
    const urlParams = new URLSearchParams(location.search);
    const initialDate = urlParams.get('date') || new Date().toISOString().split('T')[0];

    const { cohorts, learners, user, fetchCohorts, fetchLearners } = useStore();

    // -- App State --
    const [loading, setLoading] = useState(false);
    const [fetchingRecord, setFetchingRecord] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [date, setDate] = useState(initialDate);
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

    // Store exactly who should be rendered in the table
    const [registerLearners, setRegisterLearners] = useState<DashboardLearner[]>([]);
    const [existingRecordId, setExistingRecordId] = useState<string | null>(null);

    // -- Modals State --
    const [statusModal, setStatusModal] = useState({ show: false, type: 'success' as 'success' | 'error', title: '', message: '' });
    const [evidenceModal, setEvidenceModal] = useState<{ show: boolean, learnerId: string, learnerName: string } | null>(null);
    const [modalCategory, setModalCategory] = useState('');
    const [modalReason, setModalReason] = useState('');
    const [modalFile, setModalFile] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    // -- Initialization --
    useEffect(() => {
        if (learners.length === 0) fetchLearners();
        if (cohorts.length === 0) fetchCohorts();
    }, [fetchCohorts, fetchLearners, learners.length, cohorts.length]);

    const currentCohort = cohorts.find(c => c.id === cohortId);

    // -- Data Loading & Locking Logic --
    useEffect(() => {
        const loadRegister = async () => {
            if (!cohortId || !date || learners.length === 0 || !currentCohort) return;

            setFetchingRecord(true);
            try {
                const q = query(
                    collection(db, 'attendance'),
                    where('cohortId', '==', cohortId),
                    where('date', '==', date)
                );
                const querySnapshot = await getDocs(q);

                const newStatus: Record<string, AttendanceStatus> = {};
                let roster: DashboardLearner[] = [];

                // Safely deduplicate learners based on ID Number
                const getUniqueRoster = (targetIds: Set<string> | string[]) => {
                    const idSet = targetIds instanceof Set ? targetIds : new Set(targetIds);
                    const uniqueMap = new Map<string, DashboardLearner>();

                    learners.forEach(l => {
                        if (idSet.has(l.id) || (l.idNumber && idSet.has(l.idNumber))) {
                            const key = l.idNumber || l.id; // Group them by their ID number
                            // Prefer valid documents over 'Unassigned_' ghost profiles
                            if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
                                uniqueMap.set(key, l);
                            }
                        }
                    });
                    return Array.from(uniqueMap.values());
                };

                if (!querySnapshot.empty) {
                    // RECORD EXISTS: Load it and LOCK the UI
                    const docSnap = querySnapshot.docs[0];
                    const data = docSnap.data();

                    setExistingRecordId(docSnap.id);
                    setIsLocked(true);

                    // Build roster from historical record + current cohort
                    const historicalIds = [...(data.presentLearners || []), ...(data.absentLearners || [])];
                    const currentIds = currentCohort.learnerIds || [];
                    const allRelevantIds = new Set([...historicalIds, ...currentIds]);

                    // Generate a completely duplicate-free roster
                    roster = getUniqueRoster(allRelevantIds);

                    roster.forEach(l => {
                        const isPresent = data.presentLearners?.includes(l.id) || data.presentLearners?.includes(l.idNumber) || false;
                        newStatus[l.id] = {
                            present: isPresent,
                            reason: data.reasons?.[l.id] || '',
                            proofUrl: data.proofs?.[l.id] || undefined
                        };
                    });
                } else {
                    // NO RECORD: Start fresh and unlock UI
                    setExistingRecordId(null);
                    setIsLocked(false);

                    // Generate a completely duplicate-free roster
                    roster = getUniqueRoster(currentCohort.learnerIds || []);

                    roster.forEach(l => {
                        newStatus[l.id] = { present: true };
                    });
                }

                setRegisterLearners(roster);
                setAttendance(newStatus);
            } catch (err) {
                console.error("Error loading register:", err);
            } finally {
                setFetchingRecord(false);
            }
        };
        loadRegister();
    }, [date, cohortId, currentCohort, learners.length]);

    // -- Export Functions --
    const exportToCSV = () => {
        const headers = ['Learner Name', 'ID Number', 'Status', 'Reason'];
        const rows = registerLearners.map(l => {
            const att = attendance[l.id] || { present: true };
            return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', (att.reason || '-').replace(/,/g, '')];
        });
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Attendance_${currentCohort?.name}_${date}.csv`; a.click();
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text(`Attendance Register: ${currentCohort?.name}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Date: ${date} | Facilitator: ${user?.fullName || 'Admin'}`, 14, 22);

        const tableData = registerLearners.map(l => {
            const att = attendance[l.id] || { present: true };
            return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
        });

        autoTable(doc, {
            head: [['Learner', 'ID Number', 'Status', 'Reason']],
            body: tableData,
            startY: 30,
            headStyles: { fillColor: [7, 63, 78] }
        });
        doc.save(`Register_${currentCohort?.name}_${date}.pdf`);
    };

    // 🚀 Helper to open modal and prepopulate existing reason
    const openEvidenceModal = (learnerId: string, learnerName: string) => {
        if (isLocked) return;
        const currentAtt = attendance[learnerId];

        // Parse out the category if it was previously saved like "[Medical] Was sick"
        let cat = '';
        let res = currentAtt?.reason || '';

        if (res.startsWith('[')) {
            const closeBracket = res.indexOf(']');
            if (closeBracket > -1) {
                cat = res.substring(1, closeBracket);
                res = res.substring(closeBracket + 1).trim();
            }
        }

        setModalCategory(cat);
        setModalReason(res);
        setModalFile(null); // Reset file input
        setEvidenceModal({ show: true, learnerId, learnerName });
    };

    // -- Handlers --
    const toggleStatus = (learnerId: string, learnerName: string) => {
        if (isLocked) return;
        const currentStatus = attendance[learnerId]?.present ?? true;
        if (currentStatus) {
            // If changing to Absent, open the modal to get a reason
            openEvidenceModal(learnerId, learnerName);
        } else {
            // If changing back to Present, wipe the reason/proof
            setAttendance(prev => ({
                ...prev,
                [learnerId]: { present: true, reason: '', proofUrl: undefined }
            }));
        }
    };

    const isModalValid = modalCategory !== '' && modalReason.trim().length > 3;

    const submitEvidence = async () => {
        if (!isModalValid || !evidenceModal) return;
        const { learnerId } = evidenceModal;
        setUploadingFile(true);
        try {
            let fileUrl = '';
            if (modalFile) {
                const storage = getStorage();
                const storageRef = ref(storage, `attendance_proofs/${cohortId}/${date}/${learnerId}_${Date.now()}`);
                await uploadBytes(storageRef, modalFile);
                fileUrl = await getDownloadURL(storageRef);
            }
            setAttendance(prev => ({
                ...prev,
                [learnerId]: {
                    present: false,
                    reason: `[${modalCategory}] ${modalReason}`,
                    proofUrl: fileUrl || prev[learnerId]?.proofUrl // Preserve old URL if no new file uploaded
                }
            }));
            setEvidenceModal(null);
        } catch (error) {
            alert("Upload failed.");
        } finally {
            setUploadingFile(false);
        }
    };

    const handleSave = async () => {
        if (!user || !cohortId) return;
        setLoading(true);
        try {
            const presentIds = Object.keys(attendance).filter(id => attendance[id].present);
            const absentIds = registerLearners.filter(l => !presentIds.includes(l.id)).map(l => l.id);
            const proofsMap: Record<string, string> = {};
            const reasonsMap: Record<string, string> = {};

            Object.keys(attendance).forEach(id => {
                if (attendance[id].proofUrl) proofsMap[id] = attendance[id].proofUrl!;
                if (attendance[id].reason) reasonsMap[id] = attendance[id].reason!;
            });

            const payload = {
                cohortId,
                cohortName: currentCohort?.name || 'Unknown Cohort',
                date,
                facilitatorId: user.uid,
                presentLearners: presentIds,
                absentLearners: absentIds,
                proofs: proofsMap,
                reasons: reasonsMap,
                updatedAt: serverTimestamp(),
                method: 'manual_override'
            };

            if (existingRecordId) {
                await updateDoc(doc(db, 'attendance', existingRecordId), payload);
            } else {
                const newRef = doc(collection(db, 'attendance'));
                await setDoc(newRef, { ...payload, createdAt: serverTimestamp() });
                setExistingRecordId(newRef.id);
            }

            setIsLocked(true);
            setStatusModal({ show: true, type: 'success', title: 'Register Saved', message: 'Attendance record has been securely saved and locked.' });
        } catch (error) {
            console.error(error);
            setStatusModal({ show: true, type: 'error', title: 'Save Failed', message: 'Failed to save attendance record. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const filteredLearners = registerLearners.filter(l =>
        l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.idNumber.includes(searchTerm)
    );

    if (!currentCohort) return (
        <div className="p-8 att-loader-wrap">
            <Loader message="Loading Register Data..." />
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>

            {/* ─── STATUS MODAL (Wrapped in createPortal) ─── */}
            {statusModal.show && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        {...statusModal}
                        onClose={() => setStatusModal(prev => ({ ...prev, show: false }))}
                    />
                </div>,
                document.body
            )}

            {/* ─── EVIDENCE MODAL (Wrapped in createPortal) ─── */}
            {evidenceModal && createPortal(
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldAlert size={20} color="#ef4444" />
                                <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>Log Absence</h3>
                            </div>
                            <button onClick={() => setEvidenceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        <p style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', marginBottom: '1.5rem' }}>
                            Providing a reason for <strong>{evidenceModal.learnerName}</strong>'s absence is required for compliance.
                        </p>

                        <div style={{ marginBottom: '1.2rem' }}>
                            <label style={labelStyle}>Reason Category <span style={{ color: '#ef4444' }}>*</span></label>
                            <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} style={inputBaseStyle}>
                                <option value="">-- Select Category --</option>
                                {ABSENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>

                        <div style={{ marginBottom: '1.2rem' }}>
                            <label style={labelStyle}>Detailed Note <span style={{ color: '#ef4444' }}>*</span></label>
                            <textarea
                                value={modalReason}
                                placeholder='Briefly explain the reason for the absence...'
                                onChange={(e) => setModalReason(e.target.value)}
                                style={{ ...inputBaseStyle, minHeight: '100px', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ marginBottom: '2rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                            <label style={labelStyle}>Attach Proof <span style={{ color: '#64748b', fontWeight: 'normal' }}>(Optional)</span></label>
                            <input
                                type="file"
                                onChange={(e) => setModalFile(e.target.files?.[0] || null)}
                                style={{ fontSize: '0.85rem', width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="mlab-btn mlab-btn--outline" onClick={() => setEvidenceModal(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                            <button className="mlab-btn mlab-btn--primary" onClick={submitEvidence} disabled={!isModalValid || uploadingFile} style={{ flex: 1, justifyContent: 'center' }}>
                                {uploadingFile ? <Loader2 className="spin" size={16} /> : 'Confirm Absence'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* HEADER ACTIONS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
                            <ChevronLeft size={20} color="var(--mlab-blue)" />
                        </button>
                        {currentCohort.name}
                    </h1>
                    <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0 44px' }}>Daily Attendance Register</p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="mlab-btn mlab-btn--outline" onClick={exportToCSV}>
                        <Download size={16} /> Export CSV
                    </button>
                    <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={exportToPDF}>
                        <FileDown size={16} /> Export PDF
                    </button>
                </div>
            </div>

            {/* TOOLBAR */}
            <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                    <div className="mlab-search" style={{ minWidth: '250px' }}>
                        <Search size={18} color="var(--mlab-grey)" />
                        <input type="text" placeholder="Search learners..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>

                    <div className="mlab-search" style={{ maxWidth: '200px', background: '#f8fafc' }}>
                        <Calendar size={18} color="var(--mlab-blue)" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            style={{ background: 'transparent', outline: 'none', fontWeight: 'bold', color: 'var(--mlab-blue)' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isLocked ? (
                        <>
                            <div style={{ background: '#f1f5f9', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Lock size={16} /> Read-Only Record
                            </div>
                            <button className="mlab-btn mlab-btn--outline" onClick={() => setIsLocked(false)} style={{ borderColor: '#f59e0b', color: '#d97706', background: '#fffbeb' }}>
                                <Edit3 size={16} /> Unlock to Edit
                            </button>
                        </>
                    ) : (
                        <button className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={loading || fetchingRecord}>
                            {loading ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                            {existingRecordId ? 'Save Updates' : 'Save Register'}
                        </button>
                    )}
                </div>
            </div>

            {/* DATA TABLE */}
            <div className="mlab-table-wrap">
                {fetchingRecord ? (
                    <div style={{ padding: '4rem 0', textAlign: 'center' }}>
                        <Loader message="Fetching records..." />
                    </div>
                ) : (
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Learner</th>
                                <th>ID Number</th>
                                <th>Status</th>
                                <th>Evidence / Reason</th>
                                <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLearners.length > 0 ? filteredLearners.map((l) => {
                                const att = attendance[l.id] || { present: true };
                                return (
                                    <tr key={l.id} style={{ borderLeft: att.present ? '4px solid #16a34a' : '4px solid #ef4444' }}>
                                        <td style={{ width: '60px' }}>
                                            <div style={{
                                                width: '36px', height: '36px', borderRadius: '50%',
                                                background: att.present ? '#dcfce7' : '#fef2f2', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 'bold', color: att.present ? '#166534' : '#991b1b'
                                            }}>
                                                {l.fullName.charAt(0)}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{l.fullName}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Enrolled Learner</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500, color: 'var(--mlab-blue)', fontFamily: 'monospace', letterSpacing: '1px' }}>{l.idNumber}</div>
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                                                background: att.present ? '#dcfce7' : '#fef2f2',
                                                color: att.present ? '#166534' : '#991b1b'
                                            }}>
                                                {att.present ? 'Present' : 'Absent'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', maxWidth: '300px' }}>
                                            {!att.present ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                                    <ExpandableText text={att.reason || 'No reason provided'} limit={40} />

                                                    {att.proofUrl && (
                                                        <a href={att.proofUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--mlab-blue)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <DownloadCloud size={12} /> View Attached Proof
                                                        </a>
                                                    )}

                                                    {!isLocked && (
                                                        <button
                                                            onClick={() => openEvidenceModal(l.id, l.fullName)}
                                                            style={{
                                                                background: 'none', border: 'none', color: '#3b82f6',
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                                gap: '4px', fontSize: '0.75rem', fontWeight: 600, padding: 0
                                                            }}
                                                        >
                                                            <Paperclip size={12} /> {att.proofUrl || att.reason ? 'Edit Evidence / Note' : 'Add Evidence'}
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ opacity: 0.5, fontStyle: 'italic' }}>N/A (Present)</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className={`mlab-btn mlab-btn--sm ${att.present ? 'mlab-btn--outline' : 'mlab-btn--outline mlab-btn--outline-blue'}`}
                                                disabled={isLocked}
                                                style={{ opacity: isLocked ? 0.5 : 1, borderColor: att.present ? '#ef4444' : 'var(--mlab-green)', color: att.present ? '#ef4444' : 'var(--mlab-green)' }}
                                                onClick={() => toggleStatus(l.id, l.fullName)}
                                            >
                                                {att.present ? 'Mark Absent' : 'Mark Present'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
                                        No learners match your search criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(7, 63, 78, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { background: 'white', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: 'var(--mlab-blue)' };
const inputBaseStyle: React.CSSProperties = { width: '100%', padding: '0.75rem', color: 'var(--mlab-blue)', borderRadius: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.9rem', outline: 'none', background: '#fff' };




// // src/pages/FacilitatorDashboard/AttendancePage.tsx

// import React, { useState, useEffect } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import { useStore } from '../../store/useStore';
// import {
//     ChevronLeft, Save,
//     Calendar, Search, X,
//     Download, FileDown, Edit3, ShieldAlert, Lock,
//     Loader2,
//     DownloadCloud
// } from 'lucide-react';
// import { collection, doc, getDocs, query, where, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
// import { db } from '../../lib/firebase';
// import { StatusModal } from '../../components/common/StatusModal/StatusModal';
// import { ExpandableText } from '../../components/common/ExpandableText';
// import type { DashboardLearner } from '../../types';
// import jsPDF from 'jspdf';
// import autoTable from 'jspdf-autotable';
// import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
// import Loader from '../../components/common/Loader/Loader';

// const ABSENCE_REASONS = [
//     "Medical (Sick/Illness)",
//     "Family Emergency",
//     "Transport / Logistics Issues",
//     "Bereavement",
//     "Work Commitment",
//     "Unauthorized / Unknown",
//     "Other (Specify below)"
// ];

// interface AttendanceStatus {
//     present: boolean;
//     reason?: string;
//     proofUrl?: string;
// }

// export const AttendancePage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();

//     // Parse the date from the URL parameters (e.g., ?date=2023-10-25)
//     const urlParams = new URLSearchParams(location.search);
//     const initialDate = urlParams.get('date') || new Date().toISOString().split('T')[0];

//     const { cohorts, learners, user, fetchCohorts, fetchLearners } = useStore();

//     // -- App State --
//     const [loading, setLoading] = useState(false);
//     const [fetchingRecord, setFetchingRecord] = useState(false);
//     const [isLocked, setIsLocked] = useState(false);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [date, setDate] = useState(initialDate);
//     const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

//     // 🚀 NEW: Store exactly who should be rendered in the table
//     const [registerLearners, setRegisterLearners] = useState<DashboardLearner[]>([]);
//     const [existingRecordId, setExistingRecordId] = useState<string | null>(null);

//     // -- Modals State --
//     const [statusModal, setStatusModal] = useState({ show: false, type: 'success' as 'success' | 'error', title: '', message: '' });
//     const [evidenceModal, setEvidenceModal] = useState<{ show: boolean, learnerId: string, learnerName: string } | null>(null);
//     const [modalCategory, setModalCategory] = useState('');
//     const [modalReason, setModalReason] = useState('');
//     const [modalFile, setModalFile] = useState<File | null>(null);
//     const [uploadingFile, setUploadingFile] = useState(false);

//     // -- Initialization --
//     useEffect(() => {
//         if (learners.length === 0) fetchLearners();
//         if (cohorts.length === 0) fetchCohorts();
//     }, [fetchCohorts, fetchLearners, learners.length, cohorts.length]);

//     const currentCohort = cohorts.find(c => c.id === cohortId);

//     // -- Data Loading & Locking Logic --
//     useEffect(() => {
//         const loadRegister = async () => {
//             if (!cohortId || !date || learners.length === 0 || !currentCohort) return;

//             setFetchingRecord(true);
//             try {
//                 const q = query(
//                     collection(db, 'attendance'),
//                     where('cohortId', '==', cohortId),
//                     where('date', '==', date)
//                 );
//                 const querySnapshot = await getDocs(q);

//                 const newStatus: Record<string, AttendanceStatus> = {};
//                 let roster: DashboardLearner[] = [];

//                 // 🚀 FIX: Safely deduplicate learners based on ID Number
//                 const getUniqueRoster = (targetIds: Set<string> | string[]) => {
//                     const idSet = targetIds instanceof Set ? targetIds : new Set(targetIds);
//                     const uniqueMap = new Map<string, DashboardLearner>();

//                     learners.forEach(l => {
//                         if (idSet.has(l.id) || (l.idNumber && idSet.has(l.idNumber))) {
//                             const key = l.idNumber || l.id; // Group them by their ID number
//                             // Prefer valid documents over 'Unassigned_' ghost profiles
//                             if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
//                                 uniqueMap.set(key, l);
//                             }
//                         }
//                     });
//                     return Array.from(uniqueMap.values());
//                 };

//                 if (!querySnapshot.empty) {
//                     // 🚀 RECORD EXISTS: Load it and LOCK the UI
//                     const docSnap = querySnapshot.docs[0];
//                     const data = docSnap.data();

//                     setExistingRecordId(docSnap.id);
//                     setIsLocked(true);

//                     // Build roster from historical record + current cohort
//                     const historicalIds = [...(data.presentLearners || []), ...(data.absentLearners || [])];
//                     const currentIds = currentCohort.learnerIds || [];
//                     const allRelevantIds = new Set([...historicalIds, ...currentIds]);

//                     // Generate a completely duplicate-free roster
//                     roster = getUniqueRoster(allRelevantIds);

//                     roster.forEach(l => {
//                         const isPresent = data.presentLearners?.includes(l.id) || data.presentLearners?.includes(l.idNumber) || false;
//                         newStatus[l.id] = {
//                             present: isPresent,
//                             reason: data.reasons?.[l.id] || '',
//                             proofUrl: data.proofs?.[l.id] || undefined
//                         };
//                     });
//                 } else {
//                     // 🚀 NO RECORD: Start fresh and unlock UI
//                     setExistingRecordId(null);
//                     setIsLocked(false);

//                     // Generate a completely duplicate-free roster
//                     roster = getUniqueRoster(currentCohort.learnerIds || []);

//                     roster.forEach(l => {
//                         newStatus[l.id] = { present: true };
//                     });
//                 }

//                 setRegisterLearners(roster);
//                 setAttendance(newStatus);
//             } catch (err) {
//                 console.error("Error loading register:", err);
//             } finally {
//                 setFetchingRecord(false);
//             }
//         };
//         loadRegister();
//     }, [date, cohortId, currentCohort, learners.length]);

//     // -- Export Functions --
//     const exportToCSV = () => {
//         const headers = ['Learner Name', 'ID Number', 'Status', 'Reason'];
//         const rows = registerLearners.map(l => {
//             const att = attendance[l.id] || { present: true };
//             return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', (att.reason || '-').replace(/,/g, '')];
//         });
//         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
//         const blob = new Blob([csvContent], { type: 'text/csv' });
//         const url = window.URL.createObjectURL(blob);
//         const a = document.createElement('a');
//         a.href = url; a.download = `Attendance_${currentCohort?.name}_${date}.csv`; a.click();
//     };

//     const exportToPDF = () => {
//         const doc = new jsPDF();
//         doc.text(`Attendance Register: ${currentCohort?.name}`, 14, 15);
//         doc.setFontSize(10);
//         doc.text(`Date: ${date} | Facilitator: ${user?.fullName || 'Admin'}`, 14, 22);

//         const tableData = registerLearners.map(l => {
//             const att = attendance[l.id] || { present: true };
//             return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
//         });

//         autoTable(doc, {
//             head: [['Learner', 'ID Number', 'Status', 'Reason']],
//             body: tableData,
//             startY: 30,
//             headStyles: { fillColor: [7, 63, 78] }
//         });
//         doc.save(`Register_${currentCohort?.name}_${date}.pdf`);
//     };

//     // -- Handlers --
//     const toggleStatus = (learnerId: string, learnerName: string) => {
//         if (isLocked) return;
//         const currentStatus = attendance[learnerId]?.present ?? true;
//         if (currentStatus) {
//             setEvidenceModal({ show: true, learnerId, learnerName });
//             setModalCategory('');
//             setModalReason('');
//             setModalFile(null);
//         } else {
//             setAttendance(prev => ({ ...prev, [learnerId]: { present: true } }));
//         }
//     };

//     const isModalValid = modalCategory !== '' && modalReason.trim().length > 3;

//     const submitEvidence = async () => {
//         if (!isModalValid || !evidenceModal) return;
//         const { learnerId } = evidenceModal;
//         setUploadingFile(true);
//         try {
//             let fileUrl = '';
//             if (modalFile) {
//                 const storage = getStorage();
//                 const storageRef = ref(storage, `attendance_proofs/${cohortId}/${date}/${learnerId}_${Date.now()}`);
//                 await uploadBytes(storageRef, modalFile);
//                 fileUrl = await getDownloadURL(storageRef);
//             }
//             setAttendance(prev => ({
//                 ...prev,
//                 [learnerId]: {
//                     present: false,
//                     reason: `[${modalCategory}] ${modalReason}`,
//                     proofUrl: fileUrl || prev[learnerId]?.proofUrl
//                 }
//             }));
//             setEvidenceModal(null);
//         } catch (error) {
//             alert("Upload failed.");
//         } finally {
//             setUploadingFile(false);
//         }
//     };

//     const handleSave = async () => {
//         if (!user || !cohortId) return;
//         setLoading(true);
//         try {
//             const presentIds = Object.keys(attendance).filter(id => attendance[id].present);
//             const absentIds = registerLearners.filter(l => !presentIds.includes(l.id)).map(l => l.id);
//             const proofsMap: Record<string, string> = {};
//             const reasonsMap: Record<string, string> = {};

//             Object.keys(attendance).forEach(id => {
//                 if (attendance[id].proofUrl) proofsMap[id] = attendance[id].proofUrl!;
//                 if (attendance[id].reason) reasonsMap[id] = attendance[id].reason!;
//             });

//             const payload = {
//                 cohortId,
//                 cohortName: currentCohort?.name || 'Unknown Cohort',
//                 date,
//                 facilitatorId: user.uid,
//                 presentLearners: presentIds,
//                 absentLearners: absentIds,
//                 proofs: proofsMap,
//                 reasons: reasonsMap,
//                 updatedAt: serverTimestamp(),
//                 method: 'manual_override'
//             };

//             if (existingRecordId) {
//                 await updateDoc(doc(db, 'attendance', existingRecordId), payload);
//             } else {
//                 const newRef = doc(collection(db, 'attendance'));
//                 await setDoc(newRef, { ...payload, createdAt: serverTimestamp() });
//                 setExistingRecordId(newRef.id);
//             }

//             setIsLocked(true);
//             setStatusModal({ show: true, type: 'success', title: 'Register Saved', message: 'Attendance record has been securely saved and locked.' });
//         } catch (error) {
//             console.error(error);
//             setStatusModal({ show: true, type: 'error', title: 'Save Failed', message: 'Failed to save attendance record. Please try again.' });
//         } finally {
//             setLoading(false);
//         }
//     };

//     const filteredLearners = registerLearners.filter(l =>
//         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         l.idNumber.includes(searchTerm)
//     );

//     if (!currentCohort) return (
//         <div className="p-8 att-loader-wrap">
//             <Loader message="Loading Register Data..." />
//         </div>
//     );

//     return (
//         <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>

//             {/* ─── EVIDENCE MODAL ─── */}
//             {evidenceModal && (
//                 <div style={modalOverlayStyle}>
//                     <div style={modalContentStyle}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <ShieldAlert size={20} color="#ef4444" />
//                                 <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>Log Absence</h3>
//                             </div>
//                             <button onClick={() => setEvidenceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
//                         </div>

//                         <p style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', marginBottom: '1.5rem' }}>
//                             Providing a reason for <strong>{evidenceModal.learnerName}</strong>'s absence is required for compliance.
//                         </p>

//                         <div style={{ marginBottom: '1.2rem' }}>
//                             <label style={labelStyle}>Reason Category <span style={{ color: '#ef4444' }}>*</span></label>
//                             <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} style={inputBaseStyle}>
//                                 <option value="">-- Select Category --</option>
//                                 {ABSENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
//                             </select>
//                         </div>

//                         <div style={{ marginBottom: '1.2rem' }}>
//                             <label style={labelStyle}>Detailed Note <span style={{ color: '#ef4444' }}>*</span></label>
//                             <textarea
//                                 value={modalReason}
//                                 placeholder='Briefly explain the reason for the absence...'
//                                 onChange={(e) => setModalReason(e.target.value)}
//                                 style={{ ...inputBaseStyle, minHeight: '100px', resize: 'vertical' }}
//                             />
//                         </div>

//                         <div style={{ marginBottom: '2rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
//                             <label style={labelStyle}>Attach Proof <span style={{ color: '#64748b', fontWeight: 'normal' }}>(Optional)</span></label>
//                             <input
//                                 type="file"
//                                 onChange={(e) => setModalFile(e.target.files?.[0] || null)}
//                                 style={{ fontSize: '0.85rem', width: '100%' }}
//                             />
//                         </div>

//                         <div style={{ display: 'flex', gap: '1rem' }}>
//                             <button className="mlab-btn mlab-btn--outline" onClick={() => setEvidenceModal(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
//                             <button className="mlab-btn mlab-btn--primary" onClick={submitEvidence} disabled={!isModalValid || uploadingFile} style={{ flex: 1, justifyContent: 'center' }}>
//                                 {uploadingFile ? <Loader2 className="spin" size={16} /> : 'Confirm Absence'}
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* HEADER ACTIONS */}
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
//                 <div>
//                     <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
//                         <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
//                             <ChevronLeft size={20} color="var(--mlab-blue)" />
//                         </button>
//                         {currentCohort.name}
//                     </h1>
//                     <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0 44px' }}>Daily Attendance Register</p>
//                 </div>

//                 <div style={{ display: 'flex', gap: '0.75rem' }}>
//                     <button className="mlab-btn mlab-btn--outline" onClick={exportToCSV}>
//                         <Download size={16} /> Export CSV
//                     </button>
//                     <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue" onClick={exportToPDF}>
//                         <FileDown size={16} /> Export PDF
//                     </button>
//                 </div>
//             </div>

//             {statusModal.show && <StatusModal {...statusModal} onClose={() => setStatusModal(prev => ({ ...prev, show: false }))} />}

//             {/* TOOLBAR */}
//             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                 <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
//                     <div className="mlab-search" style={{ minWidth: '250px' }}>
//                         <Search size={18} color="var(--mlab-grey)" />
//                         <input type="text" placeholder="Search learners..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
//                     </div>

//                     <div className="mlab-search" style={{ maxWidth: '200px', background: '#f8fafc' }}>
//                         <Calendar size={18} color="var(--mlab-blue)" />
//                         <input
//                             type="date"
//                             value={date}
//                             onChange={(e) => setDate(e.target.value)}
//                             style={{ background: 'transparent', outline: 'none', fontWeight: 'bold', color: 'var(--mlab-blue)' }}
//                         />
//                     </div>
//                 </div>

//                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                     {isLocked ? (
//                         <>
//                             {/* 🚀 UI FIX: CLEARLY SHOW THIS IS A HISTORICAL RECORD */}
//                             <div style={{ background: '#f1f5f9', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                 <Lock size={16} /> Read-Only Record
//                             </div>
//                             <button className="mlab-btn mlab-btn--outline" onClick={() => setIsLocked(false)} style={{ borderColor: '#f59e0b', color: '#d97706', background: '#fffbeb' }}>
//                                 <Edit3 size={16} /> Unlock to Edit
//                             </button>
//                         </>
//                     ) : (
//                         <button className="mlab-btn mlab-btn--primary" onClick={handleSave} disabled={loading || fetchingRecord}>
//                             {loading ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
//                             {existingRecordId ? 'Save Updates' : 'Save Register'}
//                         </button>
//                     )}
//                 </div>
//             </div>

//             {/* DATA TABLE */}
//             <div className="mlab-table-wrap">
//                 {fetchingRecord ? (
//                     <div style={{ padding: '4rem 0', textAlign: 'center' }}>
//                         <Loader message="Fetching records..." />
//                     </div>
//                 ) : (
//                     <table className="mlab-table">
//                         <thead>
//                             <tr>
//                                 <th></th>
//                                 <th>Learner</th>
//                                 <th>ID Number</th>
//                                 <th>Status</th>
//                                 <th>Evidence / Reason</th>
//                                 <th style={{ textAlign: 'right' }}>Action</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {filteredLearners.length > 0 ? filteredLearners.map((l) => {
//                                 const att = attendance[l.id] || { present: true };
//                                 return (
//                                     <tr key={l.id} style={{ borderLeft: att.present ? '4px solid #16a34a' : '4px solid #ef4444' }}>
//                                         <td style={{ width: '60px' }}>
//                                             <div style={{
//                                                 width: '36px', height: '36px', borderRadius: '50%',
//                                                 background: att.present ? '#dcfce7' : '#fef2f2', display: 'flex',
//                                                 alignItems: 'center', justifyContent: 'center',
//                                                 fontWeight: 'bold', color: att.present ? '#166534' : '#991b1b'
//                                             }}>
//                                                 {l.fullName.charAt(0)}
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{l.fullName}</div>
//                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Enrolled Learner</div>
//                                         </td>
//                                         <td>
//                                             <div style={{ fontWeight: 500, color: 'var(--mlab-blue)', fontFamily: 'monospace', letterSpacing: '1px' }}>{l.idNumber}</div>
//                                         </td>
//                                         <td>
//                                             <span style={{
//                                                 display: 'inline-flex', alignItems: 'center', gap: '6px',
//                                                 padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
//                                                 background: att.present ? '#dcfce7' : '#fef2f2',
//                                                 color: att.present ? '#166534' : '#991b1b'
//                                             }}>
//                                                 {att.present ? 'Present' : 'Absent'}
//                                             </span>
//                                         </td>
//                                         <td style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', maxWidth: '300px' }}>
//                                             {!att.present ? (
//                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                     <ExpandableText text={att.reason || 'No reason provided'} limit={40} />
//                                                     {att.proofUrl && (
//                                                         <a href={att.proofUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--mlab-blue)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                             <DownloadCloud size={12} /> View Attached Proof
//                                                         </a>
//                                                     )}
//                                                 </div>
//                                             ) : (
//                                                 <span style={{ opacity: 0.5, fontStyle: 'italic' }}>N/A (Present)</span>
//                                             )}
//                                         </td>
//                                         <td style={{ textAlign: 'right' }}>
//                                             <button
//                                                 className={`mlab-btn mlab-btn--sm ${att.present ? 'mlab-btn--outline' : 'mlab-btn--outline mlab-btn--outline-blue'}`}
//                                                 disabled={isLocked}
//                                                 style={{ opacity: isLocked ? 0.5 : 1, borderColor: att.present ? '#ef4444' : 'var(--mlab-green)', color: att.present ? '#ef4444' : 'var(--mlab-green)' }}
//                                                 onClick={() => toggleStatus(l.id, l.fullName)}
//                                             >
//                                                 {att.present ? 'Mark Absent' : 'Mark Present'}
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             }) : (
//                                 <tr>
//                                     <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
//                                         No learners match your search criteria.
//                                     </td>
//                                 </tr>
//                             )}
//                         </tbody>
//                     </table>
//                 )}
//             </div>
//         </div>
//     );
// };

// const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(7, 63, 78, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
// const modalContentStyle: React.CSSProperties = { background: 'white', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' };
// const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: 'var(--mlab-blue)' };
// const inputBaseStyle: React.CSSProperties = { width: '100%', padding: '0.75rem', color: 'var(--mlab-blue)', borderRadius: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.9rem', outline: 'none', background: '#fff' };



// // import React, { useState, useEffect, useMemo } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { useStore } from '../../store/useStore';
// // import {
// //     ChevronLeft, Save, Loader,
// //     Calendar, Search, X,
// //     Download, FileDown, Edit3
// // } from 'lucide-react';
// // import { doc, setDoc, getDoc } from 'firebase/firestore';
// // import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
// // import { db } from '../../lib/firebase';
// // import { StatusModal } from '../../components/common/StatusModal/StatusModal';
// // import { ExpandableText } from '../../components/common/ExpandableText';
// // import jsPDF from 'jspdf';
// // import autoTable from 'jspdf-autotable';
// // // import './FacilitatorDashboard.css';
// // import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css'

// // const ABSENCE_REASONS = [
// //     "Medical (Sick/Illness)",
// //     "Family Emergency",
// //     "Transport / Logistics Issues",
// //     "Bereavement",
// //     "Work Commitment",
// //     "Unauthorized / Unknown",
// //     "Other (Specify below)"
// // ];

// // interface AttendanceStatus {
// //     present: boolean;
// //     reason?: string;
// //     proofUrl?: string;
// // }

// // export const AttendancePage: React.FC = () => {
// //     const { cohortId } = useParams();
// //     const navigate = useNavigate();
// //     const { cohorts, learners, user, fetchCohorts, fetchLearners } = useStore();

// //     // -- App State --
// //     const [loading, setLoading] = useState(false);
// //     const [fetchingRecord, setFetchingRecord] = useState(false);
// //     const [isLocked, setIsLocked] = useState(false);
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
// //     const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

// //     // -- Modals State --
// //     const [statusModal, setStatusModal] = useState({ show: false, type: 'success' as 'success' | 'error', title: '', message: '' });
// //     const [evidenceModal, setEvidenceModal] = useState<{ show: boolean, learnerId: string, learnerName: string } | null>(null);
// //     const [modalCategory, setModalCategory] = useState('');
// //     const [modalReason, setModalReason] = useState('');
// //     const [modalFile, setModalFile] = useState<File | null>(null);
// //     const [uploadingFile, setUploadingFile] = useState(false);

// //     // -- Initialization --
// //     useEffect(() => {
// //         fetchCohorts();
// //         fetchLearners();
// //     }, [fetchCohorts, fetchLearners]);

// //     const currentCohort = cohorts.find(c => c.id === cohortId);
// //     const cohortLearners = useMemo(() => {
// //         return learners.filter(l => currentCohort?.learnerIds?.includes(l.id));
// //     }, [learners, currentCohort]);

// //     // -- Data Loading & Locking Logic --
// //     useEffect(() => {
// //         const loadRegister = async () => {
// //             if (!cohortId || !date || cohortLearners.length === 0) return;
// //             setFetchingRecord(true);
// //             try {
// //                 const recordId = `${cohortId}_${date}`;
// //                 const docSnap = await getDoc(doc(db, 'attendance', recordId));

// //                 const newStatus: Record<string, AttendanceStatus> = {};
// //                 if (docSnap.exists()) {
// //                     const data = docSnap.data();
// //                     setIsLocked(true); // Lock by default if it exists
// //                     cohortLearners.forEach(l => {
// //                         const isPresent = data.presentLearners.includes(l.id);
// //                         newStatus[l.id] = {
// //                             present: isPresent,
// //                             reason: data.reasons?.[l.id] || '',
// //                             proofUrl: data.proofs?.[l.id] || undefined
// //                         };
// //                     });
// //                 } else {
// //                     setIsLocked(false);
// //                     cohortLearners.forEach(l => {
// //                         newStatus[l.id] = { present: true };
// //                     });
// //                 }
// //                 setAttendance(newStatus);
// //             } catch (err) {
// //                 console.error("Error loading register:", err);
// //             } finally {
// //                 setFetchingRecord(false);
// //             }
// //         };
// //         loadRegister();
// //     }, [date, cohortId, cohortLearners.length]);

// //     // -- Export Functions --
// //     const exportToCSV = () => {
// //         const headers = ['Learner Name', 'ID Number', 'Status', 'Reason'];
// //         const rows = cohortLearners.map(l => {
// //             const att = attendance[l.id] || { present: true };
// //             return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
// //         });
// //         const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
// //         const blob = new Blob([csvContent], { type: 'text/csv' });
// //         const url = window.URL.createObjectURL(blob);
// //         const a = document.createElement('a');
// //         a.href = url; a.download = `Attendance_${currentCohort?.name}_${date}.csv`; a.click();
// //     };

// //     const exportToPDF = () => {
// //         const doc = new jsPDF();
// //         doc.text(`Attendance Register: ${currentCohort?.name}`, 14, 15);
// //         doc.setFontSize(10);
// //         doc.text(`Date: ${date} | Facilitator: ${user?.fullName}`, 14, 22);

// //         const tableData = cohortLearners.map(l => {
// //             const att = attendance[l.id] || { present: true };
// //             return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
// //         });

// //         autoTable(doc, {
// //             head: [['Learner', 'ID Number', 'Status', 'Reason']],
// //             body: tableData,
// //             startY: 30,
// //             headStyles: { fillColor: [37, 99, 235] }
// //         });
// //         doc.save(`Register_${currentCohort?.name}_${date}.pdf`);
// //     };

// //     // -- Handlers --
// //     const toggleStatus = (learnerId: string, learnerName: string) => {
// //         if (isLocked) return;
// //         const currentStatus = attendance[learnerId]?.present ?? true;
// //         if (currentStatus) {
// //             setEvidenceModal({ show: true, learnerId, learnerName });
// //             setModalCategory('');
// //             setModalReason('');
// //             setModalFile(null);
// //         } else {
// //             setAttendance(prev => ({ ...prev, [learnerId]: { present: true } }));
// //         }
// //     };

// //     const isModalValid = modalCategory !== '' && modalReason.trim().length > 3;

// //     const submitEvidence = async () => {
// //         if (!isModalValid || !evidenceModal) return;
// //         const { learnerId } = evidenceModal;
// //         setUploadingFile(true);
// //         try {
// //             let fileUrl = '';
// //             if (modalFile) {
// //                 const storage = getStorage();
// //                 const storageRef = ref(storage, `attendance_proofs/${cohortId}/${date}/${learnerId}_${Date.now()}`);
// //                 await uploadBytes(storageRef, modalFile);
// //                 fileUrl = await getDownloadURL(storageRef);
// //             }
// //             setAttendance(prev => ({
// //                 ...prev,
// //                 [learnerId]: {
// //                     present: false,
// //                     reason: `[${modalCategory}] ${modalReason}`,
// //                     proofUrl: fileUrl || prev[learnerId]?.proofUrl
// //                 }
// //             }));
// //             setEvidenceModal(null);
// //         } catch (error) {
// //             alert("Upload failed.");
// //         } finally {
// //             setUploadingFile(false);
// //         }
// //     };

// //     const handleSave = async () => {
// //         if (!user || !cohortId) return;
// //         setLoading(true);
// //         try {
// //             const presentIds = Object.keys(attendance).filter(id => attendance[id].present);
// //             const proofsMap: Record<string, string> = {};
// //             const reasonsMap: Record<string, string> = {};
// //             Object.keys(attendance).forEach(id => {
// //                 if (attendance[id].proofUrl) proofsMap[id] = attendance[id].proofUrl!;
// //                 if (attendance[id].reason) reasonsMap[id] = attendance[id].reason!;
// //             });

// //             await setDoc(doc(db, 'attendance', `${cohortId}_${date}`), {
// //                 cohortId, date, facilitatorId: user.uid, presentLearners: presentIds,
// //                 proofs: proofsMap, reasons: reasonsMap, updatedAt: new Date().toISOString()
// //             });

// //             setIsLocked(true);
// //             setStatusModal({ show: true, type: 'success', title: 'Success', message: 'Attendance record secured.' });
// //         } catch (error) {
// //             setStatusModal({ show: true, type: 'error', title: 'Error', message: 'Failed to save.' });
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     const filteredLearners = cohortLearners.filter(l =>
// //         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || l.idNumber.includes(searchTerm)
// //     );

// //     if (!currentCohort) return <div className="p-8">Loading...</div>;

// //     return (
// //         <div style={{ padding: '2rem' }}>
// //             {/* EVIDENCE MODAL */}
// //             {evidenceModal && (
// //                 <div style={modalOverlayStyle}>
// //                     <div style={modalContentStyle}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
// //                             <h3 style={{ margin: 0 }}>Mark Absent: {evidenceModal.learnerName}</h3>
// //                             <button onClick={() => setEvidenceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
// //                         </div>
// //                         <div style={{ marginBottom: '1rem' }}>
// //                             <label style={labelStyle}>Reason Category <span style={{ color: 'red' }}>*</span></label>
// //                             <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} style={inputBaseStyle}>
// //                                 <option value="">-- Select --</option>
// //                                 {ABSENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
// //                             </select>
// //                         </div>
// //                         <div style={{ marginBottom: '1rem' }}>
// //                             <label style={labelStyle}>Details <span style={{ color: 'red' }}>*</span></label>
// //                             <textarea value={modalReason} placeholder='Detailed reason for learner absence' onChange={(e) => setModalReason(e.target.value)} style={{ ...inputBaseStyle, minHeight: '80px', color: 'whitesmoke' }} />
// //                         </div>
// //                         <div style={{ marginBottom: '1.5rem' }}>
// //                             <label style={labelStyle}>Proof (Optional)</label>
// //                             <input type="file" onChange={(e) => setModalFile(e.target.files?.[0] || null)} />
// //                         </div>
// //                         <div style={{ display: 'flex', gap: '1rem' }}>
// //                             <button className="btn btn-outline" onClick={() => setEvidenceModal(null)} style={{ flex: 1 }}>Cancel</button>
// //                             <button className="btn btn-primary" onClick={submitEvidence} disabled={!isModalValid || uploadingFile} style={{ flex: 1 }}>Confirm</button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* HEADER ACTIONS */}
// //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
// //                 <h2 style={{ margin: 0 }}>{currentCohort.name} Attendance</h2>
// //                 <div style={{ display: 'flex', gap: '0.75rem' }}>
// //                     <button className="btn btn-outline" onClick={exportToCSV}><Download size={18} /> CSV</button>
// //                     <button className="btn btn-outline" onClick={exportToPDF}><FileDown size={18} /> PDF</button>
// //                 </div>
// //             </div>

// //             {statusModal.show && <StatusModal {...statusModal} onClose={() => setStatusModal(prev => ({ ...prev, show: false }))} />}

// //             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
// //                 <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.6rem' }}><ChevronLeft size={20} /></button>
// //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
// //                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// //                     <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
// //                 </div>
// //                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
// //                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
// //                     <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: 'none', background: 'transparent', color: 'inherit', outline: 'none' }} />
// //                 </div>

// //                 {isLocked ? (
// //                     <button className="btn btn-outline" onClick={() => setIsLocked(false)} style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
// //                         <Edit3 size={18} /> Edit Record
// //                     </button>
// //                 ) : (
// //                     <button className="btn btn-primary" onClick={handleSave} disabled={loading || fetchingRecord} style={{ marginLeft: 'auto' }}>
// //                         {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
// //                         <span>Save Register</span>
// //                     </button>
// //                 )}
// //             </div>

// //             <div className="list-view">
// //                 <table className="assessment-table">
// //                     <thead>
// //                         <tr>
// //                             <th></th>
// //                             <th>Learner</th>
// //                             <th>ID Number</th>
// //                             <th>Status</th>
// //                             <th>Evidence/Reason</th>
// //                             <th style={{ textAlign: 'right' }}>Action</th>
// //                         </tr>
// //                     </thead>
// //                     <tbody>
// //                         {filteredLearners.map((l) => {
// //                             const att = attendance[l.id] || { present: true };
// //                             return (
// //                                 <tr key={l.id} style={{ borderLeft: att.present ? '4px solid #16a34a' : '4px solid #ef4444' }}>
// //                                     {/* <td><strong>{l.fullName}</strong></td> */}
// //                                     <td>
// //                                         <div style={{
// //                                             width: '40px', height: '40px', borderRadius: '50%',
// //                                             background: '#e0f2fe', display: 'flex',
// //                                             alignItems: 'center', justifyContent: 'center',
// //                                             fontWeight: 'bold', color: '#0369a1'
// //                                         }}>
// //                                             {l.fullName.charAt(0)}
// //                                         </div>
// //                                     </td>
// //                                     <td>
// //                                         <div>
// //                                             <div style={{ fontWeight: 600 }}>{l.fullName}</div>
// //                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Learner</div>
// //                                         </div>
// //                                     </td>





// //                                     {/* <td style={{ opacity: 0.7 }}>{l.idNumber}</td> */}
// //                                     <td>
// //                                         <div style={{ fontWeight: 500 }}>{l.idNumber}</div>
// //                                         <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Verified ID</div>
// //                                     </td>
// //                                     <td>
// //                                         <span style={{ color: att.present ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
// //                                             {att.present ? 'Present' : 'Absent'}
// //                                         </span>
// //                                     </td>
// //                                     <td style={{ fontSize: '0.85rem' }}>
// //                                         {!att.present && (
// //                                             <>
// //                                                 <ExpandableText text={att.reason || ''} limit={40} />
// //                                                 {att.proofUrl && <a href={att.proofUrl} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#2563eb' }}>View Proof</a>}
// //                                             </>
// //                                         )}
// //                                     </td>
// //                                     <td style={{ textAlign: 'right' }}>
// //                                         <button
// //                                             className="btn btn-outline small"
// //                                             disabled={isLocked}
// //                                             style={{ opacity: isLocked ? 0.5 : 1 }}
// //                                             onClick={() => toggleStatus(l.id, l.fullName)}
// //                                         >
// //                                             {att.present ? 'Mark Absent' : 'Mark Present'}
// //                                         </button>
// //                                     </td>
// //                                 </tr>
// //                             );
// //                         })}
// //                     </tbody>
// //                 </table>
// //             </div>
// //         </div>
// //     );
// // };

// // const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', color: '#374151', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
// // const modalContentStyle: React.CSSProperties = { background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '450px' };
// // const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem' };
// // const inputBaseStyle: React.CSSProperties = { width: '100%', padding: '0.75rem', color: '#374151', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' };

