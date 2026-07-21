import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DownloadCloud, X, DollarSign, Calendar, Calculator, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; // Adjust path to your firebase config if needed
import { useToast } from '../Toast/Toast'; // Adjust path to your Toast if needed

interface StipendExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    cohortId: string;
    cohortName: string;
    learners: any[];
    attendanceMode: 'qcto' | 'bootcamp';
    initialMonth: string; // 🚀 ADDED PROP
}

export const StipendExportModal: React.FC<StipendExportModalProps> = ({
    isOpen, onClose, cohortId, cohortName, learners, attendanceMode, initialMonth
}) => {
    // 🚀 Initialize state with the prop
    const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
    const [stipendAmount, setStipendAmount] = useState<number>(3500);
    const [isGenerating, setIsGenerating] = useState(false);
    const toast = useToast();

    // 🚀 Sync state when initial month changes from calendar view
    useEffect(() => {
        if (isOpen) {
            setSelectedMonth(initialMonth);
        }
    }, [initialMonth, isOpen]);

    if (!isOpen) return null;

    const handleExport = async () => {
        setIsGenerating(true);

        try {
            let totalLoggedDays = 0;
            const learnerStats: Record<string, { present: number, partial: number, approvedLeave: number }> = {};

            // Initialize stats for active roster
            learners.forEach(l => {
                learnerStats[l.idNumber || l.id] = { present: 0, partial: 0, approvedLeave: 0 };
            });

            // 1. FETCH APPROVED LEAVES
            const leavesSnap = await getDocs(query(collection(db, 'leave_requests'), where('status', '==', 'Approved')));
            const paidLeaveDates = new Map<string, Set<string>>();

            leavesSnap.docs.forEach(doc => {
                const lv = doc.data();
                const id = lv.learnerId || lv.idNumber;
                if (!id) return;

                if (!paidLeaveDates.has(id)) paidLeaveDates.set(id, new Set());
                const dateSet = paidLeaveDates.get(id)!;

                const start = lv.startDate || lv.dateAffected;
                const end = lv.endDate || lv.dateAffected;

                if (start && end) {
                    let current = new Date(start);
                    const endDate = new Date(end);
                    while (current <= endDate) {
                        dateSet.add(current.toISOString().split('T')[0]);
                        current.setDate(current.getDate() + 1);
                    }
                }
            });

            // 2. Fetch data based on Bootcamp vs QCTO mode
            if (attendanceMode === 'bootcamp') {
                const logsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('cohortId', '==', cohortId)));
                const monthLogs = logsSnap.docs.filter(d => (d.data().sessionDate || '').startsWith(selectedMonth));
                totalLoggedDays = monthLogs.length;

                const recsSnap = await getDocs(query(collection(db, 'attendance_records'), where('cohortId', '==', cohortId)));
                recsSnap.docs.forEach(d => {
                    const data = d.data();
                    const dateStr = (data.sessionDate || '').split('T')[0];

                    if (dateStr.startsWith(selectedMonth)) {
                        const targetId = data.learnerId;
                        const match = learners.find(l => l.id === targetId || l.idNumber === targetId);
                        if (match) {
                            const key = match.idNumber || match.id;
                            if (data.status === 'Present') {
                                learnerStats[key].present++;
                            } else if (data.status === 'Partial') {
                                learnerStats[key].partial++;
                            } else {
                                if (paidLeaveDates.get(targetId)?.has(dateStr) || paidLeaveDates.get(match.idNumber)?.has(dateStr)) {
                                    learnerStats[key].approvedLeave++;
                                }
                            }
                        }
                    }
                });
            } else {
                const attSnap = await getDocs(query(collection(db, 'attendance'), where('cohortId', '==', cohortId)));
                const monthAtts = attSnap.docs.filter(d => (d.data().date || '').startsWith(selectedMonth));
                totalLoggedDays = monthAtts.length;

                monthAtts.forEach(d => {
                    const data = d.data();
                    const dateStr = (data.date || '').split('T')[0];
                    const presents = data.presentLearners || [];

                    learners.forEach(l => {
                        const idNum = l.idNumber;
                        if (presents.includes(idNum)) {
                            learnerStats[idNum].present++;
                        } else {
                            if (paidLeaveDates.get(idNum)?.has(dateStr) || paidLeaveDates.get(l.id)?.has(dateStr)) {
                                learnerStats[idNum].approvedLeave++;
                            }
                        }
                    });
                });
            }

            if (totalLoggedDays === 0) {
                toast.error(`No attendance registers found for ${selectedMonth}.`);
                setIsGenerating(false);
                return;
            }

            // 3. Setup Excel Headers
            const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });
            const headers = [
                "Learner Name",
                "ID Number",
                "Total Logged Days",
                "Days Present (1.0)",
                "Days Partial (0.5)",
                "Approved Paid Leave (1.0)",
                "Unpaid Days Missed",
                "Base Stipend (ZAR)",
                "Calculated Payout (ZAR)"
            ];

            const dataRows = [headers.map(createTextCell)];

            // 4. Process each learner's payout math
            learners.forEach(learner => {
                const key = learner.idNumber || learner.id;
                const stats = learnerStats[key];

                const presentCount = stats.present;
                const partialCount = stats.partial;
                const approvedLeaveCount = stats.approvedLeave;

                const equivalentDaysPaid = presentCount + approvedLeaveCount + (partialCount * 0.5);
                const unpaidDaysMissed = totalLoggedDays - presentCount - partialCount - approvedLeaveCount;

                const cappedPaidDays = Math.min(equivalentDaysPaid, totalLoggedDays);
                const payout = totalLoggedDays > 0 ? (cappedPaidDays / totalLoggedDays) * stipendAmount : 0;

                dataRows.push([
                    learner.fullName,
                    learner.idNumber,
                    totalLoggedDays,
                    presentCount,
                    partialCount,
                    approvedLeaveCount,
                    Math.max(0, unpaidDaysMissed),
                    `R ${stipendAmount.toFixed(2)}`,
                    `R ${payout.toFixed(2)}`
                ].map(createTextCell));
            });

            // 5. Generate the Excel Workbook
            const wb = XLSX.utils.book_new();

            const summarySheet = XLSX.utils.aoa_to_sheet([
                ["STIPEND RECONCILIATION REPORT"],
                ["Cohort:", cohortName],
                ["Month:", selectedMonth],
                ["Base Stipend:", `R ${stipendAmount.toFixed(2)}`],
                ["Total Logged Training Days:", totalLoggedDays],
                ["Note:", "Approved Paid Leave is calculated at 1.0 day rate. Partial attendance is calculated at 0.5 day rate."],
                ["Export Date:", new Date().toLocaleDateString()]
            ].map(r => r.map(createTextCell)));

            const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

            XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
            XLSX.utils.book_append_sheet(wb, dataSheet, 'Payroll Data');

            const fileName = `Stipends_${cohortName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedMonth}.xlsx`;
            XLSX.writeFile(wb, fileName);

            toast.success("Stipend export generated successfully!");
            onClose();

        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to generate stipend export.");
        } finally {
            setIsGenerating(false);
        }
    };

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
                    <div className="wm-modal__header-icon" style={{ background: '#f0fdf4', color: '#166534' }}>
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <h2 className="wm-modal__title">Export Monthly Stipends</h2>
                        <p className="wm-modal__subtitle">Calculate pro-rata payouts based on timesheets.</p>
                    </div>
                    <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="wm-form-group">
                        <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={14} /> Select Month
                        </label>
                        <input
                            type="month"
                            className="wm-form-input"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                        />
                    </div>

                    <div className="wm-form-group">
                        <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calculator size={14} /> Monthly Base Stipend (ZAR)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>R</span>
                            <input
                                type="number"
                                className="wm-form-input"
                                style={{ paddingLeft: '32px' }}
                                value={stipendAmount}
                                onChange={e => setStipendAmount(Number(e.target.value))}
                                min="0"
                                step="100"
                            />
                        </div>
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.5, border: '1px solid #cbd5e1' }}>
                            <strong>Calculation Logic:</strong>
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                <li><strong>Present:</strong> 1.0 day rate</li>
                                <li><strong style={{ color: 'var(--mlab-green)' }}>Approved Leave:</strong> 1.0 day rate (Paid)</li>
                                <li><strong>Partial:</strong> 0.5 day rate</li>
                                <li><strong>Absent:</strong> Unpaid</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="wm-modal__footer">
                    <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isGenerating}>Cancel</button>
                    <button className="mlab-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={handleExport} disabled={isGenerating || stipendAmount <= 0 || !selectedMonth}>
                        {isGenerating ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />} Generate Excel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};


// import React, { useState } from 'react';
// import { createPortal } from 'react-dom';
// import { DownloadCloud, X, DollarSign, Calendar, Calculator, Loader2 } from 'lucide-react';
// import * as XLSX from 'xlsx';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { collection, getDocs, query, where } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// // ─── STIPEND EXPORT MODAL ───────────────────────────────────────────────────

// export const StipendExportModal: React.FC<{
//     isOpen: boolean;
//     onClose: () => void;
//     cohortId: string;
//     cohortName: string;
//     learners: any[];
//     attendanceMode: 'qcto' | 'bootcamp';
// }> = ({ isOpen, onClose, cohortId, cohortName, learners, attendanceMode }) => {
//     const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
//     const [stipendAmount, setStipendAmount] = useState<number>(3500);
//     const [isGenerating, setIsGenerating] = useState(false);
//     const toast = useToast();

//     if (!isOpen) return null;

//     const handleExport = async () => {
//         setIsGenerating(true);

//         try {
//             let totalLoggedDays = 0;
//             const learnerStats: Record<string, { present: number, partial: number }> = {};

//             // Initialize stats for active roster
//             learners.forEach(l => {
//                 learnerStats[l.idNumber || l.id] = { present: 0, partial: 0 };
//             });

//             // 1. Fetch data based on Bootcamp vs QCTO mode
//             if (attendanceMode === 'bootcamp') {
//                 const logsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('cohortId', '==', cohortId)));
//                 const monthLogs = logsSnap.docs.filter(d => (d.data().sessionDate || '').startsWith(selectedMonth));
//                 totalLoggedDays = monthLogs.length;

//                 const recsSnap = await getDocs(query(collection(db, 'attendance_records'), where('cohortId', '==', cohortId)));
//                 recsSnap.docs.forEach(d => {
//                     const data = d.data();
//                     if ((data.sessionDate || '').startsWith(selectedMonth)) {
//                         const targetId = data.learnerId;
//                         const match = learners.find(l => l.id === targetId || l.idNumber === targetId);
//                         if (match) {
//                             const key = match.idNumber || match.id;
//                             if (data.status === 'Present') learnerStats[key].present++;
//                             if (data.status === 'Partial') learnerStats[key].partial++;
//                         }
//                     }
//                 });
//             } else {
//                 const attSnap = await getDocs(query(collection(db, 'attendance'), where('cohortId', '==', cohortId)));
//                 const monthAtts = attSnap.docs.filter(d => (d.data().date || '').startsWith(selectedMonth));
//                 totalLoggedDays = monthAtts.length;

//                 monthAtts.forEach(d => {
//                     const data = d.data();
//                     const presents = data.presentLearners || [];
//                     presents.forEach((idNum: string) => {
//                         if (learnerStats[idNum]) {
//                             learnerStats[idNum].present++;
//                         }
//                     });
//                 });
//             }

//             if (totalLoggedDays === 0) {
//                 toast.error(`No attendance registers found for ${selectedMonth}.`);
//                 setIsGenerating(false);
//                 return;
//             }

//             // 2. Setup Excel Headers
//             const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });
//             const headers = [
//                 "Learner Name",
//                 "ID Number",
//                 "Status",
//                 "Total Expected Days",
//                 "Days Present (1.0)",
//                 "Days Partial (0.5)",
//                 "Days Missed",
//                 "Base Stipend (ZAR)",
//                 "Calculated Payout (ZAR)"
//             ];

//             const dataRows = [headers.map(createTextCell)];

//             // 3. Process each learner's payout math
//             learners.forEach(learner => {
//                 const key = learner.idNumber || learner.id;
//                 const stats = learnerStats[key];

//                 const presentCount = stats.present;
//                 const partialCount = stats.partial;

//                 // Math: Full day = 1, Partial = 0.5
//                 const equivalentDays = presentCount + (partialCount * 0.5);
//                 const daysMissed = totalLoggedDays - presentCount - partialCount;

//                 // Payout Math: (Equivalent Attended / Expected) * Stipend
//                 const payout = totalLoggedDays > 0 ? (equivalentDays / totalLoggedDays) * stipendAmount : 0;

//                 dataRows.push([
//                     learner.fullName,
//                     learner.idNumber,
//                     learner.status === 'dropped' ? 'Withdrawn' : 'Active',
//                     totalLoggedDays,
//                     presentCount,
//                     partialCount,
//                     daysMissed,
//                     `R ${stipendAmount.toFixed(2)}`,
//                     `R ${payout.toFixed(2)}`
//                 ].map(createTextCell));
//             });

//             // 4. Generate the Excel Workbook
//             const wb = XLSX.utils.book_new();

//             const summarySheet = XLSX.utils.aoa_to_sheet([
//                 ["STIPEND RECONCILIATION REPORT"],
//                 ["Cohort:", cohortName],
//                 ["Month:", selectedMonth],
//                 ["Base Stipend:", `R ${stipendAmount.toFixed(2)}`],
//                 ["Total Logged Training Days:", totalLoggedDays],
//                 ["Export Date:", new Date().toLocaleDateString()]
//             ].map(r => r.map(createTextCell)));

//             const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

//             XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
//             XLSX.utils.book_append_sheet(wb, dataSheet, 'Payroll Data');

//             const fileName = `Stipends_${cohortName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedMonth}.xlsx`;
//             XLSX.writeFile(wb, fileName);

//             toast.success("Stipend export generated successfully!");
//             onClose();

//         } catch (error) {
//             console.error("Export error:", error);
//             toast.error("Failed to generate stipend export.");
//         } finally {
//             setIsGenerating(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#f0fdf4', color: '#166534' }}>
//                         <DollarSign size={20} />
//                     </div>
//                     <div>
//                         <h2 className="wm-modal__title">Export Monthly Stipends</h2>
//                         <p className="wm-modal__subtitle">Calculate pro-rata payouts based on timesheets.</p>
//                     </div>
//                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>

//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                     <div className="wm-form-group">
//                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Calendar size={14} /> Select Month
//                         </label>
//                         <input
//                             type="month"
//                             className="wm-form-input"
//                             value={selectedMonth}
//                             onChange={e => setSelectedMonth(e.target.value)}
//                         />
//                     </div>

//                     <div className="wm-form-group">
//                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Calculator size={14} /> Monthly Base Stipend (ZAR)
//                         </label>
//                         <div style={{ position: 'relative' }}>
//                             <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>R</span>
//                             <input
//                                 type="number"
//                                 className="wm-form-input"
//                                 style={{ paddingLeft: '32px' }}
//                                 value={stipendAmount}
//                                 onChange={e => setStipendAmount(Number(e.target.value))}
//                                 min="0"
//                                 step="100"
//                             />
//                         </div>
//                         <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '6px 0 0', lineHeight: 1.4 }}>
//                             Learners with 100% attendance will receive this full amount. Absences will pro-rata this total. <br />
//                             <strong>Note:</strong> Partial attendance is calculated as a half-day (0.5).
//                         </p>
//                     </div>
//                 </div>

//                 <div className="wm-modal__footer">
//                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isGenerating}>Cancel</button>
//                     <button className="mlab-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={handleExport} disabled={isGenerating || stipendAmount <= 0 || !selectedMonth}>
//                         {isGenerating ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />} Generate Excel
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };