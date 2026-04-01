// src/components/admin/BulkResultsImportModal.tsx

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
    X, UploadCloud, Loader2, CheckCircle2, Layers, Save, FileSpreadsheet,
    Plus
} from "lucide-react";
import type { DashboardLearner, Cohort, ProgrammeTemplate } from "../../../types";
import { generateSorId } from "../../../pages/utils/validation";

interface BulkResultsImportModalProps {
    existingLearners: DashboardLearner[];
    cohorts: Cohort[];
    programmes: ProgrammeTemplate[];
    onClose: () => void;
    onSaveAll: (parsedLearners: any[]) => Promise<void>;
}

const GLOBAL_SDP_CODE = import.meta.env.VITE_SDP_CODE || "SDP070824115131";

const parseLocalToSA = (dStr: string | null | undefined): string => {
    if (!dStr) return "";
    const str = String(dStr).trim();
    const parts = str.split("-");
    if (parts.length === 3 && parts[2].length === 4) return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${d.getFullYear()}`;
};

const normalizeStatus = (status?: string) => {
    if (!status) return "Not Started";
    const s = status.toLowerCase().trim();
    if (s === "competent" || s === "pass" || s === "c") return "Competent";
    if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") return "Not Yet Competent";
    if (s === "not started") return "Not Started";
    return "In Progress";
};

export const BulkResultsImportModal: React.FC<BulkResultsImportModalProps> = ({
    existingLearners, cohorts, programmes, onClose, onSaveAll
}) => {
    const [step, setStep] = useState<"upload" | "processing" | "review" | "saving" | "complete">("upload");
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [errorMsg, setErrorMessage] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing");
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const extractedLearners: any[] = [];

                // LOOP THROUGH ALL SHEETS IN THE EXCEL WORKBOOK
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as string[][];

                    // Check if this sheet actually looks like a learner result sheet
                    const isLearnerSheet = rows.some(r => String(r[0] || "").toLowerCase().includes("id number"));
                    if (!isLearnerSheet) return; // Skip instruction tabs

                    const parsed = parseSingleSheet(rows, sheetName);
                    if (parsed && parsed.idNumber) {
                        extractedLearners.push(parsed);
                    }
                });

                if (extractedLearners.length === 0) {
                    setErrorMessage("No valid learner data found in any of the sheets.");
                    setStep("upload");
                    return;
                }

                setParsedData(extractedLearners);
                setStep("review");
            } catch (err: any) {
                console.error(err);
                setErrorMessage("Could not parse the file. Please ensure it is a valid QCTO template.");
                setStep("upload");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const parseSingleSheet = (rows: string[][], sheetName: string) => {
        let fullName = "", qualName = "", nqfLevel = 0, saqaId = "", totalCredits = 0;
        let idNumber = "", emailAddress = "", phoneNumber = "", startDateStr = "", completionDateStr = "", issueDateStr = "";
        let importedCohortName = "", importedSdpCode = GLOBAL_SDP_CODE;
        const knowledgeModules: any[] = [], practicalModules: any[] = [], workExperienceModules: any[] = [];
        let currentSection = "K", isModuleSection = false;

        rows.forEach((cols) => {
            if (!cols || cols.length === 0 || (cols.length === 1 && cols[0] === "")) return;
            const col0 = String(cols[0] || "").trim();
            const col1 = String(cols[1] || "").trim();
            const col0Lower = col0.toLowerCase();

            if (!isModuleSection) {
                if (col0Lower.includes("qualification title")) qualName = String(cols[1] || "").trim();
                else if (col0Lower.includes("nqf level")) nqfLevel = parseInt(cols[1]) || 0;
                else if (col0Lower.includes("saqa qual id")) saqaId = String(cols[1] || "").trim();
                else if (col0Lower.includes("credits")) totalCredits = parseInt(cols[1]) || 0;
                // Safely catches "Leaner Name" typo in CSV
                else if (col0Lower.includes("name") && (col0Lower.includes("learner") || col0Lower.includes("leaner"))) fullName = String(cols[1] || "").trim();
                else if (col0Lower.includes("id number")) idNumber = String(cols[1] || "").trim();
                else if (col0Lower.includes("email address")) emailAddress = String(cols[1] || "").trim();
                else if (col0Lower.includes("phone number")) phoneNumber = String(cols[1] || "").trim();
                else if (col0Lower.includes("start date")) startDateStr = parseLocalToSA(cols[1]);
                else if (col0Lower.includes("completion date")) completionDateStr = parseLocalToSA(cols[1]);
                else if (col0Lower.includes("issue date")) issueDateStr = parseLocalToSA(cols[1]);
                else if (col0Lower.includes("cohort")) importedCohortName = String(cols[1] || "").trim();
                else if (col0Lower.includes("sdp code") || col0Lower.includes("provider code")) importedSdpCode = String(cols[1] || "").trim() || GLOBAL_SDP_CODE;

                if ((col0Lower === "modules" || col0Lower === "") && col1.toLowerCase() === "module name") {
                    isModuleSection = true; return;
                }
            }

            if (isModuleSection) {
                if (col0Lower.includes("knowledge") || col0Lower.includes("knowlege")) currentSection = "K";
                else if (col0Lower.includes("practical") || col0Lower.includes("skills")) currentSection = "P";
                else if (col0Lower.includes("work") || col0Lower.includes("experience")) currentSection = "W";

                if (col1 && col1.toLowerCase() !== "module name") {
                    const modCode = String(cols[2] || "").trim();
                    let status = normalizeStatus(String(cols[8] || cols[7] || ""));

                    const mod = {
                        name: col1.replace(/\n|\r/g, " ").trim(), code: modCode, nqfLevel: parseInt(cols[3]) || nqfLevel || 5,
                        credits: parseInt(cols[4]) || 0, notionalHours: (parseInt(cols[4]) || 0) * 10, status: status,
                        dateAssessed: issueDateStr, dateSignedOff: issueDateStr, isTemplateLocked: false,
                    };

                    let targetSection = currentSection;
                    if (modCode.toUpperCase().startsWith("KM")) targetSection = "K";
                    else if (modCode.toUpperCase().startsWith("PM")) targetSection = "P";
                    else if (modCode.toUpperCase().startsWith("WM") || modCode.toUpperCase().startsWith("WE")) targetSection = "W";

                    if (targetSection === "K") knowledgeModules.push(mod);
                    else if (targetSection === "P") practicalModules.push(mod);
                    else workExperienceModules.push(mod);
                }
            }
        });

        // Cross-reference with existing learners
        const existingMatch = existingLearners.find(l => l.idNumber === idNumber);

        let fName = "", lName = "";
        if (fullName) {
            const parts = fullName.trim().split(" ");
            fName = parts[0] || ""; lName = parts.slice(1).join(" ") || "";
        }

        const matchedCohort = importedCohortName ? cohorts.find(c => c.name.toLowerCase().trim() === importedCohortName.toLowerCase().trim()) : null;

        return {
            isUpdate: !!existingMatch,
            existingId: existingMatch?.id || null,
            sheetName,
            fullName: fullName || existingMatch?.fullName || "Unknown Learner",
            firstName: fName || existingMatch?.firstName || "",
            lastName: lName || existingMatch?.lastName || "",
            idNumber: idNumber || existingMatch?.idNumber || "",
            email: emailAddress || existingMatch?.email || "",
            mobile: phoneNumber || existingMatch?.mobile || "",
            trainingStartDate: startDateStr || existingMatch?.trainingStartDate || "",
            trainingEndDate: completionDateStr || existingMatch?.trainingEndDate || "",
            cohortId: matchedCohort?.id || existingMatch?.cohortId || "Unassigned",
            campusId: existingMatch?.campusId || "",
            isOffline: true,
            issueDate: issueDateStr || parseLocalToSA(new Date().toISOString()),
            verificationCode: existingMatch?.verificationCode || generateSorId(fullName || "Unknown", issueDateStr || parseLocalToSA(new Date().toISOString()), importedSdpCode),
            qualification: {
                name: qualName || existingMatch?.qualification?.name || "",
                saqaId: saqaId || existingMatch?.qualification?.saqaId || "",
                nqfLevel: nqfLevel || existingMatch?.qualification?.nqfLevel || 0,
                credits: totalCredits || existingMatch?.qualification?.credits || 0,
                totalNotionalHours: (totalCredits || 0) * 10,
                dateAssessed: issueDateStr || existingMatch?.qualification?.dateAssessed || ""
            },
            demographics: {
                ...(existingMatch?.demographics || {}),
                sdpCode: importedSdpCode,
                expectedTrainingCompletionDate: completionDateStr || existingMatch?.demographics?.expectedTrainingCompletionDate || ""
            },
            knowledgeModules, practicalModules, workExperienceModules
        };
    };

    const executeSaveAll = async () => {
        setStep("saving");
        try {
            await onSaveAll(parsedData);
            setStep("complete");
        } catch (error) {
            console.error("Save All Error:", error);
            setErrorMessage("An error occurred while saving the results.");
            setStep("review");
        }
    };

    const activeLearner = parsedData[selectedIndex];

    return (
        <div className="mlab-modal-overlay" style={{ zIndex: 1000 }}>
            <div className="mlab-modal mlab-modal--lg animate-fade-in" style={{ width: step === "review" ? '90vw' : '500px', maxWidth: step === "review" ? '1200px' : '500px', transition: 'all 0.3s ease', background: 'whitesmoke' }}>
                <div className="mlab-modal__header" style={{ borderBottom: '2px solid var(--mlab-light-blue)' }}>
                    <div className="mlab-modal__title-group">
                        <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '6px', color: 'var(--mlab-blue)' }}>
                            <FileSpreadsheet size={22} />
                        </div>
                        <div style={{ marginLeft: '12px' }}>
                            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
                                Bulk Results Importer
                            </h2>
                            {step === "review" && <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>REVIEWING {parsedData.length} LEARNERS</span>}
                        </div>
                    </div>
                    <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing" || step === "saving"}><X size={20} /></button>
                </div>

                <div className="mlab-modal__body" style={{ padding: step === "review" ? '0' : '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>

                    {step === "upload" && (
                        <div style={{ textAlign: 'center' }}>
                            {errorMsg && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>{errorMsg}</div>}
                            <p style={{ color: 'var(--mlab-grey)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                Upload a multi-sheet Excel file. The system will extract every learner from every tab automatically.
                            </p>
                            <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{ border: '2px dashed var(--mlab-blue)', borderRadius: '12px', padding: '3rem', cursor: 'pointer', background: '#f8fafc' }}
                            >
                                <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem' }} />
                                <h4>Click to Upload Master Spreadsheet</h4>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Supports .xlsx and .csv</span>
                            </div>
                        </div>
                    )}

                    {(step === "processing" || step === "saving") && (
                        <div style={{ textAlign: "center", padding: "4rem 0" }}>
                            <Loader2 className="spin" size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ color: 'var(--mlab-blue)' }}>{step === "processing" ? "Scanning Sheets..." : "Saving Records to Database..."}</h3>
                            <p style={{ color: 'var(--mlab-grey)' }}>Please do not close this window.</p>
                        </div>
                    )}

                    {step === "review" && (
                        <div style={{ display: 'flex', height: '65vh' }}>
                            {/* SIDEBAR */}
                            <div style={{ width: '300px', borderRight: '1px solid var(--mlab-border)', background: '#f8fafc', overflowY: 'auto' }}>
                                <div style={{ padding: '12px 16px', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', position: 'sticky', top: 0, fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                    FOUND IN SPREADSHEET
                                </div>
                                {parsedData.map((l, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedIndex(idx)}
                                        style={{
                                            padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #e2e8f0',
                                            background: selectedIndex === idx ? 'var(--mlab-light-blue)' : 'transparent',
                                            borderLeft: selectedIndex === idx ? '4px solid var(--mlab-blue)' : '4px solid transparent'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>{l.fullName}</span>
                                            {/* 🚀 FIXED TS ERROR: Wrapped icons in a span with a title attribute */}
                                            {l.isUpdate ? (
                                                <span title="Existing Learner Found" style={{ display: 'flex' }}>
                                                    <CheckCircle2 size={14} color="var(--mlab-green)" />
                                                </span>
                                            ) : (
                                                <span title="New Offline Learner" style={{ display: 'flex' }}>
                                                    <Plus size={14} color="#f59e0b" />
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>ID: {l.idNumber}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', fontStyle: 'italic' }}>Tab: {l.sheetName}</div>
                                    </div>
                                ))}
                            </div>

                            {/* MAIN STAGE */}
                            <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--mlab-border)' }}>
                                    <div>
                                        <h2 style={{ margin: '0 0 4px', color: 'var(--mlab-blue)' }}>{activeLearner.fullName}</h2>
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                            <span><strong>ID:</strong> {activeLearner.idNumber}</span>
                                            <span><strong>SAQA:</strong> {activeLearner.qualification.saqaId}</span>
                                            <span><strong>Status:</strong> {activeLearner.isUpdate ? "Updating Existing Profile" : "Creating New Offline Profile"}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{activeLearner.qualification.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Modules: {activeLearner.knowledgeModules.length + activeLearner.practicalModules.length + activeLearner.workExperienceModules.length}</div>
                                    </div>
                                </div>

                                {/* Quick Preview of Modules */}
                                <h4 style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={14} /> Extracted Module Results</h4>
                                <table className="mlab-table" style={{ border: '1px solid var(--mlab-border)', borderRadius: '8px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th>Type</th>
                                            <th>Code</th>
                                            <th>Module Name</th>
                                            <th>Achievement</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ...activeLearner.knowledgeModules.map((m: any) => ({ ...m, t: 'Knowledge' })),
                                            ...activeLearner.practicalModules.map((m: any) => ({ ...m, t: 'Practical' })),
                                            ...activeLearner.workExperienceModules.map((m: any) => ({ ...m, t: 'Workplace' }))
                                        ].map((mod: any, i: number) => (
                                            <tr key={i}>
                                                <td style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{mod.t}</td>
                                                <td style={{ fontSize: '0.8rem' }}>{mod.code}</td>
                                                <td style={{ fontSize: '0.8rem' }}>{mod.name}</td>
                                                <td>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                                                        background: mod.status === 'Competent' ? '#dcfce7' : mod.status === 'Not Yet Competent' ? '#fee2e2' : '#fef9c3',
                                                        color: mod.status === 'Competent' ? '#166534' : mod.status === 'Not Yet Competent' ? '#991b1b' : '#854d0e'
                                                    }}>
                                                        {mod.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === "complete" && (
                        <div style={{ textAlign: "center", padding: "3rem 0" }}>
                            <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 style={{ color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Import Successful</h3>
                            <p style={{ color: 'var(--mlab-grey)' }}>{parsedData.length} learner records have been successfully updated/created.</p>
                            <button className="mlab-btn mlab-btn--green" style={{ marginTop: '1rem' }} onClick={onClose}>Return to Dashboard</button>
                        </div>
                    )}
                </div>

                {step === "review" && (
                    <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)', borderTop: '1px solid var(--mlab-border)', display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Please verify the extracted data before saving.</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="mlab-btn mlab-btn--ghost" onClick={() => setStep("upload")}>Cancel & Re-upload</button>
                            <button className="mlab-btn mlab-btn--primary" onClick={executeSaveAll}><Save size={14} /> Save All {parsedData.length} Learners</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};