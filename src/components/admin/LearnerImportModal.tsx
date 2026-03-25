import React, { useState, useRef } from "react";
import Papa from "papaparse";
import {
    UploadCloud,
    X,
    Loader2,
    CheckCircle2,
    BookOpen,
} from "lucide-react";
import { writeBatch, doc } from "firebase/firestore";
import { useStore } from "../../store/useStore";
import type {
    DashboardLearner,
} from "../../types";
import { db } from "../../lib/firebase";
import { generateSorId } from "../../pages/utils/validation";

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
    const { cohorts, programmes } = useStore();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<"upload" | "processing" | "complete">(
        "upload",
    );
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [stats, setStats] = useState({ total: 0, skipped: 0 });

    const [selectedCohortId, setSelectedCohortId] = useState<string>(
        cohortId || "",
    );

    const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

    // Force South African Date Format (DD-MM-YYYY)
    const formatDateSA = (dateInput: string | Date | undefined | null): string => {
        if (!dateInput) {
            const d = new Date();
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${day}-${month}-${d.getFullYear()}`;
        }

        // Handle strings that might already be DD-MM-YYYY or similar
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput).trim(); // Fallback to raw string if JS can't parse it

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing");
        addToLog(`Reading file: ${file.name}...`);

        Papa.parse(file, {
            skipEmptyLines: false,
            complete: async (results) => {
                const rawData = results.data as string[][];

                if (!rawData || rawData.length < 15) {
                    alert("File does not match the standard mLab Single-Student template format.");
                    setStep("upload");
                    return;
                }

                addToLog(`Parsing Single-Student Template...`);
                const learnersMap = new Map<string, DashboardLearner>();

                try {
                    // 1. PLUCK SPECIFIC CELLS (Based on your exact CSV layout)
                    const fullName = (rawData[7]?.[1] || "Unknown Learner").trim();
                    const idNumber = (rawData[8]?.[1] || "").trim();

                    // Pluck and Format the Issue Date into DD-MM-YYYY
                    const rawIssueDate = rawData[12]?.[1];
                    const issueDateStr = formatDateSA(rawIssueDate);

                    const providerCode = "SDP070824115131";

                    if (!idNumber) {
                        addToLog(`⚠️ Failed: No ID Number found in Row 9 (Cell B9).`);
                        setStep("upload");
                        return;
                    }

                    // 2. CREATE LEARNER SHELL WITH SYNCED DATES
                    const newLearner: DashboardLearner = {
                        id: idNumber,
                        learnerId: idNumber,
                        enrollmentId: idNumber,
                        firstName: fullName.split(' ')[0],
                        lastName: fullName.split(' ').slice(1).join(' '),
                        fullName: fullName,
                        status: "active",
                        isDraft: true,
                        authStatus: "pending",
                        isArchived: false,
                        idNumber: idNumber,
                        email: (rawData[10]?.[1] || "").trim(),
                        phone: (rawData[11]?.[1] || "").trim(),
                        mobile: (rawData[11]?.[1] || "").trim(),
                        dateOfBirth: "",
                        cohortId: selectedCohortId || "Unassigned",
                        trainingStartDate: formatDateSA(rawData[5]?.[1]), // Format training start date as well
                        createdAt: new Date().toISOString(),
                        createdBy: "admin-import",

                        qualification: {
                            name: (rawData[0]?.[1] || "Occupational Certificate").trim(),
                            saqaId: (rawData[3]?.[1] || "").trim(),
                            credits: parseInt(rawData[4]?.[1] || "0"),
                            totalNotionalHours: (parseInt(rawData[4]?.[1] || "0")) * 10,
                            nqfLevel: parseInt(rawData[1]?.[1] || "0"),
                            // 🚀 SYNC: Qualification Date Assessed = Statement Issue Date
                            dateAssessed: issueDateStr,
                        },
                        knowledgeModules: [],
                        practicalModules: [],
                        workExperienceModules: [],
                        eisaAdmission: true, // Assuming true for offline graduates

                        // Generate the custom MLAB SoR ID and lock the date!
                        verificationCode: generateSorId(fullName, issueDateStr, providerCode),
                        issueDate: issueDateStr,
                    };

                    let importedCohortName = (rawData[9]?.[1] || "").trim();

                    // 3. LOOP THROUGH MODULES (Starts at Row 15 / Index 14)
                    let currentType = "K";
                    let isModuleSection = false;

                    for (let i = 14; i < rawData.length; i++) {
                        const row = rawData[i];
                        if (!row) continue;

                        const col0 = (row[0] || "").toLowerCase();
                        const modName = (row[1] || "").trim();

                        if (col0 === "modules" || col0 === "") {
                            if (modName.toLowerCase() === "module name") {
                                isModuleSection = true;
                                continue;
                            }
                        }

                        // Stop parsing if we hit completely empty rows at the bottom
                        if (!modName && !col0) continue;

                        if (col0.includes("knowledge")) currentType = "K";
                        else if (col0.includes("practical") || col0.includes("skills")) currentType = "P";
                        else if (col0.includes("work") || col0.includes("experience") || col0.includes("workplace")) currentType = "W";

                        if (modName && modName.toLowerCase() !== "module name") {
                            const modCode = row[2]?.trim() || "";
                            const baseMod = {
                                name: modName,
                                code: modCode,
                                nqfLevel: parseInt(row[3]) || newLearner.qualification.nqfLevel || 5,
                                credits: parseInt(row[4] || "0"),
                                notionalHours: parseInt(row[4] || "0") * 10,
                                status: (row[8]?.trim() || row[7]?.trim()) || "Competent",
                                // Every module's Date Assessed = Statement Issue Date
                                dateAssessed: issueDateStr,
                                dateSignedOff: issueDateStr,
                                isTemplateLocked: false,
                            };

                            let targetSection = currentType;
                            if (modCode.toUpperCase().startsWith("KM")) targetSection = "K";
                            else if (modCode.toUpperCase().startsWith("PM")) targetSection = "P";
                            else if (modCode.toUpperCase().startsWith("WM") || modCode.toUpperCase().startsWith("WE")) targetSection = "W";

                            if (targetSection === "K") newLearner.knowledgeModules?.push(baseMod as any);
                            else if (targetSection === "P") newLearner.practicalModules?.push(baseMod as any);
                            else if (targetSection === "W") newLearner.workExperienceModules?.push(baseMod as any);
                            else newLearner.knowledgeModules?.push(baseMod as any);
                        }
                    }

                    const matchedCohort = importedCohortName
                        ? cohorts.find(c => c.name.toLowerCase().trim() === importedCohortName.toLowerCase().trim())
                        : null;

                    if (matchedCohort) {
                        newLearner.cohortId = matchedCohort.id;
                    }

                    learnersMap.set(idNumber, newLearner);
                    setStats({ total: 1, skipped: 0 });
                    addToLog(`Processed 1 Single-Student Template with SA Date: ${issueDateStr}`);

                    await saveToStaging(learnersMap);

                } catch (err: any) {
                    alert(`Template Parsing Error: ${err.message}`);
                    setStep("upload");
                }
            },
            error: (err) => {
                alert(`CSV Reader Error: ${err.message}`);
                setStep("upload");
            },
        });
    };

    const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
        addToLog(`Saving to 'staging_learners' collection...`);
        try {
            const batch = writeBatch(db);
            let count = 0;

            dataMap.forEach((learner) => {
                const ref = doc(db, "staging_learners", learner.id);
                batch.set(ref, learner);
                count++;
            });

            await batch.commit();
            addToLog(`✅ SUCCESS: ${count} record moved to Staging Area.`);
            setStep("complete");

            setTimeout(() => {
                onSuccess();
            }, 1500);
        } catch (error: any) {
            console.error(error);
            addToLog(`❌ DATABASE ERROR: ${error.message}`);
            alert("Error saving to database. Check console for details.");
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(e.dataTransfer.files[0]);
                fileInputRef.current.files = dataTransfer.files;
                const event = new Event("change", { bubbles: true });
                fileInputRef.current.dispatchEvent(event);
            }
        }
    };

    return (
        <div className="mlab-modal-overlay">
            <div className="mlab-modal mlab-modal--md">
                <div className="mlab-modal__header">
                    <div className="mlab-modal__title-group">
                        <UploadCloud size={20} className="mlab-modal__icon" />
                        <h2>Import Statement of Results</h2>
                    </div>
                    <button
                        className="mlab-modal__close"
                        onClick={onClose}
                        disabled={step === "processing"}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="mlab-modal__body">
                    {step === "upload" && (
                        <>
                            <div
                                className="mlab-import-instructions"
                                style={{
                                    marginBottom: "1.5rem",
                                    fontSize: "0.85rem",
                                    color: "#64748b",
                                }}
                            >
                                <p>
                                    Upload a single-student Statement of Results CSV file. Ensure the
                                    layout matches the official mLab template.
                                </p>
                            </div>

                            <div
                                className="mlab-form-group"
                                style={{ marginBottom: "1.5rem" }}
                            >
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        fontSize: "0.85rem",
                                        fontWeight: 600,
                                        color: "#334155",
                                        marginBottom: "6px",
                                    }}
                                >
                                    <BookOpen size={14} /> Target Class / Cohort
                                </label>
                                <select
                                    value={selectedCohortId}
                                    onChange={(e) => setSelectedCohortId(e.target.value)}
                                    className="mlab-input"
                                    style={{
                                        borderColor: "var(--mlab-blue)",
                                        backgroundColor: "#f0f9ff",
                                        padding: "0.65rem",
                                    }}
                                >
                                    <option value="">-- Add to Drafts / Unassigned --</option>
                                    {cohorts
                                        .filter((c) => !c.isArchived)
                                        .map((c) => {
                                            const pId = c.qualificationId || c.programmeId;
                                            const pName =
                                                programmes.find((p) => p.id === pId)?.name ||
                                                "Unknown Curriculum";
                                            return (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} ({pName})
                                                </option>
                                            );
                                        })}
                                </select>
                                <p
                                    style={{
                                        fontSize: "0.75rem",
                                        color: "#64748b",
                                        marginTop: "6px",
                                    }}
                                >
                                    The learner will be pushed to the Staging area. When
                                    approved, they will be formally linked to this class.
                                </p>
                            </div>

                            <div
                                className="mlab-dropzone"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    textAlign: "center",
                                    padding: "2rem",
                                    border: "2px dashed #cbd5e1",
                                    borderRadius: "8px",
                                    background: "#f8fafc",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                            >
                                <input
                                    type="file"
                                    accept=".csv"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    style={{ display: "none" }}
                                />

                                <div className="mlab-dropzone__prompt">
                                    <UploadCloud
                                        size={40}
                                        color="#94a3b8"
                                        style={{ margin: "0 auto 1rem" }}
                                    />
                                    <p style={{ margin: 0, color: "#475569" }}>
                                        <strong>Click to browse</strong> or drag and drop a CSV file
                                        here
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {step === "processing" && (
                        <div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginBottom: "1rem",
                                    color: "var(--mlab-blue)",
                                }}
                            >
                                <Loader2 className="spin" size={20} />
                                <span style={{ fontWeight: 600 }}>Processing Import...</span>
                            </div>
                            <div
                                style={{
                                    background: "#1e293b",
                                    color: "#10b981",
                                    padding: "1rem",
                                    borderRadius: "8px",
                                    fontFamily: "monospace",
                                    fontSize: "0.8rem",
                                    height: "200px",
                                    overflowY: "auto",
                                }}
                            >
                                {debugLog.map((log, i) => (
                                    <div key={i} style={{ marginBottom: "4px" }}>
                                        {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === "complete" && (
                        <div style={{ textAlign: "center", padding: "2rem" }}>
                            <CheckCircle2
                                size={56}
                                color="#10b981"
                                style={{ margin: "0 auto 1.5rem" }}
                            />
                            <h3 style={{ marginBottom: "0.5rem", color: "#1e293b" }}>
                                Import Successful!
                            </h3>
                            <p style={{ color: "#64748b" }}>
                                The learner has been added to the{" "}
                                <strong>Staging Area</strong> tab for final review and approval.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mlab-modal__footer">
                    {step === "upload" && (
                        <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                    )}
                    {step === "complete" && (
                        <button className="mlab-btn mlab-btn--primary" onClick={onSuccess}>
                            Close & Refresh List
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
