// src/components/admin/LearnerImportModal.tsx

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
    UploadCloud,
    X,
    Loader2,
    CheckCircle2,
    BookOpen,
    FileSpreadsheet,
    Terminal,
    AlertCircle,
    Info
} from "lucide-react";
import { writeBatch, doc } from "firebase/firestore";
import { useStore } from "../../store/useStore";
import type { DashboardLearner, LearnerDemographics } from "../../types";
import { db } from "../../lib/firebase";
import { generateSorId } from "../../pages/utils/validation";

import '../views/LearnersView/LearnersView.css'

interface LearnerImportModalProps {
    cohortId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
    cohortId,
    onClose,
    onSuccess,
}) => {
    const { cohorts } = useStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

    const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

    /**
     * ── HELPERS ──────────────────────────────────────────────────────────
     */

    const parseQCTODate = (val: any): string => {
        const str = String(val || "").trim();
        if (!str) return "";

        if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
            const y = str.substring(0, 4);
            const m = str.substring(4, 6);
            const d = str.substring(6, 8);
            return `${d}-${m}-${y}`;
        }

        if (str.includes("-") && str.split("-")[0].length === 4) {
            const [y, m, d] = str.split("-");
            return `${d}-${m}-${y}`;
        }

        if (str.includes("/")) {
            const parts = str.split("/");
            if (parts[2].length === 4) {
                return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
            }
        }

        return str;
    };

    const getTodaySA = (): string => {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };

    /**
     * ── DRAG & DROP HANDLERS ─────────────────────────────────────────────
     */
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFile = e.dataTransfer.files[0];
            const validTypes = [
                "text/csv",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-excel"
            ];

            if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
                alert("Invalid file type. Please drop a .csv or .xlsx file.");
                return;
            }
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(droppedFile);
                fileInputRef.current.files = dataTransfer.files;
                const event = new Event("change", { bubbles: true });
                fileInputRef.current.dispatchEvent(event);
            }
        }
    };

    /**
     * ── CORE PROCESSING LOGIC (EXCEL / LEISA BULK FORMAT) ───────────────
     */
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing");
        setDebugLog([]);
        addToLog(`🚀 Initializing Bulk LEISA Import: ${file.name}`);

        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                let targetSheetName = workbook.SheetNames[0];
                let foundHeader = false;

                if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
                    targetSheetName = "Learner Enrolment and EISA";
                    addToLog(`📁 Found QCTO Data Sheet. Skipping Instructions...`);
                } else {
                    for (const sheetName of workbook.SheetNames) {
                        const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
                        for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
                            const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/\s/g, ''));
                            if (headers.includes("nationalid") || headers.includes("learneralternateid")) {
                                targetSheetName = sheetName;
                                foundHeader = true;
                                break;
                            }
                        }
                        if (foundHeader) break;
                    }
                }

                addToLog(`📖 Reading data from sheet: "${targetSheetName}"`);
                const worksheet = workbook.Sheets[targetSheetName];

                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

                if (rows.length === 0) {
                    addToLog(`❌ Error: No data found in sheet "${targetSheetName}".`);
                    setStep("upload");
                    return;
                }

                const firstRowKeys = Object.keys(rows[0]).map(k => k.toLowerCase().replace(/\s/g, ''));
                if (!firstRowKeys.includes("nationalid") && !firstRowKeys.includes("learneralternateid")) {
                    addToLog(`❌ Error: Header "National Id" not found. Please ensure headers match standard LEISA layout.`);
                    setStep("upload");
                    return;
                }

                const learnersMap = new Map<string, DashboardLearner>();
                const todaySA = getTodaySA();

                rows.forEach((row, index) => {
                    const getVal = (key: string) => {
                        const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
                        return exactKey ? String(row[exactKey] || "").trim() : "";
                    };

                    const idNumber = getVal("nationalid");
                    const firstName = getVal("learnerfirstname");
                    const lastName = getVal("learnerlastname");
                    const fullName = `${firstName} ${lastName}`.trim();

                    // ID Number is the only strict requirement to create a unique Staging record
                    if (!idNumber || idNumber === "undefined") {
                        addToLog(`⚠️ Row ${index + 2}: Skipped (Missing National ID)`);
                        return;
                    }

                    const issueDateRaw = getVal("statementofresultsissuedate");
                    const issueDateSA = parseQCTODate(issueDateRaw);
                    const sdpCode = getVal("sdpcode"); // 🚀 STRICTLY WHAT IS IN THE SHEET

                    const newLearner: DashboardLearner = {
                        id: idNumber,
                        learnerId: idNumber,
                        enrollmentId: idNumber,
                        firstName,
                        lastName,
                        fullName,
                        status: "active",
                        isDraft: true,
                        authStatus: "pending",
                        isArchived: false,
                        idNumber,
                        email: getVal("learneremailaddress"),
                        phone: getVal("learnercellphonenumber"),
                        mobile: getVal("learnercellphonenumber"),
                        dateOfBirth: parseQCTODate(getVal("learnerbirthdate")),
                        cohortId: selectedCohortId || "Unassigned",
                        trainingStartDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
                        createdAt: new Date().toISOString(),
                        createdBy: "bulk-import",
                        qualification: {
                            name: getVal("qualificationtitle"), // 🚀 STRICT
                            saqaId: getVal("qualificationid"),
                            credits: 0,
                            totalNotionalHours: 0,
                            nqfLevel: 0,
                            dateAssessed: issueDateSA,
                        },
                        knowledgeModules: [],
                        practicalModules: [],
                        workExperienceModules: [],
                        eisaAdmission: getVal("statementofresultsstatus") === "01",
                        // Fallback purely for internal system unique ID generation if missing
                        verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
                        issueDate: issueDateSA,
                        demographics: {
                            // 🚀 ALL DEFAULTS REMOVED: STRICT SPREADSHEET MAPPING
                            sdpCode,
                            learnerTitle: getVal("learnertitle"),
                            learnerMiddleName: getVal("learnermiddlename"),
                            genderCode: getVal("gendercode"),
                            equityCode: getVal("equitycode"),
                            homeLanguageCode: getVal("homelanguagecode"),
                            citizenResidentStatusCode: getVal("citizenresidentstatuscode"),
                            nationalityCode: getVal("nationalitycode"),
                            immigrantStatus: getVal("immigrantstatus"),
                            alternativeIdType: getVal("alternativeidtype"),
                            socioeconomicStatusCode: getVal("socioeconomicstatuscode"),
                            disabilityStatusCode: getVal("disabilitystatuscode"),
                            disabilityRating: getVal("disabilityrating"),
                            provinceCode: getVal("provincecode"),
                            statsaaAreaCode: getVal("statssaareacode"),
                            flc: getVal("flc"),
                            flcStatementOfResultNumber: getVal("flcstatementofresultnumber"),
                            statementOfResultsStatus: getVal("statementofresultsstatus"),
                            statementOfResultsIssueDate: issueDateSA,
                            learnerReadinessForEISATypeId: getVal("learnerreadinessforeisatypeid"),
                            assessmentCentreCode: getVal("assessmentcentrecode"),
                            popiActAgree: getVal("popiactagree"),
                            popiActDate: parseQCTODate(getVal("popiactdate")),
                            expectedTrainingCompletionDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
                            learnerHomeAddress1: getVal("learnerhomeaddress1"),
                            learnerHomeAddress2: getVal("learnerhomeaddress2"),
                            learnerHomeAddress3: getVal("learnerhomeaddress3"),
                            learnerPostalAddress1: getVal("learnerpostaladdress1"),
                            learnerPostalAddress2: getVal("learnerpostaladdress2"),
                            learnerPostalAddressPostCode: getVal("learnerpostaladdresspostcode")
                        } as LearnerDemographics
                    };

                    learnersMap.set(idNumber, newLearner);
                    addToLog(`✅ Mapped: ${fullName || idNumber}`);
                });

                if (learnersMap.size > 0) {
                    await saveToStaging(learnersMap);
                } else {
                    addToLog("❌ No valid learners found to import.");
                    setStep("upload");
                }

            } catch (err: any) {
                addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
                setStep("upload");
            }
        };

        reader.onerror = () => {
            addToLog(`❌ ERROR: Could not read file.`);
            setStep("upload");
        };

        reader.readAsArrayBuffer(file);
    };

    const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
        addToLog(`💾 Committing ${dataMap.size} records to Staging Vault...`);
        try {
            const batch = writeBatch(db);
            dataMap.forEach((learner) => {
                const ref = doc(db, "staging_learners", learner.id);
                batch.set(ref, learner);
            });
            await batch.commit();
            addToLog(`✅ SUCCESS: Bulk import ready for review.`);
            setStep("complete");
            setTimeout(() => onSuccess(), 2500);
        } catch (error: any) {
            addToLog(`❌ DATABASE ERROR: ${error.message}`);
            setStep("upload");
        }
    };

    const EXPECTED_COLUMNS = [
        "National Id (*)",
        "Learner First Name",
        "Learner Last Name",
        "Qualification Title",
        "Statement of Results Issue Date",
        "FLC Statement of result number"
    ];

    return (
        <div className="mlab-modal-overlay">
            {/* <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px' }}> */}
            <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px', background: 'whitesmoke' }}>

                {/* ── HEADER ── */}
                <div className="mlab-modal__header" style={{ borderBottom: '2px solid var(--mlab-light-blue)' }}>
                    <div className="mlab-modal__title-group">
                        <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '6px', color: 'var(--mlab-blue)' }}>
                            <FileSpreadsheet size={22} />
                        </div>
                        <div style={{ marginLeft: '12px' }}>
                            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
                                Bulk LEISA Import
                            </h2>
                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>EXCEL & CSV SUPPORTED</span>
                        </div>
                    </div>
                    <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
                        <X size={20} />
                    </button>
                </div>

                {/* ── BODY ── */}
                <div className="mlab-modal__body" style={{ padding: '1.5rem' }}>
                    {step === "upload" && (
                        <>
                            <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '12px 16px', marginBottom: '1.5rem', borderRadius: '0 4px 4px 0' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.5 }}>
                                    Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>) using the standard LEISA headers. All learners will be mapped and sent to the <strong>Staging Area</strong>. Empty fields will be strictly preserved as blank.
                                </p>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{
                                    fontFamily: 'var(--font-heading)',
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    color: 'var(--mlab-grey)',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '8px'
                                }}>
                                    <Info size={14} color="var(--mlab-blue)" /> Expected Columns
                                </label>
                                <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '10px' }}>
                                    The system maps standard LEISA headers (spaces are ignored). Key columns include:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {EXPECTED_COLUMNS.map(col => (
                                        <span key={col} style={{
                                            background: '#f1f5f9',
                                            color: '#334155',
                                            border: '1px solid #cbd5e1',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {col}
                                        </span>
                                    ))}
                                    <span style={{ color: '#64748b', padding: '4px 8px', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                        + other LEISA fields...
                                    </span>
                                </div>
                            </div>

                            <div className="lfm-fg" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--mlab-grey)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                    <BookOpen size={14} color="var(--mlab-blue)" /> Target Cohort
                                </label>
                                <select
                                    value={selectedCohortId}
                                    onChange={(e) => setSelectedCohortId(e.target.value)}
                                    className="lfm-input lfm-select"
                                    style={{ margin: 0 }}
                                >
                                    <option value="">-- DEFAULT: DRAFT/UNASSIGNED --</option>
                                    {cohorts.filter((c) => !c.isArchived).map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div
                                className="mlab-import-dropzone"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: '2px dashed var(--mlab-border)',
                                    borderRadius: '12px',
                                    padding: '3.5rem 2rem',
                                    textAlign: 'center',
                                    backgroundColor: 'var(--mlab-bg)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
                                <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
                                <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 8px' }}>
                                    Drop Bulk Spreadsheet Here
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: 0 }}>
                                    Supports <strong>.xlsx</strong> and <strong>.csv</strong> files.
                                </p>
                            </div>
                        </>
                    )}

                    {step === "processing" && (
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
                                <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
                                <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, textTransform: 'uppercase' }}>
                                    Mapping Data Fields...
                                </h4>
                            </div>
                            <div style={{
                                background: "#051e26",
                                color: "#94c73d",
                                padding: "1.25rem",
                                borderRadius: "8px",
                                fontFamily: "'Courier New', Courier, monospace",
                                fontSize: "0.8rem",
                                height: "220px",
                                overflowY: "auto",
                                border: '1px solid #0a2d38'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b8a34', marginBottom: '10px', borderBottom: '1px solid #0a2d38', paddingBottom: '6px' }}>
                                    <Terminal size={14} /> <span>BULK_MAPPING_ENGINE_v4.0</span>
                                </div>
                                {debugLog.map((log, i) => (
                                    <div key={i} style={{ marginBottom: "4px" }}>
                                        <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === "complete" && (
                        <div style={{ textAlign: "center", padding: "2rem 0" }}>
                            <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                Import Successful
                            </h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: '0.5rem 0 1.5rem' }}>
                                Learners have been successfully staged for approval.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
                    {step === "upload" ? (
                        <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                    ) : step === "complete" ? (
                        <button className="mlab-btn mlab-btn--green" style={{ width: '100%' }} onClick={onSuccess}>
                            Go to Staging Area
                        </button>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
                            <AlertCircle size={14} /> SECURITY: DATABASE TRANSACTION IN PROGRESS
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// import React, { useState, useRef } from "react";
// import * as XLSX from "xlsx";
// import {
//     UploadCloud,
//     X,
//     Loader2,
//     CheckCircle2,
//     BookOpen,
//     FileSpreadsheet,
//     Terminal,
//     AlertCircle,
//     Info // 🚀 Added Info icon
// } from "lucide-react";
// import { writeBatch, doc } from "firebase/firestore";
// import { useStore } from "../../store/useStore";
// import type { DashboardLearner, LearnerDemographics } from "../../types";
// import { db } from "../../lib/firebase";
// import { generateSorId } from "../../pages/utils/validation";

// import '../views/LearnersView/LearnersView.css'

// interface LearnerImportModalProps {
//     cohortId?: string;
//     onClose: () => void;
//     onSuccess: () => void;
// }

// export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
//     cohortId,
//     onClose,
//     onSuccess,
// }) => {
//     const { cohorts } = useStore();

//     const fileInputRef = useRef<HTMLInputElement>(null);
//     const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
//     const [debugLog, setDebugLog] = useState<string[]>([]);
//     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

//     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

//     /**
//      * ── HELPERS ──────────────────────────────────────────────────────────
//      */

//     // Parse QCTO Date Formats (YYYYMMDD or YYYY-MM-DD or DD-MM-YYYY or Excel Date)
//     const parseQCTODate = (val: any): string => {
//         const str = String(val || "").trim();
//         if (!str) return "";

//         // Handle YYYYMMDD (QCTO Standard)
//         if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
//             const y = str.substring(0, 4);
//             const m = str.substring(4, 6);
//             const d = str.substring(6, 8);
//             return `${d}-${m}-${y}`;
//         }

//         // Handle ISO/HTML (YYYY-MM-DD)
//         if (str.includes("-") && str.split("-")[0].length === 4) {
//             const [y, m, d] = str.split("-");
//             return `${d}-${m}-${y}`;
//         }

//         // Handle Excel slashes (DD/MM/YYYY or MM/DD/YYYY depending on locale)
//         if (str.includes("/")) {
//             const parts = str.split("/");
//             if (parts[2].length === 4) {
//                 // Assuming DD/MM/YYYY
//                 return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
//             }
//         }

//         return str; // Return as is if already SA format or unknown
//     };

//     const handleDragOver = (e: React.DragEvent) => {
//         e.preventDefault();
//         e.stopPropagation();
//     };

//     const handleDrop = (e: React.DragEvent) => {
//         e.preventDefault();
//         e.stopPropagation();
//         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
//             const droppedFile = e.dataTransfer.files[0];
//             const validTypes = [
//                 "text/csv",
//                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//                 "application/vnd.ms-excel"
//             ];

//             if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
//                 alert("Invalid file type. Please drop a .csv or .xlsx file.");
//                 return;
//             }
//             if (fileInputRef.current) {
//                 const dataTransfer = new DataTransfer();
//                 dataTransfer.items.add(droppedFile);
//                 fileInputRef.current.files = dataTransfer.files;
//                 const event = new Event("change", { bubbles: true });
//                 fileInputRef.current.dispatchEvent(event);
//             }
//         }
//     };

//     /**
//      * ── CORE PROCESSING LOGIC (EXCEL / LEISA BULK FORMAT) ───────────────
//      */
//     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         setStep("processing");
//         setDebugLog([]);
//         addToLog(`🚀 Initializing Bulk LEISA Import: ${file.name}`);

//         const reader = new FileReader();

//         reader.onload = async (event) => {
//             try {
//                 // Read file as ArrayBuffer for Excel processing
//                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
//                 const workbook = XLSX.read(data, { type: 'array' });

//                 // Get the first worksheet
//                 const firstSheetName = workbook.SheetNames[0];
//                 const worksheet = workbook.Sheets[firstSheetName];

//                 // Convert to JSON (raw: false converts Excel date serials to formatted strings)
//                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

//                 if (rows.length === 0) {
//                     addToLog(`❌ Error: No data found in the spreadsheet.`);
//                     setStep("upload");
//                     return;
//                 }

//                 // Check for critical LEISA headers (ignoring case/spaces for robustness)
//                 const firstRowKeys = Object.keys(rows[0]).map(k => k.toLowerCase().replace(/\s/g, ''));
//                 if (!firstRowKeys.includes("nationalid") && !firstRowKeys.includes("learneralternateid")) {
//                     addToLog(`❌ Error: Header "National Id" not found. Please use the Bulk LEISA layout.`);
//                     setStep("upload");
//                     return;
//                 }

//                 const learnersMap = new Map<string, DashboardLearner>();

//                 rows.forEach((row, index) => {
//                     // Helper to get row value regardless of exact spacing in headers
//                     const getVal = (key: string) => {
//                         const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
//                         return exactKey ? String(row[exactKey] || "").trim() : "";
//                     };

//                     const idNumber = getVal("nationalid");
//                     const firstName = getVal("learnerfirstname");
//                     const lastName = getVal("learnerlastname");
//                     const fullName = `${firstName} ${lastName}`.trim();

//                     if (!idNumber || idNumber === "undefined") {
//                         addToLog(`⚠️ Row ${index + 2}: Skipped (Missing National ID)`);
//                         return;
//                     }

//                     const issueDateRaw = getVal("statementofresultsissuedate");
//                     const issueDateSA = parseQCTODate(issueDateRaw);
//                     const sdpCode = getVal("sdpcode") || "SDP070824115131";

//                     const newLearner: DashboardLearner = {
//                         id: idNumber,
//                         learnerId: idNumber,
//                         enrollmentId: idNumber,
//                         firstName,
//                         lastName,
//                         fullName,
//                         status: "active",
//                         isDraft: true,
//                         authStatus: "pending",
//                         isArchived: false,
//                         idNumber,
//                         email: getVal("learneremailaddress"),
//                         phone: getVal("learnercellphonenumber"),
//                         mobile: getVal("learnercellphonenumber"),
//                         dateOfBirth: parseQCTODate(getVal("learnerbirthdate")),
//                         cohortId: selectedCohortId || "Unassigned",
//                         trainingStartDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
//                         createdAt: new Date().toISOString(),
//                         createdBy: "bulk-import",
//                         qualification: {
//                             name: "Imported Qualification",
//                             saqaId: getVal("qualificationid"),
//                             credits: 0,
//                             totalNotionalHours: 0,
//                             nqfLevel: 0,
//                             dateAssessed: issueDateSA,
//                         },
//                         knowledgeModules: [],
//                         practicalModules: [],
//                         workExperienceModules: [],
//                         eisaAdmission: getVal("statementofresultsstatus") === "01",
//                         verificationCode: generateSorId(fullName, issueDateSA || "31-03-2026", sdpCode),
//                         issueDate: issueDateSA,
//                         demographics: {
//                             sdpCode,
//                             learnerTitle: getVal("learnertitle"),
//                             learnerMiddleName: getVal("learnermiddlename"),
//                             genderCode: getVal("gendercode"),
//                             equityCode: getVal("equitycode"),
//                             homeLanguageCode: getVal("homelanguagecode"),
//                             citizenResidentStatusCode: getVal("citizenresidentstatuscode") || "SA",
//                             nationalityCode: getVal("nationalitycode") || "SA",
//                             immigrantStatus: getVal("immigrantstatus") || "03",
//                             alternativeIdType: getVal("alternativeidtype") || "533",
//                             socioeconomicStatusCode: getVal("socioeconomicstatuscode") || "01",
//                             disabilityStatusCode: getVal("disabilitystatuscode") || "N",
//                             disabilityRating: getVal("disabilityrating"),
//                             provinceCode: getVal("provincecode"),
//                             statsaaAreaCode: getVal("statssaareacode"),
//                             flc: getVal("flc") || "06",
//                             flcStatementOfResultNumber: getVal("flcstatementofresultnumber"),
//                             statementOfResultsStatus: getVal("statementofresultsstatus") || "02",
//                             statementOfResultsIssueDate: issueDateSA,
//                             learnerReadinessForEISATypeId: getVal("learnerreadinessforeisatypeid") || "1",
//                             assessmentCentreCode: getVal("assessmentcentrecode"),
//                             popiActAgree: getVal("popiactagree") || "Y",
//                             popiActDate: parseQCTODate(getVal("popiactdate")),
//                             expectedTrainingCompletionDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
//                             learnerHomeAddress1: getVal("learnerhomeaddress1"),
//                             learnerHomeAddress2: getVal("learnerhomeaddress2"),
//                             learnerHomeAddress3: getVal("learnerhomeaddress3"),
//                             learnerPostalAddress1: getVal("learnerpostaladdress1"),
//                             learnerPostalAddress2: getVal("learnerpostaladdress2"),
//                             learnerPostalAddressPostCode: getVal("learnerpostaladdresspostcode")
//                         } as LearnerDemographics
//                     };

//                     learnersMap.set(idNumber, newLearner);
//                     addToLog(`✅ Mapped: ${fullName}`);
//                 });

//                 if (learnersMap.size > 0) {
//                     await saveToStaging(learnersMap);
//                 } else {
//                     addToLog("❌ No valid learners found to import.");
//                     setStep("upload");
//                 }

//             } catch (err: any) {
//                 addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
//                 setStep("upload");
//             }
//         };

//         reader.onerror = () => {
//             addToLog(`❌ ERROR: Could not read file.`);
//             setStep("upload");
//         };

//         reader.readAsArrayBuffer(file);
//     };

//     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
//         addToLog(`💾 Committing ${dataMap.size} records to Staging Vault...`);
//         try {
//             const batch = writeBatch(db);
//             dataMap.forEach((learner) => {
//                 const ref = doc(db, "staging_learners", learner.id);
//                 batch.set(ref, learner);
//             });
//             await batch.commit();
//             addToLog(`✅ SUCCESS: Bulk import ready for review.`);
//             setStep("complete");
//             setTimeout(() => onSuccess(), 2500);
//         } catch (error: any) {
//             addToLog(`❌ DATABASE ERROR: ${error.message}`);
//             setStep("upload");
//         }
//     };

//     // Columns to display in the UI as required/expected
//     const EXPECTED_COLUMNS = [
//         "National Id (*)",
//         "Learner First Name",
//         "Learner Last Name",
//         "Statement of Results Issue Date",
//         "FLC Statement of result number"
//     ];

//     return (
//         <div className="mlab-modal-overlay">
//             <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px', background: 'whitesmoke' }}>

//                 {/* ── HEADER ── */}
//                 <div className="mlab-modal__header" style={{ borderBottom: '2px solid var(--mlab-light-blue)' }}>
//                     <div className="mlab-modal__title-group">
//                         <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '6px', color: 'var(--mlab-blue)' }}>
//                             <FileSpreadsheet size={22} />
//                         </div>
//                         <div style={{ marginLeft: '12px' }}>
//                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
//                                 Bulk LEISA Import
//                             </h2>
//                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>EXCEL & CSV SUPPORTED</span>
//                         </div>
//                     </div>
//                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
//                         <X size={20} />
//                     </button>
//                 </div>

//                 {/* ── BODY ── */}
//                 <div className="mlab-modal__body" style={{ padding: '1.5rem' }}>
//                     {step === "upload" && (
//                         <>
//                             <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '12px 16px', marginBottom: '1.5rem', borderRadius: '0 4px 4px 0' }}>
//                                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.5 }}>
//                                     Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>) using the standard LEISA headers. All learners will be mapped and sent to the <strong>Staging Area</strong>.
//                                 </p>
//                             </div>

//                             {/* 🚀 NEW UI: EXPECTED COLUMNS */}
//                             <div style={{ marginBottom: '1.5rem' }}>
//                                 <label style={{
//                                     fontFamily: 'var(--font-heading)',
//                                     fontWeight: 700,
//                                     fontSize: '0.75rem',
//                                     color: 'var(--mlab-grey)',
//                                     letterSpacing: '0.08em',
//                                     textTransform: 'uppercase',
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     gap: '6px',
//                                     marginBottom: '8px'
//                                 }}>
//                                     <Info size={14} color="var(--mlab-blue)" /> Expected Columns
//                                 </label>
//                                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '10px' }}>
//                                     The system maps standard LEISA headers (spaces are ignored). Key columns include:
//                                 </div>
//                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
//                                     {EXPECTED_COLUMNS.map(col => (
//                                         <span key={col} style={{
//                                             background: '#f1f5f9',
//                                             color: '#334155',
//                                             border: '1px solid #cbd5e1',
//                                             padding: '4px 8px',
//                                             borderRadius: '4px',
//                                             fontSize: '0.75rem',
//                                             fontWeight: 600
//                                         }}>
//                                             {col}
//                                         </span>
//                                     ))}
//                                     <span style={{ color: '#64748b', padding: '4px 8px', fontSize: '0.75rem', fontStyle: 'italic' }}>
//                                         + other LEISA fields...
//                                     </span>
//                                 </div>
//                             </div>

//                             <div className="lfm-fg" style={{ marginBottom: '1.5rem' }}>
//                                 <label style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--mlab-grey)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
//                                     <BookOpen size={14} color="var(--mlab-blue)" /> Target Cohort
//                                 </label>
//                                 <select
//                                     value={selectedCohortId}
//                                     onChange={(e) => setSelectedCohortId(e.target.value)}
//                                     className="lfm-input lfm-select"
//                                     style={{ margin: 0 }}
//                                 >
//                                     <option value="">-- DEFAULT: DRAFT/UNASSIGNED --</option>
//                                     {cohorts.filter((c) => !c.isArchived).map((c) => (
//                                         <option key={c.id} value={c.id}>{c.name}</option>
//                                     ))}
//                                 </select>
//                             </div>

//                             <div
//                                 className="mlab-import-dropzone"
//                                 onDragOver={handleDragOver}
//                                 onDrop={handleDrop}
//                                 onClick={() => fileInputRef.current?.click()}
//                                 style={{
//                                     border: '2px dashed var(--mlab-border)',
//                                     borderRadius: '12px',
//                                     padding: '3rem 2rem',
//                                     textAlign: 'center',
//                                     backgroundColor: 'var(--mlab-bg)',
//                                     cursor: 'pointer',
//                                     transition: 'all 0.2s ease'
//                                 }}
//                             >
//                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
//                                 <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
//                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 8px' }}>
//                                     Drop Bulk Spreadsheet Here
//                                 </h4>
//                                 <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: 0 }}>
//                                     Supports <strong>.xlsx</strong> and <strong>.csv</strong> files.
//                                 </p>
//                             </div>
//                         </>
//                     )}

//                     {step === "processing" && (
//                         <div>
//                             <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
//                                 <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
//                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, textTransform: 'uppercase' }}>
//                                     Mapping Data Fields...
//                                 </h4>
//                             </div>
//                             <div style={{
//                                 background: "#051e26",
//                                 color: "#94c73d",
//                                 padding: "1.25rem",
//                                 borderRadius: "8px",
//                                 fontFamily: "'Courier New', Courier, monospace",
//                                 fontSize: "0.8rem",
//                                 height: "220px",
//                                 overflowY: "auto",
//                                 border: '1px solid #0a2d38'
//                             }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b8a34', marginBottom: '10px', borderBottom: '1px solid #0a2d38', paddingBottom: '6px' }}>
//                                     <Terminal size={14} /> <span>BULK_MAPPING_ENGINE_v4.0</span>
//                                 </div>
//                                 {debugLog.map((log, i) => (
//                                     <div key={i} style={{ marginBottom: "4px" }}>
//                                         <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
//                                     </div>
//                                 ))}
//                             </div>
//                         </div>
//                     )}

//                     {step === "complete" && (
//                         <div style={{ textAlign: "center", padding: "2rem 0" }}>
//                             <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
//                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                 Import Successful
//                             </h3>
//                             <p style={{ color: 'var(--mlab-grey)', margin: '0.5rem 0 1.5rem' }}>
//                                 Learners have been successfully staged for approval.
//                             </p>
//                         </div>
//                     )}
//                 </div>

//                 <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
//                     {step === "upload" ? (
//                         <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
//                             Cancel
//                         </button>
//                     ) : step === "complete" ? (
//                         <button className="mlab-btn mlab-btn--green" style={{ width: '100%' }} onClick={onSuccess}>
//                             Go to Staging Area
//                         </button>
//                     ) : (
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
//                             <AlertCircle size={14} /> SECURITY: DATABASE TRANSACTION IN PROGRESS
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>
//     );
// };


// // import React, { useState, useRef } from "react";
// // import Papa from "papaparse";
// // import {
// //     UploadCloud,
// //     X,
// //     Loader2,
// //     CheckCircle2,
// //     BookOpen,
// //     FileSpreadsheet,
// //     Terminal,
// //     AlertCircle
// // } from "lucide-react";
// // import { writeBatch, doc } from "firebase/firestore";
// // import { useStore } from "../../store/useStore";
// // import type { DashboardLearner, LearnerDemographics } from "../../types";
// // import { db } from "../../lib/firebase";
// // import { generateSorId } from "../../pages/utils/validation";

// // interface LearnerImportModalProps {
// //     cohortId?: string;
// //     onClose: () => void;
// //     onSuccess: () => void;
// // }

// // export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
// //     cohortId,
// //     onClose,
// //     onSuccess,
// // }) => {
// //     const { cohorts } = useStore();

// //     const fileInputRef = useRef<HTMLInputElement>(null);
// //     const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
// //     const [debugLog, setDebugLog] = useState<string[]>([]);
// //     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

// //     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

// //     /**
// //      * ── HELPERS ──────────────────────────────────────────────────────────
// //      */

// //     // Parse QCTO Date Formats (YYYYMMDD or YYYY-MM-DD or DD-MM-YYYY)
// //     const parseQCTODate = (val: any): string => {
// //         const str = String(val || "").trim();
// //         if (!str) return "";

// //         // Handle YYYYMMDD (QCTO Standard)
// //         if (str.length === 8 && !str.includes("-")) {
// //             const y = str.substring(0, 4);
// //             const m = str.substring(4, 6);
// //             const d = str.substring(6, 8);
// //             return `${d}-${m}-${y}`;
// //         }

// //         // Handle ISO/HTML (YYYY-MM-DD)
// //         if (str.includes("-") && str.split("-")[0].length === 4) {
// //             const [y, m, d] = str.split("-");
// //             return `${d}-${m}-${y}`;
// //         }

// //         return str; // Return as is if already SA format or unknown
// //     };

// //     const handleDragOver = (e: React.DragEvent) => {
// //         e.preventDefault();
// //         e.stopPropagation();
// //     };

// //     const handleDrop = (e: React.DragEvent) => {
// //         e.preventDefault();
// //         e.stopPropagation();
// //         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
// //             const droppedFile = e.dataTransfer.files[0];
// //             if (fileInputRef.current) {
// //                 const dataTransfer = new DataTransfer();
// //                 dataTransfer.items.add(droppedFile);
// //                 fileInputRef.current.files = dataTransfer.files;
// //                 const event = new Event("change", { bubbles: true });
// //                 fileInputRef.current.dispatchEvent(event);
// //             }
// //         }
// //     };

// //     /**
// //      * ── CORE PROCESSING LOGIC (LEISA BULK FORMAT) ───────────────────────
// //      */
// //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setStep("processing");
// //         setDebugLog([]);
// //         addToLog(`🚀 Initializing Bulk LEISA Import: ${file.name}`);

// //         Papa.parse(file, {
// //             header: true, // 🚀 Changed to header mode for bulk table processing
// //             skipEmptyLines: true,
// //             complete: async (results) => {
// //                 const rows = results.data as any[];

// //                 if (rows.length === 0) {
// //                     addToLog(`❌ Error: No data found in file.`);
// //                     setStep("upload");
// //                     return;
// //                 }

// //                 // Check for critical header "NationalId" to ensure correct format
// //                 if (!rows[0].hasOwnProperty("NationalId")) {
// //                     addToLog(`❌ Error: Header "NationalId" not found. Please use the Bulk LEISA layout.`);
// //                     setStep("upload");
// //                     return;
// //                 }

// //                 const learnersMap = new Map<string, DashboardLearner>();

// //                 try {
// //                     rows.forEach((row, index) => {
// //                         const idNumber = String(row.NationalId || "").trim();
// //                         const firstName = String(row.LearnerFirstName || "").trim();
// //                         const lastName = String(row.LearnerLastName || "").trim();
// //                         const fullName = `${firstName} ${lastName}`.trim();

// //                         if (!idNumber || idNumber === "undefined") {
// //                             addToLog(`⚠️ Row ${index + 1}: Skipped (Missing National ID)`);
// //                             return;
// //                         }

// //                         const issueDateRaw = row.StatementofResultsIssueDate || "";
// //                         const issueDateSA = parseQCTODate(issueDateRaw);
// //                         const sdpCode = row.SDPCode || "SDP070824115131";

// //                         const newLearner: DashboardLearner = {
// //                             id: idNumber,
// //                             learnerId: idNumber,
// //                             enrollmentId: idNumber,
// //                             firstName,
// //                             lastName,
// //                             fullName,
// //                             status: "active",
// //                             isDraft: true,
// //                             authStatus: "pending",
// //                             isArchived: false,
// //                             idNumber,
// //                             email: (row.LearnerEmailAddress || "").trim(),
// //                             phone: (row.LearnerCellPhoneNumber || "").trim(),
// //                             mobile: (row.LearnerCellPhoneNumber || "").trim(),
// //                             dateOfBirth: parseQCTODate(row.LearnerBirthDate),
// //                             cohortId: selectedCohortId || "Unassigned",
// //                             trainingStartDate: parseQCTODate(row.ExpectedTrainingCompletionDate), // Placeholder/Logic fallback
// //                             createdAt: new Date().toISOString(),
// //                             createdBy: "bulk-import",
// //                             qualification: {
// //                                 name: "Imported Qualification",
// //                                 saqaId: String(row.QualificationId || ""),
// //                                 credits: 0,
// //                                 totalNotionalHours: 0,
// //                                 nqfLevel: 0,
// //                                 dateAssessed: issueDateSA,
// //                             },
// //                             knowledgeModules: [],
// //                             practicalModules: [],
// //                             workExperienceModules: [],
// //                             eisaAdmission: row.StatementofResultsStatus === "01",
// //                             verificationCode: generateSorId(fullName, issueDateSA || "31-03-2026", sdpCode),
// //                             issueDate: issueDateSA,
// //                             demographics: {
// //                                 sdpCode,
// //                                 learnerTitle: row.LearnerTitle || "",
// //                                 learnerMiddleName: row.LearnerMiddleName || "",
// //                                 genderCode: row.GenderCode || "",
// //                                 equityCode: row.EquityCode || "",
// //                                 homeLanguageCode: row.HomeLanguageCode || "",
// //                                 citizenResidentStatusCode: row.CitizenResidentStatusCode || "SA",
// //                                 nationalityCode: row.NationalityCode || "SA",
// //                                 immigrantStatus: row.ImmigrantStatus || "03",
// //                                 alternativeIdType: row.AlternativeIdType || "533",
// //                                 socioeconomicStatusCode: row.SocioeconomicStatusCode || "01",
// //                                 disabilityStatusCode: row.DisabilityStatusCode || "N",
// //                                 disabilityRating: row.DisabilityRating || "",
// //                                 provinceCode: row.ProvinceCode || "",
// //                                 statsaaAreaCode: row.STATSSAAreaCode || "",
// //                                 flc: row.FLC || "06",
// //                                 flcStatementOfResultNumber: row.FLCStatementofresultnumber || "",
// //                                 statementOfResultsStatus: row.StatementofResultsStatus || "02",
// //                                 statementOfResultsIssueDate: issueDateSA,
// //                                 learnerReadinessForEISATypeId: row.LearnerReadinessforEISATypeId || "1",
// //                                 assessmentCentreCode: row.AssessmentCentreCode || "",
// //                                 popiActAgree: row.POPIActAgree || "Y",
// //                                 popiActDate: parseQCTODate(row.POPIActDate),
// //                                 expectedTrainingCompletionDate: parseQCTODate(row.ExpectedTrainingCompletionDate),
// //                                 learnerHomeAddress1: row.LearnerHomeAddress1 || "",
// //                                 learnerHomeAddress2: row.LearnerHomeAddress2 || "",
// //                                 learnerHomeAddress3: row.LearnerHomeAddress3 || "",
// //                                 learnerPostalAddress1: row.LearnerPostalAddress1 || "",
// //                                 learnerPostalAddress2: row.LearnerPostalAddress2 || "",
// //                                 learnerPostalAddressPostCode: row.LearnerPostalAddressPostCode || ""
// //                             } as LearnerDemographics
// //                         };

// //                         learnersMap.set(idNumber, newLearner);
// //                         addToLog(`✅ Parsed: ${fullName}`);
// //                     });

// //                     if (learnersMap.size > 0) {
// //                         await saveToStaging(learnersMap);
// //                     } else {
// //                         addToLog("❌ No valid learners found to import.");
// //                         setStep("upload");
// //                     }

// //                 } catch (err: any) {
// //                     addToLog(`❌ PARSE ERROR: ${err.message}`);
// //                     setStep("upload");
// //                 }
// //             },
// //             error: (err) => {
// //                 addToLog(`❌ CSV ERROR: ${err.message}`);
// //                 setStep("upload");
// //             },
// //         });
// //     };

// //     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
// //         addToLog(`💾 Committing ${dataMap.size} records to Staging Vault...`);
// //         try {
// //             const batch = writeBatch(db);
// //             dataMap.forEach((learner) => {
// //                 const ref = doc(db, "staging_learners", learner.id);
// //                 batch.set(ref, learner);
// //             });
// //             await batch.commit();
// //             addToLog(`✅ SUCCESS: Bulk import ready for review.`);
// //             setStep("complete");
// //             setTimeout(() => onSuccess(), 2500);
// //         } catch (error: any) {
// //             addToLog(`❌ DATABASE ERROR: ${error.message}`);
// //             setStep("upload");
// //         }
// //     };

// //     return (
// //         <div className="mlab-modal-overlay">
// //             <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px' }}>

// //                 {/* ── HEADER ── */}
// //                 <div className="mlab-modal__header" style={{ borderBottom: '2px solid var(--mlab-light-blue)' }}>
// //                     <div className="mlab-modal__title-group">
// //                         <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '6px', color: 'var(--mlab-blue)' }}>
// //                             <FileSpreadsheet size={22} />
// //                         </div>
// //                         <div style={{ marginLeft: '12px' }}>
// //                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
// //                                 Bulk LEISA Import
// //                             </h2>
// //                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>QCTO COMPLIANT MAPPING</span>
// //                         </div>
// //                     </div>
// //                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
// //                         <X size={20} />
// //                     </button>
// //                 </div>

// //                 {/* ── BODY ── */}
// //                 <div className="mlab-modal__body" style={{ padding: '1.5rem' }}>
// //                     {step === "upload" && (
// //                         <>
// //                             <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '12px 16px', marginBottom: '1.5rem', borderRadius: '0 4px 4px 0' }}>
// //                                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.5 }}>
// //                                     Upload a spreadsheet using the standard LEISA headers. All learners in the file will be mapped and sent to the <strong>Staging Area</strong> for approval.
// //                                 </p>
// //                             </div>

// //                             <div className="lfm-fg" style={{ marginBottom: '1.5rem' }}>
// //                                 <label style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--mlab-grey)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
// //                                     <BookOpen size={14} color="var(--mlab-blue)" /> Target Cohort
// //                                 </label>
// //                                 <select
// //                                     value={selectedCohortId}
// //                                     onChange={(e) => setSelectedCohortId(e.target.value)}
// //                                     className="lfm-input lfm-select"
// //                                     style={{ margin: 0 }}
// //                                 >
// //                                     <option value="">-- DEFAULT: DRAFT/UNASSIGNED --</option>
// //                                     {cohorts.filter((c) => !c.isArchived).map((c) => (
// //                                         <option key={c.id} value={c.id}>{c.name}</option>
// //                                     ))}
// //                                 </select>
// //                             </div>

// //                             <div
// //                                 className="mlab-import-dropzone"
// //                                 onDragOver={handleDragOver}
// //                                 onDrop={handleDrop}
// //                                 onClick={() => fileInputRef.current?.click()}
// //                                 style={{
// //                                     border: '2px dashed var(--mlab-border)',
// //                                     borderRadius: '12px',
// //                                     padding: '3.5rem 2rem',
// //                                     textAlign: 'center',
// //                                     backgroundColor: 'var(--mlab-bg)',
// //                                     cursor: 'pointer'
// //                                 }}
// //                             >
// //                                 <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
// //                                 <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
// //                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 8px' }}>
// //                                     Drop Bulk Spreadsheet Here
// //                                 </h4>
// //                                 <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: 0 }}>
// //                                     File must contain <strong>NationalId</strong> and <strong>LearnerFirstName</strong>
// //                                 </p>
// //                             </div>
// //                         </>
// //                     )}

// //                     {step === "processing" && (
// //                         <div>
// //                             <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
// //                                 <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
// //                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, textTransform: 'uppercase' }}>
// //                                     Mapping Data Fields...
// //                                 </h4>
// //                             </div>
// //                             <div style={{
// //                                 background: "#051e26",
// //                                 color: "#94c73d",
// //                                 padding: "1.25rem",
// //                                 borderRadius: "8px",
// //                                 fontFamily: "'Courier New', Courier, monospace",
// //                                 fontSize: "0.8rem",
// //                                 height: "220px",
// //                                 overflowY: "auto",
// //                                 border: '1px solid #0a2d38'
// //                             }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b8a34', marginBottom: '10px', borderBottom: '1px solid #0a2d38', paddingBottom: '6px' }}>
// //                                     <Terminal size={14} /> <span>BULK_MAPPING_ENGINE_v3.0</span>
// //                                 </div>
// //                                 {debugLog.map((log, i) => (
// //                                     <div key={i} style={{ marginBottom: "4px" }}>
// //                                         <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
// //                                     </div>
// //                                 ))}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {step === "complete" && (
// //                         <div style={{ textAlign: "center", padding: "2rem 0" }}>
// //                             <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
// //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// //                                 Import Successful
// //                             </h3>
// //                             <p style={{ color: 'var(--mlab-grey)', margin: '0.5rem 0 1.5rem' }}>
// //                                 Learners have been successfully staged for approval.
// //                             </p>
// //                         </div>
// //                     )}
// //                 </div>

// //                 <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
// //                     {step === "upload" ? (
// //                         <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
// //                             Cancel
// //                         </button>
// //                     ) : step === "complete" ? (
// //                         <button className="mlab-btn mlab-btn--green" style={{ width: '100%' }} onClick={onSuccess}>
// //                             Go to Staging Area
// //                         </button>
// //                     ) : (
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
// //                             <AlertCircle size={14} /> SECURITY: DATABASE TRANSACTION IN PROGRESS
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };


// // // import React, { useState, useRef } from "react";
// // // import Papa from "papaparse";
// // // import {
// // //     UploadCloud,
// // //     X,
// // //     Loader2,
// // //     CheckCircle2,
// // //     BookOpen,
// // // } from "lucide-react";
// // // import { writeBatch, doc } from "firebase/firestore";
// // // import { useStore } from "../../store/useStore";
// // // import type {
// // //     DashboardLearner,
// // // } from "../../types";
// // // import { db } from "../../lib/firebase";
// // // import { generateSorId } from "../../pages/utils/validation";

// // // interface LearnerImportModalProps {
// // //     cohortId?: string;
// // //     onClose: () => void;
// // //     onSuccess: () => void;
// // // }

// // // export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
// // //     cohortId,
// // //     onClose,
// // //     onSuccess,
// // // }) => {
// // //     const { cohorts, programmes } = useStore();

// // //     const fileInputRef = useRef<HTMLInputElement>(null);
// // //     const [step, setStep] = useState<"upload" | "processing" | "complete">(
// // //         "upload",
// // //     );
// // //     const [debugLog, setDebugLog] = useState<string[]>([]);
// // //     const [stats, setStats] = useState({ total: 0, skipped: 0 });

// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(
// // //         cohortId || "",
// // //     );

// // //     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

// // //     // Force South African Date Format (DD-MM-YYYY)
// // //     const formatDateSA = (dateInput: string | Date | undefined | null): string => {
// // //         if (!dateInput) {
// // //             const d = new Date();
// // //             const day = String(d.getDate()).padStart(2, '0');
// // //             const month = String(d.getMonth() + 1).padStart(2, '0');
// // //             return `${day}-${month}-${d.getFullYear()}`;
// // //         }

// // //         // Handle strings that might already be DD-MM-YYYY or similar
// // //         const d = new Date(dateInput);
// // //         if (isNaN(d.getTime())) return String(dateInput).trim(); // Fallback to raw string if JS can't parse it

// // //         const day = String(d.getDate()).padStart(2, '0');
// // //         const month = String(d.getMonth() + 1).padStart(2, '0');
// // //         const year = d.getFullYear();
// // //         return `${day}-${month}-${year}`;
// // //     };

// // //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         setStep("processing");
// // //         addToLog(`Reading file: ${file.name}...`);

// // //         Papa.parse(file, {
// // //             skipEmptyLines: false,
// // //             complete: async (results) => {
// // //                 const rawData = results.data as string[][];

// // //                 if (!rawData || rawData.length < 15) {
// // //                     alert("File does not match the standard mLab Single-Student template format.");
// // //                     setStep("upload");
// // //                     return;
// // //                 }

// // //                 addToLog(`Parsing Single-Student Template...`);
// // //                 const learnersMap = new Map<string, DashboardLearner>();

// // //                 try {
// // //                     // 1. PLUCK SPECIFIC CELLS (Based on your exact CSV layout)
// // //                     const fullName = (rawData[7]?.[1] || "Unknown Learner").trim();
// // //                     const idNumber = (rawData[8]?.[1] || "").trim();

// // //                     // Pluck and Format the Issue Date into DD-MM-YYYY
// // //                     const rawIssueDate = rawData[12]?.[1];
// // //                     const issueDateStr = formatDateSA(rawIssueDate);

// // //                     const providerCode = "SDP070824115131";

// // //                     if (!idNumber) {
// // //                         addToLog(`⚠️ Failed: No ID Number found in Row 9 (Cell B9).`);
// // //                         setStep("upload");
// // //                         return;
// // //                     }

// // //                     // 2. CREATE LEARNER SHELL WITH SYNCED DATES
// // //                     const newLearner: DashboardLearner = {
// // //                         id: idNumber,
// // //                         learnerId: idNumber,
// // //                         enrollmentId: idNumber,
// // //                         firstName: fullName.split(' ')[0],
// // //                         lastName: fullName.split(' ').slice(1).join(' '),
// // //                         fullName: fullName,
// // //                         status: "active",
// // //                         isDraft: true,
// // //                         authStatus: "pending",
// // //                         isArchived: false,
// // //                         idNumber: idNumber,
// // //                         email: (rawData[10]?.[1] || "").trim(),
// // //                         phone: (rawData[11]?.[1] || "").trim(),
// // //                         mobile: (rawData[11]?.[1] || "").trim(),
// // //                         dateOfBirth: "",
// // //                         cohortId: selectedCohortId || "Unassigned",
// // //                         trainingStartDate: formatDateSA(rawData[5]?.[1]), // Format training start date as well
// // //                         createdAt: new Date().toISOString(),
// // //                         createdBy: "admin-import",

// // //                         qualification: {
// // //                             name: (rawData[0]?.[1] || "Occupational Certificate").trim(),
// // //                             saqaId: (rawData[3]?.[1] || "").trim(),
// // //                             credits: parseInt(rawData[4]?.[1] || "0"),
// // //                             totalNotionalHours: (parseInt(rawData[4]?.[1] || "0")) * 10,
// // //                             nqfLevel: parseInt(rawData[1]?.[1] || "0"),
// // //                             dateAssessed: issueDateStr,
// // //                         },
// // //                         knowledgeModules: [],
// // //                         practicalModules: [],
// // //                         workExperienceModules: [],
// // //                         eisaAdmission: true, // Assuming true for offline graduates

// // //                         // Generate the custom MLAB SoR ID and lock the date!
// // //                         verificationCode: generateSorId(fullName, issueDateStr, providerCode),
// // //                         issueDate: issueDateStr,
// // //                     };

// // //                     let importedCohortName = (rawData[9]?.[1] || "").trim();

// // //                     // 3. LOOP THROUGH MODULES (Starts at Row 15 / Index 14)
// // //                     let currentType = "K";
// // //                     let isModuleSection = false;

// // //                     for (let i = 14; i < rawData.length; i++) {
// // //                         const row = rawData[i];
// // //                         if (!row) continue;

// // //                         const col0 = (row[0] || "").toLowerCase();
// // //                         const modName = (row[1] || "").trim();

// // //                         if (col0 === "modules" || col0 === "") {
// // //                             if (modName.toLowerCase() === "module name") {
// // //                                 isModuleSection = true;
// // //                                 continue;
// // //                             }
// // //                         }

// // //                         // Stop parsing if we hit completely empty rows at the bottom
// // //                         if (!modName && !col0) continue;

// // //                         if (col0.includes("knowledge")) currentType = "K";
// // //                         else if (col0.includes("practical") || col0.includes("skills")) currentType = "P";
// // //                         else if (col0.includes("work") || col0.includes("experience") || col0.includes("workplace")) currentType = "W";

// // //                         if (modName && modName.toLowerCase() !== "module name") {
// // //                             const modCode = row[2]?.trim() || "";
// // //                             const baseMod = {
// // //                                 name: modName,
// // //                                 code: modCode,
// // //                                 nqfLevel: parseInt(row[3]) || newLearner.qualification.nqfLevel || 5,
// // //                                 credits: parseInt(row[4] || "0"),
// // //                                 notionalHours: parseInt(row[4] || "0") * 10,
// // //                                 status: (row[8]?.trim() || row[7]?.trim()) || "Competent",
// // //                                 // Every module's Date Assessed = Statement Issue Date
// // //                                 dateAssessed: issueDateStr,
// // //                                 dateSignedOff: issueDateStr,
// // //                                 isTemplateLocked: false,
// // //                             };

// // //                             let targetSection = currentType;
// // //                             if (modCode.toUpperCase().startsWith("KM")) targetSection = "K";
// // //                             else if (modCode.toUpperCase().startsWith("PM")) targetSection = "P";
// // //                             else if (modCode.toUpperCase().startsWith("WM") || modCode.toUpperCase().startsWith("WE")) targetSection = "W";

// // //                             if (targetSection === "K") newLearner.knowledgeModules?.push(baseMod as any);
// // //                             else if (targetSection === "P") newLearner.practicalModules?.push(baseMod as any);
// // //                             else if (targetSection === "W") newLearner.workExperienceModules?.push(baseMod as any);
// // //                             else newLearner.knowledgeModules?.push(baseMod as any);
// // //                         }
// // //                     }

// // //                     const matchedCohort = importedCohortName
// // //                         ? cohorts.find(c => c.name.toLowerCase().trim() === importedCohortName.toLowerCase().trim())
// // //                         : null;

// // //                     if (matchedCohort) {
// // //                         newLearner.cohortId = matchedCohort.id;
// // //                     }

// // //                     learnersMap.set(idNumber, newLearner);
// // //                     setStats({ total: 1, skipped: 0 });
// // //                     addToLog(`Processed 1 Single-Student Template with SA Date: ${issueDateStr}`);

// // //                     await saveToStaging(learnersMap);

// // //                 } catch (err: any) {
// // //                     alert(`Template Parsing Error: ${err.message}`);
// // //                     setStep("upload");
// // //                 }
// // //             },
// // //             error: (err) => {
// // //                 alert(`CSV Reader Error: ${err.message}`);
// // //                 setStep("upload");
// // //             },
// // //         });
// // //     };

// // //     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
// // //         addToLog(`Saving to 'staging_learners' collection...`);
// // //         try {
// // //             const batch = writeBatch(db);
// // //             let count = 0;

// // //             dataMap.forEach((learner) => {
// // //                 const ref = doc(db, "staging_learners", learner.id);
// // //                 batch.set(ref, learner);
// // //                 count++;
// // //             });

// // //             await batch.commit();
// // //             addToLog(`✅ SUCCESS: ${count} record moved to Staging Area.`);
// // //             setStep("complete");

// // //             setTimeout(() => {
// // //                 onSuccess();
// // //             }, 1500);
// // //         } catch (error: any) {
// // //             console.error(error);
// // //             addToLog(`❌ DATABASE ERROR: ${error.message}`);
// // //             alert("Error saving to database. Check console for details.");
// // //         }
// // //     };

// // //     const handleDragOver = (e: React.DragEvent) => {
// // //         e.preventDefault();
// // //         e.stopPropagation();
// // //     };

// // //     const handleDrop = (e: React.DragEvent) => {
// // //         e.preventDefault();
// // //         e.stopPropagation();
// // //         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
// // //             if (fileInputRef.current) {
// // //                 const dataTransfer = new DataTransfer();
// // //                 dataTransfer.items.add(e.dataTransfer.files[0]);
// // //                 fileInputRef.current.files = dataTransfer.files;
// // //                 const event = new Event("change", { bubbles: true });
// // //                 fileInputRef.current.dispatchEvent(event);
// // //             }
// // //         }
// // //     };

// // //     return (
// // //         <div className="mlab-modal-overlay">
// // //             <div className="mlab-modal mlab-modal--md">
// // //                 <div className="mlab-modal__header">
// // //                     <div className="mlab-modal__title-group">
// // //                         <UploadCloud size={20} className="mlab-modal__icon" />
// // //                         <h2>Import Statement of Results</h2>
// // //                     </div>
// // //                     <button
// // //                         className="mlab-modal__close"
// // //                         onClick={onClose}
// // //                         disabled={step === "processing"}
// // //                     >
// // //                         <X size={20} />
// // //                     </button>
// // //                 </div>

// // //                 <div className="mlab-modal__body">
// // //                     {step === "upload" && (
// // //                         <>
// // //                             <div
// // //                                 className="mlab-import-instructions"
// // //                                 style={{
// // //                                     marginBottom: "1.5rem",
// // //                                     fontSize: "0.85rem",
// // //                                     color: "#64748b",
// // //                                 }}
// // //                             >
// // //                                 <p>
// // //                                     Upload a single-student Statement of Results CSV file. Ensure the
// // //                                     layout matches the official mLab template.
// // //                                 </p>
// // //                             </div>

// // //                             <div
// // //                                 className="mlab-form-group"
// // //                                 style={{ marginBottom: "1.5rem" }}
// // //                             >
// // //                                 <label
// // //                                     style={{
// // //                                         display: "flex",
// // //                                         alignItems: "center",
// // //                                         gap: "6px",
// // //                                         fontSize: "0.85rem",
// // //                                         fontWeight: 600,
// // //                                         color: "#334155",
// // //                                         marginBottom: "6px",
// // //                                     }}
// // //                                 >
// // //                                     <BookOpen size={14} /> Target Class / Cohort
// // //                                 </label>
// // //                                 <select
// // //                                     value={selectedCohortId}
// // //                                     onChange={(e) => setSelectedCohortId(e.target.value)}
// // //                                     className="mlab-input"
// // //                                     style={{
// // //                                         borderColor: "var(--mlab-blue)",
// // //                                         backgroundColor: "#f0f9ff",
// // //                                         padding: "0.65rem",
// // //                                     }}
// // //                                 >
// // //                                     <option value="">-- Add to Drafts / Unassigned --</option>
// // //                                     {cohorts
// // //                                         .filter((c) => !c.isArchived)
// // //                                         .map((c) => {
// // //                                             const pId = c.qualificationId || c.programmeId;
// // //                                             const pName =
// // //                                                 programmes.find((p) => p.id === pId)?.name ||
// // //                                                 "Unknown Curriculum";
// // //                                             return (
// // //                                                 <option key={c.id} value={c.id}>
// // //                                                     {c.name} ({pName})
// // //                                                 </option>
// // //                                             );
// // //                                         })}
// // //                                 </select>
// // //                                 <p
// // //                                     style={{
// // //                                         fontSize: "0.75rem",
// // //                                         color: "#64748b",
// // //                                         marginTop: "6px",
// // //                                     }}
// // //                                 >
// // //                                     The learner will be pushed to the Staging area. When
// // //                                     approved, they will be formally linked to this class.
// // //                                 </p>
// // //                             </div>

// // //                             <div
// // //                                 className="mlab-dropzone"
// // //                                 onDragOver={handleDragOver}
// // //                                 onDrop={handleDrop}
// // //                                 onClick={() => fileInputRef.current?.click()}
// // //                                 style={{
// // //                                     textAlign: "center",
// // //                                     padding: "2rem",
// // //                                     border: "2px dashed #cbd5e1",
// // //                                     borderRadius: "8px",
// // //                                     background: "#f8fafc",
// // //                                     cursor: "pointer",
// // //                                     transition: "all 0.2s",
// // //                                 }}
// // //                             >
// // //                                 <input
// // //                                     type="file"
// // //                                     accept=".csv"
// // //                                     ref={fileInputRef}
// // //                                     onChange={handleFileChange}
// // //                                     style={{ display: "none" }}
// // //                                 />

// // //                                 <div className="mlab-dropzone__prompt">
// // //                                     <UploadCloud
// // //                                         size={40}
// // //                                         color="#94a3b8"
// // //                                         style={{ margin: "0 auto 1rem" }}
// // //                                     />
// // //                                     <p style={{ margin: 0, color: "#475569" }}>
// // //                                         <strong>Click to browse</strong> or drag and drop a CSV file
// // //                                         here
// // //                                     </p>
// // //                                 </div>
// // //                             </div>
// // //                         </>
// // //                     )}

// // //                     {step === "processing" && (
// // //                         <div>
// // //                             <div
// // //                                 style={{
// // //                                     display: "flex",
// // //                                     alignItems: "center",
// // //                                     gap: "10px",
// // //                                     marginBottom: "1rem",
// // //                                     color: "var(--mlab-blue)",
// // //                                 }}
// // //                             >
// // //                                 <Loader2 className="spin" size={20} />
// // //                                 <span style={{ fontWeight: 600 }}>Processing Import...</span>
// // //                             </div>
// // //                             <div
// // //                                 style={{
// // //                                     background: "#1e293b",
// // //                                     color: "#10b981",
// // //                                     padding: "1rem",
// // //                                     borderRadius: "8px",
// // //                                     fontFamily: "monospace",
// // //                                     fontSize: "0.8rem",
// // //                                     height: "200px",
// // //                                     overflowY: "auto",
// // //                                 }}
// // //                             >
// // //                                 {debugLog.map((log, i) => (
// // //                                     <div key={i} style={{ marginBottom: "4px" }}>
// // //                                         {log}
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {step === "complete" && (
// // //                         <div style={{ textAlign: "center", padding: "2rem" }}>
// // //                             <CheckCircle2
// // //                                 size={56}
// // //                                 color="#10b981"
// // //                                 style={{ margin: "0 auto 1.5rem" }}
// // //                             />
// // //                             <h3 style={{ marginBottom: "0.5rem", color: "#1e293b" }}>
// // //                                 Import Successful!
// // //                             </h3>
// // //                             <p style={{ color: "#64748b" }}>
// // //                                 The learner has been added to the{" "}
// // //                                 <strong>Staging Area</strong> tab for final review and approval.
// // //                             </p>
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 <div className="mlab-modal__footer">
// // //                     {step === "upload" && (
// // //                         <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
// // //                             Cancel
// // //                         </button>
// // //                     )}
// // //                     {step === "complete" && (
// // //                         <button className="mlab-btn mlab-btn--primary" onClick={onSuccess}>
// // //                             Close & Refresh List
// // //                         </button>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };
