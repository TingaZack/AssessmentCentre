import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import moment from "moment";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, collection, setDoc, serverTimestamp } from "firebase/firestore";
import { UploadCloud, CheckCircle, Landmark, X, Loader2, Save } from "lucide-react";
import { db } from "../../../../lib/firebase";

import type { EnrichedPlacement } from "./CompanyInsightsView";
import "../../LearnerFormModal/LearnerFormModal.css";
import { StatusModal, type StatusModalProps } from "../../../common/StatusModal/StatusModal";

// 🚀 DYNAMIC HOLIDAY INJECTION
const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidays.includes(current.format('YYYY-MM-DD'))) {
                days++;
            }
        }
        current.add(1, 'days');
    }
    return days;
};

interface StipendDisbursementModalProps {
    placement: EnrichedPlacement;
    workplaceLogs: any[];
    saHolidays: string[]; // 🚀 NEW PROP
    onClose: () => void;
}

export const StipendDisbursementModal: React.FC<StipendDisbursementModalProps> = ({
    placement,
    workplaceLogs,
    saHolidays,
    onClose
}) => {
    const [monthYear, setMonthYear] = useState(moment().format('YYYY-MM'));
    const [totalEarnings, setTotalEarnings] = useState(Number(placement.stipendAmount) || 0);
    const [daysExpected, setDaysExpected] = useState(0);
    const [daysApproved, setDaysApproved] = useState(0);
    const [bankReference, setBankReference] = useState("");
    const [payDate, setPayDate] = useState(moment().format('YYYY-MM-DD'));
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    useEffect(() => {
        if (!monthYear) return;

        const [yearStr, monthStr] = monthYear.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;

        // 🚀 CALCULATES USING DYNAMIC API HOLIDAYS
        const expected = getSAWorkingDaysInMonth(year, month, saHolidays);
        setDaysExpected(expected);

        const safeLearnerId = String(placement.learnerId || "").trim().toLowerCase();
        const safeIdNumber = String(placement.idNumber || "").trim().toLowerCase();

        const learnerWpLogs = workplaceLogs.filter((l: any) => {
            const logLId = String(l.learnerId || "").trim().toLowerCase();
            return (safeLearnerId !== "" && logLId === safeLearnerId) || (safeIdNumber !== "" && logLId === safeIdNumber);
        });

        const monthWpLogs = learnerWpLogs.filter((l: any) => l.dateString && l.dateString.startsWith(monthYear));

        const approvedDatesThisMonth = new Set(
            monthWpLogs
                .filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved")
                .map((l: any) => l.dateString)
        );

        setDaysApproved(approvedDatesThisMonth.size);
        setBankReference(`MLAB-${placement.idNumber.slice(-4)}-${moment(monthYear).format('MMM').toUpperCase()}`);

    }, [monthYear, placement, workplaceLogs, saHolidays]);

    const netPayment = useMemo(() => {
        if (daysExpected === 0) return 0;
        const calc = (daysApproved / daysExpected) * totalEarnings;
        return Math.round(Math.min(calc, totalEarnings) * 100) / 100;
    }, [totalEarnings, daysExpected, daysApproved]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);

    const handleSave = async () => {
        if (!file) {
            setStatusModal({ type: "warning", title: "Missing Requirement", message: "A Proof of Payment document is legally required for SETA compliance.", onClose: () => setStatusModal(null) });
            return;
        }

        setIsSaving(true);
        try {
            const storage = getStorage();
            const storageRef = ref(storage, `disbursements/${placement.id}/${monthYear}_pop_${Date.now()}.${file.name.split('.').pop()}`);
            await uploadBytes(storageRef, file);
            const payslipEftUrl = await getDownloadURL(storageRef);

            const disbursementRef = doc(collection(db, `placements/${placement.id}/disbursements`), monthYear);

            await setDoc(disbursementRef, {
                monthYear, employeeIdNumber: placement.idNumber, totalEarnings, daysExpected, daysApproved, netPayment,
                etiClaimed: placement.etiMonthlyValue || 0, paymentStatus: "Disbursed", bankReference, payDate: new Date(payDate).toISOString().split('T')[0],
                payslipEftUrl, loggedAt: serverTimestamp(),
            });

            setStatusModal({ type: "success", title: "Ledger Updated", message: "Disbursement logged seamlessly onto the unified payroll ledger.", onClose: () => { setStatusModal(null); onClose(); } });
        } catch (error: any) {
            console.error("Error saving disbursement:", error);
            setStatusModal({ type: "error", title: "Sync Failed", message: "Failed to save ledger transaction: " + error.message, onClose: () => setStatusModal(null) });
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <>
            <div className="lfm-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ zIndex: 99995 }}>
                <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                    <div className="lfm-header">
                        <h2 className="lfm-header__title"><Landmark size={18} /> Log Stipend Disbursement</h2>
                        <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                    </div>

                    <div className="lfm-body">
                        <div className="lfm-section-hdr"><Landmark size={13} /> Financial Audit Record</div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', marginTop: 0, marginBottom: '0.5rem' }}>Unified Payroll Sync Matrix for <strong>{placement.learnerName}</strong>.</p>

                        <div className="lfm-grid" style={{ marginBottom: "0.5rem" }}>
                            <div className="lfm-fg">
                                <label>Disbursement Month *</label>
                                <input type="month" className="lfm-input" value={monthYear} onChange={e => setMonthYear(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>Pay Date *</label>
                                <input type="date" className="lfm-input" value={payDate} onChange={e => setPayDate(e.target.value)} />
                            </div>
                        </div>

                        <div className="lfm-flags-panel" style={{ padding: "1.25rem 1rem", gap: "0.8rem", marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Total Earnings (Base)</span>
                                <input type="number" className="lfm-input" value={totalEarnings} onChange={e => setTotalEarnings(Number(e.target.value))} style={{ width: "120px", textAlign: "right", padding: "0.4rem" }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Expected Days</span>
                                <input type="number" className="lfm-input" value={daysExpected} readOnly style={{ width: "120px", textAlign: "right", padding: "0.4rem", background: "#f1f5f9" }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "12px" }}>
                                <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Approved Logbook Days</span>
                                <input type="number" className="lfm-input" value={daysApproved} readOnly style={{ width: "120px", textAlign: "right", padding: "0.4rem", background: "var(--mlab-green-bg)", color: "var(--mlab-green-dark)", fontWeight: "bold" }} />
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
                                <span style={{ fontSize: "0.85rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 800 }}>Net Payment (Pro-Rata)</span>
                                <span style={{ fontSize: "1.2rem", fontWeight: 800, color: netPayment < totalEarnings ? "var(--mlab-red)" : "var(--mlab-green-dark)" }}>{formatCurrency(netPayment)}</span>
                            </div>
                        </div>

                        <div className="lfm-fg lfm-fg--full" style={{ marginBottom: "0.5rem" }}>
                            <label>Bank Payment Reference *</label>
                            <input type="text" className="lfm-input" value={bankReference} onChange={e => setBankReference(e.target.value)} />
                        </div>

                        <div className="lfm-fg lfm-fg--full" style={{ marginBottom: "0.5rem" }}>
                            <label>Official Proof of Payment (PDF/Image) *</label>
                            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", border: "2px dashed var(--mlab-border)", background: file ? "var(--mlab-green-bg)" : "var(--mlab-bg)", cursor: "pointer", transition: "all 0.2s", textAlign: "center" }}>
                                {file ? (
                                    <>
                                        <CheckCircle size={28} color="var(--mlab-green-dark)" style={{ marginBottom: "8px" }} />
                                        <span style={{ fontFamily: "var(--font-heading)", fontSize: "0.85rem", color: "var(--mlab-green-dark)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{file.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud size={28} color="var(--mlab-blue)" style={{ marginBottom: "8px" }} />
                                        <span style={{ fontFamily: "var(--font-heading)", fontSize: "0.85rem", color: "var(--mlab-blue)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Click to upload bank receipt</span>
                                        <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--mlab-grey)", marginTop: "8px" }}>Must be an official EFT printout (.pdf, .png, .jpg)</span>
                                    </>
                                )}
                                <input type="file" accept=".pdf, image/jpeg, image/png" hidden onChange={e => e.target.files && setFile(e.target.files[0])} disabled={isSaving} />
                            </label>
                        </div>
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleSave} disabled={isSaving || !file}>
                            {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Syncing Ledger...</> : <><Save size={13} /> Commit Payment</>}
                        </button>
                    </div>
                </div>
            </div>
            {statusModal && (
                <>
                    <style dangerouslySetInnerHTML={{ __html: `.stm-overlay { z-index: 999999 !important; }` }} />
                    <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} onClose={statusModal.onClose} />
                </>
            )}
        </>,
        document.body
    );
};



// import React, { useState, useMemo } from "react";
// import { createPortal } from "react-dom";
// import moment from "moment";
// import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
// import { doc, collection, setDoc, serverTimestamp } from "firebase/firestore";
// import { UploadCloud, CheckCircle, Landmark, X, Loader2, Save } from "lucide-react";
// import { db } from "../../../../lib/firebase";

// import type { EnrichedPlacement } from "./CompanyInsightsView";

// // import "../LearnerFormModal/LearnerFormModal.css";
// import "../../LearnerFormModal/LearnerFormModal.css";
// import { StatusModal, type StatusModalProps } from "../../../common/StatusModal/StatusModal";

// interface StipendDisbursementModalProps {
//     placement: EnrichedPlacement;
//     onClose: () => void;
// }

// export const StipendDisbursementModal: React.FC<StipendDisbursementModalProps> = ({
//     placement,
//     onClose
// }) => {
//     const [monthYear, setMonthYear] = useState(moment().format('YYYY-MM'));
//     const [totalEarnings, setTotalEarnings] = useState(Number(placement.stipendAmount) || 0);
//     const [daysExpected, setDaysExpected] = useState(placement.expectedWorkingDaysThisMonth || 21);
//     const [daysApproved, setDaysApproved] = useState(placement.currentMonthApprovedDays || 0);
//     const [bankReference, setBankReference] = useState(`MLAB-${placement.idNumber.slice(-4)}-${moment().format('MMM').toUpperCase()}`);
//     const [payDate, setPayDate] = useState(moment().format('YYYY-MM-DD'));
//     const [file, setFile] = useState<File | null>(null);
//     const [isSaving, setIsSaving] = useState(false);

//     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

//     const netPayment = useMemo(() => {
//         if (daysExpected === 0) return 0;
//         const calc = (daysApproved / daysExpected) * totalEarnings;
//         return Math.round(Math.min(calc, totalEarnings) * 100) / 100;
//     }, [totalEarnings, daysExpected, daysApproved]);

//     const formatCurrency = (val: number) =>
//         new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);

//     const handleSave = async () => {
//         if (!file) {
//             setStatusModal({
//                 type: "warning",
//                 title: "Missing Requirement",
//                 message: "A Proof of Payment document is legally required for SETA compliance.",
//                 onClose: () => setStatusModal(null)
//             });
//             return;
//         }

//         setIsSaving(true);
//         try {
//             const storage = getStorage();
//             const storageRef = ref(storage, `disbursements/${placement.id}/${monthYear}_pop_${Date.now()}.${file.name.split('.').pop()}`);
//             await uploadBytes(storageRef, file);
//             const payslipEftUrl = await getDownloadURL(storageRef);

//             const disbursementRef = doc(collection(db, `placements/${placement.id}/disbursements`), monthYear);

//             await setDoc(disbursementRef, {
//                 monthYear,
//                 employeeIdNumber: placement.idNumber,
//                 totalEarnings,
//                 daysExpected,
//                 daysApproved,
//                 netPayment,
//                 etiClaimed: placement.etiMonthlyValue || 0,
//                 paymentStatus: "Disbursed",
//                 bankReference,
//                 payDate: new Date(payDate).toISOString().split('T')[0],
//                 payslipEftUrl,
//                 loggedAt: serverTimestamp(),
//             });

//             setStatusModal({
//                 type: "success",
//                 title: "Ledger Updated",
//                 message: "Disbursement logged seamlessly onto the unified payroll ledger.",
//                 onClose: () => {
//                     setStatusModal(null);
//                     onClose();
//                 }
//             });
//         } catch (error: any) {
//             console.error("Error saving disbursement:", error);
//             setStatusModal({
//                 type: "error",
//                 title: "Sync Failed",
//                 message: "Failed to save ledger transaction: " + error.message,
//                 onClose: () => setStatusModal(null)
//             });
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     return createPortal(
//         <>
//             {/* 🚀 FIX 2: Stop React Event Bubbling so clicking this doesn't close the parent drawer */}
//             <div
//                 className="lfm-overlay"
//                 onClick={(e) => { e.stopPropagation(); onClose(); }}
//                 style={{ zIndex: 100000 }}
//             >
//                 <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>

//                     <div className="lfm-header">
//                         <h2 className="lfm-header__title">
//                             <Landmark size={18} /> Log Stipend Disbursement
//                         </h2>
//                         <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}>
//                             <X size={20} />
//                         </button>
//                     </div>

//                     <div className="lfm-body">
//                         <div className="lfm-section-hdr">
//                             <Landmark size={13} /> Financial Audit Record
//                         </div>
//                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--mlab-blue)', marginTop: 0, marginBottom: '0.5rem' }}>
//                             Unified Payroll Sync Matrix for <strong>{placement.learnerName}</strong>.
//                         </p>

//                         <div className="lfm-grid" style={{ marginBottom: "0.5rem" }}>
//                             <div className="lfm-fg">
//                                 <label>Disbursement Month *</label>
//                                 <input type="month" className="lfm-input" value={monthYear} onChange={e => setMonthYear(e.target.value)} />
//                             </div>
//                             <div className="lfm-fg">
//                                 <label>Pay Date *</label>
//                                 <input type="date" className="lfm-input" value={payDate} onChange={e => setPayDate(e.target.value)} />
//                             </div>
//                         </div>

//                         <div className="lfm-flags-panel" style={{ padding: "1.25rem 1rem", gap: "0.8rem", marginBottom: "0.5rem" }}>
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                                 <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Total Earnings (Base)</span>
//                                 <input type="number" className="lfm-input" value={totalEarnings} onChange={e => setTotalEarnings(Number(e.target.value))} style={{ width: "120px", textAlign: "right", padding: "0.4rem" }} />
//                             </div>
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                                 <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Expected Days</span>
//                                 <input type="number" className="lfm-input" value={daysExpected} onChange={e => setDaysExpected(Number(e.target.value))} style={{ width: "120px", textAlign: "right", padding: "0.4rem" }} />
//                             </div>
//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--mlab-border)", paddingBottom: "12px" }}>
//                                 <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 700 }}>Approved Logbook Days</span>
//                                 <input type="number" className="lfm-input" value={daysApproved} onChange={e => setDaysApproved(Number(e.target.value))} style={{ width: "120px", textAlign: "right", padding: "0.4rem", background: "var(--mlab-green-bg)", color: "var(--mlab-green-dark)", fontWeight: "bold" }} />
//                             </div>

//                             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
//                                 <span style={{ fontSize: "0.85rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--mlab-blue)", fontWeight: 800 }}>Net Payment (Pro-Rata)</span>
//                                 <span style={{ fontSize: "1.2rem", fontWeight: 800, color: netPayment < totalEarnings ? "var(--mlab-red)" : "var(--mlab-green-dark)" }}>{formatCurrency(netPayment)}</span>
//                             </div>
//                         </div>

//                         <div className="lfm-fg lfm-fg--full" style={{ marginBottom: "0.5rem" }}>
//                             <label>Bank Payment Reference *</label>
//                             <input type="text" className="lfm-input" value={bankReference} onChange={e => setBankReference(e.target.value)} />
//                         </div>

//                         <div className="lfm-fg lfm-fg--full" style={{ marginBottom: "0.5rem" }}>
//                             <label>Official Proof of Payment (PDF/Image) *</label>
//                             <label style={{
//                                 display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
//                                 padding: "2rem 1.5rem", border: "2px dashed var(--mlab-border)",
//                                 background: file ? "var(--mlab-green-bg)" : "var(--mlab-bg)",
//                                 cursor: "pointer", transition: "all 0.2s", textAlign: "center"
//                             }}>
//                                 {file ? (
//                                     <>
//                                         <CheckCircle size={28} color="var(--mlab-green-dark)" style={{ marginBottom: "8px" }} />
//                                         <span style={{ fontFamily: "var(--font-heading)", fontSize: "0.85rem", color: "var(--mlab-green-dark)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{file.name}</span>
//                                     </>
//                                 ) : (
//                                     <>
//                                         <UploadCloud size={28} color="var(--mlab-blue)" style={{ marginBottom: "8px" }} />
//                                         <span style={{ fontFamily: "var(--font-heading)", fontSize: "0.85rem", color: "var(--mlab-blue)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Click to upload bank receipt</span>
//                                         <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--mlab-grey)", marginTop: "8px" }}>Must be an official EFT printout (.pdf, .png, .jpg)</span>
//                                     </>
//                                 )}
//                                 <input type="file" accept=".pdf, image/jpeg, image/png" hidden onChange={e => e.target.files && setFile(e.target.files[0])} disabled={isSaving} />
//                             </label>
//                         </div>
//                     </div>

//                     <div className="lfm-footer">
//                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
//                         <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleSave} disabled={isSaving || !file}>
//                             {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Syncing...</> : <><Save size={13} /> Commit Payment</>}
//                         </button>
//                     </div>
//                 </div>
//             </div>

//             {statusModal && (
//                 <StatusModal
//                     type={statusModal.type}
//                     title={statusModal.title}
//                     message={statusModal.message}
//                     onClose={statusModal.onClose}
//                     onCancel={statusModal.onCancel}
//                     confirmText={statusModal.confirmText}
//                 />
//             )}
//         </>,
//         document.body
//     );
// };