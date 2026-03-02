import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
    ChevronLeft, Save, Loader,
    Calendar, Search, X,
    Download, FileDown, Edit3
} from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { StatusModal } from '../../components/common/StatusModal/StatusModal';
import { ExpandableText } from '../../components/common/ExpandableText';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FacilitatorDashboard.css';

// --- CONFIGURATION ---
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
    const { cohorts, learners, user, fetchCohorts, fetchLearners } = useStore();

    // -- App State --
    const [loading, setLoading] = useState(false);
    const [fetchingRecord, setFetchingRecord] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

    // -- Modals State --
    const [statusModal, setStatusModal] = useState({ show: false, type: 'success' as 'success' | 'error', title: '', message: '' });
    const [evidenceModal, setEvidenceModal] = useState<{ show: boolean, learnerId: string, learnerName: string } | null>(null);
    const [modalCategory, setModalCategory] = useState('');
    const [modalReason, setModalReason] = useState('');
    const [modalFile, setModalFile] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    // -- Initialization --
    useEffect(() => {
        fetchCohorts();
        fetchLearners();
    }, [fetchCohorts, fetchLearners]);

    const currentCohort = cohorts.find(c => c.id === cohortId);
    const cohortLearners = useMemo(() => {
        return learners.filter(l => currentCohort?.learnerIds?.includes(l.id));
    }, [learners, currentCohort]);

    // -- Data Loading & Locking Logic --
    useEffect(() => {
        const loadRegister = async () => {
            if (!cohortId || !date || cohortLearners.length === 0) return;
            setFetchingRecord(true);
            try {
                const recordId = `${cohortId}_${date}`;
                const docSnap = await getDoc(doc(db, 'attendance', recordId));

                const newStatus: Record<string, AttendanceStatus> = {};
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setIsLocked(true); // Lock by default if it exists
                    cohortLearners.forEach(l => {
                        const isPresent = data.presentLearners.includes(l.id);
                        newStatus[l.id] = {
                            present: isPresent,
                            reason: data.reasons?.[l.id] || '',
                            proofUrl: data.proofs?.[l.id] || undefined
                        };
                    });
                } else {
                    setIsLocked(false);
                    cohortLearners.forEach(l => {
                        newStatus[l.id] = { present: true };
                    });
                }
                setAttendance(newStatus);
            } catch (err) {
                console.error("Error loading register:", err);
            } finally {
                setFetchingRecord(false);
            }
        };
        loadRegister();
    }, [date, cohortId, cohortLearners.length]);

    // -- Export Functions --
    const exportToCSV = () => {
        const headers = ['Learner Name', 'ID Number', 'Status', 'Reason'];
        const rows = cohortLearners.map(l => {
            const att = attendance[l.id] || { present: true };
            return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
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
        doc.text(`Date: ${date} | Facilitator: ${user?.fullName}`, 14, 22);

        const tableData = cohortLearners.map(l => {
            const att = attendance[l.id] || { present: true };
            return [l.fullName, l.idNumber, att.present ? 'Present' : 'Absent', att.reason || '-'];
        });

        autoTable(doc, {
            head: [['Learner', 'ID Number', 'Status', 'Reason']],
            body: tableData,
            startY: 30,
            headStyles: { fillColor: [37, 99, 235] }
        });
        doc.save(`Register_${currentCohort?.name}_${date}.pdf`);
    };

    // -- Handlers --
    const toggleStatus = (learnerId: string, learnerName: string) => {
        if (isLocked) return;
        const currentStatus = attendance[learnerId]?.present ?? true;
        if (currentStatus) {
            setEvidenceModal({ show: true, learnerId, learnerName });
            setModalCategory('');
            setModalReason('');
            setModalFile(null);
        } else {
            setAttendance(prev => ({ ...prev, [learnerId]: { present: true } }));
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
                    proofUrl: fileUrl || prev[learnerId]?.proofUrl
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
            const proofsMap: Record<string, string> = {};
            const reasonsMap: Record<string, string> = {};
            Object.keys(attendance).forEach(id => {
                if (attendance[id].proofUrl) proofsMap[id] = attendance[id].proofUrl!;
                if (attendance[id].reason) reasonsMap[id] = attendance[id].reason!;
            });

            await setDoc(doc(db, 'attendance', `${cohortId}_${date}`), {
                cohortId, date, facilitatorId: user.uid, presentLearners: presentIds,
                proofs: proofsMap, reasons: reasonsMap, updatedAt: new Date().toISOString()
            });

            setIsLocked(true);
            setStatusModal({ show: true, type: 'success', title: 'Success', message: 'Attendance record secured.' });
        } catch (error) {
            setStatusModal({ show: true, type: 'error', title: 'Error', message: 'Failed to save.' });
        } finally {
            setLoading(false);
        }
    };

    const filteredLearners = cohortLearners.filter(l =>
        l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || l.idNumber.includes(searchTerm)
    );

    if (!currentCohort) return <div className="p-8">Loading...</div>;

    return (
        <div style={{ padding: '2rem' }}>
            {/* EVIDENCE MODAL */}
            {evidenceModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Mark Absent: {evidenceModal.learnerName}</h3>
                            <button onClick={() => setEvidenceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={labelStyle}>Reason Category <span style={{ color: 'red' }}>*</span></label>
                            <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} style={inputBaseStyle}>
                                <option value="">-- Select --</option>
                                {ABSENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={labelStyle}>Details <span style={{ color: 'red' }}>*</span></label>
                            <textarea value={modalReason} placeholder='Detailed reason for learner absence' onChange={(e) => setModalReason(e.target.value)} style={{ ...inputBaseStyle, minHeight: '80px', color: 'whitesmoke' }} />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={labelStyle}>Proof (Optional)</label>
                            <input type="file" onChange={(e) => setModalFile(e.target.files?.[0] || null)} />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-outline" onClick={() => setEvidenceModal(null)} style={{ flex: 1 }}>Cancel</button>
                            <button className="btn btn-primary" onClick={submitEvidence} disabled={!isModalValid || uploadingFile} style={{ flex: 1 }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER ACTIONS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>{currentCohort.name} Attendance</h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={exportToCSV}><Download size={18} /> CSV</button>
                    <button className="btn btn-outline" onClick={exportToPDF}><FileDown size={18} /> PDF</button>
                </div>
            </div>

            {statusModal.show && <StatusModal {...statusModal} onClose={() => setStatusModal(prev => ({ ...prev, show: false }))} />}

            <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.6rem' }}><ChevronLeft size={20} /></button>
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
                    <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
                    <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: 'none', background: 'transparent', color: 'inherit', outline: 'none' }} />
                </div>

                {isLocked ? (
                    <button className="btn btn-outline" onClick={() => setIsLocked(false)} style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
                        <Edit3 size={18} /> Edit Record
                    </button>
                ) : (
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading || fetchingRecord} style={{ marginLeft: 'auto' }}>
                        {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
                        <span>Save Register</span>
                    </button>
                )}
            </div>

            <div className="list-view">
                <table className="assessment-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Learner</th>
                            <th>ID Number</th>
                            <th>Status</th>
                            <th>Evidence/Reason</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLearners.map((l) => {
                            const att = attendance[l.id] || { present: true };
                            return (
                                <tr key={l.id} style={{ borderLeft: att.present ? '4px solid #16a34a' : '4px solid #ef4444' }}>
                                    {/* <td><strong>{l.fullName}</strong></td> */}
                                    <td>
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            background: '#e0f2fe', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 'bold', color: '#0369a1'
                                        }}>
                                            {l.fullName.charAt(0)}
                                        </div>
                                    </td>
                                    <td>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{l.fullName}</div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Learner</div>
                                        </div>
                                    </td>





                                    {/* <td style={{ opacity: 0.7 }}>{l.idNumber}</td> */}
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{l.idNumber}</div>
                                        <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Verified ID</div>
                                    </td>
                                    <td>
                                        <span style={{ color: att.present ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                                            {att.present ? 'Present' : 'Absent'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.85rem' }}>
                                        {!att.present && (
                                            <>
                                                <ExpandableText text={att.reason || ''} limit={40} />
                                                {att.proofUrl && <a href={att.proofUrl} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#2563eb' }}>View Proof</a>}
                                            </>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn btn-outline small"
                                            disabled={isLocked}
                                            style={{ opacity: isLocked ? 0.5 : 1 }}
                                            onClick={() => toggleStatus(l.id, l.fullName)}
                                        >
                                            {att.present ? 'Mark Absent' : 'Mark Present'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- STYLES ---
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', color: '#374151', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { background: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '450px' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem' };
const inputBaseStyle: React.CSSProperties = { width: '100%', padding: '0.75rem', color: '#374151', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' };



// import React, { useState, useEffect } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { useStore } from '../../store/useStore';
// import {
//     ChevronLeft, Save, CheckCircle, XCircle, Loader,
//     Calendar, Search, AlertCircle
// } from 'lucide-react';
// import { doc, setDoc, getDoc } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { StatusModal } from '../../components/common/StatusModal';
// import './FacilitatorDashboard.css';

// export const AttendancePage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();

//     // 1. Get fetching methods from the store
//     const { cohorts, learners, user, fetchCohorts, fetchLearners } = useStore();

//     const [loading, setLoading] = useState(false);
//     const [fetchingRecord, setFetchingRecord] = useState(false); // For checking DB for saved attendance
//     const [searchTerm, setSearchTerm] = useState('');
//     const [status, setStatus] = useState<{
//         show: boolean,
//         type: 'success' | 'error' | 'info',
//         title: string,
//         message: string
//     }>({ show: false, type: 'info', title: '', message: '' });

//     const [attendance, setAttendance] = useState<Record<string, boolean>>({});
//     const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

//     // 2. Load Global Data if not present (Fix for the blank list)
//     useEffect(() => {
//         fetchCohorts();
//         fetchLearners();
//     }, [fetchCohorts, fetchLearners]);

//     const currentCohort = cohorts.find(c => c.id === cohortId);

//     // 3. Memoize the learners in this specific cohort
//     const cohortLearners = React.useMemo(() => {
//         return learners.filter(l => currentCohort?.learnerIds?.includes(l.id));
//     }, [learners, currentCohort]);

//     const filteredLearners = cohortLearners.filter(l =>
//         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         l.idNumber.includes(searchTerm)
//     );

//     // 4. Load existing attendance record for the selected date
//     useEffect(() => {
//         const fetchExistingRecord = async () => {
//             if (!cohortId || !date || cohortLearners.length === 0) return;
//             setFetchingRecord(true);
//             try {
//                 const recordId = `${cohortId}_${date}`;
//                 const docSnap = await getDoc(doc(db, 'attendance', recordId));

//                 if (docSnap.exists()) {
//                     const data = docSnap.data();
//                     const savedStatus: Record<string, boolean> = {};
//                     cohortLearners.forEach(l => {
//                         savedStatus[l.id] = data.presentLearners.includes(l.id);
//                     });
//                     setAttendance(savedStatus);
//                 } else {
//                     const defaultStatus: Record<string, boolean> = {};
//                     cohortLearners.forEach(l => { defaultStatus[l.id] = true; });
//                     setAttendance(defaultStatus);
//                 }
//             } catch (err) {
//                 console.error("Error fetching register:", err);
//             } finally {
//                 setFetchingRecord(false);
//             }
//         };
//         fetchExistingRecord();
//     }, [date, cohortId, cohortLearners]);

//     const toggleStatus = (id: string) => {
//         setAttendance(prev => ({ ...prev, [id]: !prev[id] }));
//     };

//     const handleSave = async () => {
//         if (!user || !cohortId) return;
//         setLoading(true);
//         try {
//             const presentIds = Object.keys(attendance).filter(id => attendance[id]);
//             const recordId = `${cohortId}_${date}`;
//             await setDoc(doc(db, 'attendance', recordId), {
//                 cohortId,
//                 date,
//                 facilitatorId: user.uid,
//                 facilitatorName: user.fullName,
//                 presentLearners: presentIds,
//                 updatedAt: new Date().toISOString()
//             });
//             setStatus({
//                 show: true, type: 'success', title: 'Register Finalized',
//                 message: `Attendance for ${date} has been saved successfully.`
//             });
//         } catch (error) {
//             setStatus({
//                 show: true, type: 'error', title: 'Error',
//                 message: 'Failed to save register. Please try again.'
//             });
//         } finally {
//             setLoading(false);
//         }
//     };

//     // Show a global loader if we don't even have the cohort data yet
//     if (!currentCohort && cohorts.length === 0) {
//         return (
//             <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
//                 <Loader className="spin" size={40} />
//                 <p>Loading Cohort Data...</p>
//             </div>
//         );
//     }

//     if (!currentCohort) return <div className="p-8">Cohort not found.</div>;

//     return (
//         <div style={{ padding: '2rem' }}>
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
//                 <h2 style={{ margin: 0 }}>Attendance Register: {currentCohort.name}</h2>
//             </div>

//             {status.show && (
//                 <StatusModal
//                     type={status.type}
//                     title={status.title}
//                     message={status.message}
//                     onClose={() => setStatus(prev => ({ ...prev, show: false }))}
//                 />
//             )}

//             <div className="edit-grid" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
//                 <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ padding: '0.6rem' }}>
//                     <ChevronLeft size={20} />
//                 </button>

//                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 2, minWidth: '250px' }}>
//                     <Search size={20} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
//                     <input
//                         type="text"
//                         placeholder="Search learners..."
//                         value={searchTerm}
//                         onChange={(e) => setSearchTerm(e.target.value)}
//                         style={{ width: '100%' }}
//                     />
//                 </div>

//                 <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', width: 'auto' }}>
//                     <Calendar size={18} style={{ opacity: 0.5, marginRight: '0.5rem' }} />
//                     <input
//                         type="date"
//                         value={date}
//                         onChange={(e) => setDate(e.target.value)}
//                         style={{ border: 'none', background: 'transparent', color: 'inherit', outline: 'none', cursor: 'pointer' }}
//                     />
//                 </div>

//                 <button
//                     className="btn btn-primary"
//                     onClick={handleSave}
//                     disabled={loading || fetchingRecord}
//                     style={{ marginLeft: 'auto' }}
//                 >
//                     {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
//                     <span>Save Register</span>
//                 </button>
//             </div>

//             <div className="list-view">
//                 {fetchingRecord ? (
//                     <div style={{ padding: '4rem', textAlign: 'center' }}>
//                         <Loader className="spin" size={32} />
//                         <p style={{ marginTop: '1rem', opacity: 0.7 }}>Checking records for {date}...</p>
//                     </div>
//                 ) : (
//                     <table className="assessment-table">
//                         <thead>
//                             <tr>
//                                 <th>Learner Details</th>
//                                 <th>Identification</th>
//                                 <th>Status</th>
//                                 <th style={{ textAlign: 'right' }}>Action</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {filteredLearners.length > 0 ? (
//                                 filteredLearners.map((learner) => (
//                                     <tr key={learner.id}>
//                                         <td>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                                 <div style={{
//                                                     width: '40px', height: '40px', borderRadius: '50%',
//                                                     background: '#e0f2fe', display: 'flex',
//                                                     alignItems: 'center', justifyContent: 'center',
//                                                     fontWeight: 'bold', color: '#0369a1'
//                                                 }}>
//                                                     {learner.fullName.charAt(0)}
//                                                 </div>
//                                                 <div>
//                                                     <div style={{ fontWeight: 600 }}>{learner.fullName}</div>
//                                                     <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Learner</div>
//                                                 </div>
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <div style={{ fontWeight: 500 }}>{learner.idNumber}</div>
//                                             <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Verified ID</div>
//                                         </td>
//                                         <td>
//                                             <span style={{
//                                                 display: 'flex', alignItems: 'center', gap: '0.4rem',
//                                                 fontWeight: 500, color: attendance[learner.id] ? '#16a34a' : '#ef4444'
//                                             }}>
//                                                 {attendance[learner.id] ? <><CheckCircle size={16} /> Present</> : <><XCircle size={16} /> Absent</>}
//                                             </span>
//                                         </td>
//                                         <td style={{ textAlign: 'right' }}>
//                                             <button
//                                                 className="icon-btn"
//                                                 style={{
//                                                     background: attendance[learner.id] ? 'transparent' : 'transparent',
//                                                     border: `1px solid ${attendance[learner.id] ? '#16a34a' : '#ef4444'}`,
//                                                     color: attendance[learner.id] ? '#16a34a' : '#ef4444',
//                                                     padding: '0.4rem 1rem',
//                                                     width: 'auto',
//                                                     borderRadius: '6px',
//                                                     fontSize: '0.8rem',
//                                                     cursor: 'pointer'
//                                                 }}
//                                                 onClick={() => toggleStatus(learner.id)}
//                                             >
//                                                 {attendance[learner.id] ? 'Mark Absent' : 'Mark Present'}
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 ))
//                             ) : (
//                                 <tr>
//                                     <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
//                                         No learners found for this cohort.
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