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
import { writeBatch, doc, getDocs, collection } from "firebase/firestore";
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
    const { cohorts, fetchStagingLearners } = useStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");
    const [errorCount, setErrorCount] = useState(0);
    const [successCount, setSuccessCount] = useState(0);

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
     * ── STRICT MVP PROCESSING LOGIC ──────────────────────────────────────
     */
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing");
        setDebugLog([]);
        setErrorCount(0);
        setSuccessCount(0);
        addToLog(`🚀 Initializing Strict Bulk Import: ${file.name}`);

        // 1. GUARANTEED DATABASE CHECK: Fetch live rules before parsing
        addToLog(`⏳ Fetching live database rules for strict validation...`);
        const existingIds = new Set<string>();
        const existingEmails = new Set<string>();
        const validSaqaIds = new Set<string>();
        const validProgNames = new Set<string>();

        try {
            const learnersSnap = await getDocs(collection(db, "learners"));
            learnersSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.idNumber) existingIds.add(String(data.idNumber).trim());
                if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
            });

            const progSnap = await getDocs(collection(db, "programmes"));
            progSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
                if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
            });
            addToLog(`🔒 Database Locked: Found ${existingIds.size} existing learners and ${validProgNames.size} valid qualifications.`);
        } catch (err) {
            addToLog(`❌ FATAL: Could not connect to database for validation rules.`);
            setStep("upload");
            return;
        }

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
                            const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-]/g, ''));
                            if (headers.includes("nationalid") || headers.includes("learneralternateid") || headers.includes("idnumber")) {
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

                const learnersMap = new Map<string, DashboardLearner>();
                const todaySA = getTodaySA();
                let errors = 0;

                rows.forEach((row, index) => {
                    const getVal = (possibleKeys: string[]) => {
                        for (const key of possibleKeys) {
                            const normalizedTarget = key.toLowerCase().replace(/[\s_*-]/g, '');
                            const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_*-]/g, '') === normalizedTarget);
                            if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
                                return String(row[exactKey]).trim();
                            }
                        }
                        return "";
                    };

                    const idNumber = getVal(["nationalid", "idnumber", "learneralternateid", "id", "identitynumber"]);
                    const firstName = getVal(["learnerfirstname", "firstname", "name", "first"]);
                    const lastName = getVal(["learnerlastname", "lastname", "surname", "last"]);
                    let fullName = getVal(["fullname", "learnerfullname"]);
                    if (!fullName) fullName = `${firstName} ${lastName}`.trim();

                    const saqaId = getVal(["qualificationid", "saqaid"]);
                    const progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);

                    const rawEmail = getVal(["learneremailaddress", "emailaddress", "email"]);
                    const email = rawEmail ? String(rawEmail).toLowerCase().trim() : "";

                    if (!idNumber || !fullName || fullName === " ") {
                        addToLog(`⚠️ Row ${index + 2}: Skipped (Missing critical ID or Name)`);
                        errors++;
                        return;
                    }

                    if (existingIds.has(idNumber)) {
                        addToLog(`⚠️ Row ${index + 2}: Skipped (Learner ID ${idNumber} already exists in live database)`);
                        errors++;
                        return;
                    }

                    if (email && existingEmails.has(email)) {
                        addToLog(`⚠️ Row ${index + 2}: Skipped (Email ${email} is already in use by another learner)`);
                        errors++;
                        return;
                    }

                    const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
                    const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

                    if (!isSaqaMatch && !isNameMatch) {
                        addToLog(`⚠️ Row ${index + 2}: Skipped (Course "${progName || saqaId}" not found in system)`);
                        errors++;
                        return;
                    }

                    const issueDateRaw = getVal(["statementofresultsissuedate", "issuedate"]);
                    const issueDateSA = parseQCTODate(issueDateRaw);
                    const sdpCode = getVal(["sdpcode", "providercode"]);

                    // 🚀 ARCHITECTURE UPGRADE: Determine Cohort & Generate Ledger ID
                    const activeCohortId = selectedCohortId || "Unassigned";
                    const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

                    const newLearner: DashboardLearner = {
                        id: idNumber,
                        learnerId: idNumber,
                        enrollmentId: generatedEnrollmentId, // 🚀 Now uses composite key for the Ledger!
                        firstName,
                        lastName,
                        fullName,
                        status: "active",
                        isDraft: true,
                        authStatus: "pending",
                        isArchived: false,
                        idNumber,
                        email: rawEmail,
                        phone: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
                        mobile: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
                        dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob"])),
                        cohortId: activeCohortId,
                        trainingStartDate: parseQCTODate(getVal(["expectedtrainingcompletiondate", "trainingstartdate"])),
                        createdAt: new Date().toISOString(),
                        createdBy: "bulk-import",
                        qualification: {
                            name: progName,
                            saqaId: saqaId,
                            credits: 0,
                            totalNotionalHours: 0,
                            nqfLevel: 0,
                            dateAssessed: issueDateSA,
                        },
                        knowledgeModules: [],
                        practicalModules: [],
                        workExperienceModules: [],
                        eisaAdmission: getVal(["statementofresultsstatus", "eisaadmission"]) === "01",
                        verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
                        issueDate: issueDateSA,
                        demographics: {
                            sdpCode,
                            learnerTitle: getVal(["learnertitle", "title"]),
                            learnerMiddleName: getVal(["learnermiddlename", "middlename"]),
                            genderCode: getVal(["gendercode", "gender"]),
                            equityCode: getVal(["equitycode", "race"]),
                            homeLanguageCode: getVal(["homelanguagecode", "language"]),
                            citizenResidentStatusCode: getVal(["citizenresidentstatuscode", "citizen"]),
                            nationalityCode: getVal(["nationalitycode", "nationality"]),
                            immigrantStatus: getVal(["immigrantstatus"]),
                            alternativeIdType: getVal(["alternativeidtype"]),
                            socioeconomicStatusCode: getVal(["socioeconomicstatuscode"]),
                            disabilityStatusCode: getVal(["disabilitystatuscode", "disability"]),
                            disabilityRating: getVal(["disabilityrating"]),
                            provinceCode: getVal(["provincecode", "province"]),
                            statsaaAreaCode: getVal(["statssaareacode"]),
                            flc: getVal(["flc"]),
                            flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
                            statementOfResultsStatus: getVal(["statementofresultsstatus"]),
                            statementOfResultsIssueDate: issueDateSA,
                            learnerReadinessForEISATypeId: getVal(["learnerreadinessforeisatypeid"]),
                            assessmentCentreCode: getVal(["assessmentcentrecode"]),
                            popiActAgree: getVal(["popiactagree"]),
                            popiActDate: parseQCTODate(getVal(["popiactdate"])),
                            expectedTrainingCompletionDate: parseQCTODate(getVal(["expectedtrainingcompletiondate"])),
                            learnerHomeAddress1: getVal(["learnerhomeaddress1", "address1"]),
                            learnerHomeAddress2: getVal(["learnerhomeaddress2", "address2"]),
                            learnerHomeAddress3: getVal(["learnerhomeaddress3", "address3"]),
                            learnerPostalAddress1: getVal(["learnerpostaladdress1"]),
                            learnerPostalAddress2: getVal(["learnerpostaladdress2"]),
                            learnerPostalAddressPostCode: getVal(["learnerpostaladdresspostcode", "postalcode", "zip"])
                        } as LearnerDemographics
                    };

                    learnersMap.set(idNumber, newLearner);
                });

                setErrorCount(errors);
                setSuccessCount(learnersMap.size);

                if (learnersMap.size > 0) {
                    await saveToStaging(learnersMap);
                } else {
                    addToLog(`❌ Process complete. No valid learners found to import (Blocked: ${errors}).`);
                }

            } catch (err: any) {
                addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
            }
        };

        reader.onerror = () => {
            addToLog(`❌ ERROR: Could not read file.`);
            setStep("upload");
        };

        reader.readAsArrayBuffer(file);
    };

    const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
        addToLog(`💾 Committing ${dataMap.size} safe records to Staging Vault...`);
        try {
            const batch = writeBatch(db);
            dataMap.forEach((learner) => {
                const ref = doc(db, "staging_learners", learner.id);
                batch.set(ref, learner);
            });
            await batch.commit();
            await fetchStagingLearners();
            addToLog(`✅ SUCCESS: Bulk import ready for review.`);
            setStep("complete");
        } catch (error: any) {
            addToLog(`❌ DATABASE ERROR: ${error.message}`);
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
                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>STRICT MVP VALIDATION ACTIVE</span>
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
                                    Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). The system will strictly check against the live database and automatically block any duplicate IDs, emails, or unknown qualifications to prevent data corruption.
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

                    {(step === "processing" || step === "complete") && (
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
                                {step === "processing" ? (
                                    <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
                                ) : (
                                    <CheckCircle2 size={24} color="var(--mlab-green)" />
                                )}
                                <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase' }}>
                                    {step === "processing" ? "Processing Import..." : "Import Completed"}
                                </h4>
                            </div>

                            {step === "complete" && (
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                    <div style={{ flex: 1, padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>{successCount}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#15803d', textTransform: 'uppercase' }}>Staged</div>
                                    </div>
                                    <div style={{ flex: 1, padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>{errorCount}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#b91c1c', textTransform: 'uppercase' }}>Blocked</div>
                                    </div>
                                </div>
                            )}

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
                                    <Terminal size={14} /> <span>STRICT_MVP_ENGINE_v6.0</span>
                                </div>
                                {debugLog.map((log, i) => (
                                    <div key={i} style={{ marginBottom: "4px", color: log.includes("⚠️") || log.includes("❌") ? '#f87171' : '#94c73d' }}>
                                        <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
                    {step === "upload" ? (
                        <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                    ) : step === "complete" ? (
                        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                            <button className="mlab-btn mlab-btn--ghost" style={{ flex: 1 }} onClick={() => setStep("upload")}>
                                Upload Another
                            </button>
                            <button className="mlab-btn mlab-btn--green" style={{ flex: 1 }} onClick={onSuccess}>
                                Go to Staging Area
                            </button>
                        </div>
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


// // src/components/admin/LearnerImportModal.tsx

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
//     Info
// } from "lucide-react";
// import { writeBatch, doc, getDocs, collection } from "firebase/firestore";
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
//     const { cohorts, fetchStagingLearners } = useStore();

//     const fileInputRef = useRef<HTMLInputElement>(null);
//     const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
//     const [debugLog, setDebugLog] = useState<string[]>([]);
//     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");
//     const [errorCount, setErrorCount] = useState(0);
//     const [successCount, setSuccessCount] = useState(0);

//     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

//     /**
//      * ── HELPERS ──────────────────────────────────────────────────────────
//      */

//     const parseQCTODate = (val: any): string => {
//         const str = String(val || "").trim();
//         if (!str) return "";

//         if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
//             const y = str.substring(0, 4);
//             const m = str.substring(4, 6);
//             const d = str.substring(6, 8);
//             return `${d}-${m}-${y}`;
//         }

//         if (str.includes("-") && str.split("-")[0].length === 4) {
//             const [y, m, d] = str.split("-");
//             return `${d}-${m}-${y}`;
//         }

//         if (str.includes("/")) {
//             const parts = str.split("/");
//             if (parts[2].length === 4) {
//                 return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
//             }
//         }

//         return str;
//     };

//     const getTodaySA = (): string => {
//         const d = new Date();
//         const day = String(d.getDate()).padStart(2, '0');
//         const month = String(d.getMonth() + 1).padStart(2, '0');
//         const year = d.getFullYear();
//         return `${day}-${month}-${year}`;
//     };

//     /**
//      * ── DRAG & DROP HANDLERS ─────────────────────────────────────────────
//      */
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
//      * ── STRICT MVP PROCESSING LOGIC ──────────────────────────────────────
//      */
//     const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         setStep("processing");
//         setDebugLog([]);
//         setErrorCount(0);
//         setSuccessCount(0);
//         addToLog(`🚀 Initializing Strict Bulk Import: ${file.name}`);

//         // 1. GUARANTEED DATABASE CHECK: Fetch live rules before parsing
//         addToLog(`⏳ Fetching live database rules for strict validation...`);
//         const existingIds = new Set<string>();
//         const existingEmails = new Set<string>(); // 🚀 NEW: Email Tracker
//         const validSaqaIds = new Set<string>();
//         const validProgNames = new Set<string>();

//         try {
//             const learnersSnap = await getDocs(collection(db, "learners"));
//             learnersSnap.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.idNumber) existingIds.add(String(data.idNumber).trim());
//                 // 🚀 NEW: Collect all existing emails for Auth protection
//                 if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
//             });

//             const progSnap = await getDocs(collection(db, "programmes"));
//             progSnap.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
//                 if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
//             });
//             addToLog(`🔒 Database Locked: Found ${existingIds.size} existing learners and ${validProgNames.size} valid qualifications.`);
//         } catch (err) {
//             addToLog(`❌ FATAL: Could not connect to database for validation rules.`);
//             setStep("upload");
//             return;
//         }

//         const reader = new FileReader();

//         reader.onload = async (event) => {
//             try {
//                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
//                 const workbook = XLSX.read(data, { type: 'array' });

//                 let targetSheetName = workbook.SheetNames[0];
//                 let foundHeader = false;

//                 if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
//                     targetSheetName = "Learner Enrolment and EISA";
//                     addToLog(`📁 Found QCTO Data Sheet. Skipping Instructions...`);
//                 } else {
//                     for (const sheetName of workbook.SheetNames) {
//                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
//                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
//                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-]/g, ''));
//                             if (headers.includes("nationalid") || headers.includes("learneralternateid") || headers.includes("idnumber")) {
//                                 targetSheetName = sheetName;
//                                 foundHeader = true;
//                                 break;
//                             }
//                         }
//                         if (foundHeader) break;
//                     }
//                 }

//                 addToLog(`📖 Reading data from sheet: "${targetSheetName}"`);
//                 const worksheet = workbook.Sheets[targetSheetName];

//                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

//                 if (rows.length === 0) {
//                     addToLog(`❌ Error: No data found in sheet "${targetSheetName}".`);
//                     setStep("upload");
//                     return;
//                 }

//                 const learnersMap = new Map<string, DashboardLearner>();
//                 const todaySA = getTodaySA();
//                 let errors = 0;

//                 rows.forEach((row, index) => {
//                     const getVal = (possibleKeys: string[]) => {
//                         for (const key of possibleKeys) {
//                             const normalizedTarget = key.toLowerCase().replace(/[\s_*-]/g, '');
//                             const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_*-]/g, '') === normalizedTarget);
//                             if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
//                                 return String(row[exactKey]).trim();
//                             }
//                         }
//                         return "";
//                     };

//                     const idNumber = getVal(["nationalid", "idnumber", "learneralternateid", "id", "identitynumber"]);
//                     const firstName = getVal(["learnerfirstname", "firstname", "name", "first"]);
//                     const lastName = getVal(["learnerlastname", "lastname", "surname", "last"]);
//                     let fullName = getVal(["fullname", "learnerfullname"]);
//                     if (!fullName) fullName = `${firstName} ${lastName}`.trim();

//                     const saqaId = getVal(["qualificationid", "saqaid"]);
//                     const progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);

//                     // 🚀 NEW: Extract Email for checking
//                     const rawEmail = getVal(["learneremailaddress", "emailaddress", "email"]);
//                     const email = rawEmail ? String(rawEmail).toLowerCase().trim() : "";

//                     // 🛑 STRICT LOCK 1: PREVENT GHOSTS (Missing Data)
//                     if (!idNumber || !fullName || fullName === " ") {
//                         addToLog(`⚠️ Row ${index + 2}: Skipped (Missing critical ID or Name)`);
//                         errors++;
//                         return;
//                     }

//                     // 🛑 STRICT LOCK 2: PREVENT DUPLICATE IDs
//                     if (existingIds.has(idNumber)) {
//                         addToLog(`⚠️ Row ${index + 2}: Skipped (Learner ID ${idNumber} already exists in live database)`);
//                         errors++;
//                         return;
//                     }

//                     // 🛑 STRICT LOCK 3: PREVENT DUPLICATE EMAILS (Auth Protection)
//                     if (email && existingEmails.has(email)) {
//                         addToLog(`⚠️ Row ${index + 2}: Skipped (Email ${email} is already in use by another learner)`);
//                         errors++;
//                         return;
//                     }

//                     // 🛑 STRICT LOCK 4: VALIDATE QUALIFICATION
//                     const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
//                     const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

//                     if (!isSaqaMatch && !isNameMatch) {
//                         addToLog(`⚠️ Row ${index + 2}: Skipped (Course "${progName || saqaId}" not found in system)`);
//                         errors++;
//                         return;
//                     }

//                     const issueDateRaw = getVal(["statementofresultsissuedate", "issuedate"]);
//                     const issueDateSA = parseQCTODate(issueDateRaw);
//                     const sdpCode = getVal(["sdpcode", "providercode"]);

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
//                         email: rawEmail, // Save the original case email
//                         phone: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
//                         mobile: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
//                         dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob"])),
//                         cohortId: selectedCohortId || "Unassigned",
//                         trainingStartDate: parseQCTODate(getVal(["expectedtrainingcompletiondate", "trainingstartdate"])),
//                         createdAt: new Date().toISOString(),
//                         createdBy: "bulk-import",
//                         qualification: {
//                             name: progName,
//                             saqaId: saqaId,
//                             credits: 0,
//                             totalNotionalHours: 0,
//                             nqfLevel: 0,
//                             dateAssessed: issueDateSA,
//                         },
//                         knowledgeModules: [],
//                         practicalModules: [],
//                         workExperienceModules: [],
//                         eisaAdmission: getVal(["statementofresultsstatus", "eisaadmission"]) === "01",
//                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
//                         issueDate: issueDateSA,
//                         demographics: {
//                             sdpCode,
//                             learnerTitle: getVal(["learnertitle", "title"]),
//                             learnerMiddleName: getVal(["learnermiddlename", "middlename"]),
//                             genderCode: getVal(["gendercode", "gender"]),
//                             equityCode: getVal(["equitycode", "race"]),
//                             homeLanguageCode: getVal(["homelanguagecode", "language"]),
//                             citizenResidentStatusCode: getVal(["citizenresidentstatuscode", "citizen"]),
//                             nationalityCode: getVal(["nationalitycode", "nationality"]),
//                             immigrantStatus: getVal(["immigrantstatus"]),
//                             alternativeIdType: getVal(["alternativeidtype"]),
//                             socioeconomicStatusCode: getVal(["socioeconomicstatuscode"]),
//                             disabilityStatusCode: getVal(["disabilitystatuscode", "disability"]),
//                             disabilityRating: getVal(["disabilityrating"]),
//                             provinceCode: getVal(["provincecode", "province"]),
//                             statsaaAreaCode: getVal(["statssaareacode"]),
//                             flc: getVal(["flc"]),
//                             flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
//                             statementOfResultsStatus: getVal(["statementofresultsstatus"]),
//                             statementOfResultsIssueDate: issueDateSA,
//                             learnerReadinessForEISATypeId: getVal(["learnerreadinessforeisatypeid"]),
//                             assessmentCentreCode: getVal(["assessmentcentrecode"]),
//                             popiActAgree: getVal(["popiactagree"]),
//                             popiActDate: parseQCTODate(getVal(["popiactdate"])),
//                             expectedTrainingCompletionDate: parseQCTODate(getVal(["expectedtrainingcompletiondate"])),
//                             learnerHomeAddress1: getVal(["learnerhomeaddress1", "address1"]),
//                             learnerHomeAddress2: getVal(["learnerhomeaddress2", "address2"]),
//                             learnerHomeAddress3: getVal(["learnerhomeaddress3", "address3"]),
//                             learnerPostalAddress1: getVal(["learnerpostaladdress1"]),
//                             learnerPostalAddress2: getVal(["learnerpostaladdress2"]),
//                             learnerPostalAddressPostCode: getVal(["learnerpostaladdresspostcode", "postalcode", "zip"])
//                         } as LearnerDemographics
//                     };

//                     learnersMap.set(idNumber, newLearner);
//                 });

//                 setErrorCount(errors);
//                 setSuccessCount(learnersMap.size);

//                 if (learnersMap.size > 0) {
//                     await saveToStaging(learnersMap);
//                 } else {
//                     addToLog(`❌ Process complete. No valid learners found to import (Blocked: ${errors}).`);
//                     // We don't automatically go back to upload so they can read the log
//                 }

//             } catch (err: any) {
//                 addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
//             }
//         };

//         reader.onerror = () => {
//             addToLog(`❌ ERROR: Could not read file.`);
//             setStep("upload");
//         };

//         reader.readAsArrayBuffer(file);
//     };

//     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
//         addToLog(`💾 Committing ${dataMap.size} safe records to Staging Vault...`);
//         try {
//             const batch = writeBatch(db);
//             dataMap.forEach((learner) => {
//                 const ref = doc(db, "staging_learners", learner.id);
//                 batch.set(ref, learner);
//             });
//             await batch.commit();
//             await fetchStagingLearners();
//             addToLog(`✅ SUCCESS: Bulk import ready for review.`);
//             setStep("complete");
//         } catch (error: any) {
//             addToLog(`❌ DATABASE ERROR: ${error.message}`);
//         }
//     };

//     const EXPECTED_COLUMNS = [
//         "National Id (*)",
//         "Learner First Name",
//         "Learner Last Name",
//         "Qualification Title",
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
//                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>STRICT MVP VALIDATION ACTIVE</span>
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
//                                     Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). The system will strictly check against the live database and automatically block any duplicate IDs, emails, or unknown qualifications to prevent data corruption.
//                                 </p>
//                             </div>

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
//                                     padding: '3.5rem 2rem',
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

//                     {(step === "processing" || step === "complete") && (
//                         <div>
//                             <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
//                                 {step === "processing" ? (
//                                     <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
//                                 ) : (
//                                     <CheckCircle2 size={24} color="var(--mlab-green)" />
//                                 )}
//                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase' }}>
//                                     {step === "processing" ? "Processing Import..." : "Import Completed"}
//                                 </h4>
//                             </div>

//                             {step === "complete" && (
//                                 <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
//                                     <div style={{ flex: 1, padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', textAlign: 'center' }}>
//                                         <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>{successCount}</div>
//                                         <div style={{ fontSize: '0.75rem', color: '#15803d', textTransform: 'uppercase' }}>Staged</div>
//                                     </div>
//                                     <div style={{ flex: 1, padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', textAlign: 'center' }}>
//                                         <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>{errorCount}</div>
//                                         <div style={{ fontSize: '0.75rem', color: '#b91c1c', textTransform: 'uppercase' }}>Blocked</div>
//                                     </div>
//                                 </div>
//                             )}

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
//                                     <Terminal size={14} /> <span>STRICT_MVP_ENGINE_v6.0</span>
//                                 </div>
//                                 {debugLog.map((log, i) => (
//                                     <div key={i} style={{ marginBottom: "4px", color: log.includes("⚠️") || log.includes("❌") ? '#f87171' : '#94c73d' }}>
//                                         <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
//                                     </div>
//                                 ))}
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
//                     {step === "upload" ? (
//                         <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
//                             Cancel
//                         </button>
//                     ) : step === "complete" ? (
//                         <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
//                             <button className="mlab-btn mlab-btn--ghost" style={{ flex: 1 }} onClick={() => setStep("upload")}>
//                                 Upload Another
//                             </button>
//                             <button className="mlab-btn mlab-btn--green" style={{ flex: 1 }} onClick={onSuccess}>
//                                 Go to Staging Area
//                             </button>
//                         </div>
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


// // // src/components/admin/LearnerImportModal.tsx

// // import React, { useState, useRef } from "react";
// // import * as XLSX from "xlsx";
// // import {
// //     UploadCloud,
// //     X,
// //     Loader2,
// //     CheckCircle2,
// //     BookOpen,
// //     FileSpreadsheet,
// //     Terminal,
// //     AlertCircle,
// //     Info
// // } from "lucide-react";
// // import { writeBatch, doc } from "firebase/firestore";
// // import { useStore } from "../../store/useStore";
// // import type { DashboardLearner, LearnerDemographics } from "../../types";
// // import { db } from "../../lib/firebase";
// // import { generateSorId } from "../../pages/utils/validation";

// // import '../views/LearnersView/LearnersView.css'

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

// //     const parseQCTODate = (val: any): string => {
// //         const str = String(val || "").trim();
// //         if (!str) return "";

// //         if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
// //             const y = str.substring(0, 4);
// //             const m = str.substring(4, 6);
// //             const d = str.substring(6, 8);
// //             return `${d}-${m}-${y}`;
// //         }

// //         if (str.includes("-") && str.split("-")[0].length === 4) {
// //             const [y, m, d] = str.split("-");
// //             return `${d}-${m}-${y}`;
// //         }

// //         if (str.includes("/")) {
// //             const parts = str.split("/");
// //             if (parts[2].length === 4) {
// //                 return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
// //             }
// //         }

// //         return str;
// //     };

// //     const getTodaySA = (): string => {
// //         const d = new Date();
// //         const day = String(d.getDate()).padStart(2, '0');
// //         const month = String(d.getMonth() + 1).padStart(2, '0');
// //         const year = d.getFullYear();
// //         return `${day}-${month}-${year}`;
// //     };

// //     /**
// //      * ── DRAG & DROP HANDLERS ─────────────────────────────────────────────
// //      */
// //     const handleDragOver = (e: React.DragEvent) => {
// //         e.preventDefault();
// //         e.stopPropagation();
// //     };

// //     const handleDrop = (e: React.DragEvent) => {
// //         e.preventDefault();
// //         e.stopPropagation();
// //         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
// //             const droppedFile = e.dataTransfer.files[0];
// //             const validTypes = [
// //                 "text/csv",
// //                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
// //                 "application/vnd.ms-excel"
// //             ];

// //             if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
// //                 alert("Invalid file type. Please drop a .csv or .xlsx file.");
// //                 return;
// //             }
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
// //      * ── CORE PROCESSING LOGIC (EXCEL / LEISA BULK FORMAT) ───────────────
// //      */
// //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setStep("processing");
// //         setDebugLog([]);
// //         addToLog(`🚀 Initializing Bulk LEISA Import: ${file.name}`);

// //         const reader = new FileReader();

// //         reader.onload = async (event) => {
// //             try {
// //                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
// //                 const workbook = XLSX.read(data, { type: 'array' });

// //                 let targetSheetName = workbook.SheetNames[0];
// //                 let foundHeader = false;

// //                 if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
// //                     targetSheetName = "Learner Enrolment and EISA";
// //                     addToLog(`📁 Found QCTO Data Sheet. Skipping Instructions...`);
// //                 } else {
// //                     for (const sheetName of workbook.SheetNames) {
// //                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
// //                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
// //                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-]/g, ''));
// //                             if (headers.includes("nationalid") || headers.includes("learneralternateid") || headers.includes("idnumber")) {
// //                                 targetSheetName = sheetName;
// //                                 foundHeader = true;
// //                                 break;
// //                             }
// //                         }
// //                         if (foundHeader) break;
// //                     }
// //                 }

// //                 addToLog(`📖 Reading data from sheet: "${targetSheetName}"`);
// //                 const worksheet = workbook.Sheets[targetSheetName];

// //                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

// //                 if (rows.length === 0) {
// //                     addToLog(`❌ Error: No data found in sheet "${targetSheetName}".`);
// //                     setStep("upload");
// //                     return;
// //                 }

// //                 const learnersMap = new Map<string, DashboardLearner>();
// //                 const todaySA = getTodaySA();

// //                 rows.forEach((row, index) => {
// //                     // 🚀 FIXED: Robust multi-alias mapping that aggressively scrubs whitespace/characters
// //                     const getVal = (possibleKeys: string[]) => {
// //                         for (const key of possibleKeys) {
// //                             const normalizedTarget = key.toLowerCase().replace(/[\s_*-]/g, '');
// //                             const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_*-]/g, '') === normalizedTarget);
// //                             if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
// //                                 return String(row[exactKey]).trim();
// //                             }
// //                         }
// //                         return "";
// //                     };

// //                     const idNumber = getVal(["nationalid", "idnumber", "learneralternateid", "id", "identitynumber"]);
// //                     const firstName = getVal(["learnerfirstname", "firstname", "name", "first"]);
// //                     const lastName = getVal(["learnerlastname", "lastname", "surname", "last"]);
// //                     let fullName = getVal(["fullname", "learnerfullname"]);

// //                     if (!fullName) fullName = `${firstName} ${lastName}`.trim();

// //                     // 🚀 FIXED: GHOST PREVENTION. Reject rows entirely if missing ID or Name.
// //                     if (!idNumber) {
// //                         addToLog(`⚠️ Row ${index + 2}: Skipped (Missing ID Number)`);
// //                         return;
// //                     }
// //                     if (!fullName) {
// //                         addToLog(`⚠️ Row ${index + 2}: Skipped (Missing Learner Name)`);
// //                         return;
// //                     }

// //                     const issueDateRaw = getVal(["statementofresultsissuedate", "issuedate"]);
// //                     const issueDateSA = parseQCTODate(issueDateRaw);
// //                     const sdpCode = getVal(["sdpcode", "providercode"]);

// //                     const newLearner: DashboardLearner = {
// //                         id: idNumber,
// //                         learnerId: idNumber,
// //                         enrollmentId: idNumber,
// //                         firstName,
// //                         lastName,
// //                         fullName,
// //                         status: "active",
// //                         isDraft: true,
// //                         authStatus: "pending",
// //                         isArchived: false,
// //                         idNumber,
// //                         email: getVal(["learneremailaddress", "emailaddress", "email"]),
// //                         phone: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
// //                         mobile: getVal(["learnercellphonenumber", "cellphonenumber", "phone", "mobile"]),
// //                         dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob"])),
// //                         cohortId: selectedCohortId || "Unassigned",
// //                         trainingStartDate: parseQCTODate(getVal(["expectedtrainingcompletiondate", "trainingstartdate"])),
// //                         createdAt: new Date().toISOString(),
// //                         createdBy: "bulk-import",
// //                         qualification: {
// //                             name: getVal(["qualificationtitle", "programmename", "qualificationname"]),
// //                             saqaId: getVal(["qualificationid", "saqaid"]),
// //                             credits: 0,
// //                             totalNotionalHours: 0,
// //                             nqfLevel: 0,
// //                             dateAssessed: issueDateSA,
// //                         },
// //                         knowledgeModules: [],
// //                         practicalModules: [],
// //                         workExperienceModules: [],
// //                         eisaAdmission: getVal(["statementofresultsstatus", "eisaadmission"]) === "01",
// //                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
// //                         issueDate: issueDateSA,
// //                         demographics: {
// //                             sdpCode,
// //                             learnerTitle: getVal(["learnertitle", "title"]),
// //                             learnerMiddleName: getVal(["learnermiddlename", "middlename"]),
// //                             genderCode: getVal(["gendercode", "gender"]),
// //                             equityCode: getVal(["equitycode", "race"]),
// //                             homeLanguageCode: getVal(["homelanguagecode", "language"]),
// //                             citizenResidentStatusCode: getVal(["citizenresidentstatuscode", "citizen"]),
// //                             nationalityCode: getVal(["nationalitycode", "nationality"]),
// //                             immigrantStatus: getVal(["immigrantstatus"]),
// //                             alternativeIdType: getVal(["alternativeidtype"]),
// //                             socioeconomicStatusCode: getVal(["socioeconomicstatuscode"]),
// //                             disabilityStatusCode: getVal(["disabilitystatuscode", "disability"]),
// //                             disabilityRating: getVal(["disabilityrating"]),
// //                             provinceCode: getVal(["provincecode", "province"]),
// //                             statsaaAreaCode: getVal(["statssaareacode"]),
// //                             flc: getVal(["flc"]),
// //                             flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
// //                             statementOfResultsStatus: getVal(["statementofresultsstatus"]),
// //                             statementOfResultsIssueDate: issueDateSA,
// //                             learnerReadinessForEISATypeId: getVal(["learnerreadinessforeisatypeid"]),
// //                             assessmentCentreCode: getVal(["assessmentcentrecode"]),
// //                             popiActAgree: getVal(["popiactagree"]),
// //                             popiActDate: parseQCTODate(getVal(["popiactdate"])),
// //                             expectedTrainingCompletionDate: parseQCTODate(getVal(["expectedtrainingcompletiondate"])),
// //                             learnerHomeAddress1: getVal(["learnerhomeaddress1", "address1"]),
// //                             learnerHomeAddress2: getVal(["learnerhomeaddress2", "address2"]),
// //                             learnerHomeAddress3: getVal(["learnerhomeaddress3", "address3"]),
// //                             learnerPostalAddress1: getVal(["learnerpostaladdress1"]),
// //                             learnerPostalAddress2: getVal(["learnerpostaladdress2"]),
// //                             learnerPostalAddressPostCode: getVal(["learnerpostaladdresspostcode", "postalcode", "zip"])
// //                         } as LearnerDemographics
// //                     };

// //                     learnersMap.set(idNumber, newLearner);
// //                     addToLog(`✅ Mapped: ${fullName} (${idNumber})`);
// //                 });

// //                 if (learnersMap.size > 0) {
// //                     await saveToStaging(learnersMap);
// //                 } else {
// //                     addToLog("❌ No valid learners found to import.");
// //                     setStep("upload");
// //                 }

// //             } catch (err: any) {
// //                 addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
// //                 setStep("upload");
// //             }
// //         };

// //         reader.onerror = () => {
// //             addToLog(`❌ ERROR: Could not read file.`);
// //             setStep("upload");
// //         };

// //         reader.readAsArrayBuffer(file);
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

// //     const EXPECTED_COLUMNS = [
// //         "National Id (*)",
// //         "Learner First Name",
// //         "Learner Last Name",
// //         "Qualification Title",
// //         "Statement of Results Issue Date",
// //         "FLC Statement of result number"
// //     ];

// //     return (
// //         <div className="mlab-modal-overlay">
// //             <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px', background: 'whitesmoke' }}>

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
// //                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>EXCEL & CSV SUPPORTED</span>
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
// //                                     Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>) using the standard LEISA headers. All learners will be mapped and sent to the <strong>Staging Area</strong>. Empty fields will be strictly preserved as blank.
// //                                 </p>
// //                             </div>

// //                             <div style={{ marginBottom: '1.5rem' }}>
// //                                 <label style={{
// //                                     fontFamily: 'var(--font-heading)',
// //                                     fontWeight: 700,
// //                                     fontSize: '0.75rem',
// //                                     color: 'var(--mlab-grey)',
// //                                     letterSpacing: '0.08em',
// //                                     textTransform: 'uppercase',
// //                                     display: 'flex',
// //                                     alignItems: 'center',
// //                                     gap: '6px',
// //                                     marginBottom: '8px'
// //                                 }}>
// //                                     <Info size={14} color="var(--mlab-blue)" /> Expected Columns
// //                                 </label>
// //                                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '10px' }}>
// //                                     The system maps standard LEISA headers (spaces are ignored). Key columns include:
// //                                 </div>
// //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
// //                                     {EXPECTED_COLUMNS.map(col => (
// //                                         <span key={col} style={{
// //                                             background: '#f1f5f9',
// //                                             color: '#334155',
// //                                             border: '1px solid #cbd5e1',
// //                                             padding: '4px 8px',
// //                                             borderRadius: '4px',
// //                                             fontSize: '0.75rem',
// //                                             fontWeight: 600
// //                                         }}>
// //                                             {col}
// //                                         </span>
// //                                     ))}
// //                                     <span style={{ color: '#64748b', padding: '4px 8px', fontSize: '0.75rem', fontStyle: 'italic' }}>
// //                                         + other LEISA fields...
// //                                     </span>
// //                                 </div>
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
// //                                     cursor: 'pointer',
// //                                     transition: 'all 0.2s ease'
// //                                 }}
// //                             >
// //                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
// //                                 <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
// //                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 8px' }}>
// //                                     Drop Bulk Spreadsheet Here
// //                                 </h4>
// //                                 <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: 0 }}>
// //                                     Supports <strong>.xlsx</strong> and <strong>.csv</strong> files.
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
// //                                     <Terminal size={14} /> <span>BULK_MAPPING_ENGINE_v4.0</span>
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


// // // // src/components/admin/LearnerImportModal.tsx

// // // import React, { useState, useRef } from "react";
// // // import * as XLSX from "xlsx";
// // // import {
// // //     UploadCloud,
// // //     X,
// // //     Loader2,
// // //     CheckCircle2,
// // //     BookOpen,
// // //     FileSpreadsheet,
// // //     Terminal,
// // //     AlertCircle,
// // //     Info
// // // } from "lucide-react";
// // // import { writeBatch, doc } from "firebase/firestore";
// // // import { useStore } from "../../store/useStore";
// // // import type { DashboardLearner, LearnerDemographics } from "../../types";
// // // import { db } from "../../lib/firebase";
// // // import { generateSorId } from "../../pages/utils/validation";

// // // import '../views/LearnersView/LearnersView.css'

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
// // //     const { cohorts } = useStore();

// // //     const fileInputRef = useRef<HTMLInputElement>(null);
// // //     const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
// // //     const [debugLog, setDebugLog] = useState<string[]>([]);
// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

// // //     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

// // //     /**
// // //      * ── HELPERS ──────────────────────────────────────────────────────────
// // //      */

// // //     const parseQCTODate = (val: any): string => {
// // //         const str = String(val || "").trim();
// // //         if (!str) return "";

// // //         if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
// // //             const y = str.substring(0, 4);
// // //             const m = str.substring(4, 6);
// // //             const d = str.substring(6, 8);
// // //             return `${d}-${m}-${y}`;
// // //         }

// // //         if (str.includes("-") && str.split("-")[0].length === 4) {
// // //             const [y, m, d] = str.split("-");
// // //             return `${d}-${m}-${y}`;
// // //         }

// // //         if (str.includes("/")) {
// // //             const parts = str.split("/");
// // //             if (parts[2].length === 4) {
// // //                 return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
// // //             }
// // //         }

// // //         return str;
// // //     };

// // //     const getTodaySA = (): string => {
// // //         const d = new Date();
// // //         const day = String(d.getDate()).padStart(2, '0');
// // //         const month = String(d.getMonth() + 1).padStart(2, '0');
// // //         const year = d.getFullYear();
// // //         return `${day}-${month}-${year}`;
// // //     };

// // //     /**
// // //      * ── DRAG & DROP HANDLERS ─────────────────────────────────────────────
// // //      */
// // //     const handleDragOver = (e: React.DragEvent) => {
// // //         e.preventDefault();
// // //         e.stopPropagation();
// // //     };

// // //     const handleDrop = (e: React.DragEvent) => {
// // //         e.preventDefault();
// // //         e.stopPropagation();
// // //         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
// // //             const droppedFile = e.dataTransfer.files[0];
// // //             const validTypes = [
// // //                 "text/csv",
// // //                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
// // //                 "application/vnd.ms-excel"
// // //             ];

// // //             if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
// // //                 alert("Invalid file type. Please drop a .csv or .xlsx file.");
// // //                 return;
// // //             }
// // //             if (fileInputRef.current) {
// // //                 const dataTransfer = new DataTransfer();
// // //                 dataTransfer.items.add(droppedFile);
// // //                 fileInputRef.current.files = dataTransfer.files;
// // //                 const event = new Event("change", { bubbles: true });
// // //                 fileInputRef.current.dispatchEvent(event);
// // //             }
// // //         }
// // //     };

// // //     /**
// // //      * ── CORE PROCESSING LOGIC (EXCEL / LEISA BULK FORMAT) ───────────────
// // //      */
// // //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         setStep("processing");
// // //         setDebugLog([]);
// // //         addToLog(`🚀 Initializing Bulk LEISA Import: ${file.name}`);

// // //         const reader = new FileReader();

// // //         reader.onload = async (event) => {
// // //             try {
// // //                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
// // //                 const workbook = XLSX.read(data, { type: 'array' });

// // //                 let targetSheetName = workbook.SheetNames[0];
// // //                 let foundHeader = false;

// // //                 if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
// // //                     targetSheetName = "Learner Enrolment and EISA";
// // //                     addToLog(`📁 Found QCTO Data Sheet. Skipping Instructions...`);
// // //                 } else {
// // //                     for (const sheetName of workbook.SheetNames) {
// // //                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
// // //                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
// // //                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/\s/g, ''));
// // //                             if (headers.includes("nationalid") || headers.includes("learneralternateid")) {
// // //                                 targetSheetName = sheetName;
// // //                                 foundHeader = true;
// // //                                 break;
// // //                             }
// // //                         }
// // //                         if (foundHeader) break;
// // //                     }
// // //                 }

// // //                 addToLog(`📖 Reading data from sheet: "${targetSheetName}"`);
// // //                 const worksheet = workbook.Sheets[targetSheetName];

// // //                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

// // //                 if (rows.length === 0) {
// // //                     addToLog(`❌ Error: No data found in sheet "${targetSheetName}".`);
// // //                     setStep("upload");
// // //                     return;
// // //                 }

// // //                 const firstRowKeys = Object.keys(rows[0]).map(k => k.toLowerCase().replace(/\s/g, ''));
// // //                 if (!firstRowKeys.includes("nationalid") && !firstRowKeys.includes("learneralternateid")) {
// // //                     addToLog(`❌ Error: Header "National Id" not found. Please ensure headers match standard LEISA layout.`);
// // //                     setStep("upload");
// // //                     return;
// // //                 }

// // //                 const learnersMap = new Map<string, DashboardLearner>();
// // //                 const todaySA = getTodaySA();

// // //                 rows.forEach((row, index) => {
// // //                     const getVal = (key: string) => {
// // //                         const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
// // //                         return exactKey ? String(row[exactKey] || "").trim() : "";
// // //                     };

// // //                     const idNumber = getVal("nationalid");
// // //                     const firstName = getVal("learnerfirstname");
// // //                     const lastName = getVal("learnerlastname");
// // //                     const fullName = `${firstName} ${lastName}`.trim();

// // //                     // ID Number is the only strict requirement to create a unique Staging record
// // //                     if (!idNumber || idNumber === "undefined") {
// // //                         addToLog(`⚠️ Row ${index + 2}: Skipped (Missing National ID)`);
// // //                         return;
// // //                     }

// // //                     const issueDateRaw = getVal("statementofresultsissuedate");
// // //                     const issueDateSA = parseQCTODate(issueDateRaw);
// // //                     const sdpCode = getVal("sdpcode");

// // //                     const newLearner: DashboardLearner = {
// // //                         id: idNumber,
// // //                         learnerId: idNumber,
// // //                         enrollmentId: idNumber,
// // //                         firstName,
// // //                         lastName,
// // //                         fullName,
// // //                         status: "active",
// // //                         isDraft: true,
// // //                         authStatus: "pending",
// // //                         isArchived: false,
// // //                         idNumber,
// // //                         email: getVal("learneremailaddress"),
// // //                         phone: getVal("learnercellphonenumber"),
// // //                         mobile: getVal("learnercellphonenumber"),
// // //                         dateOfBirth: parseQCTODate(getVal("learnerbirthdate")),
// // //                         cohortId: selectedCohortId || "Unassigned",
// // //                         trainingStartDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
// // //                         createdAt: new Date().toISOString(),
// // //                         createdBy: "bulk-import",
// // //                         qualification: {
// // //                             name: getVal("qualificationtitle"),
// // //                             saqaId: getVal("qualificationid"),
// // //                             credits: 0,
// // //                             totalNotionalHours: 0,
// // //                             nqfLevel: 0,
// // //                             dateAssessed: issueDateSA,
// // //                         },
// // //                         knowledgeModules: [],
// // //                         practicalModules: [],
// // //                         workExperienceModules: [],
// // //                         eisaAdmission: getVal("statementofresultsstatus") === "01",
// // //                         // Fallback purely for internal system unique ID generation if missing
// // //                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
// // //                         issueDate: issueDateSA,
// // //                         demographics: {
// // //                             sdpCode,
// // //                             learnerTitle: getVal("learnertitle"),
// // //                             learnerMiddleName: getVal("learnermiddlename"),
// // //                             genderCode: getVal("gendercode"),
// // //                             equityCode: getVal("equitycode"),
// // //                             homeLanguageCode: getVal("homelanguagecode"),
// // //                             citizenResidentStatusCode: getVal("citizenresidentstatuscode"),
// // //                             nationalityCode: getVal("nationalitycode"),
// // //                             immigrantStatus: getVal("immigrantstatus"),
// // //                             alternativeIdType: getVal("alternativeidtype"),
// // //                             socioeconomicStatusCode: getVal("socioeconomicstatuscode"),
// // //                             disabilityStatusCode: getVal("disabilitystatuscode"),
// // //                             disabilityRating: getVal("disabilityrating"),
// // //                             provinceCode: getVal("provincecode"),
// // //                             statsaaAreaCode: getVal("statssaareacode"),
// // //                             flc: getVal("flc"),
// // //                             flcStatementOfResultNumber: getVal("flcstatementofresultnumber"),
// // //                             statementOfResultsStatus: getVal("statementofresultsstatus"),
// // //                             statementOfResultsIssueDate: issueDateSA,
// // //                             learnerReadinessForEISATypeId: getVal("learnerreadinessforeisatypeid"),
// // //                             assessmentCentreCode: getVal("assessmentcentrecode"),
// // //                             popiActAgree: getVal("popiactagree"),
// // //                             popiActDate: parseQCTODate(getVal("popiactdate")),
// // //                             expectedTrainingCompletionDate: parseQCTODate(getVal("expectedtrainingcompletiondate")),
// // //                             learnerHomeAddress1: getVal("learnerhomeaddress1"),
// // //                             learnerHomeAddress2: getVal("learnerhomeaddress2"),
// // //                             learnerHomeAddress3: getVal("learnerhomeaddress3"),
// // //                             learnerPostalAddress1: getVal("learnerpostaladdress1"),
// // //                             learnerPostalAddress2: getVal("learnerpostaladdress2"),
// // //                             learnerPostalAddressPostCode: getVal("learnerpostaladdresspostcode")
// // //                         } as LearnerDemographics
// // //                     };

// // //                     learnersMap.set(idNumber, newLearner);
// // //                     addToLog(`✅ Mapped: ${fullName || idNumber}`);
// // //                 });

// // //                 if (learnersMap.size > 0) {
// // //                     await saveToStaging(learnersMap);
// // //                 } else {
// // //                     addToLog("❌ No valid learners found to import.");
// // //                     setStep("upload");
// // //                 }

// // //             } catch (err: any) {
// // //                 addToLog(`❌ EXCEL PARSE ERROR: ${err.message}`);
// // //                 setStep("upload");
// // //             }
// // //         };

// // //         reader.onerror = () => {
// // //             addToLog(`❌ ERROR: Could not read file.`);
// // //             setStep("upload");
// // //         };

// // //         reader.readAsArrayBuffer(file);
// // //     };

// // //     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
// // //         addToLog(`💾 Committing ${dataMap.size} records to Staging Vault...`);
// // //         try {
// // //             const batch = writeBatch(db);
// // //             dataMap.forEach((learner) => {
// // //                 const ref = doc(db, "staging_learners", learner.id);
// // //                 batch.set(ref, learner);
// // //             });
// // //             await batch.commit();
// // //             addToLog(`✅ SUCCESS: Bulk import ready for review.`);
// // //             setStep("complete");
// // //             setTimeout(() => onSuccess(), 2500);
// // //         } catch (error: any) {
// // //             addToLog(`❌ DATABASE ERROR: ${error.message}`);
// // //             setStep("upload");
// // //         }
// // //     };

// // //     const EXPECTED_COLUMNS = [
// // //         "National Id (*)",
// // //         "Learner First Name",
// // //         "Learner Last Name",
// // //         "Qualification Title",
// // //         "Statement of Results Issue Date",
// // //         "FLC Statement of result number"
// // //     ];

// // //     return (
// // //         <div className="mlab-modal-overlay">
// // //             {/* <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px' }}> */}
// // //             <div className="mlab-modal mlab-modal--md animate-fade-in" style={{ maxWidth: '600px', background: 'whitesmoke' }}>

// // //                 {/* ── HEADER ── */}
// // //                 <div className="mlab-modal__header" style={{ borderBottom: '2px solid var(--mlab-light-blue)' }}>
// // //                     <div className="mlab-modal__title-group">
// // //                         <div style={{ background: 'var(--mlab-light-blue)', padding: '8px', borderRadius: '6px', color: 'var(--mlab-blue)' }}>
// // //                             <FileSpreadsheet size={22} />
// // //                         </div>
// // //                         <div style={{ marginLeft: '12px' }}>
// // //                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
// // //                                 Bulk LEISA Import
// // //                             </h2>
// // //                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>EXCEL & CSV SUPPORTED</span>
// // //                         </div>
// // //                     </div>
// // //                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
// // //                         <X size={20} />
// // //                     </button>
// // //                 </div>

// // //                 {/* ── BODY ── */}
// // //                 <div className="mlab-modal__body" style={{ padding: '1.5rem' }}>
// // //                     {step === "upload" && (
// // //                         <>
// // //                             <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '12px 16px', marginBottom: '1.5rem', borderRadius: '0 4px 4px 0' }}>
// // //                                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.5 }}>
// // //                                     Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>) using the standard LEISA headers. All learners will be mapped and sent to the <strong>Staging Area</strong>. Empty fields will be strictly preserved as blank.
// // //                                 </p>
// // //                             </div>

// // //                             <div style={{ marginBottom: '1.5rem' }}>
// // //                                 <label style={{
// // //                                     fontFamily: 'var(--font-heading)',
// // //                                     fontWeight: 700,
// // //                                     fontSize: '0.75rem',
// // //                                     color: 'var(--mlab-grey)',
// // //                                     letterSpacing: '0.08em',
// // //                                     textTransform: 'uppercase',
// // //                                     display: 'flex',
// // //                                     alignItems: 'center',
// // //                                     gap: '6px',
// // //                                     marginBottom: '8px'
// // //                                 }}>
// // //                                     <Info size={14} color="var(--mlab-blue)" /> Expected Columns
// // //                                 </label>
// // //                                 <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '10px' }}>
// // //                                     The system maps standard LEISA headers (spaces are ignored). Key columns include:
// // //                                 </div>
// // //                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
// // //                                     {EXPECTED_COLUMNS.map(col => (
// // //                                         <span key={col} style={{
// // //                                             background: '#f1f5f9',
// // //                                             color: '#334155',
// // //                                             border: '1px solid #cbd5e1',
// // //                                             padding: '4px 8px',
// // //                                             borderRadius: '4px',
// // //                                             fontSize: '0.75rem',
// // //                                             fontWeight: 600
// // //                                         }}>
// // //                                             {col}
// // //                                         </span>
// // //                                     ))}
// // //                                     <span style={{ color: '#64748b', padding: '4px 8px', fontSize: '0.75rem', fontStyle: 'italic' }}>
// // //                                         + other LEISA fields...
// // //                                     </span>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="lfm-fg" style={{ marginBottom: '1.5rem' }}>
// // //                                 <label style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--mlab-grey)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
// // //                                     <BookOpen size={14} color="var(--mlab-blue)" /> Target Cohort
// // //                                 </label>
// // //                                 <select
// // //                                     value={selectedCohortId}
// // //                                     onChange={(e) => setSelectedCohortId(e.target.value)}
// // //                                     className="lfm-input lfm-select"
// // //                                     style={{ margin: 0 }}
// // //                                 >
// // //                                     <option value="">-- DEFAULT: DRAFT/UNASSIGNED --</option>
// // //                                     {cohorts.filter((c) => !c.isArchived).map((c) => (
// // //                                         <option key={c.id} value={c.id}>{c.name}</option>
// // //                                     ))}
// // //                                 </select>
// // //                             </div>

// // //                             <div
// // //                                 className="mlab-import-dropzone"
// // //                                 onDragOver={handleDragOver}
// // //                                 onDrop={handleDrop}
// // //                                 onClick={() => fileInputRef.current?.click()}
// // //                                 style={{
// // //                                     border: '2px dashed var(--mlab-border)',
// // //                                     borderRadius: '12px',
// // //                                     padding: '3.5rem 2rem',
// // //                                     textAlign: 'center',
// // //                                     backgroundColor: 'var(--mlab-bg)',
// // //                                     cursor: 'pointer',
// // //                                     transition: 'all 0.2s ease'
// // //                                 }}
// // //                             >
// // //                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
// // //                                 <UploadCloud size={48} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
// // //                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 8px' }}>
// // //                                     Drop Bulk Spreadsheet Here
// // //                                 </h4>
// // //                                 <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: 0 }}>
// // //                                     Supports <strong>.xlsx</strong> and <strong>.csv</strong> files.
// // //                                 </p>
// // //                             </div>
// // //                         </>
// // //                     )}

// // //                     {step === "processing" && (
// // //                         <div>
// // //                             <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
// // //                                 <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
// // //                                 <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, textTransform: 'uppercase' }}>
// // //                                     Mapping Data Fields...
// // //                                 </h4>
// // //                             </div>
// // //                             <div style={{
// // //                                 background: "#051e26",
// // //                                 color: "#94c73d",
// // //                                 padding: "1.25rem",
// // //                                 borderRadius: "8px",
// // //                                 fontFamily: "'Courier New', Courier, monospace",
// // //                                 fontSize: "0.8rem",
// // //                                 height: "220px",
// // //                                 overflowY: "auto",
// // //                                 border: '1px solid #0a2d38'
// // //                             }}>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b8a34', marginBottom: '10px', borderBottom: '1px solid #0a2d38', paddingBottom: '6px' }}>
// // //                                     <Terminal size={14} /> <span>BULK_MAPPING_ENGINE_v4.0</span>
// // //                                 </div>
// // //                                 {debugLog.map((log, i) => (
// // //                                     <div key={i} style={{ marginBottom: "4px" }}>
// // //                                         <span style={{ color: '#0ea5e9' }}>&gt;</span> {log}
// // //                                     </div>
// // //                                 ))}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {step === "complete" && (
// // //                         <div style={{ textAlign: "center", padding: "2rem 0" }}>
// // //                             <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
// // //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
// // //                                 Import Successful
// // //                             </h3>
// // //                             <p style={{ color: 'var(--mlab-grey)', margin: '0.5rem 0 1.5rem' }}>
// // //                                 Learners have been successfully staged for approval.
// // //                             </p>
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 <div className="mlab-modal__footer" style={{ background: 'var(--mlab-bg)' }}>
// // //                     {step === "upload" ? (
// // //                         <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
// // //                             Cancel
// // //                         </button>
// // //                     ) : step === "complete" ? (
// // //                         <button className="mlab-btn mlab-btn--green" style={{ width: '100%' }} onClick={onSuccess}>
// // //                             Go to Staging Area
// // //                         </button>
// // //                     ) : (
// // //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
// // //                             <AlertCircle size={14} /> SECURITY: DATABASE TRANSACTION IN PROGRESS
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };