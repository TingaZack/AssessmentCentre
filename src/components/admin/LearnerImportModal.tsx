// src/components/admin/LearnerImportModal.tsx

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
    UploadCloud, X, Loader2, CheckCircle2, BookOpen,
    FileSpreadsheet, Terminal, Info, Layers, AlertTriangle, DatabaseZap, PlusCircle
} from "lucide-react";
import { writeBatch, doc, getDocs, collection, query, where } from "firebase/firestore";
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

interface ImportConflict {
    row: number;
    idNumber: string;
    fullName: string;
    reason: string;
    existingCohortId: string;
    learnerData: DashboardLearner;
}

export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
    cohortId,
    onClose,
    onSuccess,
}) => {
    const { cohorts, fetchStagingLearners, fetchLearners } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<"upload" | "processing" | "conflict_resolution" | "complete">("upload");
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");
    const [pipelineMode, setPipelineMode] = useState<'standard' | 'bootcamp' | null>(null);

    const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
    const [parsedValidMap, setParsedValidMap] = useState<Map<string, DashboardLearner>>(new Map());

    const [errorCount, setErrorCount] = useState(0);
    const [successCount, setSuccessCount] = useState(0);

    const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

    const EXPECTED_COLUMNS = [
        "National Id (*)", "Learner First Name", "Learner Last Name",
        "Qualification Title", "Statement of Results Issue Date", "FLC Statement of result number"
    ];

    useEffect(() => {
        if (selectedCohortId) {
            const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
            if (selectedCohort && (selectedCohort as any).type === 'bootcamp') setPipelineMode('bootcamp');
            else if (selectedCohort && (selectedCohort as any).type === 'standard') setPipelineMode('standard');
            else setPipelineMode(null);
        } else {
            setPipelineMode(null);
        }
    }, [selectedCohortId, cohorts]);

    const parseQCTODate = (val: any): string => {
        const str = String(val || "").trim();
        if (!str) return "";
        if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
            return `${str.substring(6, 8)}-${str.substring(4, 6)}-${str.substring(0, 4)}`;
        }
        if (str.includes("-") && str.split("-")[0].length === 4) {
            const [y, m, d] = str.split("-");
            return `${d}-${m}-${y}`;
        }
        if (str.includes("/")) {
            const parts = str.split("/");
            if (parts[2].length === 4) return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
        return str;
    };

    const getTodaySA = (): string => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };

    const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

    const mapProvinceFuzzy = (rawStr: string): string => {
        if (!rawStr) return "Not specified";
        const cleanInput = rawStr.toLowerCase().replace(/[^a-z]/g, "");

        const provinceAliases = [
            { name: "KwaZulu-Natal", aliases: ["kzn", "kwazulu", "natal"] },
            { name: "Limpopo", aliases: ["lp", "limp", "limpopo", "lmpp"] },
            { name: "Gauteng", aliases: ["gp", "gauteng", "gtg", "jhb", "pta"] },
            { name: "Western Cape", aliases: ["wc", "westerncape", "cape town", "cpt"] },
            { name: "Mpumalanga", aliases: ["mp", "mpumalanga", "mpu"] },
            { name: "North West", aliases: ["nw", "northwest"] },
            { name: "Free State", aliases: ["fs", "freestate"] },
            { name: "Northern Cape", aliases: ["nc", "northerncape"] },
            { name: "Eastern Cape", aliases: ["ec", "easterncape"] }
        ];

        for (const prov of provinceAliases) {
            for (const alias of prov.aliases) {
                if (cleanInput.includes(alias.replace(/[^a-z]/g, ""))) {
                    return prov.name;
                }
            }
        }
        return rawStr.trim();
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFile = e.dataTransfer.files[0];
            const validTypes = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
            if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
                alert("Invalid file type. Please drop a .csv or .xlsx file.");
                return;
            }
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(droppedFile);
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!pipelineMode) return;
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing"); setDebugLog([]); setErrorCount(0); setSuccessCount(0); setConflicts([]); setParsedValidMap(new Map());
        addToLog(`Initializing Smart Data Pipeline: ${file.name}`);

        const existingIds = new Set<string>();
        const existingEmails = new Set<string>();
        const existingLearnersMap = new Map<string, any>();
        const stagingIds = new Set<string>();
        const validSaqaIds = new Set<string>();
        const validProgNames = new Set<string>();

        try {
            const learnersSnap = await getDocs(collection(db, "learners"));
            learnersSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.idNumber) {
                    const cleanId = String(data.idNumber).trim();
                    existingIds.add(cleanId);
                    existingLearnersMap.set(cleanId, data);
                }
                if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
            });
            const stagingSnap = await getDocs(collection(db, "staging_learners"));
            stagingSnap.forEach(docSnap => { if (docSnap.data().idNumber) stagingIds.add(String(docSnap.data().idNumber).trim()); });
            const progSnap = await getDocs(collection(db, "programmes"));
            progSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
                if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
            });
        } catch (err) {
            addToLog(` FATAL: Pipeline could not authenticate deep database lookups.`);
            setStep("upload"); return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                let targetSheetName = workbook.SheetNames[0];
                let foundHeader = false;

                if (workbook.SheetNames.includes("Learner Enrolment and EISA")) targetSheetName = "Learner Enrolment and EISA";
                else {
                    for (const sheetName of workbook.SheetNames) {
                        const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
                        for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
                            const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-?()]/g, ''));
                            if (headers.includes("nationalid") || headers.includes("idnumber") || headers.includes("emailaddress") || headers.includes("email")) {
                                targetSheetName = sheetName; foundHeader = true; break;
                            }
                        }
                        if (foundHeader) break;
                    }
                }

                addToLog(` Ingesting from row schema: "${targetSheetName}"`);

                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { defval: "", raw: true }) as any[];

                if (rows.length === 0) {
                    addToLog(` Error: Document empty or has unreadable row schema.`);
                    setStep("upload"); return;
                }

                const validLearnersMap = new Map<string, DashboardLearner>();
                const conflictLearnersList: ImportConflict[] = [];
                const todaySA = getTodaySA();
                let hardErrors = 0;

                rows.forEach((row, index) => {
                    const getVal = (possibleSubstrings: string[]) => {
                        for (const targetSub of possibleSubstrings) {
                            const cleanTarget = targetSub.toLowerCase().replace(/[\s_*-?()]/g, "");
                            const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_*-?()]/g, "").includes(cleanTarget));

                            if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
                                let cellVal = row[exactKey];

                                if (typeof cellVal === 'number') {
                                    cellVal = cellVal.toLocaleString('fullwide', { useGrouping: false });
                                } else if (typeof cellVal === 'string' && cellVal.toUpperCase().includes('E')) {
                                    const parsedNum = Number(cellVal);
                                    if (!isNaN(parsedNum)) {
                                        cellVal = parsedNum.toLocaleString('fullwide', { useGrouping: false });
                                    }
                                }
                                return String(cellVal).trim();
                            }
                        }
                        return "";
                    };

                    let idNumber = getVal(["idnumber", "nationalid", "learneralternateid", "identitynumber", "id"]).replace(/[^0-9]/g, "");
                    const firstName = getVal(["firstname", "learnerfirstname", "name", "first"]).trim();
                    const lastName = getVal(["lastname", "surname", "learnerlastname", "last"]).trim();
                    let fullName = getVal(["fullname", "learnerfullname"]).trim();
                    if (!fullName && firstName) fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");

                    const email = String(getVal(["emailaddress", "email", "learneremailaddress"]) || "").toLowerCase().trim();
                    let phone = getVal(["phonenumber", "phone", "cellphonenumber", "mobile", "learnercellphonenumber"]).replace(/[^0-9]/g, "");

                    if (idNumber && idNumber.length > 0 && idNumber.length < 13) {
                        idNumber = idNumber.padStart(13, '0');
                    }
                    if (phone && phone.length === 9) {
                        phone = "0" + phone;
                    }

                    if (!idNumber || idNumber.length !== 13 || !fullName) {
                        hardErrors++; return;
                    }

                    let isConflict = false;
                    let conflictReason = "";
                    let existingCohortId = "Unassigned";

                    if (existingIds.has(idNumber)) {
                        isConflict = true; conflictReason = "Profile exists in Live Matrix";
                        existingCohortId = existingLearnersMap.get(idNumber)?.cohortId || "Unassigned";
                    } else if (email && existingEmails.has(email)) {
                        isConflict = true; conflictReason = "Email already linked to another user";
                    } else if (pipelineMode === 'standard' && stagingIds.has(idNumber)) {
                        isConflict = true; conflictReason = "Profile already pending in Staging Area";
                    }

                    let saqaId = ""; let progName = "Bootcamp / Pre-selection"; let issueDateSA = ""; let sdpCode = "";

                    if (pipelineMode === 'standard') {
                        saqaId = getVal(["qualificationid", "saqaid"]);
                        progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);
                        issueDateSA = parseQCTODate(getVal(["statementofresultsissuedate", "issuedate"]));
                        sdpCode = getVal(["sdpcode", "providercode"]);
                        if ((saqaId === "" || !validSaqaIds.has(saqaId)) && (progName === "" || !validProgNames.has(progName.toLowerCase().trim()))) {
                            hardErrors++; return;
                        }
                    }

                    const rawLocationString = getVal(["nearesttoyou", "nearesttoyourresidence", "whichprovince", "provincecode", "province", "residentialaddress"]).trim();
                    const normalizedProvince = mapProvinceFuzzy(rawLocationString);

                    const activeCohortId = selectedCohortId || "Unassigned";
                    const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

                    let extractedDOB = getVal(["learnerbirthdate", "dateofbirth", "dob", "age"]);
                    if (idNumber.length === 13 && (!extractedDOB || extractedDOB.length < 5)) {
                        const yy = idNumber.substring(0, 2);
                        const mm = idNumber.substring(2, 4);
                        const dd = idNumber.substring(4, 6);
                        const century = parseInt(yy) >= 0 && parseInt(yy) <= 30 ? "20" : "19";
                        extractedDOB = `${dd}-${mm}-${century}${yy}`;
                    } else {
                        extractedDOB = parseQCTODate(extractedDOB);
                    }

                    // BOOTCAMP PROFILE EXTENSION MAPPING
                    const bootcampProfileObj = pipelineMode === 'bootcamp' ? {
                        highestQualification: getVal(["tertiaryqualification", "highestlevel", "qualification"]),
                        hasProgrammingBackground: getVal(["backgroundinprogramming", "coding", "background"]),
                        githubProfileUrl: getVal(["github"]),
                        hasLaptopOrComputer: getVal(["laptop", "computer", "personalcomputer"]),
                        hasInternetConnection: getVal(["internet"]),
                        requiresSubsidyOrStipend: getVal(["subsidy", "stipend"]),
                        whyJoinTech: getVal(["whytech", "whydoyouwanttobeintech"]),
                        cvDocumentUrl: getVal(["cv", "uploadcv"])
                    } : null;

                    let rawGender = getVal(["gender", "gendercode"]).trim();
                    if (!rawGender) rawGender = "Unspecified";
                    else if (rawGender.toLowerCase().startsWith('m')) rawGender = "Male";
                    else if (rawGender.toLowerCase().startsWith('f')) rawGender = "Female";

                    const newLearner: any = {
                        id: idNumber,
                        learnerId: idNumber,
                        idNumber: idNumber,
                        enrollmentId: generatedEnrollmentId,
                        firstName,
                        lastName,
                        fullName,
                        email,
                        phone,
                        mobile: phone,
                        status: "active",
                        isDraft: pipelineMode === 'standard',
                        authStatus: "pending",
                        isArchived: false,
                        isBootcamp: pipelineMode === 'bootcamp',
                        nearestCodeTribe: rawLocationString,
                        province: normalizedProvince,
                        dateOfBirth: extractedDOB,
                        cohortId: activeCohortId,
                        trainingStartDate: "",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        createdBy: "bulk-import",

                        _geocoded: false,
                        geoData: null,

                        ...(bootcampProfileObj && { bootcampProfile: bootcampProfileObj }),

                        qualification: {
                            name: progName,
                            saqaId,
                            credits: 0,
                            totalNotionalHours: 0,
                            nqfLevel: 0,
                            dateAssessed: pipelineMode === 'standard' ? issueDateSA : ""
                        },
                        knowledgeModules: [],
                        practicalModules: [],
                        workExperienceModules: [],
                        eisaAdmission: false,
                        verificationCode: generateSorId(fullName || "Learner", pipelineMode === 'standard' ? issueDateSA : todaySA, sdpCode || "BOOTCAMP"),
                        issueDate: pipelineMode === 'standard' ? issueDateSA : "",
                        demographics: {
                            sdpCode: sdpCode || "",
                            genderCode: rawGender,
                            equityCode: getVal(["race", "ethnicity", "equitycode"]).trim() || "African",
                            disabilityStatusCode: getVal(["disabilities", "disability", "disabilitystatuscode"]).trim() || "No",
                            provinceCode: normalizedProvince,
                            province: normalizedProvince,
                            citizenResidentStatusCode: getVal(["citizen", "resident"]).trim() || "South African citizen",
                            homeLanguageCode: getVal(["languagecode", "language"]).trim() || "",
                            nationalityCode: getVal(["nationality"]).trim() || "",
                            socioeconomicStatusCode: getVal(["socioeconomic"]).trim() || "",
                            flc: getVal(["flc"]).trim() || "",
                            flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]).trim() || "",
                            statementOfResultsStatus: getVal(["statementofresultsstatus"]).trim() || "",
                            statementOfResultsIssueDate: pipelineMode === 'standard' ? issueDateSA : "",
                            learnerHomeAddress1: getVal(["address1", "residentialaddress", "homeaddress"]).trim(),
                            learnerPostalAddressPostCode: getVal(["postalcode", "zip"]).trim()
                        } as LearnerDemographics
                    };

                    if (isConflict) {
                        conflictLearnersList.push({ row: index + 2, idNumber, fullName, reason: conflictReason, existingCohortId, learnerData: newLearner });
                    } else {
                        validLearnersMap.set(idNumber, newLearner);
                    }
                });

                setErrorCount(hardErrors); setParsedValidMap(validLearnersMap); setConflicts(conflictLearnersList);

                if (conflictLearnersList.length > 0) setStep("conflict_resolution");
                else if (validLearnersMap.size > 0) { setSuccessCount(validLearnersMap.size); saveToDatabase(validLearnersMap); }
                else { addToLog(`Parse halt. No clean rows found. Blocked: ${hardErrors}.`); setStep("complete"); }

            } catch (err: any) { addToLog(`SCHEMATIC UNRECOGNIZED: ${err.message}`); setStep("complete"); }
        };

        reader.onerror = () => { addToLog(` ERROR: Buffer transmission failed.`); setStep("upload"); };
        reader.readAsArrayBuffer(file);
    };

    const handleResolveConflicts = (action: 'skip' | 'overwrite' | 'multi_enroll') => {
        setStep("processing");
        const finalMap = new Map(parsedValidMap);

        if (action === 'overwrite' || action === 'multi_enroll') {
            conflicts.forEach(c => {
                if (action === 'multi_enroll') c.learnerData.cohortId = c.existingCohortId;
                finalMap.set(c.idNumber, c.learnerData);
            });
            addToLog(`⚡ Processing ${conflicts.length} conflicting records as [${action.toUpperCase()}].`);
        } else {
            addToLog(` SKIPPING ${conflicts.length} conflicting records.`);
            setErrorCount(prev => prev + conflicts.length);
        }

        setSuccessCount(finalMap.size);
        if (finalMap.size > 0) saveToDatabase(finalMap);
        else { addToLog(` Import halt: No profiles left to import.`); setStep("complete"); }
    };

    // 🚀 CHUNKED BATCHING & GHOST PURGE LOGIC
    const saveToDatabase = async (dataMap: Map<string, DashboardLearner>) => {
        const isBootcamp = pipelineMode === 'bootcamp';
        addToLog(` Syncing ${dataMap.size} documents to ${isBootcamp ? 'LIVE BOOTCAMP' : 'SERVER STAGING'}...`);

        try {
            const commitPromises: Promise<void>[] = [];
            let currentBatch = writeBatch(db);
            let operationCount = 0;

            const commitAndResetBatch = () => {
                if (operationCount > 0) {
                    commitPromises.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    operationCount = 0;
                }
            };

            const trackOperation = () => {
                operationCount++;
                if (operationCount >= 450) {
                    commitAndResetBatch();
                }
            };

            // 🧹 SURGICAL GHOST PURGE
            if (isBootcamp && selectedCohortId) {
                addToLog(`⏳ Scanning target directory for damaged index IDs...`);
                try {
                    const existingLearnersQ = query(collection(db, "learners"), where("cohortId", "==", selectedCohortId));
                    const snap = await getDocs(existingLearnersQ);

                    let purgeCount = 0;
                    snap.forEach(d => {
                        const recId = d.id;
                        // Identify damaged strings like "9.90702E+12" or truncated integers
                        if (recId.includes('E') || recId.includes('+') || recId.length < 13) {
                            currentBatch.delete(doc(db, "learners", recId));
                            trackOperation();

                            // Delete orphaned enrollment ledger
                            const badEnrollmentId = `${selectedCohortId}_${recId}`;
                            currentBatch.delete(doc(db, "enrollments", badEnrollmentId));
                            trackOperation();

                            purgeCount++;
                        }
                    });

                    if (purgeCount > 0) {
                        addToLog(`🧹 SURGICAL PURGE: Removed ${purgeCount} broken ghost profiles from cohort.`);
                    }
                } catch (e) {
                    addToLog(`⚠️ Warning: Could not execute pre-purge scan.`);
                }
            }

            // 📥 CHUNKED DATA INGESTION
            dataMap.forEach((learner) => {
                const cleanedLearner = cleanObject(learner);

                if (isBootcamp) {
                    currentBatch.set(doc(db, "learners", String(learner.id)), cleanedLearner, { merge: true });
                    trackOperation();

                    if (learner.enrollmentId) {
                        currentBatch.set(doc(db, "enrollments", String(learner.enrollmentId)), {
                            id: learner.enrollmentId,
                            learnerId: learner.id,
                            cohortId: selectedCohortId || "Unassigned",
                            status: "active",
                            createdAt: new Date().toISOString(),
                            isBootcamp: true
                        }, { merge: true });
                        trackOperation();
                    }

                    currentBatch.delete(doc(db, "staging_learners", String(learner.id)));
                    trackOperation();
                } else {
                    currentBatch.set(doc(db, "staging_learners", String(learner.id)), cleanedLearner, { merge: true });
                    trackOperation();
                }
            });

            // Commit any remaining operations in the final batch
            commitAndResetBatch();

            addToLog(`⏳ Dispatching ${commitPromises.length} network packets to Google Cloud...`);

            await Promise.all(commitPromises);

            addToLog(`✅ COMPLETE: System successfully healed and populated.`);
            setStep("complete");

            if (isBootcamp && fetchLearners) fetchLearners(true);
            if (fetchStagingLearners) fetchStagingLearners();

        } catch (error: any) {
            console.error("Batch Error:", error);
            addToLog(` BATCH ERROR: ${error.message}`);
            setStep("complete");
        }
    };

    return createPortal(
        <div className="mlab-modal-overlay">
            <div className="mlab-modal animate-fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--mlab-bg)', padding: 0, overflow: 'hidden' }}>
                <div className="mlab-modal__header" style={{ flexShrink: 0, borderBottom: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem', background: 'white' }}>
                    <div className="mlab-modal__title-group">
                        <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0ea5e9' }}><FileSpreadsheet size={22} /></div>
                        <div style={{ marginLeft: '12px' }}>
                            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>Data Pipeline Importer</h2>
                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>FUZZY HEADER CONFIGURATION LIVE</span>
                        </div>
                    </div>
                    <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflowY: 'auto', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 380px', maxWidth: '380px', background: 'white', borderRight: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BookOpen size={16} /> 1. Target Cohort Assignment
                            </h3>
                            <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} className="lfm-input" style={{ margin: 0, padding: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }} disabled={step !== "upload"}>
                                <option value="">-- DRAFT DIRECTORY (Unassigned) --</option>
                                {cohorts.filter((c) => !c.isArchived).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                        </div>
                        <div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={16} /> 2. Core Ingestion Pathway
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: step !== "upload" ? 0.6 : 1, pointerEvents: step !== "upload" ? 'none' : 'auto' }}>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'standard' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'standard' ? '#f0f9ff' : 'white', transition: 'all 0.2s ease' }}>
                                    <input type="radio" checked={pipelineMode === 'standard'} onChange={() => setPipelineMode('standard')} style={{ marginTop: '2px', accentColor: 'var(--mlab-blue)' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>Standard Programme Ingestion</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Enforces rigid SAQA blueprint cross-checks. Routes to Staging Area.</div>
                                    </div>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'bootcamp' ? 'var(--mlab-green)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'bootcamp' ? '#f0fdf4' : 'white', transition: 'all 0.2s ease' }}>
                                    <input type="radio" checked={pipelineMode === 'bootcamp'} onChange={() => setPipelineMode('bootcamp')} style={{ marginTop: '2px', accentColor: 'var(--mlab-green)' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)' }}>Bootcamp / Pre-selection Funnel</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Bypasses staging logic. Injects shadows profiles directly into active Bootcamp view.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div style={{ marginTop: 'auto' }}>
                            {pipelineMode === 'standard' && (
                                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <Info size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: 1.4 }}>Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). Automatically blocks duplicates.</p>
                                    </div>
                                </div>
                            )}
                            {pipelineMode === 'bootcamp' && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4 }}><strong>System Note:</strong> Fuzzy containment maps custom survey fields perfectly onto your database layout. <br />It also automatically isolates and wipes any pre-existing ghost records tied to this cohort before writing.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: '320px', background: step === 'conflict_resolution' ? '#fffbeb' : 'transparent', transition: 'background 0.3s ease' }}>
                        {step === "upload" && (
                            <div
                                onDragOver={pipelineMode ? handleDragOver : undefined} onDrop={pipelineMode ? handleDrop : undefined} onClick={() => pipelineMode && fileInputRef.current?.click()}
                                style={{
                                    border: `2px dashed ${pipelineMode ? '#cbd5e1' : '#f87171'}`, borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', backgroundColor: pipelineMode ? 'white' : '#fef2f2',
                                    cursor: pipelineMode ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} disabled={!pipelineMode} />
                                <UploadCloud size={56} color={pipelineMode ? "var(--mlab-blue)" : "var(--mlab-red)"} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                <h3 style={{ fontFamily: 'var(--font-heading)', color: pipelineMode ? 'var(--mlab-blue)' : 'var(--mlab-red)', margin: '0 0 8px', fontSize: '1.5rem' }}>{pipelineMode ? "Drag Spreadsheet Log Here" : "Action Required"}</h3>
                            </div>
                        )}

                        {step === "conflict_resolution" && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #fcd34d', borderRadius: '12px', background: 'white', overflow: 'hidden' }}>
                                <div style={{ background: '#fef3c7', padding: '1.25rem', borderBottom: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <AlertTriangle size={32} color="#d97706" style={{ flexShrink: 0 }} />
                                    <div><h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', fontSize: '1.25rem' }}>Identity Conflicts Detected</h3><p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#92400e' }}>The system flagged <strong>{conflicts.length} profiles</strong>.</p></div>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0', background: 'white' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                                            <tr>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Row</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>ID Number</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Current Cohort</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conflicts.map((c, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                                                    <td style={{ padding: '10px 12px', color: '#64748b' }}>#{c.row}</td>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{c.fullName}</td>
                                                    <td style={{ padding: '10px 12px', color: '#475569' }}>{c.idNumber}</td>
                                                    <td style={{ padding: '10px 12px', color: '#b45309', fontWeight: 600 }}>{cohorts.find(ch => ch.id === c.existingCohortId)?.name || 'Unassigned'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => handleResolveConflicts('skip')} className="wm-btn wm-btn--ghost">Skip</button>
                                    <button onClick={() => handleResolveConflicts('multi_enroll')} className="wm-btn wm-btn--primary" style={{ background: '#0ea5e9', borderColor: '#0ea5e9', display: 'flex', gap: '6px', alignItems: 'center' }}><PlusCircle size={14} /> Add Additional</button>
                                    <button onClick={() => handleResolveConflicts('overwrite')} className="wm-btn wm-btn--primary" style={{ background: '#d97706', borderColor: '#d97706', display: 'flex', gap: '6px', alignItems: 'center' }}><DatabaseZap size={14} /> Overwrite</button>
                                </div>
                            </div>
                        )}

                        {(step === "processing" || step === "complete") && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem", padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                    {step === "processing" ? <Loader2 className="spin" size={24} color="var(--mlab-blue)" /> : <CheckCircle2 size={24} color="var(--mlab-green)" />}
                                    <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase' }}>{step === "processing" ? "Compiling Matrix Array..." : "Import Cycle Complete"}</h4>
                                </div>
                                {step === "complete" && (
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a' }}>{successCount}</div><div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>Profiles Migrated</div></div>
                                        <div style={{ flex: 1, padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{errorCount}</div><div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>Duplicates Blocked</div></div>
                                    </div>
                                )}
                                <div style={{ background: "#0f172a", color: "#a3e635", padding: "1rem", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.8rem", flex: 1, minHeight: "200px", overflowY: "auto" }}>
                                    {debugLog.map((log, i) => <div key={i} style={{ marginBottom: "4px", color: log.includes("PURGE") ? '#facc15' : '#a3e635' }}><span style={{ color: '#38bdf8', marginRight: '6px' }}>&gt;</span>{log}</div>)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mlab-modal__footer" style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem' }}>
                    {step === "upload" || step === "conflict_resolution" ? <button className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button> : <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-green)', color: 'white' }} onClick={onSuccess}>Done</button>}
                </div>
            </div>
        </div>,
        document.body
    );
};



// // src/components/admin/LearnerImportModal.tsx

// import React, { useState, useRef, useEffect } from "react";
// import { createPortal } from "react-dom";
// import * as XLSX from "xlsx";
// import {
//     UploadCloud,
//     X,
//     Loader2,
//     CheckCircle2,
//     BookOpen,
//     FileSpreadsheet,
//     Terminal,
//     Info,
//     Layers,
//     AlertTriangle,
//     DatabaseZap,
//     PlusCircle
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

// interface ImportConflict {
//     row: number;
//     idNumber: string;
//     fullName: string;
//     reason: string;
//     existingCohortId: string;
//     learnerData: DashboardLearner;
// }

// export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
//     cohortId,
//     onClose,
//     onSuccess,
// }) => {
//     const { cohorts, fetchStagingLearners, fetchLearners } = useStore();

//     const fileInputRef = useRef<HTMLInputElement>(null);

//     const [step, setStep] = useState<"upload" | "processing" | "conflict_resolution" | "complete">("upload");
//     const [debugLog, setDebugLog] = useState<string[]>([]);
//     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

//     const [pipelineMode, setPipelineMode] = useState<'standard' | 'bootcamp' | null>(null);

//     // Conflict tracking state
//     const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
//     const [parsedValidMap, setParsedValidMap] = useState<Map<string, DashboardLearner>>(new Map());

//     const [errorCount, setErrorCount] = useState(0);
//     const [successCount, setSuccessCount] = useState(0);

//     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

//     const EXPECTED_COLUMNS = [
//         "National Id (*)",
//         "Learner First Name",
//         "Learner Last Name",
//         "Qualification Title",
//         "Statement of Results Issue Date",
//         "FLC Statement of result number"
//     ];

//     useEffect(() => {
//         if (selectedCohortId) {
//             const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
//             if (selectedCohort && (selectedCohort as any).type === 'bootcamp') {
//                 setPipelineMode('bootcamp');
//             } else if (selectedCohort && (selectedCohort as any).type === 'standard') {
//                 setPipelineMode('standard');
//             } else {
//                 setPipelineMode(null);
//             }
//         } else {
//             setPipelineMode(null);
//         }
//     }, [selectedCohortId, cohorts]);

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

//     const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

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
//      * ── STRICT FUZZY-MATCH PROCESSING LOGIC ──────────────────────────────
//      */
//     const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (!pipelineMode) return;
//         const file = e.target.files?.[0];
//         if (!file) return;

//         setStep("processing");
//         setDebugLog([]);
//         setErrorCount(0);
//         setSuccessCount(0);
//         setConflicts([]);
//         setParsedValidMap(new Map());

//         addToLog(`Initializing Smart Data Pipeline: ${file.name}`);
//         addToLog(`Import Target: ${pipelineMode === 'bootcamp' ? 'DIRECT TO LIVE (Bootcamp/Applicants)' : 'STAGING AREA (LEISA Compliance)'}`);

//         addToLog(`⏳ Querying live system safety rules...`);
//         const existingIds = new Set<string>();
//         const existingEmails = new Set<string>();
//         const existingLearnersMap = new Map<string, any>(); // Store the existing data to identify current cohorts
//         const stagingIds = new Set<string>();
//         const validSaqaIds = new Set<string>();
//         const validProgNames = new Set<string>();

//         try {
//             const learnersSnap = await getDocs(collection(db, "learners"));
//             learnersSnap.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.idNumber) {
//                     const cleanId = String(data.idNumber).trim();
//                     existingIds.add(cleanId);
//                     existingLearnersMap.set(cleanId, data);
//                 }
//                 if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
//             });

//             const stagingSnap = await getDocs(collection(db, "staging_learners"));
//             stagingSnap.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.idNumber) stagingIds.add(String(data.idNumber).trim());
//             });

//             const progSnap = await getDocs(collection(db, "programmes"));
//             progSnap.forEach(docSnap => {
//                 const data = docSnap.data();
//                 if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
//                 if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
//             });
//             addToLog(` Safeguards Activated: Verified ${existingIds.size} live and ${stagingIds.size} staged profiles.`);
//         } catch (err) {
//             addToLog(` FATAL: Pipeline could not authenticate deep database lookups.`);
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
//                     addToLog(` QCTO/LEISA sheet structure isolated.`);
//                 } else {
//                     for (const sheetName of workbook.SheetNames) {
//                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
//                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
//                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-?()]/g, ''));
//                             if (headers.includes("nationalid") || headers.includes("idnumber") || headers.includes("emailaddress") || headers.includes("email")) {
//                                 targetSheetName = sheetName;
//                                 foundHeader = true;
//                                 break;
//                             }
//                         }
//                         if (foundHeader) break;
//                     }
//                 }

//                 addToLog(` Ingesting from row schema: "${targetSheetName}"`);
//                 const worksheet = workbook.Sheets[targetSheetName];
//                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

//                 if (rows.length === 0) {
//                     addToLog(` Error: Document empty or has unreadable row schema.`);
//                     setStep("upload");
//                     return;
//                 }

//                 const validLearnersMap = new Map<string, DashboardLearner>();
//                 const conflictLearnersList: ImportConflict[] = [];
//                 const todaySA = getTodaySA();
//                 let hardErrors = 0;

//                 rows.forEach((row, index) => {
//                     const getVal = (possibleSubstrings: string[]) => {
//                         for (const targetSub of possibleSubstrings) {
//                             const cleanTarget = targetSub.toLowerCase().replace(/[\s_*-?()]/g, "");

//                             const exactKey = Object.keys(row).find(k => {
//                                 const cleanKey = k.toLowerCase().replace(/[\s_*-?()]/g, "");
//                                 return cleanKey.includes(cleanTarget);
//                             });

//                             if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
//                                 return String(row[exactKey]).trim();
//                             }
//                         }
//                         return "";
//                     };

//                     const idNumber = getVal(["idnumber", "nationalid", "learneralternateid", "identitynumber", "id"]);
//                     const firstName = getVal(["firstname", "learnerfirstname", "name", "first"]);
//                     const lastName = getVal(["lastname", "surname", "learnerlastname", "last"]);
//                     let fullName = getVal(["fullname", "learnerfullname"]);
//                     if (!fullName && firstName) fullName = `${firstName} ${lastName}`.trim();

//                     const rawEmail = getVal(["emailaddress", "email", "learneremailaddress"]);
//                     const email = rawEmail ? String(rawEmail).toLowerCase().trim() : "";
//                     const phone = getVal(["phonenumber", "phone", "cellphonenumber", "mobile", "learnercellphonenumber"]);

//                     if (!idNumber || !fullName || fullName === " ") {
//                         addToLog(` Row ${index + 2}: Dropped (Missing structural ID Number or Name)`);
//                         hardErrors++;
//                         return;
//                     }

//                     // Detect conflicts instead of dropping them instantly
//                     let isConflict = false;
//                     let conflictReason = "";
//                     let existingCohortId = "Unassigned";

//                     if (existingIds.has(idNumber)) {
//                         isConflict = true;
//                         conflictReason = "Profile exists in Live Matrix";
//                         existingCohortId = existingLearnersMap.get(idNumber)?.cohortId || "Unassigned";
//                     } else if (email && existingEmails.has(email)) {
//                         isConflict = true;
//                         conflictReason = "Email already linked to another user";
//                     } else if (pipelineMode === 'standard' && stagingIds.has(idNumber)) {
//                         isConflict = true;
//                         conflictReason = "Profile already pending in Staging Area";
//                     }

//                     let saqaId = "";
//                     let progName = "Bootcamp / Pre-selection";
//                     let issueDateSA = "";
//                     let sdpCode = "";

//                     if (pipelineMode === 'standard') {
//                         saqaId = getVal(["qualificationid", "saqaid"]);
//                         progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);
//                         issueDateSA = parseQCTODate(getVal(["statementofresultsissuedate", "issuedate"]));
//                         sdpCode = getVal(["sdpcode", "providercode"]);

//                         const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
//                         const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

//                         if (!isSaqaMatch && !isNameMatch) {
//                             addToLog(` Row ${index + 2}: Dropped (Qualification title or SAQA ID not recognized in database blueprints)`);
//                             hardErrors++;
//                             return;
//                         }
//                     }

//                     const locationAnswer = getVal([
//                         "nearesttoyourresidence",
//                         "whichprovince",
//                         "provincecode",
//                         "province",
//                         "residentialaddress"
//                     ]);

//                     const gender = getVal(["gender", "gendercode"]);
//                     const race = getVal(["race", "ethnicity", "equitycode"]);
//                     const disability = getVal(["disabilities", "disability", "disabilitystatuscode"]);

//                     const activeCohortId = selectedCohortId || "Unassigned";
//                     const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

//                     const newLearner: DashboardLearner = {
//                         id: idNumber,
//                         learnerId: idNumber,
//                         enrollmentId: generatedEnrollmentId,
//                         firstName,
//                         lastName,
//                         fullName,
//                         status: "active",
//                         isDraft: pipelineMode === 'standard',
//                         authStatus: "pending",
//                         isArchived: false,
//                         isBootcamp: pipelineMode === 'bootcamp',
//                         idNumber,
//                         email,
//                         phone,
//                         mobile: phone,
//                         dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob", "age"])),
//                         cohortId: activeCohortId,
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
//                         eisaAdmission: false,
//                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
//                         issueDate: issueDateSA,
//                         demographics: {
//                             sdpCode,
//                             genderCode: gender,
//                             equityCode: race,
//                             disabilityStatusCode: disability,
//                             provinceCode: locationAnswer,
//                             citizenResidentStatusCode: getVal(["citizen", "resident"]),
//                             homeLanguageCode: getVal(["languagecode", "language"]),
//                             nationalityCode: getVal(["nationality"]),
//                             socioeconomicStatusCode: getVal(["socioeconomic"]),
//                             flc: getVal(["flc"]),
//                             flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
//                             statementOfResultsStatus: getVal(["statementofresultsstatus"]),
//                             statementOfResultsIssueDate: issueDateSA,
//                             learnerHomeAddress1: getVal(["address1", "residentialaddress", "homeaddress"]),
//                             learnerPostalAddressPostCode: getVal(["postalcode", "zip"])
//                         } as LearnerDemographics
//                     };

//                     // Route to Conflict UI instead of silent dropping
//                     if (isConflict) {
//                         conflictLearnersList.push({
//                             row: index + 2,
//                             idNumber,
//                             fullName,
//                             reason: conflictReason,
//                             existingCohortId,
//                             learnerData: newLearner
//                         });
//                         addToLog(` Row ${index + 2}: CONFLICT DETECTED - ${conflictReason}`);
//                     } else {
//                         validLearnersMap.set(idNumber, newLearner);
//                     }
//                 });

//                 setErrorCount(hardErrors);
//                 setParsedValidMap(validLearnersMap);
//                 setConflicts(conflictLearnersList);

//                 // ROUTING: Go to conflict resolution if there are duplicates, otherwise save directly
//                 if (conflictLearnersList.length > 0) {
//                     setStep("conflict_resolution");
//                 } else if (validLearnersMap.size > 0) {
//                     setSuccessCount(validLearnersMap.size);
//                     saveToDatabase(validLearnersMap);
//                 } else {
//                     addToLog(`Parse halt. No clean rows found to process (Blocked: ${hardErrors}).`);
//                     setStep("complete");
//                 }

//             } catch (err: any) {
//                 addToLog(`SCHEMATIC UNRECOGNIZED: ${err.message}`);
//                 setStep("complete");
//             }
//         };

//         reader.onerror = () => {
//             addToLog(` ERROR: Buffer transmission failed.`);
//             setStep("upload");
//         };

//         reader.readAsArrayBuffer(file);
//     };

//     // Multi-Action Conflict Resolution Handler
//     const handleResolveConflicts = (action: 'skip' | 'overwrite' | 'multi_enroll') => {
//         setStep("processing");
//         const finalMap = new Map(parsedValidMap);

//         if (action === 'overwrite' || action === 'multi_enroll') {
//             conflicts.forEach(c => {
//                 if (action === 'multi_enroll') {
//                     // Revert the primary pointer so they aren't fully stripped from their old class
//                     c.learnerData.cohortId = c.existingCohortId;
//                 }
//                 finalMap.set(c.idNumber, c.learnerData);
//             });
//             addToLog(`⚡ Resolution: Processing ${conflicts.length} conflicting records as [${action.toUpperCase()}].`);
//         } else {
//             addToLog(` Resolution: SKIPPING ${conflicts.length} conflicting records.`);
//             setErrorCount(prev => prev + conflicts.length);
//         }

//         setSuccessCount(finalMap.size);

//         if (finalMap.size > 0) {
//             saveToDatabase(finalMap);
//         } else {
//             addToLog(` Import halt: No profiles left to import after skipping duplicates.`);
//             setStep("complete");
//         }
//     };

//     // DEFENSE 3: SPLIT TRAFFIC & PURGE GHOSTS
//     const saveToDatabase = (dataMap: Map<string, DashboardLearner>) => {
//         const isBootcamp = pipelineMode === 'bootcamp';

//         addToLog(` Syncing ${dataMap.size} documents to ${isBootcamp ? 'LIVE BOOTCAMP' : 'SERVER STAGING'} vault...`);

//         try {
//             const batch = writeBatch(db);
//             let writeCount = 0;

//             dataMap.forEach((learner) => {
//                 const cleanedLearner = cleanObject(learner);

//                 if (isBootcamp) {
//                     // Bypass Staging -> Inject straight to live learners
//                     const learnerRef = doc(db, "learners", String(learner.id));
//                     batch.set(learnerRef, cleanedLearner, { merge: true });
//                     writeCount++;

//                     // Generate the enrollment ledger immediately so they appear in the cohort
//                     if (learner.enrollmentId) {
//                         const enrollmentRef = doc(db, "enrollments", String(learner.enrollmentId));
//                         batch.set(enrollmentRef, {
//                             id: learner.enrollmentId,
//                             learnerId: learner.id,
//                             // FORCES the ledger pointer to match the target upload class, 
//                             // even if the user chose "Multi-Enroll" and their primary ID pointer was reverted.
//                             cohortId: selectedCohortId || "Unassigned",
//                             status: "active",
//                             createdAt: new Date().toISOString(),
//                             isBootcamp: true
//                         }, { merge: true });
//                         writeCount++;
//                     }

//                     // GHOST PURGE: Delete them from staging if they were accidentally trapped there
//                     const stagingRef = doc(db, "staging_learners", String(learner.id));
//                     batch.delete(stagingRef);
//                     writeCount++;

//                 } else {
//                     // Standard routing -> Queue into staging area
//                     const ref = doc(db, "staging_learners", String(learner.id));
//                     batch.set(ref, cleanedLearner, { merge: true });
//                     writeCount++;
//                 }
//             });

//             addToLog(`⏳ Awaiting Database Acknowledgement (${writeCount} operations)...`);

//             // Non-blocking promise chain
//             batch.commit()
//                 .then(() => {
//                     addToLog(`COMPLETE: Import successfully routed to the ${isBootcamp ? 'Bootcamp Roster' : 'Staging Area'}.`);
//                     setStep("complete");

//                     // Refresh global store completely silently in the background
//                     if (isBootcamp && fetchLearners) fetchLearners(true);
//                     if (fetchStagingLearners) fetchStagingLearners();
//                 })
//                 .catch((error: any) => {
//                     console.error("Batch Write Failed:", error);
//                     addToLog(` CORE WRITE ERROR: ${error.message || "Unknown error during save"}`);
//                     setStep("complete");
//                 });

//         } catch (error: any) {
//             console.error("Pre-commit Batch Error:", error);
//             addToLog(` BATCH CREATION ERROR: ${error.message || "Unknown error building transaction"}`);
//             setStep("complete");
//         }
//     };

//     return createPortal(
//         <div className="mlab-modal-overlay">
//             <div className="mlab-modal animate-fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--mlab-bg)', padding: 0, overflow: 'hidden' }}>

//                 {/* ── HEADER ── */}
//                 <div className="mlab-modal__header" style={{ flexShrink: 0, borderBottom: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem', background: 'white' }}>
//                     <div className="mlab-modal__title-group">
//                         <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0ea5e9' }}>
//                             <FileSpreadsheet size={22} />
//                         </div>
//                         <div style={{ marginLeft: '12px' }}>
//                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
//                                 Data Pipeline Importer
//                             </h2>
//                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>FUZZY HEADER CONFIGURATION LIVE</span>
//                         </div>
//                     </div>
//                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
//                         <X size={20} />
//                     </button>
//                 </div>

//                 {/* ── 2-COLUMN DISPLAY (SCROLLABLE BODY) ── */}
//                 <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflowY: 'auto', flexWrap: 'wrap' }}>

//                     {/* LEFT COLUMN: CONTROLS & PIPELINES */}
//                     <div style={{ flex: '1 1 380px', maxWidth: '380px', background: 'white', borderRight: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//                         <div>
//                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                 <BookOpen size={16} /> 1. Target Cohort Assignment
//                             </h3>
//                             <select
//                                 value={selectedCohortId}
//                                 onChange={(e) => setSelectedCohortId(e.target.value)}
//                                 className="lfm-input"
//                                 style={{ margin: 0, padding: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
//                                 disabled={step !== "upload"}
//                             >
//                                 <option value="">-- DRAFT DIRECTORY (Unassigned) --</option>
//                                 {cohorts.filter((c) => !c.isArchived).map((c) => (
//                                     <option key={c.id} value={c.id}>{c.name}</option>
//                                 ))}
//                             </select>
//                         </div>

//                         <div>
//                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                 <Layers size={16} /> 2. Core Ingestion Pathway
//                             </h3>
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: step !== "upload" ? 0.6 : 1, pointerEvents: step !== "upload" ? 'none' : 'auto' }}>
//                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'standard' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'standard' ? '#f0f9ff' : 'white', transition: 'all 0.2s ease' }}>
//                                     <input type="radio" checked={pipelineMode === 'standard'} onChange={() => setPipelineMode('standard')} style={{ marginTop: '2px', accentColor: 'var(--mlab-blue)' }} />
//                                     <div>
//                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>Standard Programme Ingestion</div>
//                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Enforces rigid SAQA blueprint cross-checks. Routes to Staging Area.</div>
//                                     </div>
//                                 </label>

//                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'bootcamp' ? 'var(--mlab-green)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'bootcamp' ? '#f0fdf4' : 'white', transition: 'all 0.2s ease' }}>
//                                     <input type="radio" checked={pipelineMode === 'bootcamp'} onChange={() => setPipelineMode('bootcamp')} style={{ marginTop: '2px', accentColor: 'var(--mlab-green)' }} />
//                                     <div>
//                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)' }}>Bootcamp / Pre-selection Funnel</div>
//                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Bypasses staging logic. Injects shadows profiles directly into active Bootcamp view.</div>
//                                     </div>
//                                 </label>
//                             </div>
//                         </div>

//                         <div style={{ marginTop: 'auto' }}>
//                             {pipelineMode === 'standard' && (
//                                 <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
//                                     <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
//                                         <Info size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
//                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: 1.4 }}>
//                                             Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). The system will strictly check against the live database and automatically block any duplicate IDs, emails, or unknown qualifications to prevent data corruption.
//                                         </p>
//                                     </div>
//                                     <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#075985', textTransform: 'uppercase', marginBottom: '6px' }}>Expected Columns</div>
//                                     <div style={{ fontSize: '0.7rem', color: '#0c4a6e', marginBottom: '8px' }}>The system maps standard LEISA headers (spaces are ignored). Key columns include:</div>
//                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
//                                         {EXPECTED_COLUMNS.map(col => (
//                                             <span key={col} style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
//                                                 {col}
//                                             </span>
//                                         ))}
//                                         <span style={{ color: '#64748b', padding: '2px 6px', fontSize: '0.65rem', fontStyle: 'italic' }}>+ other LEISA fields...</span>
//                                     </div>
//                                 </div>
//                             )}
//                             {pipelineMode === 'bootcamp' && (
//                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                                     <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
//                                     <div>
//                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4, marginBottom: '6px' }}>
//                                             <strong>System Note:</strong> Fuzzy containment maps custom survey questions (e.g., location/address forms) perfectly onto your database layout.
//                                         </p>
//                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#15803d', lineHeight: 1.4 }}>
//                                             The engine requires <strong>ID Number</strong>, <strong>First Name</strong>, and <strong>Last Name</strong> at minimum. Bypasses strict LEISA validation.
//                                         </p>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>

//                     </div>

//                     {/* RIGHT COLUMN: INTERACTION FIELD & LOGS */}
//                     <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: '320px', background: step === 'conflict_resolution' ? '#fffbeb' : 'transparent', transition: 'background 0.3s ease' }}>

//                         {step === "upload" && (
//                             <div
//                                 onDragOver={pipelineMode ? handleDragOver : undefined}
//                                 onDrop={pipelineMode ? handleDrop : undefined}
//                                 onClick={() => pipelineMode && fileInputRef.current?.click()}
//                                 style={{
//                                     border: `2px dashed ${pipelineMode ? '#cbd5e1' : '#f87171'}`,
//                                     borderRadius: '12px',
//                                     padding: '4rem 2rem',
//                                     textAlign: 'center',
//                                     backgroundColor: pipelineMode ? 'white' : '#fef2f2',
//                                     cursor: pipelineMode ? 'pointer' : 'not-allowed',
//                                     transition: 'all 0.2s ease',
//                                     flex: 1,
//                                     display: 'flex',
//                                     flexDirection: 'column',
//                                     alignItems: 'center',
//                                     justifyContent: 'center',
//                                     opacity: pipelineMode ? 1 : 0.8
//                                 }}
//                             >
//                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} disabled={!pipelineMode} />
//                                 <UploadCloud size={56} color={pipelineMode ? "var(--mlab-blue)" : "var(--mlab-red)"} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                                 <h3 style={{ fontFamily: 'var(--font-heading)', color: pipelineMode ? 'var(--mlab-blue)' : 'var(--mlab-red)', margin: '0 0 8px', fontSize: '1.5rem' }}>
//                                     {pipelineMode ? "Drag Spreadsheet Log Here" : "Action Required"}
//                                 </h3>
//                                 {pipelineMode ? (
//                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', margin: 0 }}>
//                                         Accepts raw spreadsheet exports (<strong>.xlsx</strong> or <strong>.csv</strong>).
//                                     </p>
//                                 ) : (
//                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-red)', fontWeight: 600, margin: 0 }}>
//                                         You must select an Ingestion Pathway (Standard or Bootcamp) from the left panel before uploading.
//                                     </p>
//                                 )}
//                             </div>
//                         )}

//                         {/* CONFLICT RESOLUTION UI */}
//                         {step === "conflict_resolution" && (
//                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #fcd34d', borderRadius: '12px', background: 'white', overflow: 'hidden' }}>
//                                 <div style={{ background: '#fef3c7', padding: '1.25rem', borderBottom: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                                     <AlertTriangle size={32} color="#d97706" style={{ flexShrink: 0 }} />
//                                     <div>
//                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', fontSize: '1.25rem' }}>Identity Conflicts Detected</h3>
//                                         <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#92400e' }}>
//                                             The system flagged <strong>{conflicts.length} profiles</strong> in this batch that already exist. How would you like to handle them?
//                                         </p>
//                                     </div>
//                                 </div>

//                                 <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
//                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
//                                         <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
//                                             <tr>
//                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Row</th>
//                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
//                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>ID Number</th>
//                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Current Cohort</th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {conflicts.map((c, i) => (
//                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
//                                                     <td style={{ padding: '10px 12px', color: '#94a3b8' }}>#{c.row}</td>
//                                                     <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{c.fullName}</td>
//                                                     <td style={{ padding: '10px 12px', color: '#475569' }}>{c.idNumber}</td>
//                                                     <td style={{ padding: '10px 12px', color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>
//                                                         {cohorts.find(ch => ch.id === c.existingCohortId)?.name || 'Unassigned'}
//                                                     </td>
//                                                 </tr>
//                                             ))}
//                                         </tbody>
//                                     </table>
//                                 </div>

//                                 {/* 🚀 UPDATED RESOLUTION ACTION FOOTER WITH MULTI-ENROLL */}
//                                 <div style={{ background: '#f8fafc', padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
//                                     <button
//                                         onClick={() => handleResolveConflicts('skip')}
//                                         className="wm-btn wm-btn--ghost"
//                                         style={{ border: '1px solid #cbd5e1' }}
//                                     >
//                                         Skip {conflicts.length} Existing
//                                     </button>

//                                     {/* 🚀 FIXED: Removed the strict selectedCohortId check. This button will ALWAYS show now. */}
//                                     <button
//                                         onClick={() => handleResolveConflicts('multi_enroll')}
//                                         className="wm-btn wm-btn--primary"
//                                         style={{ background: '#0ea5e9', color: 'white', borderColor: '#0ea5e9', display: 'flex', gap: '6px', alignItems: 'center' }}
//                                     >
//                                         <PlusCircle size={14} /> Add as Additional Enrollment
//                                     </button>

//                                     <button
//                                         onClick={() => handleResolveConflicts('overwrite')}
//                                         className="wm-btn wm-btn--primary"
//                                         style={{ background: '#d97706', color: 'white', borderColor: '#d97706', display: 'flex', gap: '6px', alignItems: 'center' }}
//                                     >
//                                         <DatabaseZap size={14} /> Overwrite & Transfer
//                                     </button>
//                                 </div>
//                             </div>
//                         )}

//                         {(step === "processing" || step === "complete") && (
//                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
//                                 <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem", padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
//                                     {step === "processing" ? (
//                                         <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
//                                     ) : (
//                                         <CheckCircle2 size={24} color="var(--mlab-green)" />
//                                     )}
//                                     <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase', fontSize: '1.1rem' }}>
//                                         {step === "processing" ? "Compiling Matrix Array..." : "Import Cycle Complete"}
//                                     </h4>
//                                 </div>

//                                 {step === "complete" && (
//                                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
//                                         <div style={{ flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}>
//                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a', fontFamily: 'var(--font-heading)' }}>{successCount}</div>
//                                             <div style={{ fontSize: '0.8rem', color: '#15803d', textTransform: 'uppercase', fontWeight: 600 }}>Profiles Migrated</div>
//                                         </div>
//                                         <div style={{ flex: 1, padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', textAlign: 'center' }}>
//                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626', fontFamily: 'var(--font-heading)' }}>{errorCount}</div>
//                                             <div style={{ fontSize: '0.8rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 600 }}>Duplicates Blocked</div>
//                                         </div>
//                                     </div>
//                                 )}

//                                 <div style={{
//                                     background: "#0f172a",
//                                     color: "#a3e635",
//                                     padding: "1rem",
//                                     borderRadius: "8px",
//                                     fontFamily: "'Courier New', Courier, monospace",
//                                     fontSize: "0.8rem",
//                                     flex: 1,
//                                     minHeight: "200px",
//                                     overflowY: "auto",
//                                     border: '1px solid #1e293b',
//                                     boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
//                                 }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
//                                         <Terminal size={14} /> <span>INGESTION_SHELL_OUTPUT_v7.0</span>
//                                     </div>
//                                     {debugLog.map((log, i) => (
//                                         <div key={i} style={{ marginBottom: "4px", color: log.includes("") || log.includes("") ? '#f87171' : (log.includes("✅") ? '#4ade80' : '#a3e635') }}>
//                                             <span style={{ color: '#38bdf8', marginRight: '6px' }}>&gt;</span>{log}
//                                         </div>
//                                     ))}
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                 </div>

//                 {/* ── FOOTER ── */}
//                 <div className="mlab-modal__footer" style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem' }}>
//                     {step === "upload" || step === "conflict_resolution" ? (
//                         <button className="wm-btn wm-btn--ghost" onClick={onClose}>
//                             Cancel
//                         </button>
//                     ) : step === "complete" ? (
//                         <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
//                             <button className="wm-btn wm-btn--ghost" onClick={() => setStep("upload")}>
//                                 Import Alternative Set
//                             </button>
//                             <button
//                                 className="wm-btn wm-btn--primary"
//                                 style={{ background: 'var(--mlab-green)', color: 'white' }}
//                                 onClick={onSuccess}
//                             >
//                                 {pipelineMode === 'bootcamp' ? 'View Bootcamp Roster' : 'Open Staging Directory'}
//                             </button>
//                         </div>
//                     ) : (
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
//                             <Loader2 size={14} className="spin" /> TRANSACTION THREAD LOCKED UNTIL BATCH WRITE TERMINATES
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };



// // // src/components/admin/LearnerImportModal.tsx

// // import React, { useState, useRef, useEffect } from "react";
// // import { createPortal } from "react-dom";
// // import * as XLSX from "xlsx";
// // import {
// //     UploadCloud,
// //     X,
// //     Loader2,
// //     CheckCircle2,
// //     BookOpen,
// //     FileSpreadsheet,
// //     Terminal,
// //     Info,
// //     Layers,
// //     AlertTriangle,
// //     DatabaseZap,
// //     PlusCircle
// // } from "lucide-react";
// // import { writeBatch, doc, getDocs, collection } from "firebase/firestore";
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

// // interface ImportConflict {
// //     row: number;
// //     idNumber: string;
// //     fullName: string;
// //     reason: string;
// //     existingCohortId: string;
// //     learnerData: DashboardLearner;
// // }

// // export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
// //     cohortId,
// //     onClose,
// //     onSuccess,
// // }) => {
// //     const { cohorts, fetchStagingLearners, fetchLearners } = useStore();

// //     const fileInputRef = useRef<HTMLInputElement>(null);

// //     const [step, setStep] = useState<"upload" | "processing" | "conflict_resolution" | "complete">("upload");
// //     const [debugLog, setDebugLog] = useState<string[]>([]);
// //     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

// //     const [pipelineMode, setPipelineMode] = useState<'standard' | 'bootcamp' | null>(null);

// //     // Conflict tracking state
// //     const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
// //     const [parsedValidMap, setParsedValidMap] = useState<Map<string, DashboardLearner>>(new Map());

// //     const [errorCount, setErrorCount] = useState(0);
// //     const [successCount, setSuccessCount] = useState(0);

// //     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

// //     const EXPECTED_COLUMNS = [
// //         "National Id (*)",
// //         "Learner First Name",
// //         "Learner Last Name",
// //         "Qualification Title",
// //         "Statement of Results Issue Date",
// //         "FLC Statement of result number"
// //     ];

// //     useEffect(() => {
// //         if (selectedCohortId) {
// //             const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
// //             if (selectedCohort && (selectedCohort as any).type === 'bootcamp') {
// //                 setPipelineMode('bootcamp');
// //             } else if (selectedCohort && (selectedCohort as any).type === 'standard') {
// //                 setPipelineMode('standard');
// //             } else {
// //                 setPipelineMode(null);
// //             }
// //         } else {
// //             setPipelineMode(null);
// //         }
// //     }, [selectedCohortId, cohorts]);

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

// //     const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

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
// //      * ── STRICT FUZZY-MATCH PROCESSING LOGIC ──────────────────────────────
// //      */
// //     const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
// //         if (!pipelineMode) return;
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setStep("processing");
// //         setDebugLog([]);
// //         setErrorCount(0);
// //         setSuccessCount(0);
// //         setConflicts([]);
// //         setParsedValidMap(new Map());

// //         addToLog(`Initializing Smart Data Pipeline: ${file.name}`);
// //         addToLog(`Import Target: ${pipelineMode === 'bootcamp' ? 'DIRECT TO LIVE (Bootcamp/Applicants)' : 'STAGING AREA (LEISA Compliance)'}`);

// //         addToLog(`⏳ Querying live system safety rules...`);
// //         const existingIds = new Set<string>();
// //         const existingEmails = new Set<string>();
// //         const existingLearnersMap = new Map<string, any>(); // 🚀 NEW: Store the existing data to identify current cohorts
// //         const stagingIds = new Set<string>();
// //         const validSaqaIds = new Set<string>();
// //         const validProgNames = new Set<string>();

// //         try {
// //             const learnersSnap = await getDocs(collection(db, "learners"));
// //             learnersSnap.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 if (data.idNumber) {
// //                     const cleanId = String(data.idNumber).trim();
// //                     existingIds.add(cleanId);
// //                     existingLearnersMap.set(cleanId, data);
// //                 }
// //                 if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
// //             });

// //             const stagingSnap = await getDocs(collection(db, "staging_learners"));
// //             stagingSnap.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 if (data.idNumber) stagingIds.add(String(data.idNumber).trim());
// //             });

// //             const progSnap = await getDocs(collection(db, "programmes"));
// //             progSnap.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
// //                 if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
// //             });
// //             addToLog(` Safeguards Activated: Verified ${existingIds.size} live and ${stagingIds.size} staged profiles.`);
// //         } catch (err) {
// //             addToLog(` FATAL: Pipeline could not authenticate deep database lookups.`);
// //             setStep("upload");
// //             return;
// //         }

// //         const reader = new FileReader();

// //         reader.onload = async (event) => {
// //             try {
// //                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
// //                 const workbook = XLSX.read(data, { type: 'array' });

// //                 let targetSheetName = workbook.SheetNames[0];
// //                 let foundHeader = false;

// //                 if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
// //                     targetSheetName = "Learner Enrolment and EISA";
// //                     addToLog(` QCTO/LEISA sheet structure isolated.`);
// //                 } else {
// //                     for (const sheetName of workbook.SheetNames) {
// //                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
// //                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
// //                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-?()]/g, ''));
// //                             if (headers.includes("nationalid") || headers.includes("idnumber") || headers.includes("emailaddress") || headers.includes("email")) {
// //                                 targetSheetName = sheetName;
// //                                 foundHeader = true;
// //                                 break;
// //                             }
// //                         }
// //                         if (foundHeader) break;
// //                     }
// //                 }

// //                 addToLog(` Ingesting from row schema: "${targetSheetName}"`);
// //                 const worksheet = workbook.Sheets[targetSheetName];
// //                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

// //                 if (rows.length === 0) {
// //                     addToLog(` Error: Document empty or has unreadable row schema.`);
// //                     setStep("upload");
// //                     return;
// //                 }

// //                 const validLearnersMap = new Map<string, DashboardLearner>();
// //                 const conflictLearnersList: ImportConflict[] = [];
// //                 const todaySA = getTodaySA();
// //                 let hardErrors = 0;

// //                 rows.forEach((row, index) => {
// //                     const getVal = (possibleSubstrings: string[]) => {
// //                         for (const targetSub of possibleSubstrings) {
// //                             const cleanTarget = targetSub.toLowerCase().replace(/[\s_*-?()]/g, "");

// //                             const exactKey = Object.keys(row).find(k => {
// //                                 const cleanKey = k.toLowerCase().replace(/[\s_*-?()]/g, "");
// //                                 return cleanKey.includes(cleanTarget);
// //                             });

// //                             if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
// //                                 return String(row[exactKey]).trim();
// //                             }
// //                         }
// //                         return "";
// //                     };

// //                     const idNumber = getVal(["idnumber", "nationalid", "learneralternateid", "identitynumber", "id"]);
// //                     const firstName = getVal(["firstname", "learnerfirstname", "name", "first"]);
// //                     const lastName = getVal(["lastname", "surname", "learnerlastname", "last"]);
// //                     let fullName = getVal(["fullname", "learnerfullname"]);
// //                     if (!fullName && firstName) fullName = `${firstName} ${lastName}`.trim();

// //                     const rawEmail = getVal(["emailaddress", "email", "learneremailaddress"]);
// //                     const email = rawEmail ? String(rawEmail).toLowerCase().trim() : "";
// //                     const phone = getVal(["phonenumber", "phone", "cellphonenumber", "mobile", "learnercellphonenumber"]);

// //                     if (!idNumber || !fullName || fullName === " ") {
// //                         addToLog(` Row ${index + 2}: Dropped (Missing structural ID Number or Name)`);
// //                         hardErrors++;
// //                         return;
// //                     }

// //                     // Detect conflicts instead of dropping them instantly
// //                     let isConflict = false;
// //                     let conflictReason = "";
// //                     let existingCohortId = "Unassigned";

// //                     if (existingIds.has(idNumber)) {
// //                         isConflict = true;
// //                         conflictReason = "Profile exists in Live Matrix";
// //                         existingCohortId = existingLearnersMap.get(idNumber)?.cohortId || "Unassigned";
// //                     } else if (email && existingEmails.has(email)) {
// //                         isConflict = true;
// //                         conflictReason = "Email already linked to another user";
// //                     } else if (pipelineMode === 'standard' && stagingIds.has(idNumber)) {
// //                         isConflict = true;
// //                         conflictReason = "Profile already pending in Staging Area";
// //                     }

// //                     let saqaId = "";
// //                     let progName = "Bootcamp / Pre-selection";
// //                     let issueDateSA = "";
// //                     let sdpCode = "";

// //                     if (pipelineMode === 'standard') {
// //                         saqaId = getVal(["qualificationid", "saqaid"]);
// //                         progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);
// //                         issueDateSA = parseQCTODate(getVal(["statementofresultsissuedate", "issuedate"]));
// //                         sdpCode = getVal(["sdpcode", "providercode"]);

// //                         const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
// //                         const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

// //                         if (!isSaqaMatch && !isNameMatch) {
// //                             addToLog(` Row ${index + 2}: Dropped (Qualification title or SAQA ID not recognized in database blueprints)`);
// //                             hardErrors++;
// //                             return;
// //                         }
// //                     }

// //                     const locationAnswer = getVal([
// //                         "nearesttoyourresidence",
// //                         "whichprovince",
// //                         "provincecode",
// //                         "province",
// //                         "residentialaddress"
// //                     ]);

// //                     const gender = getVal(["gender", "gendercode"]);
// //                     const race = getVal(["race", "ethnicity", "equitycode"]);
// //                     const disability = getVal(["disabilities", "disability", "disabilitystatuscode"]);

// //                     const activeCohortId = selectedCohortId || "Unassigned";
// //                     const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

// //                     const newLearner: DashboardLearner = {
// //                         id: idNumber,
// //                         learnerId: idNumber,
// //                         enrollmentId: generatedEnrollmentId,
// //                         firstName,
// //                         lastName,
// //                         fullName,
// //                         status: "active",
// //                         isDraft: pipelineMode === 'standard',
// //                         authStatus: "pending",
// //                         isArchived: false,
// //                         isBootcamp: pipelineMode === 'bootcamp',
// //                         idNumber,
// //                         email,
// //                         phone,
// //                         mobile: phone,
// //                         dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob", "age"])),
// //                         cohortId: activeCohortId,
// //                         trainingStartDate: parseQCTODate(getVal(["expectedtrainingcompletiondate", "trainingstartdate"])),
// //                         createdAt: new Date().toISOString(),
// //                         createdBy: "bulk-import",
// //                         qualification: {
// //                             name: progName,
// //                             saqaId: saqaId,
// //                             credits: 0,
// //                             totalNotionalHours: 0,
// //                             nqfLevel: 0,
// //                             dateAssessed: issueDateSA,
// //                         },
// //                         knowledgeModules: [],
// //                         practicalModules: [],
// //                         workExperienceModules: [],
// //                         eisaAdmission: false,
// //                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
// //                         issueDate: issueDateSA,
// //                         demographics: {
// //                             sdpCode,
// //                             genderCode: gender,
// //                             equityCode: race,
// //                             disabilityStatusCode: disability,
// //                             provinceCode: locationAnswer,
// //                             citizenResidentStatusCode: getVal(["citizen", "resident"]),
// //                             homeLanguageCode: getVal(["languagecode", "language"]),
// //                             nationalityCode: getVal(["nationality"]),
// //                             socioeconomicStatusCode: getVal(["socioeconomic"]),
// //                             flc: getVal(["flc"]),
// //                             flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
// //                             statementOfResultsStatus: getVal(["statementofresultsstatus"]),
// //                             statementOfResultsIssueDate: issueDateSA,
// //                             learnerHomeAddress1: getVal(["address1", "residentialaddress", "homeaddress"]),
// //                             learnerPostalAddressPostCode: getVal(["postalcode", "zip"])
// //                         } as LearnerDemographics
// //                     };

// //                     if (isConflict) {
// //                         conflictLearnersList.push({
// //                             row: index + 2,
// //                             idNumber,
// //                             fullName,
// //                             reason: conflictReason,
// //                             existingCohortId,
// //                             learnerData: newLearner
// //                         });
// //                         addToLog(` Row ${index + 2}: CONFLICT DETECTED - ${conflictReason}`);
// //                     } else {
// //                         validLearnersMap.set(idNumber, newLearner);
// //                     }
// //                 });

// //                 setErrorCount(hardErrors);
// //                 setParsedValidMap(validLearnersMap);
// //                 setConflicts(conflictLearnersList);

// //                 // ROUTING: Go to conflict resolution if there are duplicates, otherwise save directly
// //                 if (conflictLearnersList.length > 0) {
// //                     setStep("conflict_resolution");
// //                 } else if (validLearnersMap.size > 0) {
// //                     setSuccessCount(validLearnersMap.size);
// //                     saveToDatabase(validLearnersMap);
// //                 } else {
// //                     addToLog(`Parse halt. No clean rows found to process (Blocked: ${hardErrors}).`);
// //                     setStep("complete");
// //                 }

// //             } catch (err: any) {
// //                 addToLog(`SCHEMATIC UNRECOGNIZED: ${err.message}`);
// //                 setStep("complete");
// //             }
// //         };

// //         reader.onerror = () => {
// //             addToLog(` ERROR: Buffer transmission failed.`);
// //             setStep("upload");
// //         };

// //         reader.readAsArrayBuffer(file);
// //     };

// //     // 🚀 FIXED: Multi-Action Conflict Resolution Handler
// //     const handleResolveConflicts = (action: 'skip' | 'overwrite' | 'multi_enroll') => {
// //         setStep("processing");
// //         const finalMap = new Map(parsedValidMap);

// //         if (action === 'overwrite' || action === 'multi_enroll') {
// //             conflicts.forEach(c => {
// //                 if (action === 'multi_enroll') {
// //                     // Revert the primary pointer so they aren't fully stripped from their old class
// //                     c.learnerData.cohortId = c.existingCohortId;
// //                 }
// //                 finalMap.set(c.idNumber, c.learnerData);
// //             });
// //             addToLog(`⚡ Resolution: Processing ${conflicts.length} conflicting records as [${action.toUpperCase()}].`);
// //         } else {
// //             addToLog(` Resolution: SKIPPING ${conflicts.length} conflicting records.`);
// //             setErrorCount(prev => prev + conflicts.length);
// //         }

// //         setSuccessCount(finalMap.size);

// //         if (finalMap.size > 0) {
// //             saveToDatabase(finalMap);
// //         } else {
// //             addToLog(` Import halt: No profiles left to import after skipping duplicates.`);
// //             setStep("complete");
// //         }
// //     };

// //     // DEFENSE 3: SPLIT TRAFFIC & PURGE GHOSTS
// //     const saveToDatabase = (dataMap: Map<string, DashboardLearner>) => {
// //         const isBootcamp = pipelineMode === 'bootcamp';

// //         addToLog(` Syncing ${dataMap.size} documents to ${isBootcamp ? 'LIVE BOOTCAMP' : 'SERVER STAGING'} vault...`);

// //         try {
// //             const batch = writeBatch(db);
// //             let writeCount = 0;

// //             dataMap.forEach((learner) => {
// //                 const cleanedLearner = cleanObject(learner);

// //                 if (isBootcamp) {
// //                     // Bypass Staging -> Inject straight to live learners
// //                     const learnerRef = doc(db, "learners", String(learner.id));
// //                     batch.set(learnerRef, cleanedLearner, { merge: true });
// //                     writeCount++;

// //                     // Generate the enrollment ledger immediately so they appear in the cohort
// //                     if (learner.enrollmentId) {
// //                         const enrollmentRef = doc(db, "enrollments", String(learner.enrollmentId));
// //                         batch.set(enrollmentRef, {
// //                             id: learner.enrollmentId,
// //                             learnerId: learner.id,
// //                             // 🚀 FORCES the ledger pointer to match the target upload class, 
// //                             // even if the user chose "Multi-Enroll" and their primary ID pointer was reverted.
// //                             cohortId: selectedCohortId || "Unassigned",
// //                             status: "active",
// //                             createdAt: new Date().toISOString(),
// //                             isBootcamp: true
// //                         }, { merge: true });
// //                         writeCount++;
// //                     }

// //                     // GHOST PURGE: Delete them from staging if they were accidentally trapped there
// //                     const stagingRef = doc(db, "staging_learners", String(learner.id));
// //                     batch.delete(stagingRef);
// //                     writeCount++;

// //                 } else {
// //                     // Standard routing -> Queue into staging area
// //                     const ref = doc(db, "staging_learners", String(learner.id));
// //                     batch.set(ref, cleanedLearner, { merge: true });
// //                     writeCount++;
// //                 }
// //             });

// //             addToLog(`⏳ Awaiting Database Acknowledgement (${writeCount} operations)...`);

// //             // Non-blocking promise chain
// //             batch.commit()
// //                 .then(() => {
// //                     addToLog(`COMPLETE: Import successfully routed to the ${isBootcamp ? 'Bootcamp Roster' : 'Staging Area'}.`);
// //                     setStep("complete");

// //                     // Refresh global store completely silently in the background
// //                     if (isBootcamp && fetchLearners) fetchLearners(true);
// //                     if (fetchStagingLearners) fetchStagingLearners();
// //                 })
// //                 .catch((error: any) => {
// //                     console.error("Batch Write Failed:", error);
// //                     addToLog(` CORE WRITE ERROR: ${error.message || "Unknown error during save"}`);
// //                     setStep("complete");
// //                 });

// //         } catch (error: any) {
// //             console.error("Pre-commit Batch Error:", error);
// //             addToLog(` BATCH CREATION ERROR: ${error.message || "Unknown error building transaction"}`);
// //             setStep("complete");
// //         }
// //     };

// //     return createPortal(
// //         <div className="mlab-modal-overlay">
// //             <div className="mlab-modal animate-fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--mlab-bg)', padding: 0, overflow: 'hidden' }}>

// //                 {/* ── HEADER ── */}
// //                 <div className="mlab-modal__header" style={{ flexShrink: 0, borderBottom: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem', background: 'white' }}>
// //                     <div className="mlab-modal__title-group">
// //                         <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0ea5e9' }}>
// //                             <FileSpreadsheet size={22} />
// //                         </div>
// //                         <div style={{ marginLeft: '12px' }}>
// //                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
// //                                 Data Pipeline Importer
// //                             </h2>
// //                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>FUZZY HEADER CONFIGURATION LIVE</span>
// //                         </div>
// //                     </div>
// //                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
// //                         <X size={20} />
// //                     </button>
// //                 </div>

// //                 {/* ── 2-COLUMN DISPLAY (SCROLLABLE BODY) ── */}
// //                 <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflowY: 'auto', flexWrap: 'wrap' }}>

// //                     {/* LEFT COLUMN: CONTROLS & PIPELINES */}
// //                     <div style={{ flex: '1 1 380px', maxWidth: '380px', background: 'white', borderRight: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

// //                         <div>
// //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                 <BookOpen size={16} /> 1. Target Cohort Assignment
// //                             </h3>
// //                             <select
// //                                 value={selectedCohortId}
// //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// //                                 className="lfm-input"
// //                                 style={{ margin: 0, padding: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
// //                                 disabled={step !== "upload"}
// //                             >
// //                                 <option value="">-- DRAFT DIRECTORY (Unassigned) --</option>
// //                                 {cohorts.filter((c) => !c.isArchived).map((c) => (
// //                                     <option key={c.id} value={c.id}>{c.name}</option>
// //                                 ))}
// //                             </select>
// //                         </div>

// //                         <div>
// //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                 <Layers size={16} /> 2. Core Ingestion Pathway
// //                             </h3>
// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: step !== "upload" ? 0.6 : 1, pointerEvents: step !== "upload" ? 'none' : 'auto' }}>
// //                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'standard' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'standard' ? '#f0f9ff' : 'white', transition: 'all 0.2s ease' }}>
// //                                     <input type="radio" checked={pipelineMode === 'standard'} onChange={() => setPipelineMode('standard')} style={{ marginTop: '2px', accentColor: 'var(--mlab-blue)' }} />
// //                                     <div>
// //                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>Standard Programme Ingestion</div>
// //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Enforces rigid SAQA blueprint cross-checks. Routes to Staging Area.</div>
// //                                     </div>
// //                                 </label>

// //                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'bootcamp' ? 'var(--mlab-green)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'bootcamp' ? '#f0fdf4' : 'white', transition: 'all 0.2s ease' }}>
// //                                     <input type="radio" checked={pipelineMode === 'bootcamp'} onChange={() => setPipelineMode('bootcamp')} style={{ marginTop: '2px', accentColor: 'var(--mlab-green)' }} />
// //                                     <div>
// //                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)' }}>Bootcamp / Pre-selection Funnel</div>
// //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Bypasses staging logic. Injects shadows profiles directly into active Bootcamp view.</div>
// //                                     </div>
// //                                 </label>
// //                             </div>
// //                         </div>

// //                         <div style={{ marginTop: 'auto' }}>
// //                             {pipelineMode === 'standard' && (
// //                                 <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
// //                                     <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
// //                                         <Info size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
// //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: 1.4 }}>
// //                                             Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). The system will strictly check against the live database and automatically block any duplicate IDs, emails, or unknown qualifications to prevent data corruption.
// //                                         </p>
// //                                     </div>
// //                                     <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#075985', textTransform: 'uppercase', marginBottom: '6px' }}>Expected Columns</div>
// //                                     <div style={{ fontSize: '0.7rem', color: '#0c4a6e', marginBottom: '8px' }}>The system maps standard LEISA headers (spaces are ignored). Key columns include:</div>
// //                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
// //                                         {EXPECTED_COLUMNS.map(col => (
// //                                             <span key={col} style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
// //                                                 {col}
// //                                             </span>
// //                                         ))}
// //                                         <span style={{ color: '#64748b', padding: '2px 6px', fontSize: '0.65rem', fontStyle: 'italic' }}>+ other LEISA fields...</span>
// //                                     </div>
// //                                 </div>
// //                             )}
// //                             {pipelineMode === 'bootcamp' && (
// //                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// //                                     <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
// //                                     <div>
// //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4, marginBottom: '6px' }}>
// //                                             <strong>System Note:</strong> Fuzzy containment maps custom survey questions (e.g., location/address forms) perfectly onto your database layout.
// //                                         </p>
// //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#15803d', lineHeight: 1.4 }}>
// //                                             The engine requires <strong>ID Number</strong>, <strong>First Name</strong>, and <strong>Last Name</strong> at minimum. Bypasses strict LEISA validation.
// //                                         </p>
// //                                     </div>
// //                                 </div>
// //                             )}
// //                         </div>

// //                     </div>

// //                     {/* RIGHT COLUMN: INTERACTION FIELD & LOGS */}
// //                     <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: '320px', background: step === 'conflict_resolution' ? '#fffbeb' : 'transparent', transition: 'background 0.3s ease' }}>

// //                         {step === "upload" && (
// //                             <div
// //                                 onDragOver={pipelineMode ? handleDragOver : undefined}
// //                                 onDrop={pipelineMode ? handleDrop : undefined}
// //                                 onClick={() => pipelineMode && fileInputRef.current?.click()}
// //                                 style={{
// //                                     border: `2px dashed ${pipelineMode ? '#cbd5e1' : '#f87171'}`,
// //                                     borderRadius: '12px',
// //                                     padding: '4rem 2rem',
// //                                     textAlign: 'center',
// //                                     backgroundColor: pipelineMode ? 'white' : '#fef2f2',
// //                                     cursor: pipelineMode ? 'pointer' : 'not-allowed',
// //                                     transition: 'all 0.2s ease',
// //                                     flex: 1,
// //                                     display: 'flex',
// //                                     flexDirection: 'column',
// //                                     alignItems: 'center',
// //                                     justifyContent: 'center',
// //                                     opacity: pipelineMode ? 1 : 0.8
// //                                 }}
// //                             >
// //                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} disabled={!pipelineMode} />
// //                                 <UploadCloud size={56} color={pipelineMode ? "var(--mlab-blue)" : "var(--mlab-red)"} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// //                                 <h3 style={{ fontFamily: 'var(--font-heading)', color: pipelineMode ? 'var(--mlab-blue)' : 'var(--mlab-red)', margin: '0 0 8px', fontSize: '1.5rem' }}>
// //                                     {pipelineMode ? "Drag Spreadsheet Log Here" : "Action Required"}
// //                                 </h3>
// //                                 {pipelineMode ? (
// //                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', margin: 0 }}>
// //                                         Accepts raw spreadsheet exports (<strong>.xlsx</strong> or <strong>.csv</strong>).
// //                                     </p>
// //                                 ) : (
// //                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-red)', fontWeight: 600, margin: 0 }}>
// //                                         You must select an Ingestion Pathway (Standard or Bootcamp) from the left panel before uploading.
// //                                     </p>
// //                                 )}
// //                             </div>
// //                         )}

// //                         {/* CONFLICT RESOLUTION UI */}
// //                         {step === "conflict_resolution" && (
// //                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #fcd34d', borderRadius: '12px', background: 'white', overflow: 'hidden' }}>
// //                                 <div style={{ background: '#fef3c7', padding: '1.25rem', borderBottom: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
// //                                     <AlertTriangle size={32} color="#d97706" style={{ flexShrink: 0 }} />
// //                                     <div>
// //                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', fontSize: '1.25rem' }}>Identity Conflicts Detected</h3>
// //                                         <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#92400e' }}>
// //                                             The system flagged <strong>{conflicts.length} profiles</strong> in this batch that already exist. How would you like to handle them?
// //                                         </p>
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
// //                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
// //                                         <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
// //                                             <tr>
// //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Row</th>
// //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
// //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>ID Number</th>
// //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Current Cohort</th>
// //                                             </tr>
// //                                         </thead>
// //                                         <tbody>
// //                                             {conflicts.map((c, i) => (
// //                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
// //                                                     <td style={{ padding: '10px 12px', color: '#94a3b8' }}>#{c.row}</td>
// //                                                     <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{c.fullName}</td>
// //                                                     <td style={{ padding: '10px 12px', color: '#475569' }}>{c.idNumber}</td>
// //                                                     <td style={{ padding: '10px 12px', color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>
// //                                                         {cohorts.find(ch => ch.id === c.existingCohortId)?.name || 'Unassigned'}
// //                                                     </td>
// //                                                 </tr>
// //                                             ))}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>

// //                                 {/* 🚀 UPDATED RESOLUTION ACTION FOOTER WITH MULTI-ENROLL */}
// //                                 <div style={{ background: '#f8fafc', padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
// //                                     <button
// //                                         onClick={() => handleResolveConflicts('skip')}
// //                                         className="wm-btn wm-btn--ghost"
// //                                         style={{ border: '1px solid #cbd5e1' }}
// //                                     >
// //                                         Skip {conflicts.length} Existing
// //                                     </button>
// //                                     {selectedCohortId && selectedCohortId !== "Unassigned" && (
// //                                         <button
// //                                             onClick={() => handleResolveConflicts('multi_enroll')}
// //                                             className="wm-btn wm-btn--primary"
// //                                             style={{ background: '#0ea5e9', color: 'white', borderColor: '#0ea5e9', display: 'flex', gap: '6px', alignItems: 'center' }}
// //                                         >
// //                                             <PlusCircle size={14} /> Add as Additional Enrollment
// //                                         </button>
// //                                     )}
// //                                     <button
// //                                         onClick={() => handleResolveConflicts('overwrite')}
// //                                         className="wm-btn wm-btn--primary"
// //                                         style={{ background: '#d97706', color: 'white', borderColor: '#d97706', display: 'flex', gap: '6px', alignItems: 'center' }}
// //                                     >
// //                                         <DatabaseZap size={14} /> Overwrite & Transfer
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                         )}

// //                         {(step === "processing" || step === "complete") && (
// //                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
// //                                 <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem", padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
// //                                     {step === "processing" ? (
// //                                         <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
// //                                     ) : (
// //                                         <CheckCircle2 size={24} color="var(--mlab-green)" />
// //                                     )}
// //                                     <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase', fontSize: '1.1rem' }}>
// //                                         {step === "processing" ? "Compiling Matrix Array..." : "Import Cycle Complete"}
// //                                     </h4>
// //                                 </div>

// //                                 {step === "complete" && (
// //                                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
// //                                         <div style={{ flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}>
// //                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a', fontFamily: 'var(--font-heading)' }}>{successCount}</div>
// //                                             <div style={{ fontSize: '0.8rem', color: '#15803d', textTransform: 'uppercase', fontWeight: 600 }}>Profiles Migrated</div>
// //                                         </div>
// //                                         <div style={{ flex: 1, padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', textAlign: 'center' }}>
// //                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626', fontFamily: 'var(--font-heading)' }}>{errorCount}</div>
// //                                             <div style={{ fontSize: '0.8rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 600 }}>Duplicates Blocked</div>
// //                                         </div>
// //                                     </div>
// //                                 )}

// //                                 <div style={{
// //                                     background: "#0f172a",
// //                                     color: "#a3e635",
// //                                     padding: "1rem",
// //                                     borderRadius: "8px",
// //                                     fontFamily: "'Courier New', Courier, monospace",
// //                                     fontSize: "0.8rem",
// //                                     flex: 1,
// //                                     minHeight: "200px",
// //                                     overflowY: "auto",
// //                                     border: '1px solid #1e293b',
// //                                     boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
// //                                 }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
// //                                         <Terminal size={14} /> <span>INGESTION_SHELL_OUTPUT_v7.0</span>
// //                                     </div>
// //                                     {debugLog.map((log, i) => (
// //                                         <div key={i} style={{ marginBottom: "4px", color: log.includes("") || log.includes("") ? '#f87171' : (log.includes("✅") ? '#4ade80' : '#a3e635') }}>
// //                                             <span style={{ color: '#38bdf8', marginRight: '6px' }}>&gt;</span>{log}
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {/* ── FOOTER ── */}
// //                 <div className="mlab-modal__footer" style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem' }}>
// //                     {step === "upload" || step === "conflict_resolution" ? (
// //                         <button className="wm-btn wm-btn--ghost" onClick={onClose}>
// //                             Cancel
// //                         </button>
// //                     ) : step === "complete" ? (
// //                         <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
// //                             <button className="wm-btn wm-btn--ghost" onClick={() => setStep("upload")}>
// //                                 Import Alternative Set
// //                             </button>
// //                             <button
// //                                 className="wm-btn wm-btn--primary"
// //                                 style={{ background: 'var(--mlab-green)', color: 'white' }}
// //                                 onClick={onSuccess}
// //                             >
// //                                 {pipelineMode === 'bootcamp' ? 'View Bootcamp Roster' : 'Open Staging Directory'}
// //                             </button>
// //                         </div>
// //                     ) : (
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
// //                             <Loader2 size={14} className="spin" /> TRANSACTION THREAD LOCKED UNTIL BATCH WRITE TERMINATES
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };



// // // // src/components/admin/LearnerImportModal.tsx

// // // import React, { useState, useRef, useEffect } from "react";
// // // import { createPortal } from "react-dom";
// // // import * as XLSX from "xlsx";
// // // import {
// // //     UploadCloud,
// // //     X,
// // //     Loader2,
// // //     CheckCircle2,
// // //     BookOpen,
// // //     FileSpreadsheet,
// // //     Terminal,
// // //     Info,
// // //     Layers,
// // //     AlertTriangle,
// // //     DatabaseZap
// // // } from "lucide-react";
// // // import { writeBatch, doc, getDocs, collection } from "firebase/firestore";
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

// // // interface ImportConflict {
// // //     row: number;
// // //     idNumber: string;
// // //     fullName: string;
// // //     reason: string;
// // //     learnerData: DashboardLearner;
// // // }

// // // export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
// // //     cohortId,
// // //     onClose,
// // //     onSuccess,
// // // }) => {
// // //     const { cohorts, fetchStagingLearners, fetchLearners } = useStore();

// // //     const fileInputRef = useRef<HTMLInputElement>(null);

// // //     const [step, setStep] = useState<"upload" | "processing" | "conflict_resolution" | "complete">("upload");
// // //     const [debugLog, setDebugLog] = useState<string[]>([]);
// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");

// // //     const [pipelineMode, setPipelineMode] = useState<'standard' | 'bootcamp' | null>(null);

// // //     // Conflict tracking state
// // //     const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
// // //     const [parsedValidMap, setParsedValidMap] = useState<Map<string, DashboardLearner>>(new Map());

// // //     const [errorCount, setErrorCount] = useState(0);
// // //     const [successCount, setSuccessCount] = useState(0);

// // //     const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

// // //     const EXPECTED_COLUMNS = [
// // //         "National Id (*)",
// // //         "Learner First Name",
// // //         "Learner Last Name",
// // //         "Qualification Title",
// // //         "Statement of Results Issue Date",
// // //         "FLC Statement of result number"
// // //     ];

// // //     useEffect(() => {
// // //         if (selectedCohortId) {
// // //             const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
// // //             if (selectedCohort && (selectedCohort as any).type === 'bootcamp') {
// // //                 setPipelineMode('bootcamp');
// // //             } else if (selectedCohort && (selectedCohort as any).type === 'standard') {
// // //                 setPipelineMode('standard');
// // //             } else {
// // //                 setPipelineMode(null);
// // //             }
// // //         } else {
// // //             setPipelineMode(null);
// // //         }
// // //     }, [selectedCohortId, cohorts]);

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

// // //     const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

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
// // //      * ── STRICT FUZZY-MATCH PROCESSING LOGIC ──────────────────────────────
// // //      */
// // //     const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         if (!pipelineMode) return;
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         setStep("processing");
// // //         setDebugLog([]);
// // //         setErrorCount(0);
// // //         setSuccessCount(0);
// // //         setConflicts([]);
// // //         setParsedValidMap(new Map());

// // //         addToLog(`Initializing Smart Data Pipeline: ${file.name}`);
// // //         addToLog(`Import Target: ${pipelineMode === 'bootcamp' ? 'DIRECT TO LIVE (Bootcamp/Applicants)' : 'STAGING AREA (LEISA Compliance)'}`);

// // //         addToLog(`⏳ Querying live system safety rules...`);
// // //         const existingIds = new Set<string>();
// // //         const existingEmails = new Set<string>();
// // //         const stagingIds = new Set<string>();
// // //         const validSaqaIds = new Set<string>();
// // //         const validProgNames = new Set<string>();

// // //         try {
// // //             const learnersSnap = await getDocs(collection(db, "learners"));
// // //             learnersSnap.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 if (data.idNumber) existingIds.add(String(data.idNumber).trim());
// // //                 if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
// // //             });

// // //             const stagingSnap = await getDocs(collection(db, "staging_learners"));
// // //             stagingSnap.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 if (data.idNumber) stagingIds.add(String(data.idNumber).trim());
// // //             });

// // //             const progSnap = await getDocs(collection(db, "programmes"));
// // //             progSnap.forEach(docSnap => {
// // //                 const data = docSnap.data();
// // //                 if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
// // //                 if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
// // //             });
// // //             addToLog(` Safeguards Activated: Verified ${existingIds.size} live and ${stagingIds.size} staged profiles.`);
// // //         } catch (err) {
// // //             addToLog(` FATAL: Pipeline could not authenticate deep database lookups.`);
// // //             setStep("upload");
// // //             return;
// // //         }

// // //         const reader = new FileReader();

// // //         reader.onload = async (event) => {
// // //             try {
// // //                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
// // //                 const workbook = XLSX.read(data, { type: 'array' });

// // //                 let targetSheetName = workbook.SheetNames[0];
// // //                 let foundHeader = false;

// // //                 if (workbook.SheetNames.includes("Learner Enrolment and EISA")) {
// // //                     targetSheetName = "Learner Enrolment and EISA";
// // //                     addToLog(` QCTO/LEISA sheet structure isolated.`);
// // //                 } else {
// // //                     for (const sheetName of workbook.SheetNames) {
// // //                         const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
// // //                         for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
// // //                             const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-?()]/g, ''));
// // //                             if (headers.includes("nationalid") || headers.includes("idnumber") || headers.includes("emailaddress") || headers.includes("email")) {
// // //                                 targetSheetName = sheetName;
// // //                                 foundHeader = true;
// // //                                 break;
// // //                             }
// // //                         }
// // //                         if (foundHeader) break;
// // //                     }
// // //                 }

// // //                 addToLog(` Ingesting from row schema: "${targetSheetName}"`);
// // //                 const worksheet = workbook.Sheets[targetSheetName];
// // //                 const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];

// // //                 if (rows.length === 0) {
// // //                     addToLog(` Error: Document empty or has unreadable row schema.`);
// // //                     setStep("upload");
// // //                     return;
// // //                 }

// // //                 const validLearnersMap = new Map<string, DashboardLearner>();
// // //                 const conflictLearnersList: ImportConflict[] = [];
// // //                 const todaySA = getTodaySA();
// // //                 let hardErrors = 0;

// // //                 rows.forEach((row, index) => {
// // //                     const getVal = (possibleSubstrings: string[]) => {
// // //                         for (const targetSub of possibleSubstrings) {
// // //                             const cleanTarget = targetSub.toLowerCase().replace(/[\s_*-?()]/g, "");

// // //                             const exactKey = Object.keys(row).find(k => {
// // //                                 const cleanKey = k.toLowerCase().replace(/[\s_*-?()]/g, "");
// // //                                 return cleanKey.includes(cleanTarget);
// // //                             });

// // //                             if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
// // //                                 return String(row[exactKey]).trim();
// // //                             }
// // //                         }
// // //                         return "";
// // //                     };

// // //                     const idNumber = getVal(["idnumber", "nationalid", "learneralternateid", "identitynumber", "id"]);
// // //                     const firstName = getVal(["firstname", "learnerfirstname", "name", "first"]);
// // //                     const lastName = getVal(["lastname", "surname", "learnerlastname", "last"]);
// // //                     let fullName = getVal(["fullname", "learnerfullname"]);
// // //                     if (!fullName && firstName) fullName = `${firstName} ${lastName}`.trim();

// // //                     const rawEmail = getVal(["emailaddress", "email", "learneremailaddress"]);
// // //                     const email = rawEmail ? String(rawEmail).toLowerCase().trim() : "";
// // //                     const phone = getVal(["phonenumber", "phone", "cellphonenumber", "mobile", "learnercellphonenumber"]);

// // //                     if (!idNumber || !fullName || fullName === " ") {
// // //                         addToLog(` Row ${index + 2}: Dropped (Missing structural ID Number or Name)`);
// // //                         hardErrors++;
// // //                         return;
// // //                     }

// // //                     // Detect conflicts instead of dropping them instantly
// // //                     let isConflict = false;
// // //                     let conflictReason = "";

// // //                     if (existingIds.has(idNumber)) {
// // //                         isConflict = true;
// // //                         conflictReason = "Profile exists in Live Matrix";
// // //                     } else if (email && existingEmails.has(email)) {
// // //                         isConflict = true;
// // //                         conflictReason = "Email already linked to another user";
// // //                     } else if (pipelineMode === 'standard' && stagingIds.has(idNumber)) {
// // //                         isConflict = true;
// // //                         conflictReason = "Profile already pending in Staging Area";
// // //                     }

// // //                     let saqaId = "";
// // //                     let progName = "Bootcamp / Pre-selection";
// // //                     let issueDateSA = "";
// // //                     let sdpCode = "";

// // //                     if (pipelineMode === 'standard') {
// // //                         saqaId = getVal(["qualificationid", "saqaid"]);
// // //                         progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);
// // //                         issueDateSA = parseQCTODate(getVal(["statementofresultsissuedate", "issuedate"]));
// // //                         sdpCode = getVal(["sdpcode", "providercode"]);

// // //                         const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
// // //                         const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

// // //                         if (!isSaqaMatch && !isNameMatch) {
// // //                             addToLog(` Row ${index + 2}: Dropped (Qualification title or SAQA ID not recognized in database blueprints)`);
// // //                             hardErrors++;
// // //                             return;
// // //                         }
// // //                     }

// // //                     const locationAnswer = getVal([
// // //                         "nearesttoyourresidence",
// // //                         "whichprovince",
// // //                         "provincecode",
// // //                         "province",
// // //                         "residentialaddress"
// // //                     ]);

// // //                     const gender = getVal(["gender", "gendercode"]);
// // //                     const race = getVal(["race", "ethnicity", "equitycode"]);
// // //                     const disability = getVal(["disabilities", "disability", "disabilitystatuscode"]);

// // //                     const activeCohortId = selectedCohortId || "Unassigned";
// // //                     const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

// // //                     const newLearner: DashboardLearner = {
// // //                         id: idNumber,
// // //                         learnerId: idNumber,
// // //                         enrollmentId: generatedEnrollmentId,
// // //                         firstName,
// // //                         lastName,
// // //                         fullName,
// // //                         status: "active",
// // //                         isDraft: pipelineMode === 'standard',
// // //                         authStatus: "pending",
// // //                         isArchived: false,
// // //                         isBootcamp: pipelineMode === 'bootcamp',
// // //                         idNumber,
// // //                         email,
// // //                         phone,
// // //                         mobile: phone,
// // //                         dateOfBirth: parseQCTODate(getVal(["learnerbirthdate", "dateofbirth", "dob", "age"])),
// // //                         cohortId: activeCohortId,
// // //                         trainingStartDate: parseQCTODate(getVal(["expectedtrainingcompletiondate", "trainingstartdate"])),
// // //                         createdAt: new Date().toISOString(),
// // //                         createdBy: "bulk-import",
// // //                         qualification: {
// // //                             name: progName,
// // //                             saqaId: saqaId,
// // //                             credits: 0,
// // //                             totalNotionalHours: 0,
// // //                             nqfLevel: 0,
// // //                             dateAssessed: issueDateSA,
// // //                         },
// // //                         knowledgeModules: [],
// // //                         practicalModules: [],
// // //                         workExperienceModules: [],
// // //                         eisaAdmission: false,
// // //                         verificationCode: generateSorId(fullName || "Learner", issueDateSA || todaySA, sdpCode || "PENDING"),
// // //                         issueDate: issueDateSA,
// // //                         demographics: {
// // //                             sdpCode,
// // //                             genderCode: gender,
// // //                             equityCode: race,
// // //                             disabilityStatusCode: disability,
// // //                             provinceCode: locationAnswer,
// // //                             citizenResidentStatusCode: getVal(["citizen", "resident"]),
// // //                             homeLanguageCode: getVal(["languagecode", "language"]),
// // //                             nationalityCode: getVal(["nationality"]),
// // //                             socioeconomicStatusCode: getVal(["socioeconomic"]),
// // //                             flc: getVal(["flc"]),
// // //                             flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]),
// // //                             statementOfResultsStatus: getVal(["statementofresultsstatus"]),
// // //                             statementOfResultsIssueDate: issueDateSA,
// // //                             learnerHomeAddress1: getVal(["address1", "residentialaddress", "homeaddress"]),
// // //                             learnerPostalAddressPostCode: getVal(["postalcode", "zip"])
// // //                         } as LearnerDemographics
// // //                     };

// // //                     // Route to Conflict UI instead of silent dropping
// // //                     if (isConflict) {
// // //                         conflictLearnersList.push({
// // //                             row: index + 2,
// // //                             idNumber,
// // //                             fullName,
// // //                             reason: conflictReason,
// // //                             learnerData: newLearner
// // //                         });
// // //                         addToLog(` Row ${index + 2}: CONFLICT DETECTED - ${conflictReason}`);
// // //                     } else {
// // //                         validLearnersMap.set(idNumber, newLearner);
// // //                     }
// // //                 });

// // //                 setErrorCount(hardErrors);
// // //                 setParsedValidMap(validLearnersMap);
// // //                 setConflicts(conflictLearnersList);

// // //                 // ROUTING: Go to conflict resolution if there are duplicates, otherwise save directly
// // //                 if (conflictLearnersList.length > 0) {
// // //                     setStep("conflict_resolution");
// // //                 } else if (validLearnersMap.size > 0) {
// // //                     setSuccessCount(validLearnersMap.size);
// // //                     saveToDatabase(validLearnersMap);
// // //                 } else {
// // //                     addToLog(`Parse halt. No clean rows found to process (Blocked: ${hardErrors}).`);
// // //                     setStep("complete");
// // //                 }

// // //             } catch (err: any) {
// // //                 addToLog(`SCHEMATIC UNRECOGNIZED: ${err.message}`);
// // //                 setStep("complete");
// // //             }
// // //         };

// // //         reader.onerror = () => {
// // //             addToLog(` ERROR: Buffer transmission failed.`);
// // //             setStep("upload");
// // //         };

// // //         reader.readAsArrayBuffer(file);
// // //     };

// // //     // Conflict Resolution Handler
// // //     const handleResolveConflicts = (action: 'skip' | 'overwrite') => {
// // //         setStep("processing");
// // //         const finalMap = new Map(parsedValidMap);

// // //         if (action === 'overwrite') {
// // //             conflicts.forEach(c => {
// // //                 finalMap.set(c.idNumber, c.learnerData);
// // //             });
// // //             addToLog(`⚡ Resolution: OVERWRITING ${conflicts.length} conflicting records.`);
// // //         } else {
// // //             addToLog(` Resolution: SKIPPING ${conflicts.length} conflicting records.`);
// // //             setErrorCount(prev => prev + conflicts.length);
// // //         }

// // //         setSuccessCount(finalMap.size);

// // //         if (finalMap.size > 0) {
// // //             saveToDatabase(finalMap);
// // //         } else {
// // //             addToLog(` Import halt: No profiles left to import after skipping duplicates.`);
// // //             setStep("complete");
// // //         }
// // //     };

// // //     // DEFENSE 3: SPLIT TRAFFIC & PURGE GHOSTS
// // //     const saveToDatabase = (dataMap: Map<string, DashboardLearner>) => {
// // //         const isBootcamp = pipelineMode === 'bootcamp';

// // //         addToLog(` Syncing ${dataMap.size} documents to ${isBootcamp ? 'LIVE BOOTCAMP' : 'SERVER STAGING'} vault...`);

// // //         try {
// // //             const batch = writeBatch(db);
// // //             let writeCount = 0;

// // //             dataMap.forEach((learner) => {
// // //                 const cleanedLearner = cleanObject(learner);

// // //                 if (isBootcamp) {
// // //                     // Bypass Staging -> Inject straight to live learners
// // //                     const learnerRef = doc(db, "learners", String(learner.id));
// // //                     batch.set(learnerRef, cleanedLearner, { merge: true });
// // //                     writeCount++;

// // //                     // Generate the enrollment ledger immediately so they appear in the cohort
// // //                     if (learner.enrollmentId) {
// // //                         const enrollmentRef = doc(db, "enrollments", String(learner.enrollmentId));
// // //                         batch.set(enrollmentRef, {
// // //                             id: learner.enrollmentId,
// // //                             learnerId: learner.id,
// // //                             cohortId: learner.cohortId,
// // //                             status: "active",
// // //                             createdAt: new Date().toISOString(),
// // //                             isBootcamp: true
// // //                         }, { merge: true });
// // //                         writeCount++;
// // //                     }

// // //                     // GHOST PURGE: Delete them from staging if they were accidentally trapped there
// // //                     const stagingRef = doc(db, "staging_learners", String(learner.id));
// // //                     batch.delete(stagingRef);
// // //                     writeCount++;

// // //                 } else {
// // //                     // Standard routing -> Queue into staging area
// // //                     const ref = doc(db, "staging_learners", String(learner.id));
// // //                     batch.set(ref, cleanedLearner, { merge: true });
// // //                     writeCount++;
// // //                 }
// // //             });

// // //             addToLog(`⏳ Awaiting Database Acknowledgement (${writeCount} operations)...`);

// // //             // Non-blocking promise chain
// // //             batch.commit()
// // //                 .then(() => {
// // //                     addToLog(`COMPLETE: Import successfully routed to the ${isBootcamp ? 'Bootcamp Roster' : 'Staging Area'}.`);
// // //                     setStep("complete");

// // //                     // Refresh global store completely silently in the background
// // //                     if (isBootcamp && fetchLearners) fetchLearners(true);
// // //                     if (fetchStagingLearners) fetchStagingLearners();
// // //                 })
// // //                 .catch((error: any) => {
// // //                     console.error("Batch Write Failed:", error);
// // //                     addToLog(` CORE WRITE ERROR: ${error.message || "Unknown error during save"}`);
// // //                     setStep("complete");
// // //                 });

// // //         } catch (error: any) {
// // //             console.error("Pre-commit Batch Error:", error);
// // //             addToLog(` BATCH CREATION ERROR: ${error.message || "Unknown error building transaction"}`);
// // //             setStep("complete");
// // //         }
// // //     };

// // //     return createPortal(
// // //         <div className="mlab-modal-overlay">
// // //             <div className="mlab-modal animate-fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--mlab-bg)', padding: 0, overflow: 'hidden' }}>

// // //                 {/* ── HEADER ── */}
// // //                 <div className="mlab-modal__header" style={{ flexShrink: 0, borderBottom: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem', background: 'white' }}>
// // //                     <div className="mlab-modal__title-group">
// // //                         <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0ea5e9' }}>
// // //                             <FileSpreadsheet size={22} />
// // //                         </div>
// // //                         <div style={{ marginLeft: '12px' }}>
// // //                             <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>
// // //                                 Data Pipeline Importer
// // //                             </h2>
// // //                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>FUZZY HEADER CONFIGURATION LIVE</span>
// // //                         </div>
// // //                     </div>
// // //                     <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}>
// // //                         <X size={20} />
// // //                     </button>
// // //                 </div>

// // //                 {/* ── 2-COLUMN DISPLAY (SCROLLABLE BODY) ── */}
// // //                 <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflowY: 'auto', flexWrap: 'wrap' }}>

// // //                     {/* LEFT COLUMN: CONTROLS & PIPELINES */}
// // //                     <div style={{ flex: '1 1 380px', maxWidth: '380px', background: 'white', borderRight: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

// // //                         <div>
// // //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                 <BookOpen size={16} /> 1. Target Cohort Assignment
// // //                             </h3>
// // //                             <select
// // //                                 value={selectedCohortId}
// // //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// // //                                 className="lfm-input"
// // //                                 style={{ margin: 0, padding: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }}
// // //                                 disabled={step !== "upload"}
// // //                             >
// // //                                 <option value="">-- DRAFT DIRECTORY (Unassigned) --</option>
// // //                                 {cohorts.filter((c) => !c.isArchived).map((c) => (
// // //                                     <option key={c.id} value={c.id}>{c.name}</option>
// // //                                 ))}
// // //                             </select>
// // //                         </div>

// // //                         <div>
// // //                             <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                 <Layers size={16} /> 2. Core Ingestion Pathway
// // //                             </h3>
// // //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: step !== "upload" ? 0.6 : 1, pointerEvents: step !== "upload" ? 'none' : 'auto' }}>
// // //                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'standard' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'standard' ? '#f0f9ff' : 'white', transition: 'all 0.2s ease' }}>
// // //                                     <input type="radio" checked={pipelineMode === 'standard'} onChange={() => setPipelineMode('standard')} style={{ marginTop: '2px', accentColor: 'var(--mlab-blue)' }} />
// // //                                     <div>
// // //                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>Standard Programme Ingestion</div>
// // //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Enforces rigid SAQA blueprint cross-checks. Routes to Staging Area.</div>
// // //                                     </div>
// // //                                 </label>

// // //                                 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'bootcamp' ? 'var(--mlab-green)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'bootcamp' ? '#f0fdf4' : 'white', transition: 'all 0.2s ease' }}>
// // //                                     <input type="radio" checked={pipelineMode === 'bootcamp'} onChange={() => setPipelineMode('bootcamp')} style={{ marginTop: '2px', accentColor: 'var(--mlab-green)' }} />
// // //                                     <div>
// // //                                         <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)' }}>Bootcamp / Pre-selection Funnel</div>
// // //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Bypasses staging logic. Injects shadows profiles directly into active Bootcamp view.</div>
// // //                                     </div>
// // //                                 </label>
// // //                             </div>
// // //                         </div>

// // //                         <div style={{ marginTop: 'auto' }}>
// // //                             {pipelineMode === 'standard' && (
// // //                                 <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
// // //                                     <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
// // //                                         <Info size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
// // //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: 1.4 }}>
// // //                                             Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). The system will strictly check against the live database and automatically block any duplicate IDs, emails, or unknown qualifications to prevent data corruption.
// // //                                         </p>
// // //                                     </div>
// // //                                     <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#075985', textTransform: 'uppercase', marginBottom: '6px' }}>Expected Columns</div>
// // //                                     <div style={{ fontSize: '0.7rem', color: '#0c4a6e', marginBottom: '8px' }}>The system maps standard LEISA headers (spaces are ignored). Key columns include:</div>
// // //                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
// // //                                         {EXPECTED_COLUMNS.map(col => (
// // //                                             <span key={col} style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
// // //                                                 {col}
// // //                                             </span>
// // //                                         ))}
// // //                                         <span style={{ color: '#64748b', padding: '2px 6px', fontSize: '0.65rem', fontStyle: 'italic' }}>+ other LEISA fields...</span>
// // //                                     </div>
// // //                                 </div>
// // //                             )}
// // //                             {pipelineMode === 'bootcamp' && (
// // //                                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
// // //                                     <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
// // //                                     <div>
// // //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4, marginBottom: '6px' }}>
// // //                                             <strong>System Note:</strong> Fuzzy containment maps custom survey questions (e.g., location/address forms) perfectly onto your database layout.
// // //                                         </p>
// // //                                         <p style={{ margin: 0, fontSize: '0.75rem', color: '#15803d', lineHeight: 1.4 }}>
// // //                                             The engine requires <strong>ID Number</strong>, <strong>First Name</strong>, and <strong>Last Name</strong> at minimum. Bypasses strict LEISA validation.
// // //                                         </p>
// // //                                     </div>
// // //                                 </div>
// // //                             )}
// // //                         </div>

// // //                     </div>

// // //                     {/* RIGHT COLUMN: INTERACTION FIELD & LOGS */}
// // //                     <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: '320px', background: step === 'conflict_resolution' ? '#fffbeb' : 'transparent', transition: 'background 0.3s ease' }}>

// // //                         {step === "upload" && (
// // //                             <div
// // //                                 onDragOver={pipelineMode ? handleDragOver : undefined}
// // //                                 onDrop={pipelineMode ? handleDrop : undefined}
// // //                                 onClick={() => pipelineMode && fileInputRef.current?.click()}
// // //                                 style={{
// // //                                     border: `2px dashed ${pipelineMode ? '#cbd5e1' : '#f87171'}`,
// // //                                     borderRadius: '12px',
// // //                                     padding: '4rem 2rem',
// // //                                     textAlign: 'center',
// // //                                     backgroundColor: pipelineMode ? 'white' : '#fef2f2',
// // //                                     cursor: pipelineMode ? 'pointer' : 'not-allowed',
// // //                                     transition: 'all 0.2s ease',
// // //                                     flex: 1,
// // //                                     display: 'flex',
// // //                                     flexDirection: 'column',
// // //                                     alignItems: 'center',
// // //                                     justifyContent: 'center',
// // //                                     opacity: pipelineMode ? 1 : 0.8
// // //                                 }}
// // //                             >
// // //                                 <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} disabled={!pipelineMode} />
// // //                                 <UploadCloud size={56} color={pipelineMode ? "var(--mlab-blue)" : "var(--mlab-red)"} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
// // //                                 <h3 style={{ fontFamily: 'var(--font-heading)', color: pipelineMode ? 'var(--mlab-blue)' : 'var(--mlab-red)', margin: '0 0 8px', fontSize: '1.5rem' }}>
// // //                                     {pipelineMode ? "Drag Spreadsheet Log Here" : "Action Required"}
// // //                                 </h3>
// // //                                 {pipelineMode ? (
// // //                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', margin: 0 }}>
// // //                                         Accepts raw spreadsheet exports (<strong>.xlsx</strong> or <strong>.csv</strong>).
// // //                                     </p>
// // //                                 ) : (
// // //                                     <p style={{ fontSize: '0.9rem', color: 'var(--mlab-red)', fontWeight: 600, margin: 0 }}>
// // //                                         You must select an Ingestion Pathway (Standard or Bootcamp) from the left panel before uploading.
// // //                                     </p>
// // //                                 )}
// // //                             </div>
// // //                         )}

// // //                         {/* CONFLICT RESOLUTION UI */}
// // //                         {step === "conflict_resolution" && (
// // //                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #fcd34d', borderRadius: '12px', background: 'white', overflow: 'hidden' }}>
// // //                                 <div style={{ background: '#fef3c7', padding: '1.25rem', borderBottom: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
// // //                                     <AlertTriangle size={32} color="#d97706" style={{ flexShrink: 0 }} />
// // //                                     <div>
// // //                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', fontSize: '1.25rem' }}>Identity Conflicts Detected</h3>
// // //                                         <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#92400e' }}>
// // //                                             The system flagged <strong>{conflicts.length} profiles</strong> in this batch that already exist. How would you like to handle them?
// // //                                         </p>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
// // //                                     <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
// // //                                         <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
// // //                                             <tr>
// // //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Row</th>
// // //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
// // //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>ID Number</th>
// // //                                                 <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Conflict Reason</th>
// // //                                             </tr>
// // //                                         </thead>
// // //                                         <tbody>
// // //                                             {conflicts.map((c, i) => (
// // //                                                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
// // //                                                     <td style={{ padding: '10px 12px', color: '#94a3b8' }}>#{c.row}</td>
// // //                                                     <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{c.fullName}</td>
// // //                                                     <td style={{ padding: '10px 12px', color: '#475569' }}>{c.idNumber}</td>
// // //                                                     <td style={{ padding: '10px 12px', color: '#d97706', fontSize: '0.75rem' }}>{c.reason}</td>
// // //                                                 </tr>
// // //                                             ))}
// // //                                         </tbody>
// // //                                     </table>
// // //                                 </div>

// // //                                 <div style={{ background: '#f8fafc', padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
// // //                                     <button
// // //                                         onClick={() => handleResolveConflicts('skip')}
// // //                                         className="wm-btn wm-btn--ghost"
// // //                                         style={{ border: '1px solid #cbd5e1' }}
// // //                                     >
// // //                                         Skip {conflicts.length} Existing
// // //                                     </button>
// // //                                     <button
// // //                                         onClick={() => handleResolveConflicts('overwrite')}
// // //                                         className="wm-btn wm-btn--primary"
// // //                                         style={{ background: '#d97706', color: 'white', borderColor: '#d97706', display: 'flex', gap: '6px', alignItems: 'center' }}
// // //                                     >
// // //                                         <DatabaseZap size={14} /> Update/Overwrite {conflicts.length} Profiles
// // //                                     </button>
// // //                                 </div>
// // //                             </div>
// // //                         )}

// // //                         {(step === "processing" || step === "complete") && (
// // //                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
// // //                                 <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem", padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
// // //                                     {step === "processing" ? (
// // //                                         <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
// // //                                     ) : (
// // //                                         <CheckCircle2 size={24} color="var(--mlab-green)" />
// // //                                     )}
// // //                                     <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase', fontSize: '1.1rem' }}>
// // //                                         {step === "processing" ? "Compiling Matrix Array..." : "Import Cycle Complete"}
// // //                                     </h4>
// // //                                 </div>

// // //                                 {step === "complete" && (
// // //                                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
// // //                                         <div style={{ flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}>
// // //                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a', fontFamily: 'var(--font-heading)' }}>{successCount}</div>
// // //                                             <div style={{ fontSize: '0.8rem', color: '#15803d', textTransform: 'uppercase', fontWeight: 600 }}>Profiles Migrated</div>
// // //                                         </div>
// // //                                         <div style={{ flex: 1, padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', textAlign: 'center' }}>
// // //                                             <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626', fontFamily: 'var(--font-heading)' }}>{errorCount}</div>
// // //                                             <div style={{ fontSize: '0.8rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 600 }}>Duplicates Blocked</div>
// // //                                         </div>
// // //                                     </div>
// // //                                 )}

// // //                                 <div style={{
// // //                                     background: "#0f172a",
// // //                                     color: "#a3e635",
// // //                                     padding: "1rem",
// // //                                     borderRadius: "8px",
// // //                                     fontFamily: "'Courier New', Courier, monospace",
// // //                                     fontSize: "0.8rem",
// // //                                     flex: 1,
// // //                                     minHeight: "200px",
// // //                                     overflowY: "auto",
// // //                                     border: '1px solid #1e293b',
// // //                                     boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
// // //                                 }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
// // //                                         <Terminal size={14} /> <span>INGESTION_SHELL_OUTPUT_v7.0</span>
// // //                                     </div>
// // //                                     {debugLog.map((log, i) => (
// // //                                         <div key={i} style={{ marginBottom: "4px", color: log.includes("") || log.includes("") ? '#f87171' : (log.includes("✅") ? '#4ade80' : '#a3e635') }}>
// // //                                             <span style={{ color: '#38bdf8', marginRight: '6px' }}>&gt;</span>{log}
// // //                                         </div>
// // //                                     ))}
// // //                                 </div>
// // //                             </div>
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //                 {/* ── FOOTER ── */}
// // //                 <div className="mlab-modal__footer" style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem' }}>
// // //                     {step === "upload" || step === "conflict_resolution" ? (
// // //                         <button className="wm-btn wm-btn--ghost" onClick={onClose}>
// // //                             Cancel
// // //                         </button>
// // //                     ) : step === "complete" ? (
// // //                         <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
// // //                             <button className="wm-btn wm-btn--ghost" onClick={() => setStep("upload")}>
// // //                                 Import Alternative Set
// // //                             </button>
// // //                             <button
// // //                                 className="wm-btn wm-btn--primary"
// // //                                 style={{ background: 'var(--mlab-green)', color: 'white' }}
// // //                                 onClick={onSuccess}
// // //                             >
// // //                                 {pipelineMode === 'bootcamp' ? 'View Bootcamp Roster' : 'Open Staging Directory'}
// // //                             </button>
// // //                         </div>
// // //                     ) : (
// // //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-grey)', fontSize: '0.75rem', fontWeight: 600 }}>
// // //                             <Loader2 size={14} className="spin" /> TRANSACTION THREAD LOCKED UNTIL BATCH WRITE TERMINATES
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //         </div>,
// // //         document.body
// // //     );
// // // };