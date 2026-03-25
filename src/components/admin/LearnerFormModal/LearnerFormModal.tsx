// src/components/admin/LearnerFormModal.tsx

import React, { useState, useEffect, useRef } from "react";
import {
    X,
    Save,
    Loader2,
    AlertCircle,
    Users,
    BookOpen,
    Layers,
    FileText,
    Briefcase,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Plus,
    UploadCloud,
    MapPin,
} from "lucide-react";
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
} from "firebase/firestore";
import { ModuleEditor } from "../../common/ModuleEditor/ModuleEditor";
import { useStore } from "../../../store/useStore";
import type {
    DashboardLearner,
    LearnerDemographics,
    ModuleCategory,
    ProgrammeTemplate,
    Qualification,
    Cohort,
} from "../../../types";
import "./LearnerFormModal.css";
import {
    StatusModal,
    type StatusModalProps,
} from "../../common/StatusModal/StatusModal";
import { db } from "../../../lib/firebase";
import { CohortFormModal } from "../CohortFormModal/CohortFormModal";
import { generateSorId } from "../../../pages/utils/validation";

interface LearnerFormModalProps {
    learner?: DashboardLearner | null;
    onClose: () => void;
    onSave: (learner: Partial<DashboardLearner>) => Promise<void>;
    title: string;
    programmes: ProgrammeTemplate[];
    cohorts: Cohort[];
    currentCohortId?: string;
}

const GLOBAL_SDP_CODE = import.meta.env.VITE_SDP_CODE || "SDP070824115131";

const emptyQualification: Qualification = {
    name: "",
    saqaId: "",
    credits: 0,
    totalNotionalHours: 0,
    nqfLevel: 0,
    dateAssessed: "",
};

const emptyLearner = {
    fullName: "",
    firstName: "",
    lastName: "",
    idNumber: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    mobile: "",
    cohortId: "Unassigned",
    campusId: "",
    trainingStartDate: "",
    trainingEndDate: "",
    isArchived: false,
    authStatus: "pending",
    status: "active",
    isOffline: false,
    qualification: { ...emptyQualification },
    knowledgeModules: [],
    practicalModules: [],
    workExperienceModules: [],
    eisaAdmission: false,
    nextEisaDate: "",
    verificationCode: "",
    issueDate: null,
    demographics: { sdpCode: GLOBAL_SDP_CODE } as LearnerDemographics,
    createdAt: "",
    createdBy: "",
};

const TAB_META: Record<
    ModuleCategory,
    { label: string; icon: React.ReactNode }
> = {
    knowledge: { label: "Knowledge", icon: <Layers size={13} /> },
    practical: { label: "Practical", icon: <FileText size={13} /> },
    workExperience: { label: "Work Experience", icon: <Briefcase size={13} /> },
};

// PARSE ANY DATE TO DD-MM-YYYY WITHOUT UTC SHIFTING
const parseLocalToSA = (dStr: string | null | undefined): string => {
    if (!dStr) return "";
    const str = String(dStr).trim();
    const parts = str.split("-");

    // If it's already DD-MM-YYYY, return it immediately
    if (parts.length === 3 && parts[2].length === 4) return str;

    const d = new Date(str);
    if (isNaN(d.getTime())) return str;

    // Use .getDate() instead of .toISOString() to avoid timezone shift!
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};

// CONVERT DD-MM-YYYY TO HTML YYYY-MM-DD FOR DATE PICKERS
const dateToHtml = (saDate: string | undefined): string => {
    if (!saDate) return "";
    const parts = saDate.split("-");
    if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return saDate;
};

// CONVERT HTML YYYY-MM-DD TO DD-MM-YYYY FOR DATABASE
const htmlToDate = (isoDate: string): string => {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return isoDate;
};

export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
    learner,
    onClose,
    onSave,
    title,
    programmes,
    cohorts,
    currentCohortId,
}) => {
    const { fetchCohorts, enrollLearnerInCohort, settings } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<DashboardLearner>(() => {
        if (learner) {
            return {
                ...learner,
                dateOfBirth: parseLocalToSA(learner.dateOfBirth),
                trainingStartDate: parseLocalToSA(learner.trainingStartDate),
                trainingEndDate: parseLocalToSA(learner.trainingEndDate || (learner.demographics as any)?.expectedTrainingCompletionDate),
                nextEisaDate: parseLocalToSA(learner.nextEisaDate),
                issueDate: parseLocalToSA(learner.issueDate),
                campusId: learner.campusId || "",
                qualification: {
                    ...(learner.qualification || emptyQualification),
                    dateAssessed: parseLocalToSA(learner.qualification?.dateAssessed),
                },
                demographics: {
                    ...(learner.demographics || {}),
                    sdpCode: learner.demographics?.sdpCode || GLOBAL_SDP_CODE,
                    expectedTrainingCompletionDate: parseLocalToSA(learner.demographics?.expectedTrainingCompletionDate),
                },
            } as DashboardLearner;
        }
        return {
            ...emptyLearner,
            id: "",
            cohortId: currentCohortId || "Unassigned",
        } as unknown as DashboardLearner;
    });

    const [activeTab, setActiveTab] = useState<ModuleCategory>("knowledge");
    const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);
    const [showCohortModal, setShowCohortModal] = useState(false);

    // Auto-set default campus for new Offline learners if not set
    useEffect(() => {
        if (!learner && !formData.campusId && settings?.campuses) {
            const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
            if (defaultCampus) {
                setFormData(prev => ({ ...prev, campusId: defaultCampus.id }));
            }
        }
    }, [learner, settings, formData.campusId]);

    const updateField = (field: keyof DashboardLearner, value: any) =>
        setFormData((prev) => ({ ...prev, [field]: value }));

    const updateQualification = (field: keyof Qualification, value: string | number) => {
        setFormData((prev) => {
            const updatedQual = { ...prev.qualification, [field]: value };
            if (field === "credits") updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
            return { ...prev, qualification: updatedQual };
        });
    };

    const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) =>
        setFormData((prev) => ({
            ...prev,
            demographics: { ...(prev.demographics || {}), [field]: value },
        }));

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            parseCSV(text);
        };
        reader.readAsText(file);
    };

    const parseCSV = (csvText: string) => {
        try {
            const parseCSVText = (text: string) => {
                const result: string[][] = [];
                let row: string[] = [];
                let inQuotes = false;
                let val = "";
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const nextChar = text[i + 1];
                    if (char === '"' && inQuotes && nextChar === '"') {
                        val += '"'; i++;
                    } else if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === "," && !inQuotes) {
                        row.push(val.trim()); val = "";
                    } else if ((char === "\n" || (char === "\r" && nextChar === "\n")) && !inQuotes) {
                        row.push(val.trim()); result.push(row); row = []; val = "";
                        if (char === "\r") i++;
                    } else { val += char; }
                }
                row.push(val.trim()); result.push(row);
                return result;
            };

            const rows = parseCSVText(csvText);

            let fullName = "", qualName = "", nqfLevel = 0, saqaId = "", totalCredits = 0;
            let idNumber = "", emailAddress = "", phoneNumber = "";
            let startDateStr = "", completionDateStr = "", issueDateStr = "";
            let importedCohortName = "", importedSdpCode = GLOBAL_SDP_CODE;

            const knowledgeModules: any[] = [];
            const practicalModules: any[] = [];
            const workExperienceModules: any[] = [];

            let currentSection = "K";
            let isModuleSection = false;

            rows.forEach((cols) => {
                if (!cols || cols.length === 0 || (cols.length === 1 && cols[0] === "")) return;

                const col0 = (cols[0] || "").trim();
                const col1 = (cols[1] || "").trim();
                const col0Lower = col0.toLowerCase();

                if (!isModuleSection) {
                    if (col0Lower.includes("qualification title")) qualName = cols[1]?.trim();
                    else if (col0Lower.includes("nqf level")) nqfLevel = parseInt(cols[1]) || 0;
                    else if (col0Lower.includes("saqa qual id")) saqaId = cols[1]?.trim();
                    else if (col0Lower.includes("credits")) totalCredits = parseInt(cols[1]) || 0;
                    else if (col0Lower.includes("name") && (col0Lower.includes("learner") || col0Lower.includes("leaner"))) fullName = cols[1]?.trim();
                    else if (col0Lower.includes("id number")) idNumber = cols[1]?.trim();
                    else if (col0Lower.includes("email address")) emailAddress = cols[1]?.trim();
                    else if (col0Lower.includes("phone number")) phoneNumber = cols[1]?.trim();
                    else if (col0Lower.includes("start date")) startDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("completion date")) completionDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("issue date")) issueDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("cohort")) importedCohortName = cols[1]?.trim();
                    else if (col0Lower.includes("sdp code") || col0Lower.includes("provider code")) {
                        importedSdpCode = cols[1]?.trim() || GLOBAL_SDP_CODE;
                    }

                    if ((col0Lower === "modules" || col0Lower === "") && col1.toLowerCase() === "module name") {
                        isModuleSection = true;
                        return;
                    }
                }

                if (isModuleSection) {
                    if (col0Lower.includes("knowledge")) currentSection = "K";
                    else if (col0Lower.includes("practical") || col0Lower.includes("skills")) currentSection = "P";
                    else if (col0Lower.includes("work") || col0Lower.includes("experience")) currentSection = "W";

                    if (col1 && col1.toLowerCase() !== "module name") {
                        const modCode = cols[2]?.trim() || "";
                        const modNqfLevel = parseInt(cols[3]) || nqfLevel || 5;
                        const modCredits = parseInt(cols[4]) || 0;
                        let status = cols[8]?.trim() || cols[7]?.trim() || "Not Started";
                        if (!status || status === "") status = "Not Started";

                        const mod = {
                            name: col1.replace(/\n|\r/g, " ").trim(),
                            code: modCode,
                            nqfLevel: modNqfLevel,
                            credits: modCredits,
                            notionalHours: modCredits * 10,
                            status: status,
                            dateAssessed: issueDateStr,
                            dateSignedOff: issueDateStr,
                            isTemplateLocked: false,
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

            if (!idNumber) {
                setStatusModal({ type: "error", title: "Missing ID", message: "Failed: No ID Number found in the CSV.", onClose: () => setStatusModal(null) });
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }

            if (!issueDateStr) issueDateStr = parseLocalToSA(new Date().toISOString());

            const matchedCohort = importedCohortName ? cohorts.find(c => c.name.toLowerCase().trim() === importedCohortName.toLowerCase().trim()) : null;

            // AUTOMATICALLY MATCH CAMPUS BY SDP CODE & TRACK IF WE USED A FALLBACK
            let matchedCampusId = "";
            let usedFallbackCampus = false;

            if (settings?.campuses) {
                const cMatch = settings.campuses.find(c => c.siteAccreditationNumber === importedSdpCode);
                if (cMatch) {
                    matchedCampusId = cMatch.id;
                } else {
                    const defCampus = settings.campuses.find(c => c.isDefault);
                    if (defCampus) {
                        matchedCampusId = defCampus.id;
                        usedFallbackCampus = true;
                    }
                }
            }

            setFormData((prev) => ({
                ...prev,
                fullName: fullName || prev.fullName,
                firstName: fullName ? fullName.split(' ')[0] : prev.firstName,
                lastName: fullName ? fullName.split(' ').slice(1).join(' ') : prev.lastName,
                idNumber: idNumber || prev.idNumber,
                email: emailAddress || prev.email,
                mobile: phoneNumber || prev.mobile,
                trainingStartDate: startDateStr || prev.trainingStartDate,
                trainingEndDate: completionDateStr || prev.trainingEndDate,
                cohortId: matchedCohort ? matchedCohort.id : prev.cohortId,
                campusId: matchedCampusId || prev.campusId,
                isOffline: true,
                qualification: {
                    ...prev.qualification,
                    name: qualName || prev.qualification.name,
                    saqaId: saqaId || prev.qualification.saqaId,
                    nqfLevel: nqfLevel || prev.qualification.nqfLevel,
                    credits: totalCredits || prev.qualification.credits,
                    totalNotionalHours: (totalCredits || 0) * 10,
                    dateAssessed: issueDateStr,
                },
                demographics: {
                    ...(prev.demographics || {}),
                    sdpCode: importedSdpCode,
                    expectedTrainingCompletionDate: completionDateStr || prev.demographics?.expectedTrainingCompletionDate || "",
                },
                knowledgeModules,
                practicalModules,
                workExperienceModules,
                verificationCode: generateSorId(fullName || "Unknown", issueDateStr, importedSdpCode),
                issueDate: issueDateStr,
            }));

            // CREATE THE NOTIFICATION MESSAGE WITH THE FALLBACK WARNING IF NEEDED
            let successMessage = `Successfully populated details for ${fullName || "Learner"}. Review the fields below and click "Save Learner".`;

            if (usedFallbackCampus) {
                successMessage += `\n\n⚠️ Note: The imported SDP Code (${importedSdpCode}) did not match any of your Accredited Sites in Settings. The learner was assigned to your Default Campus instead.`;
            }

            setStatusModal({
                type: "success",
                title: "Import Successful",
                message: successMessage,
                onClose: () => setStatusModal(null),
            });

            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("CSV Parse Error:", error);
            setStatusModal({ type: "error", title: "Import Failed", message: "Could not parse the CSV file. Please ensure it matches the standard layout.", onClose: () => setStatusModal(null) });
        }
    };

    const handleQuickCohortCreate = async (
        cohortData: Omit<Cohort, "id" | "createdAt" | "staffHistory" | "isArchived">,
        reasons?: { facilitator?: string; assessor?: string; moderator?: string },
    ) => {
        try {
            const cohortRef = doc(collection(db, "cohorts"));
            const newId = cohortRef.id;

            const finalCohort = {
                ...cohortData,
                id: newId,
                createdAt: new Date().toISOString(),
                isArchived: false,
                staffHistory: [],
                status: "active",
                changeReasons: reasons || {},
            };

            await setDoc(cohortRef, finalCohort);
            await fetchCohorts();
            updateField("cohortId", newId);
            // Sync Campus to match the newly created Cohort's Campus
            if (cohortData.campusId) {
                updateField("campusId", cohortData.campusId);
            }
            setShowCohortModal(false);

            setStatusModal({ type: "success", title: "Class Created", message: `New class "${cohortData.name}" created and assigned.`, onClose: () => setStatusModal(null) });
        } catch (err: any) {
            throw new Error(err.message || "Could not save the new class to the database.");
        }
    };

    const handleSyncCohortResults = async () => {
        if (!formData.cohortId || formData.cohortId === "Unassigned") {
            setStatusModal({ type: "warning", title: "No Cohort Selected", message: "Please assign the learner to a valid cohort first.", onClose: () => setStatusModal(null) });
            return;
        }

        const cohort = cohorts.find((c) => c.id === formData.cohortId);
        if (!cohort) return;

        const templateId = (cohort as any).programmeId || (cohort as any).qualificationId || selectedTemplateId;
        const template = programmes.find((p) => p.id === templateId);

        if (!template) {
            setStatusModal({ type: "warning", title: "No Curriculum Linked", message: `Cohort "${cohort.name}" does not have a linked Programme Template.`, onClose: () => setStatusModal(null) });
            return;
        }

        setIsSyncing(true);

        try {
            let submissions: any[] = [];
            if (formData.id) {
                const subRef = collection(db, "learner_submissions");
                const q = query(subRef, where("learnerId", "==", formData.learnerId || formData.id), where("cohortId", "==", cohort.id));
                const snap = await getDocs(q);
                submissions = snap.docs.map((d) => d.data());
            }

            const lockSystemModules = (modules: any[]) => {
                return (modules || []).map((m) => {
                    const sub = submissions.find((s) => s.moduleNumber === m.code || s.moduleNumber === m.name);
                    let status = "Not Started";
                    let dateAssessed = "";

                    if (sub) {
                        dateAssessed = sub.assignedAt ? parseLocalToSA(sub.assignedAt) : "";
                        if (sub.status === "graded") {
                            status = sub.marks >= sub.totalMarks / 2 ? "Competent" : "Not Yet Competent";
                        } else {
                            status = "Pending Grading";
                        }
                    }

                    return { ...m, isSystemLocked: true, status, dateAssessed, dateSignedOff: dateAssessed, cohortName: cohort.name };
                }) as any[];
            };

            setFormData((prev) => ({
                ...prev,
                qualification: {
                    name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || "",
                },
                knowledgeModules: lockSystemModules(template.knowledgeModules),
                practicalModules: lockSystemModules(template.practicalModules),
                workExperienceModules: lockSystemModules(template.workExperienceModules),
            }));

            setStatusModal({ type: "success", title: "Sync Complete", message: `Pulled ${submissions.length} authentic assessment result(s).`, onClose: () => setStatusModal(null) });
        } catch (error) {
            setStatusModal({ type: "error", title: "Sync Failed", message: "Could not retrieve database results.", onClose: () => setStatusModal(null) });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLoadFromTemplate = () => {
        if (!selectedTemplateId) return;
        const template = programmes.find((p) => p.id === selectedTemplateId);
        if (!template) return;

        setStatusModal({
            type: "warning", title: "Load Offline Curriculum", message: `Load the "${template.name}" blueprint?`, confirmText: "Yes, Load It", onCancel: () => setStatusModal(null),
            onClose: () => {
                const lockModules = (modules: any[]) => {
                    return (modules || []).map((m) => ({ ...m, isTemplateLocked: true, status: "Not Started", dateAssessed: "", dateSignedOff: "", cohortName: `Imported Blueprint: ${template.name}` })) as any[];
                };

                setFormData((prev) => ({
                    ...prev,
                    qualification: {
                        name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || "",
                    },
                    knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)],
                    practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)],
                    workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
                }));

                setSelectedTemplateId("");
                setStatusModal(null);
            },
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);

        try {
            const finalIssueDate = formData.issueDate || parseLocalToSA(new Date().toISOString());

            let fName = formData.firstName;
            let lName = formData.lastName;
            if (formData.fullName && (!fName || !lName)) {
                const parts = formData.fullName.trim().split(" ");
                fName = parts[0] || "";
                lName = parts.slice(1).join(" ") || "";
            }

            let finalVerificationCode = formData.verificationCode;
            if (!finalVerificationCode || finalVerificationCode.startsWith("SOR-")) {
                const sdpCode = formData.demographics?.sdpCode || GLOBAL_SDP_CODE;
                finalVerificationCode = generateSorId(formData.fullName || "Unknown", finalIssueDate, sdpCode);
            }

            const updatedQual = { ...formData.qualification };
            if (!updatedQual.dateAssessed) {
                updatedQual.dateAssessed = finalIssueDate;
            }

            const savedLearner: any = {
                ...formData,
                firstName: fName,
                lastName: lName,
                authStatus: formData.authStatus || "pending",
                issueDate: finalIssueDate,
                verificationCode: finalVerificationCode,
                qualification: updatedQual,
            };

            Object.keys(savedLearner).forEach((key) => {
                if (savedLearner[key] === undefined) delete savedLearner[key];
            });

            await onSave(savedLearner as Partial<DashboardLearner>);

            if (formData.cohortId && formData.cohortId !== "Unassigned") {
                const cohort = cohorts.find((c) => c.id === formData.cohortId);
                const pId = cohort?.programmeId || cohort?.qualificationId;

                if (learner?.id && learner.cohortId !== formData.cohortId && pId) {
                    await enrollLearnerInCohort(learner.learnerId || learner.id, formData.cohortId, pId);
                }
            }

            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to save learner record.");
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (formData.idNumber && formData.idNumber.length >= 6 && !formData.dateOfBirth) {
            const yearStr = formData.idNumber.substring(0, 2);
            const month = formData.idNumber.substring(2, 4);
            const day = formData.idNumber.substring(4, 6);

            const currentYear = new Date().getFullYear() % 100;
            const yearNum = parseInt(yearStr, 10);
            const fullYear = yearNum > currentYear ? `19${yearStr}` : `20${yearStr}`;

            if (parseInt(month) > 0 && parseInt(month) <= 12 && parseInt(day) > 0 && parseInt(day) <= 31) {
                setFormData((prev) => ({ ...prev, dateOfBirth: `${day}-${month}-${fullYear}` }));
            }
        }
    }, [formData.idNumber]);

    const addModule = (type: ModuleCategory) => {
        const base = { code: "", name: "", credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: [] };
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: "", status: "Not Started" } as any] }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: "", status: "Not Started" } as any] }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: "", status: "Not Started" } as any] }));
    };

    const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
        const patch = (list: any[]) => {
            const updated = [...list];
            updated[index] = field === "credits" ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 } : { ...updated[index], [field]: value };
            return updated;
        };
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
    };

    const removeModule = (type: ModuleCategory, index: number) => {
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
    };

    const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

    return (
        <>
            <div className="lfm-overlay" onClick={onClose}>
                <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="lfm-header">
                        <h2 className="lfm-header__title">
                            <Users size={16} /> {title}
                        </h2>
                        <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                        <div className="lfm-body">
                            {errorMessage && (
                                <div className="lfm-error-banner">
                                    <AlertCircle size={16} />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            {/* ── Personal & Enrolment ── */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <Users size={13} /> Personal &amp; Enrolment Details
                                </div>
                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Full Name *</label>
                                        <input className="lfm-input" type="text" required value={formData.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>ID Number *</label>
                                        <input className="lfm-input" type="text" required value={formData.idNumber} onChange={(e) => updateField("idNumber", e.target.value)} />
                                    </div>

                                    {/* 🚀 CLASS & CAMPUS BINDING ROW */}
                                    <div className="lfm-fg">
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <label style={{ marginBottom: 0 }}>Assigned Cohort *</label>
                                            <button type="button" onClick={() => setShowCohortModal(true)} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}>
                                                <Plus size={10} /> New Class
                                            </button>
                                        </div>
                                        <select className="lfm-input lfm-select" required value={formData.cohortId} onChange={(e) => updateField("cohortId", e.target.value)} style={{ marginTop: "4px" }}>
                                            <option value="Unassigned">-- Unassigned --</option>
                                            {cohorts.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} ({c.startDate})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 🚀 NEW DYNAMIC CAMPUS SELECTION */}
                                    <div className="lfm-fg">
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <label style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                                                <MapPin size={12} /> Delivery Site (Campus)
                                            </label>
                                        </div>
                                        <select className="lfm-input lfm-select" value={formData.campusId || ""} onChange={(e) => updateField("campusId", e.target.value)} style={{ marginTop: "4px" }}>
                                            <option value="">-- Inherit from Class / Default --</option>
                                            {settings?.campuses?.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="lfm-fg">
                                        <label>Email</label>
                                        <input className="lfm-input" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Mobile</label>
                                        <input className="lfm-input" type="text" value={formData.mobile || ""} onChange={(e) => updateField("mobile", e.target.value)} />
                                    </div>

                                    {/* DATE INPUTS USE dateToHtml() VISUALLY, BUT SAVE AS DD-MM-YYYY */}
                                    <div className="lfm-fg">
                                        <label>Date of Birth</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.dateOfBirth)} onChange={(e) => updateField("dateOfBirth", htmlToDate(e.target.value))} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Training Start Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.trainingStartDate)} onChange={(e) => updateField("trainingStartDate", htmlToDate(e.target.value))} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Training End Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.trainingEndDate)} onChange={(e) => updateField("trainingEndDate", htmlToDate(e.target.value))} />
                                    </div>

                                    <div className="lfm-fg">
                                        <label>SDP Provider Code *</label>
                                        <input className="lfm-input" type="text" required value={formData.demographics?.sdpCode || ""} onChange={(e) => updateDemographics("sdpCode", e.target.value)} style={{ border: "1px solid #0ea5e9", backgroundColor: "#f0f9ff" }} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Authentic Sync (Online Learners) ── */}
                            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                                <div>
                                    <h4 style={{ margin: "0 0 0.25rem 0", color: "#166534", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                                        <RefreshCw size={16} /> Authentic Cohort Synchronization
                                    </h4>
                                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#15803d" }}>
                                        Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
                                    </p>
                                </div>
                                <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === "Unassigned"} style={{ background: "#16a34a", color: "white", border: "none", padding: "0.55rem 1rem", whiteSpace: "nowrap" }}>
                                    {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : "Sync Database Results"}
                                </button>
                            </div>

                            {/* ── Offline RPL Capture & Import ── */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <BookOpen size={13} /> Offline / RPL Curriculum Source
                                </div>

                                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                    <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "1rem" }}>
                                        <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--mlab-blue)", fontSize: "0.85rem" }}>Load Blank Blueprint</h4>
                                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                            <select className="lfm-input lfm-select" style={{ flex: 1, margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                                                <option value="">-- Select Template --</option>
                                                {programmes.filter((p) => !p.isArchived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                            <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: "0.55rem 1rem" }}>
                                                Load
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ paddingLeft: "0.5rem" }}>
                                        <h4 style={{ margin: "0 0 0.5rem 0", color: "#16a34a", fontSize: "0.85rem" }}>Import External Results (CSV)</h4>
                                        <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.75rem", color: "#64748b" }}>
                                            Upload an offline Statement of Results CSV to instantly populate modules and achievements.
                                        </p>
                                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
                                        <button type="button" className="lfm-btn" onClick={() => fileInputRef.current?.click()} style={{ background: "#f0fdf4", border: "1px solid #16a34a", color: "#16a34a", width: "100%", display: "flex", justifyContent: "center" }}>
                                            <UploadCloud size={16} /> Upload SoR CSV
                                        </button>
                                    </div>
                                </div>

                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Qualification Name *</label>
                                        <input className="lfm-input" type="text" required value={formData.qualification.name} onChange={(e) => updateQualification("name", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>SAQA ID *</label>
                                        <input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={(e) => updateQualification("saqaId", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>NQF Level *</label>
                                        <input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={(e) => updateQualification("nqfLevel", parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Total Credits *</label>
                                        <input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={(e) => updateQualification("credits", parseInt(e.target.value) || 0)} />
                                    </div>
                                    {/* VISIBLE DATE ASSESSED (With SA Date Formatting) */}
                                    <div className="lfm-fg">
                                        <label>Date Assessed</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.qualification.dateAssessed)} onChange={(e) => updateQualification("dateAssessed", htmlToDate(e.target.value))} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Assessment Modules ── */}
                            <div>
                                <div className="lfm-section-hdr">
                                    <Layers size={13} /> Statement of Results / Module Scores
                                </div>
                                <div className="lfm-tabs">
                                    {(Object.keys(TAB_META) as ModuleCategory[]).map((tab) => (
                                        <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                                            {TAB_META[tab].icon} {TAB_META[tab].label}
                                            {currentModuleCount(tab) > 0 && (
                                                <span className={`lfm-tab__badge ${activeTab === tab ? "active" : ""}`}>{currentModuleCount(tab)}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="lfm-module-editor-wrap">
                                    <ModuleEditor
                                        modules={activeTab === "knowledge" ? formData.knowledgeModules : activeTab === "practical" ? formData.practicalModules : formData.workExperienceModules}
                                        type={activeTab}
                                        onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
                                        onRemove={(i) => removeModule(activeTab, i)}
                                        onAdd={() => addModule(activeTab)}
                                    />
                                </div>
                            </div>

                            {/* ── Flags & EISA Admission ── */}
                            <div className="lfm-flags-panel">
                                <label className="lfm-checkbox-row">
                                    <input type="checkbox" checked={formData.eisaAdmission} onChange={(e) => updateField("eisaAdmission", e.target.checked)} />
                                    Learner has gained admission to the EISA
                                </label>

                                {formData.eisaAdmission && (
                                    <div className="lfm-fg" style={{ marginTop: "10px", marginLeft: "24px", maxWidth: "200px" }}>
                                        <label>Scheduled EISA Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.nextEisaDate)} onChange={(e) => updateField("nextEisaDate", htmlToDate(e.target.value))} />
                                    </div>
                                )}

                                <label className="lfm-checkbox-row">
                                    <input type="checkbox" checked={formData.isOffline} onChange={(e) => updateField("isOffline", e.target.checked)} /> Mark as Offline / RPL Learner
                                </label>
                                <label className="lfm-checkbox-row">
                                    <input type="checkbox" checked={formData.isArchived} onChange={(e) => updateField("isArchived", e.target.checked)} /> Archive this learner record
                                </label>
                            </div>

                            {/* ── Demographics ── */}
                            <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics((v) => !v)}>
                                {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? "Hide" : "Show"} Full QCTO Demographics
                            </button>

                            {showDemographics && (
                                <div className="lfm-demographics-panel">
                                    <div className="lfm-section-hdr" style={{ marginBottom: "0.85rem" }}>QCTO Demographics</div>
                                    <div className="lfm-grid">
                                        {[
                                            ["equityCode", "Equity Code"], ["nationalityCode", "Nationality Code"], ["homeLanguageCode", "Home Language Code"], ["genderCode", "Gender Code"], ["citizenResidentStatusCode", "Citizen Resident Status"], ["socioeconomicStatusCode", "Socioeconomic Status"], ["disabilityStatusCode", "Disability Status"], ["disabilityRating", "Disability Rating"], ["immigrantStatus", "Immigrant Status"], ["learnerMiddleName", "Middle Name"], ["learnerTitle", "Title"],
                                        ].map(([field, label]) => (
                                            <div key={field} className="lfm-fg">
                                                <label>{label}</label>
                                                <input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ""} onChange={(e) => updateDemographics(field as keyof LearnerDemographics, e.target.value)} />
                                            </div>
                                        ))}
                                        {[
                                            ["learnerHomeAddress1", "Home Address 1"], ["learnerPostalAddress1", "Postal Address 1"],
                                        ].map(([field, label]) => (
                                            <div key={field} className="lfm-fg lfm-fg--full">
                                                <label>{label}</label>
                                                <input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ""} onChange={(e) => updateDemographics(field as keyof LearnerDemographics, e.target.value)} />
                                            </div>
                                        ))}
                                        {[
                                            ["learnerHomeAddress2", "Home Address 2"], ["learnerHomeAddress3", "Home Address 3"], ["learnerPostalAddress2", "Postal Address 2"], ["learnerPostalAddress3", "Postal Address 3"], ["learnerHomeAddressPostalCode", "Home Postal Code"], ["learnerPostalAddressPostCode", "Postal Code"], ["provinceCode", "Province Code"], ["statsaaAreaCode", "STATSAA Area Code"], ["assessmentCentreCode", "Assessment Centre Code"],
                                        ].map(([field, label]) => (
                                            <div key={field} className="lfm-fg">
                                                <label>{label}</label>
                                                <input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ""} onChange={(e) => updateDemographics(field as keyof LearnerDemographics, e.target.value)} />
                                            </div>
                                        ))}
                                        <div className="lfm-fg">
                                            <label>Expected Completion</label>
                                            <input className="lfm-input" type="date" value={dateToHtml(formData.demographics?.expectedTrainingCompletionDate)} onChange={(e) => updateDemographics("expectedTrainingCompletionDate", htmlToDate(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                                {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {statusModal && (
                <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} onClose={statusModal.onClose} onCancel={statusModal.onCancel} confirmText={statusModal.confirmText} />
            )}

            {showCohortModal && (
                <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleQuickCohortCreate} />
            )}
        </>
    );
};