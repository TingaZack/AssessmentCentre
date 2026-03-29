// src/components/views/CohortsView.tsx

import React, { useState } from 'react';
import {
    Plus, Archive, Calendar, Layers, ArrowRight,
    Edit, DownloadCloud, Loader2, FileSpreadsheet
} from 'lucide-react';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import type { StaffMember } from '../../../store/useStore';
import type { Cohort } from '../../../types';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import './CohortsView.css';
import { useToast } from '../../common/Toast/Toast';

interface CohortsViewProps {
    cohorts: Cohort[];
    staff: StaffMember[];
    onAdd: () => void;
    onEdit: (cohort: Cohort) => void;
    onArchive: (cohort: Cohort) => void;
}

// ─── QCTO HELPERS ────────────────────────────────────────────────────────

/**
 * Formats date to YYYYMMDD as required by LEISA naming convention
 */
const formatQCTODate = (dateString?: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
};

const getDOBFromID = (idNumber: string) => {
    const cleanId = String(idNumber || '').replace(/\s/g, '');
    if (cleanId.length !== 13) return '';
    try {
        let year = parseInt(cleanId.substring(0, 2), 10);
        const month = cleanId.substring(2, 4);
        const day = cleanId.substring(4, 6);
        const currentYearShort = new Date().getFullYear() % 100;
        year += year <= currentYearShort ? 2000 : 1900;
        return `${year}${month}${day}`;
    } catch (e) {
        return '';
    }
};

/**
 * The "Nuclear Option" for Excel: Forces every cell to be an explicit String
 * to prevent Excel from dropping leading zeros in IDs and Postal Codes.
 */
const createTextCell = (val: any) => ({
    t: 's',
    v: String(val === null || val === undefined ? '' : val),
    z: '@'
});

export const CohortsView: React.FC<CohortsViewProps> = ({ cohorts, staff, onAdd, onEdit, onArchive }) => {
    const navigate = useNavigate();
    const toast = useToast();

    const { settings, user, programmes } = useStore();

    const [exportingCohort, setExportingCohort] = useState<string | null>(null);
    const [isMasterExporting, setIsMasterExporting] = useState(false);

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    // ─── MASTER INSTITUTIONAL EXPORT ───────────────────────────────────────
    const handleMasterInstitutionalExport = async () => {
        const allLearnerIds = Array.from(new Set(cohorts.flatMap(c => c.learnerIds)));
        if (allLearnerIds.length === 0) {
            toast.error("No learners found to export.");
            return;
        }

        setIsMasterExporting(true);
        try {
            const learners: any[] = [];
            const chunks = [];
            for (let i = 0; i < allLearnerIds.length; i += 10) {
                chunks.push(allLearnerIds.slice(i, i + 10));
            }

            for (const chunk of chunks) {
                const q = query(collection(db, 'learners'), where(documentId(), 'in', chunk));
                const snap = await getDocs(q);
                snap.forEach(doc => learners.push({ id: doc.id, ...doc.data() }));
            }

            const rows = [
                ["Full Name", "ID Number", "Email", "Phone", "Equity", "Gender", "Province", "Compliance Status"].map(createTextCell)
            ];

            learners.forEach(l => {
                rows.push([
                    l.fullName,
                    l.idNumber,
                    l.email,
                    l.phone,
                    l.demographics?.equityCode,
                    l.demographics?.genderCode,
                    l.demographics?.provinceCode,
                    l.profileCompleted ? "Verified" : "Pending"
                ].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Master Learner Registry");

            const today = formatQCTODate(new Date().toISOString());
            const instName = (settings?.institutionName || 'Institution').replace(/[^a-zA-Z0-9]/g, '_');
            XLSX.writeFile(wb, `Master_Registry_${today}_${instName}.xlsx`);
            toast.success("Master spreadsheet generated.");
        } catch (err) {
            console.error(err);
            toast.error("Institutional export failed.");
        } finally {
            setIsMasterExporting(false);
        }
    };

    // ─── QCTO LEISA EXPORT (STRICT COMPLIANCE) ────────────────────────────
    const handleQCTOExport = async (cohort: Cohort) => {
        if (!cohort.learnerIds || cohort.learnerIds.length === 0) {
            toast.error('Cannot export an empty cohort.');
            return;
        }

        setExportingCohort(cohort.id);
        toast.info('Generating QCTO LEISA file...');

        try {
            const learners: any[] = [];
            const chunks = [];
            for (let i = 0; i < cohort.learnerIds.length; i += 10) {
                chunks.push(cohort.learnerIds.slice(i, i + 10));
            }

            for (const chunk of chunks) {
                const q = query(collection(db, 'learners'), where(documentId(), 'in', chunk));
                const snap = await getDocs(q);
                snap.forEach(doc => learners.push({ id: doc.id, ...doc.data() }));
            }

            // 1. Resolve Institutional/Campus Details
            const cohortCampusId = (cohort as any).campusId;
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohortCampusId)
                || settings?.campuses?.find((c: any) => c.isDefault)
                || settings?.campuses?.[0];

            // REQUIREMENT: Strictly use Main Institution Name
            const mainInstitutionName = settings?.institutionName || 'mLab Southern Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';

            // 2. Resolve Qualification Logic
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId);

            // REQUIREMENT: Qualification ID Column must be SAQA ID
            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const qualNameForHeader = qualObj?.name || 'Qualification Name Missing';

            const todayQCTO = formatQCTODate(new Date().toISOString());
            const expectedCompletion = formatQCTODate(cohort.endDate);

            // 3. Map Rows (Forced String/AOA to preserve leading zeros)
            const headers = [
                "SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type",
                "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code",
                "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status",
                "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date",
                "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3",
                "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3",
                "Learner Home Address Postal Code", "Learner Postal Address Post Code",
                "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address",
                "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date",
                "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date",
                "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"
            ];

            const dataRows = [headers.map(createTextCell)];

            learners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const lastName = names.length > 1 ? names.pop() : '';
                const firstNames = names.join(' ');
                const title = d.genderCode === 'F' ? 'Ms' : 'Mr';

                dataRows.push([
                    rawSdpCode,
                    saqaId,
                    learner.idNumber,
                    "", "533",
                    d.equityCode, d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O', d.homeLanguageCode, d.genderCode, d.citizenResidentStatusCode || 'SA',
                    d.socioeconomicStatusCode, d.disabilityStatusCode || 'N', d.disabilityRating, "03",
                    lastName, firstNames, "", title, getDOBFromID(learner.idNumber),
                    d.learnerHomeAddress1, d.learnerHomeAddress2, "",
                    d.learnerPostalAddress1 || d.learnerHomeAddress1, d.learnerPostalAddress2 || d.learnerHomeAddress2, "",
                    d.learnerHomeAddressPostalCode, (d as any).statsaaAreaCode || d.learnerHomeAddressPostalCode,
                    learner.phone, learner.phone, "", learner.email,
                    d.provinceCode, (d as any).statsaaAreaCode || '', d.popiActAgree || 'Y', d.popiActDate || todayQCTO,
                    expectedCompletion, "02", "", "", "1", "06", "", todayQCTO
                ].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();

            // SHEET 1: INSTRUCTIONS (AOA Format)
            const instructions = [
                ["DETAILS: (COMPULSORY INFORMATION)"],
                ["Name and Surname of Compiler:", user?.fullName || ''],
                ["Email address:", user?.email || ''],
                ["Contact Number of Compiler:", (user as any)?.phone || ''],
                ["Contact Number of Institution:", settings?.phone || ''],
                ["Name of Qualification:", qualNameForHeader],
                ["Start Date:", cohort.startDate],
                ["Expected Completion Date:", cohort.endDate],
                ["Name of SDP:", mainInstitutionName],
                ["Address of SDP:", activeCampus?.address || (settings as any)?.institutionAddress || ''],
                ["Province:", activeCampus?.province || (settings as any)?.institutionProvince || ''],
                [],
                ["-------------------------------------------------"],
                ["QCTO LEISA Data Load File (Text Encapsulated)"],
                ["SDP Code:", rawSdpCode],
                ["SAQA Qualification ID:", saqaId],
                ["Total Learners:", learners.length],
                ["Export Date:", new Date().toLocaleDateString()]
            ].map(row => row.map(createTextCell));

            const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
            wsInstructions['!cols'] = [{ wch: 35 }, { wch: 65 }];
            XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

            // SHEET 2: DATA
            const wsData = XLSX.utils.aoa_to_sheet(dataRows);
            XLSX.utils.book_append_sheet(wb, wsData, "Learner Enrolment and EISA");

            // NAMING CONVENTION: LEISAyyyymmdd-SDP/AC name
            const safeInstitutionName = mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `LEISA${todayQCTO}-${safeInstitutionName}.xlsx`;

            XLSX.writeFile(wb, fileName);
            toast.success(`QCTO Compliant file generated: ${fileName}`);

        } catch (error) {
            console.error(error);
            toast.error("Export failed. Ensure institutional settings are configured.");
        } finally {
            setExportingCohort(null);
        }
    };

    return (
        <div className="mlab-cohorts">
            <div className="mlab-cohorts__header">
                <div className="mlab-cohorts__header-text">
                    <h2 className="mlab-cohorts__title">Active Classes (Cohorts)</h2>
                    <p className="mlab-cohorts__subtitle">Manage training groups and generate compliant QCTO reports.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="mlab-btn mlab-btn--outline" onClick={handleMasterInstitutionalExport} disabled={isMasterExporting}>
                        {isMasterExporting ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />} Master Export
                    </button>
                    <button className="mlab-btn mlab-btn--green" onClick={onAdd}><Plus size={16} /> Create New Cohort</button>
                </div>
            </div>

            <div className="mlab-cohort-grid">
                {cohorts.map(cohort => (
                    <div key={cohort.id} className="mlab-cohort-card animate-fade-in">
                        <div className="mlab-cohort-card__header">
                            <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
                            <div className="mlab-cohort-card__actions">
                                <button className="mlab-icon-btn mlab-icon-btn--blue" onClick={() => onEdit(cohort)} title="Edit Details"><Edit size={15} /></button>
                                <button className="mlab-icon-btn mlab-icon-btn--amber" onClick={() => onArchive(cohort)} title="Archive Class"><Archive size={15} /></button>
                            </div>
                        </div>

                        <div className="mlab-cohort-card__dates">
                            <Calendar size={14} />
                            <span>{cohort.startDate} — {cohort.endDate}</span>
                        </div>

                        <div className="mlab-role-row-stack">
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--blue" />
                                <span className="mlab-role-label">Facilitator:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.facilitatorId)}</span>
                            </div>
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--red" />
                                <span className="mlab-role-label">Assessor:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.assessorId)}</span>
                            </div>
                            <div className="mlab-role-row">
                                <div className="mlab-role-dot mlab-role-dot--green" />
                                <span className="mlab-role-label">Moderator:</span>
                                <span className="mlab-role-name">{getStaffName(cohort.moderatorId)}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', marginTop: 16 }}>
                            <button
                                className="mlab-btn mlab-btn--outline-blue"
                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center' }}
                                onClick={() => handleQCTOExport(cohort)}
                                disabled={exportingCohort === cohort.id}
                            >
                                {exportingCohort === cohort.id ? <><Loader2 className="spin" size={13} /> Compiling...</> : <><DownloadCloud size={13} /> Export LEISA</>}
                            </button>
                            <button className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                Manage <ArrowRight size={13} />
                            </button>
                        </div>
                    </div>
                ))}

                {cohorts.length === 0 && (
                    <div className="mlab-cohort-empty">
                        <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                        <p className="mlab-cohort-empty__title">No Cohorts Yet</p>
                        <p className="mlab-cohort-empty__desc">Create a class to get started with learner tracking.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

