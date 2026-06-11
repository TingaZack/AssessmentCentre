// src/components/admin/WorkplacesManager/BulkStipendUploader.tsx

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, FileSpreadsheet, Download, Info, X, ShieldCheck, Landmark } from "lucide-react";
import * as XLSX from "xlsx";
import moment from "moment";
import { writeBatch, doc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

import type { EnrichedPlacement } from "./CompanyInsightsView";
import { StatusModal, type StatusModalProps } from "../../../common/StatusModal/StatusModal";

// 🚀 IMPORT THE CSS TO INHERIT MLAB MODAL STYLING
import "../../LearnerFormModal/LearnerFormModal.css";

interface BulkStipendUploaderProps {
    placements: EnrichedPlacement[];
    saHolidays: string[];
    onSuccess: () => void;
}

// Reused Logic for Bulk Engine
const getSAWorkingDaysInMonth = (year: number, month: number, holidays: string[]) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;
    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidays.includes(current.format('YYYY-MM-DD'))) days++;
        }
        current.add(1, 'days');
    }
    return days;
};

export const BulkStipendUploader: React.FC<BulkStipendUploaderProps> = ({ placements, saHolidays, onSuccess }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [showExplainer, setShowExplainer] = useState(false);
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // GENERATE AND DOWNLOAD THE SAMPLE TEMPLATE
    const handleDownloadTemplate = () => {
        const templateData = [
            {
                "ID Number": "9901015000000",
                "Date Paid": "2026-06-25",
                "Amount Paid": "4500",
                "Bank Reference": "BULK-JUN26-01",
                "Proof of Payment Link": "https://drive.google.com/file/d/example-link/view"
            },
            {
                "ID Number": "0102025000000",
                "Date Paid": "2026-06-25",
                "Amount Paid": "4500",
                "Bank Reference": "BULK-JUN26-02",
                "Proof of Payment Link": "https://dropbox.com/s/example-link.pdf"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(templateData);

        // Auto-size columns for better UX
        worksheet['!cols'] = [
            { wch: 18 }, // ID Number
            { wch: 15 }, // Date Paid
            { wch: 15 }, // Amount Paid
            { wch: 20 }, // Bank Reference
            { wch: 60 }  // Proof of Payment Link
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk_Upload_Template");
        XLSX.writeFile(workbook, "Bulk_Stipend_Upload_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Parse rows
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];

                if (rows.length === 0) throw new Error("The uploaded spreadsheet is empty.");

                const batch = writeBatch(db);
                let validRecords = 0;
                let missingCount = 0;

                for (const row of rows) {
                    // Fuzzy matching column names to make it incredibly robust against human error
                    const idCol = Object.keys(row).find(k => k.toLowerCase().includes("id") && k.toLowerCase().includes("number"));
                    const amountCol = Object.keys(row).find(k => k.toLowerCase().includes("amount") || k.toLowerCase().includes("paid") || k.toLowerCase().includes("net"));
                    const refCol = Object.keys(row).find(k => k.toLowerCase().includes("ref"));
                    const dateCol = Object.keys(row).find(k => k.toLowerCase().includes("date"));
                    // The Proof of Payment link column
                    const popCol = Object.keys(row).find(k => k.toLowerCase().includes("proof") || k.toLowerCase().includes("link") || k.toLowerCase().includes("url") || k.toLowerCase().includes("pop"));

                    if (!idCol || !amountCol) continue;

                    const idNumber = String(row[idCol]).trim();
                    const rawAmount = Number(String(row[amountCol]).replace(/[^0-9.-]+/g, ""));
                    const bankRef = refCol && row[refCol] ? String(row[refCol]).trim() : `BULK-${idNumber.slice(-4)}`;
                    const popLink = popCol && row[popCol] ? String(row[popCol]).trim() : ""; // Extract the PDF link

                    // Format date or default to today
                    let payDate = moment().format('YYYY-MM-DD');
                    if (dateCol && row[dateCol]) {
                        // Handle Excel serialized dates
                        if (typeof row[dateCol] === 'number') {
                            payDate = moment(new Date(Math.round((row[dateCol] - 25569) * 86400 * 1000))).format('YYYY-MM-DD');
                        } else {
                            payDate = moment(new Date(row[dateCol])).format('YYYY-MM-DD');
                        }
                    }
                    const monthYear = moment(payDate).format('YYYY-MM');

                    // Find placement match
                    const matchedPlacement = placements.find(p => p.idNumber === idNumber);
                    if (!matchedPlacement) {
                        missingCount++;
                        continue;
                    }

                    // Perform compliance logic calculation for the month
                    const [yearStr, monthStr] = monthYear.split('-');
                    const year = parseInt(yearStr, 10);
                    const month = parseInt(monthStr, 10) - 1;
                    const daysExpected = getSAWorkingDaysInMonth(year, month, saHolidays);

                    const disbursementRef = doc(collection(db, `placements/${matchedPlacement.id}/disbursements`), monthYear);

                    batch.set(disbursementRef, {
                        monthYear,
                        employeeIdNumber: matchedPlacement.idNumber,
                        totalEarnings: Number(matchedPlacement.stipendAmount) || rawAmount,
                        daysExpected,
                        daysApproved: matchedPlacement.currentMonthApprovedDays || 0, // Fallback to current memory map
                        netPayment: rawAmount,
                        etiClaimed: matchedPlacement.etiMonthlyValue || 0,
                        paymentStatus: "Disbursed",
                        bankReference: bankRef,
                        payDate,
                        payslipEftUrl: popLink,
                        loggedAt: serverTimestamp(),
                        uploadMethod: "Bulk Excel Sync"
                    }, { merge: true });

                    validRecords++;
                }

                if (validRecords > 0) {
                    await batch.commit();
                    setStatusModal({
                        type: "success",
                        title: "Bulk Import Complete",
                        message: `Successfully mapped and committed ${validRecords} payment records to the ledger. ${missingCount > 0 ? `\nNote: ${missingCount} rows were skipped because the ID numbers did not match any active learners.` : ""}`,
                        onClose: () => { setStatusModal(null); onSuccess(); }
                    });
                } else {
                    setStatusModal({
                        type: "warning",
                        title: "Import Failed",
                        message: "Could not find any matching learners. Please ensure the column header says 'ID Number'.",
                        onClose: () => setStatusModal(null)
                    });
                }

            } catch (err: any) {
                setStatusModal({ type: "error", title: "Import Error", message: err.message, onClose: () => setStatusModal(null) });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };

        reader.readAsArrayBuffer(file);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />

            {/* The Main Bulk Upload Button Group */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px" }}>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="cdp-btn cdp-btn--outline"
                    style={{
                        background: "#f0fdf4", border: "1px solid #16a34a", color: "#16a34a",
                        fontSize: "0.8rem", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px",
                        cursor: isUploading ? "not-allowed" : "pointer", justifyContent: "center"
                    }}
                >
                    {isUploading ? <Loader2 size={14} className="wm-spin" /> : <FileSpreadsheet size={14} />}
                    {isUploading ? "Syncing..." : "Bulk Excel Upload"}
                </button>

                {/* Info Button to trigger Explainer */}
                <button
                    type="button"
                    onClick={() => setShowExplainer(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", padding: "4px" }}
                    title="How does Bulk Upload work?"
                >
                    <Info size={16} />
                </button>

                {/* The Download Template Link */}
                <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    style={{
                        background: "none", border: "none", color: "var(--mlab-blue)", fontSize: "0.7rem", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", gap: "4px", textDecoration: "underline", marginLeft: "4px"
                    }}
                >
                    <Download size={12} /> Download sample template
                </button>
            </div>

            {/* 🚀 STYLED MLAB EXPLAINER MODAL */}
            {showExplainer && createPortal(
                <div className="lfm-overlay" onClick={() => setShowExplainer(false)} style={{ zIndex: 100000 }}>
                    <div className="lfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>

                        <div className="lfm-header">
                            <h2 className="lfm-header__title">
                                <ShieldCheck size={18} /> Bulk Payroll Sync Engine
                            </h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowExplainer(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="lfm-body">
                            <div style={{ fontSize: "0.85rem", color: "var(--mlab-blue)", lineHeight: 1.6 }}>
                                <p style={{ margin: "0 0 10px 0" }}>
                                    The <strong>Bulk Excel Upload</strong> tool is designed to save payroll administrators hours of manual data entry while ensuring absolute mathematical compliance for audits.
                                </p>
                                <p style={{ margin: 0 }}>
                                    By uploading your monthly stipends via spreadsheet, the engine automatically maps each payment to the learner's <strong>approved logbook hours</strong>. This creates an unshakeable, auto-calculated <em>Pro-Rata</em> compliance ledger required to securely claim <strong>SARS ETI Rebates</strong> and <strong>Section 12H Allowances</strong>.
                                </p>
                            </div>

                            <div>
                                <div className="lfm-section-hdr">
                                    <Landmark size={13} /> Required Spreadsheet Columns
                                </div>
                                <div style={{ background: "var(--mlab-white)", border: "1px solid var(--mlab-border)", padding: "1rem" }}>
                                    <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "var(--mlab-blue)", display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <li><strong>ID Number:</strong> The exact 13-digit SA ID to map the payment to the learner.</li>
                                        <li><strong>Date Paid:</strong> Used to determine the target month (e.g., <code>2026-06-25</code>).</li>
                                        <li><strong>Amount Paid:</strong> The actual Net Stipend deposited into the learner's account.</li>
                                        <li><strong>Bank Reference:</strong> Optional. The EFT tracker (e.g., <code>BULK-JUN-01</code>).</li>
                                        <li><strong>Proof of Payment Link:</strong> A secure cloud link (Google Drive, OneDrive, etc.) to the digital PDF receipt. <em>This will be injected into their final SETA Audit Pack!</em></li>
                                    </ul>
                                </div>
                            </div>

                            <div className="lfm-flags-panel">
                                <label className="lfm-checkbox-row" style={{ alignItems: "flex-start" }}>
                                    <Info size={16} color="var(--mlab-green-dark)" style={{ marginTop: "2px" }} />
                                    <span style={{ fontSize: "0.8rem", color: "var(--mlab-blue)", lineHeight: 1.5 }}>
                                        <strong style={{ color: "var(--mlab-green-dark)" }}>Pro Tip:</strong> Click <em>"Download sample template"</em> to get a pre-formatted Excel file. You can safely paste your data directly into it without worrying about exact header spellings.
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="lfm-footer">
                            <button type="button" onClick={() => setShowExplainer(false)} className="lfm-btn lfm-btn--primary">
                                Acknowledge & Close
                            </button>
                        </div>

                    </div>
                </div>,
                document.body
            )}

            {statusModal && (
                <>
                    <style dangerouslySetInnerHTML={{ __html: `.stm-overlay { z-index: 999999 !important; }` }} />
                    <StatusModal {...statusModal} />
                </>
            )}
        </div>
    );
};