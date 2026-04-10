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
                    const sdpCode = getVal("sdpcode");

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
                            name: getVal("qualificationtitle"),
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