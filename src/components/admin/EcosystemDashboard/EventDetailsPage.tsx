import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Calendar, Users, Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,
    ChevronLeft, Globe, DownloadCloud, Loader2, UploadCloud, Send, FilterX, ChevronRight,
    Info, Sparkles, FileText,
} from 'lucide-react';
import moment from 'moment';

// ─── FIREBASE IMPORTS ───
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; // Ensure your DB is exported here

// ─── APP IMPORTS ───
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import type { EcosystemEvent } from '../../../types/ecosystem.types';

import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import '../../../pages/CohortDetails/CohortDetailsPage.css';
import { AIReportWizardModal } from './AiWizard/AIReportWizardModal';
import { ReportHistoryModal } from './AiWizard/ReportHistoryModal';

// ─── GUEST DETAILS MODAL (NOW EDITABLE) ───────────────────────────────────
const GuestDetailsModal: React.FC<{
    guest: any,
    crmProfile: any,
    event: EcosystemEvent,
    onClose: () => void,
    onSave: (email: string, data: any, checkinId: string) => Promise<void>
}> = ({ guest, crmProfile, event, onClose, onSave }) => {
    if (!guest) return null;

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Editable State
    const [editData, setEditData] = useState({
        guestName: guest.guestName || '',
        phone: crmProfile?.phone || guest.guestPhone || '',
        idNumber: crmProfile?.idNumber || guest.guestIdNumber || '',
        gender: crmProfile?.gender || '',
        age: crmProfile?.age || '',
    });

    const safeTime = guest.timestamp?.toDate ? guest.timestamp.toDate() : guest.timestamp;
    const isYouth = crmProfile?.isYouth;

    const rawPopia = crmProfile?.popiaConsent ?? guest.popiaConsent;
    const popiaDate = crmProfile?.popiaConsentDate;
    const popiaDisplay = rawPopia ? `Yes${popiaDate ? ` (Signed ${moment(popiaDate).format('D MMM YYYY')})` : ''}` : '—';
    const rawMarketing = crmProfile?.marketingOptIn ?? guest.marketingOptIn;
    const marketingDisplay = rawMarketing === true ? 'Yes (Opted In)' : (rawMarketing === false ? 'No' : '—');

    const handleSaveClick = async () => {
        setIsSaving(true);
        // Auto-calculate youth status based on entered age
        const ageNum = Number(editData.age);
        const calculatedYouth = ageNum >= 18 && ageNum <= 35;

        await onSave(guest.guestEmail || '', { ...editData, isYouth: calculatedYouth }, guest.id);

        setIsSaving(false);
        setIsEditing(false);
    };

    return createPortal(
        <div className="lfm-overlay" onClick={onClose}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="lfm-header">
                    <h2 className="lfm-header__title"><Users size={16} /> Guest Profile {isEditing && "- Edit Mode"}</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>
                <div className="lfm-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700 }}>
                            {editData.guestName?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                            {isEditing ? (
                                <input
                                    className="lfm-input"
                                    value={editData.guestName}
                                    onChange={e => setEditData({ ...editData, guestName: e.target.value })}
                                    placeholder="Full Name"
                                    style={{ fontSize: '1.1rem', fontWeight: 700, padding: '4px 8px', width: '100%', marginBottom: '4px' }}
                                />
                            ) : (
                                <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.25rem', fontWeight: 700 }}>{editData.guestName}</h3>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.65rem' }}>Verified Attendance</span>
                                {(isYouth || (isEditing && Number(editData.age) >= 18 && Number(editData.age) <= 35)) &&
                                    <span style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>Youth (18-35)</span>
                                }
                            </div>
                        </div>
                    </div>

                    <div className="lfm-section-hdr"><ShieldCheck size={13} /> Contact & Demographic Details</div>
                    <div className="lfm-grid">
                        <div className="lfm-fg">
                            <label>Email Address</label>
                            <div className="lfm-input" style={{ background: '#f1f5f9', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', cursor: 'not-allowed' }}>
                                {guest.guestEmail || '—'}
                            </div>
                        </div>
                        <div className="lfm-fg">
                            <label>Mobile Number</label>
                            {isEditing ? (
                                <input className="lfm-input" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="e.g. 082 123 4567" />
                            ) : (
                                <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-midnight)', border: '1px solid var(--mlab-border)' }}>{editData.phone || '—'}</div>
                            )}
                        </div>
                        <div className="lfm-fg lfm-fg--full">
                            <label>ID / Passport Number</label>
                            {isEditing ? (
                                <input className="lfm-input" value={editData.idNumber} onChange={e => setEditData({ ...editData, idNumber: e.target.value })} placeholder="ID Number..." />
                            ) : (
                                <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-midnight)', fontFamily: 'monospace', letterSpacing: '0.05em', border: '1px solid var(--mlab-border)' }}>{editData.idNumber || 'Not provided'}</div>
                            )}
                        </div>
                        <div className="lfm-fg">
                            <label>Gender</label>
                            {isEditing ? (
                                <select className="lfm-input lfm-select" value={editData.gender} onChange={e => setEditData({ ...editData, gender: e.target.value })}>
                                    <option value="">Select Gender...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            ) : (
                                <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-midnight)', border: '1px solid var(--mlab-border)' }}>{editData.gender || '—'}</div>
                            )}
                        </div>
                        <div className="lfm-fg">
                            <label>Age</label>
                            {isEditing ? (
                                <input className="lfm-input" type="number" value={editData.age} onChange={e => setEditData({ ...editData, age: e.target.value })} placeholder="Age..." />
                            ) : (
                                <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-midnight)', border: '1px solid var(--mlab-border)' }}>{editData.age ? `${editData.age} years old` : '—'}</div>
                            )}
                        </div>
                        <div className="lfm-fg">
                            <label>POPIA Consent</label>
                            <div className="lfm-input" style={{ background: '#f8fafc', color: rawPopia ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>{popiaDisplay}</div>
                        </div>
                        <div className="lfm-fg">
                            <label>Marketing Opt-In</label>
                            <div className="lfm-input" style={{ background: '#f8fafc', color: rawMarketing ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600, border: '1px solid var(--mlab-border)' }}>{marketingDisplay}</div>
                        </div>
                        <div className="lfm-fg lfm-fg--full" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '4px' }}>
                            <label>Event Check-in Time</label>
                            <div className="lfm-input" style={{ background: '#f8fafc', color: 'var(--mlab-midnight)', border: '1px solid var(--mlab-border)' }}>{moment(safeTime).format('D MMM YYYY, HH:mm')}</div>
                        </div>
                    </div>

                    {event.guestFormBlueprint && event.guestFormBlueprint.length > 0 && !isEditing && (
                        <>
                            <div className="lfm-section-hdr" style={{ marginTop: '1rem' }}><Filter size={13} /> Custom Event Responses</div>
                            <div className="lfm-grid">
                                {event.guestFormBlueprint.map(field => {
                                    const rawVal = guest.responses?.[field.id];
                                    const displayVal = typeof rawVal === 'boolean' ? (rawVal ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>) : (rawVal || <span style={{ color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Skipped</span>);
                                    return (
                                        <div key={field.id} className="lfm-fg lfm-fg--full">
                                            <label>{field.label}</label>
                                            <div className="lfm-input" style={{ background: '#f0f9ff', color: 'var(--mlab-midnight)', border: '1px dashed #0ea5e9' }}>{displayVal}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
                <div className="lfm-footer">
                    {isEditing ? (
                        <>
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleSaveClick} disabled={isSaving}>
                                {isSaving ? <><Loader2 size={14} className="lfm-spin" /> Saving...</> : "Save Changes"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>Close Profile</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => setIsEditing(true)}>Edit Profile</button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};




// ─── MAIN COMPONENT: EVENT DETAILS & SYNC ENGINE ───────────────────────────
export const EventDetailsPage: React.FC = () => {
    const { eventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

    // 🚀 Connect to Global Store
    const {
        user, events, checkins: allCheckins, guests, ecosystemLoading,
        fetchEcosystemData, cohorts, learners, enrollments,
        fetchCohorts, fetchLearners, fetchEnrollments
    } = useStore();

    const [selectedGuest, setSelectedGuest] = useState<any | null>(null);

    // ─── REPORT WIZARD STATE ───
    const [showReportWizard, setShowReportWizard] = useState(false);
    const [showReportHistory, setShowReportHistory] = useState(false);

    // ─── URL-BOUND FILTERS & PAGINATION ───
    const urlSearchTerm = searchParams.get('search') || '';
    const urlSelectedDate = searchParams.get('date') || 'all';

    const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // ─── SYNC ENGINE STATES ───
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncCohortId, setSyncCohortId] = useState('');
    const [syncSessionTitle, setSyncSessionTitle] = useState('');
    const [syncSessionDescription, setSyncSessionDescription] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);

    // 🚀 Fetch EVERYTHING on load if missing
    useEffect(() => {
        if (fetchEcosystemData) fetchEcosystemData();
        if (fetchCohorts && cohorts.length === 0) fetchCohorts();
        if (fetchLearners && learners.length === 0) fetchLearners();
        if (fetchEnrollments && enrollments.length === 0) fetchEnrollments();
    }, [fetchEcosystemData, fetchCohorts, fetchLearners, fetchEnrollments]);

    // Debounce search to prevent lag
    useEffect(() => {
        const handler = setTimeout(() => {
            updateUrlParams({ search: localSearchTerm || null });
        }, 400);
        return () => clearTimeout(handler);
    }, [localSearchTerm]);

    // Keep local search synced if URL changes externally
    useEffect(() => {
        setLocalSearchTerm(urlSearchTerm);
    }, [urlSearchTerm]);

    // Reset pagination to page 1 whenever any filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [urlSearchTerm, urlSelectedDate]);

    const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null || value === '' || value === 'all') {
                    newParams.delete(key);
                } else {
                    newParams.set(key, String(value));
                }
            });
            return newParams;
        }, { replace: true });
    }, [setSearchParams]);

    const handleClearFilters = () => {
        setLocalSearchTerm('');
        setSearchParams(new URLSearchParams(), { replace: true });
    };

    const hasActiveFilters = Boolean(urlSearchTerm || urlSelectedDate !== 'all');

    // ─── DATA PROCESSING FROM GLOBAL STORE ───────────────────────────────────

    const event = useMemo(() => events.find(e => e.id === eventId) as EcosystemEvent | undefined, [events, eventId]);
    const checkins = useMemo(() => allCheckins.filter(c => c.eventId === eventId), [allCheckins, eventId]);

    const crmProfiles = useMemo(() => {
        const profiles: Record<string, any> = {};
        guests.forEach(g => {
            profiles[g.email.toLowerCase()] = g;
        });
        return profiles;
    }, [guests]);

    const handleSaveGuestProfile = async (email: string, data: any, checkinId: string) => {
        try {
            const batch = writeBatch(db);
            const normalizedEmail = email.toLowerCase().trim();

            // 1. Update CRM Profile (Doc ID is ALWAYS the email)
            const guestRef = doc(db, 'ecosystem_guests', normalizedEmail);
            batch.set(guestRef, {
                guestName: data.guestName,
                phone: data.phone,
                idNumber: data.idNumber,
                gender: data.gender,
                age: Number(data.age) || null,
                isYouth: data.isYouth,
                updatedAt: new Date().toISOString()
            }, { merge: true }); // Merge ensures we update if it exists, or create if it doesn't!

            // 2. Update the Check-In Record
            if (checkinId) {
                const checkinRef = doc(db, 'event_checkins', checkinId);
                batch.update(checkinRef, {
                    guestName: data.guestName,
                    guestPhone: data.phone,
                    guestIdNumber: data.idNumber
                });
            }

            await batch.commit();

            toast.success("Profile updated successfully!");
        } catch (error) {
            console.error("Save error:", error);
            toast.error("Failed to update profile.");
        }
    };

    const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : ts;

    const availableDates = useMemo(() => {
        const dates = checkins.map(c => moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD'));
        return Array.from(new Set(dates)).sort();
    }, [checkins]);

    const filteredCheckins = useMemo(() => {
        return checkins.filter(c => {
            const matchesSearch =
                c.guestName?.toLowerCase().includes(urlSearchTerm.toLowerCase()) ||
                c.guestEmail?.toLowerCase().includes(urlSearchTerm.toLowerCase());

            const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');
            const matchesDate = urlSelectedDate === 'all' || checkinDate === urlSelectedDate;

            return matchesSearch && matchesDate;
        });
    }, [checkins, urlSearchTerm, urlSelectedDate]);

    // Pagination Slicer
    const totalPages = Math.ceil(filteredCheckins.length / ITEMS_PER_PAGE);
    const paginatedCheckins = filteredCheckins.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const { displayCount, displayLabel, displayPercent } = useMemo(() => {
        if (!event?.maxCapacity || event.maxCapacity <= 0) {
            return { displayCount: filteredCheckins.length, displayLabel: "Total Attendees", displayPercent: 0 };
        }

        if (urlSelectedDate !== 'all') {
            const percent = Math.round((filteredCheckins.length / event.maxCapacity) * 100);
            return {
                displayCount: filteredCheckins.length,
                displayLabel: `Attendees on ${moment(urlSelectedDate).format('D MMM')}`,
                displayPercent: percent
            };
        } else {
            const activeDaysCount = availableDates.length || 1;
            const avgDailyAttendees = Math.round(checkins.length / activeDaysCount);
            const avgPercent = Math.round((avgDailyAttendees / event.maxCapacity) * 100);

            return {
                displayCount: avgDailyAttendees,
                displayLabel: "Avg Daily Attendees",
                displayPercent: avgPercent
            };
        }
    }, [checkins, filteredCheckins, event?.maxCapacity, urlSelectedDate, availableDates]);

    const genderStats = useMemo(() => {
        let male = 0;
        let female = 0;
        let unknown = 0;
        filteredCheckins.forEach(c => {
            const email = c.guestEmail?.toLowerCase() || '';
            const profile = crmProfiles[email] || {};
            const gender = profile.gender;
            if (gender === 'Male') male++;
            else if (gender === 'Female') female++;
            else unknown++;
        });
        return { male, female, unknown };
    }, [filteredCheckins, crmProfiles]);

    // ─── 🚀 OPEN SYNC MODAL & PRE-FILL INPUTS ───
    const handleOpenSyncModal = () => {
        setSyncSessionTitle(event?.eventName || '');
        setSyncSessionDescription('Automatically synced from Ecosystem Kiosk Check-ins.');
        setShowSyncModal(true);
    };

    // ─── 🚀 SYNC ATTENDANCE TO COHORT ENGINE ───
    const executeCohortSync = async () => {
        if (!syncCohortId) return toast.error("Please select a target cohort from the dropdown.");
        setIsSyncing(true);

        try {
            const batch = writeBatch(db);

            // 1. Identify which learners belong to the selected cohort
            const cohortEnrollments = enrollments.filter(e => e.cohortId === syncCohortId);
            const cohortLearnerIds = cohortEnrollments.map(e => e.learnerId);
            const cohortLearners = learners.filter(l => cohortLearnerIds.includes(l.id) || l.cohortId === syncCohortId);

            if (cohortLearners.length === 0) {
                setIsSyncing(false);
                return toast.error("This cohort currently has no active learners to sync.");
            }

            // 2. Group all checkins strictly by the date they actually occurred
            const checkinsByDate: Record<string, any[]> = {};

            // Only sync the records matching the current UI filters (selectedDate / search)
            filteredCheckins.forEach(c => {
                const email = String(c.guestEmail || '').toLowerCase().trim();
                if (!email) return;

                const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');

                if (!checkinsByDate[checkinDate]) {
                    checkinsByDate[checkinDate] = [];
                }
                checkinsByDate[checkinDate].push(c);
            });

            const uniqueDates = Object.keys(checkinsByDate).sort();
            if (uniqueDates.length === 0) {
                setIsSyncing(false);
                return toast.error("No valid check-in dates found to sync.");
            }

            let totalPresentCount = 0;

            // 3. Loop through every distinct day an event check-in occurred
            uniqueDates.forEach(syncDate => {
                const dayCheckins = checkinsByDate[syncDate];
                const attendedEmails = new Set(dayCheckins.map(c => String(c.guestEmail || '').toLowerCase().trim()));

                let dailyPresentCount = 0;

                // 🚀 GENERATE SYNTHETIC RAW ZOOM DATA FOR BOOTCAMP ANALYTICS
                const syntheticRawZoomData: any[] = [];

                // Evaluate each learner for this specific day
                cohortLearners.forEach(learner => {
                    const email = String(learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase().trim();
                    const isPresent = attendedEmails.has(email);

                    if (isPresent) {
                        dailyPresentCount++;
                        totalPresentCount++;

                        // Push into the synthetic array so the Bootcamp Dashboard calculates total minutes perfectly
                        syntheticRawZoomData.push({
                            name: learner.fullName || crmProfiles[email]?.guestName || "Unknown Guest",
                            email: email,
                            duration: 120, // Assign standard 2-hour duration for events
                            sessions: [{
                                duration: 120,
                                tabName: syncDate.replace(/-/g, '_')
                            }]
                        });
                    }

                    const recId = `${syncCohortId}_${syncDate}_${learner.id}`;
                    const recRef = doc(db, 'attendance_records', recId);

                    batch.set(recRef, {
                        cohortId: syncCohortId,
                        learnerId: learner.id,
                        sessionDate: syncDate,
                        status: isPresent ? 'Present' : 'Absent',
                        actualDuration: isPresent ? 120 : 0,
                        updatedAt: new Date().toISOString(),
                        source: 'ecosystem_sync',
                        eventId: event?.id
                    }, { merge: true });
                });

                // Create the Master Attendance Log for this specific day
                const logId = `${syncCohortId}_${syncDate}_ecosystem_${event?.id}`;
                const logRef = doc(db, 'attendance_logs', logId);

                // Smart Titling: Just use the input title and append (Day X) if multi-day
                const dayLabel = uniqueDates.length > 1 ? ` (Day ${uniqueDates.indexOf(syncDate) + 1})` : '';
                const baseTitle = syncSessionTitle.trim() || event?.eventName || 'Ecosystem Event';
                const finalTitle = `${baseTitle}${dayLabel}`.trim();

                const finalDesc = syncSessionDescription.trim() || (uniqueDates.length > 1
                    ? `Day ${uniqueDates.indexOf(syncDate) + 1} automatically synced from Ecosystem Kiosk Check-ins.`
                    : 'Automatically synced from Ecosystem Kiosk Check-ins.');

                batch.set(logRef, {
                    cohortId: syncCohortId,
                    sessionDate: `${syncDate}T00:00:00.000Z`,
                    sessionTitle: finalTitle,
                    sessionDescription: finalDesc,
                    expectedDuration: 120, // Standard 2-hour value
                    totalEnrolled: cohortLearners.length,
                    totalPresent: dailyPresentCount,
                    totalAbsent: cohortLearners.length - dailyPresentCount,
                    totalPartial: 0,
                    createdAt: new Date().toISOString(),
                    isBootcamp: true, // Native Bootcamp tracking format
                    importVersion: 1,
                    isEcosystem: true, // 🚀 ECOSYSTEM BADGE FLAG
                    sourceEventId: event?.id,
                    rawZoomData: syntheticRawZoomData, // 🚀 INJECTS THE ATTENDANCE INTO THE DASHBOARD ENGINE
                    totalDaySessions: 1
                }, { merge: true });
            });

            // 4. Commit to Firestore
            await batch.commit();

            toast.success(`Successfully synced! Recorded ${totalPresentCount} presences across ${uniqueDates.length} day(s).`);
            setShowSyncModal(false);
            setSyncCohortId('');
            setSyncSessionTitle('');
            setSyncSessionDescription('');
        } catch (error) {
            console.error("Sync Error:", error);
            toast.error("Failed to map ecosystem records to the cohort.");
        } finally {
            setIsSyncing(false);
        }
    };

    // ─── CSV EXPORT ──────────────────────────────────────────────────────────
    const exportToCSV = () => {
        if (filteredCheckins.length === 0) {
            toast.error("No records to export.");
            return;
        }

        const escapeCSV = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

        const headers = [
            "Guest Name",
            "Email",
            "Mobile Number",
            "ID/Passport Number",
            "Gender",
            "Age",
            "Is Youth (18-35)",
            "POPIA Consent",
            "Marketing Opt-In",
            "Check-in Time",
            "Date"
        ];

        const customFieldKeys = event?.guestFormBlueprint?.map(f => f.label) || [];
        const fullHeaders = [...headers, ...customFieldKeys];

        const rows = filteredCheckins.map(c => {
            const safeTime = getSafeTime(c.timestamp);
            const profile = crmProfiles[c.guestEmail?.toLowerCase() || ''] || {};

            const baseData = [
                escapeCSV(c.guestName),
                escapeCSV(c.guestEmail),
                escapeCSV(profile.phone || c.guestPhone || 'N/A'),
                escapeCSV(profile.idNumber || c.guestIdNumber || 'N/A'),
                escapeCSV(profile.gender || 'N/A'),
                escapeCSV(profile.age ? String(profile.age) : 'N/A'),
                escapeCSV(profile.isYouth ? 'Yes' : 'No'),
                escapeCSV(profile.popiaConsent ? 'Yes' : 'No'),
                escapeCSV(profile.marketingOptIn ? 'Yes' : 'No'),
                escapeCSV(moment(safeTime).format('HH:mm:ss')),
                escapeCSV(moment(safeTime).format('YYYY-MM-DD'))
            ];

            const customData = event?.guestFormBlueprint?.map(f => {
                const answer = c.responses?.[f.id];
                const formattedAnswer = typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : (answer || 'N/A');
                return escapeCSV(formattedAnswer);
            }) || [];

            return [...baseData, ...customData].join(",");
        });

        const csvContent = [fullHeaders.map(escapeCSV).join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Roster_${event?.eventName?.replace(/\s+/g, '_')}_${urlSelectedDate === 'all' ? 'All_Dates' : urlSelectedDate}.csv`);
        link.click();
        toast.success("Roster exported to CSV successfully.");
    };

    if (ecosystemLoading || !event) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="ecosystem" onLogout={() => navigate('/login')} />
                <main className="cdp-main cdp-main--centered">
                    {ecosystemLoading ? (
                        <div className="cdp-loading-state">
                            <Loader2 size={40} className="cdp-spinner" color="var(--mlab-blue)" />
                            <span className="cdp-loading-state__label">Loading Event Data...</span>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>
                            <h2>Event Not Found</h2>
                            <button className="mlab-btn mlab-btn--outline" onClick={() => navigate(-1)} style={{ marginTop: '1rem' }}>
                                Return to Ecosystem
                            </button>
                        </div>
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className="cdp-layout">
            <Sidebar role={user?.role} currentNav="ecosystem" setCurrentNav={nav => navigate(`/admin?tab=${nav}`)} onLogout={() => navigate('/login')} />

            {selectedGuest && (
                <GuestDetailsModal
                    guest={selectedGuest}
                    crmProfile={crmProfiles[selectedGuest.guestEmail?.toLowerCase() || '']}
                    event={event}
                    onClose={() => setSelectedGuest(null)}
                    onSave={handleSaveGuestProfile}
                />
            )}

            {showReportWizard && (
                <AIReportWizardModal
                    event={event}
                    checkins={checkins}
                    crmProfiles={crmProfiles}
                    onClose={() => setShowReportWizard(false)}
                />
            )}

            {showReportHistory && (
                <ReportHistoryModal
                    eventId={event.id}
                    eventName={event.eventName}
                    onClose={() => setShowReportHistory(false)}
                />
            )}

            {showSyncModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowSyncModal(false)}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UploadCloud size={16} /> Sync Attendance to Cohort</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowSyncModal(false)}><X size={20} /></button>
                        </div>
                        <div className="lfm-body">
                            <div className="lfm-section-hdr"><Info size={13} /> Sync Summary</div>
                            <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px dashed #0ea5e9', marginBottom: '1.5rem' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#0c4a6e', lineHeight: 1.5 }}>
                                    Pushing <strong>{filteredCheckins.length}</strong> guest records across <strong>{urlSelectedDate !== 'all' ? `1 day` : `${availableDates.length} day(s)`}</strong> to the selected cohort. Matched learners will receive "Present" status for this activity.
                                </p>
                            </div>

                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Target Cohort to Update</label>
                                    <select
                                        className="lfm-input lfm-select"
                                        value={syncCohortId}
                                        onChange={(e) => setSyncCohortId(e.target.value)}
                                    >
                                        <option value="">-- Choose a Cohort --</option>
                                        {cohorts.filter(c => !c.isArchived).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Custom Session Title</label>
                                    <input
                                        type="text"
                                        className="lfm-input"
                                        placeholder="Enter the title for the register"
                                        value={syncSessionTitle}
                                        onChange={e => setSyncSessionTitle(e.target.value)}
                                        maxLength={100}
                                    />
                                </div>
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Session Description</label>
                                    <textarea
                                        className="lfm-input"
                                        placeholder="Enter a description for this session..."
                                        rows={3}
                                        value={syncSessionDescription}
                                        onChange={e => setSyncSessionDescription(e.target.value)}
                                        style={{ resize: 'vertical' }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowSyncModal(false)} disabled={isSyncing}>Cancel</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={executeCohortSync} disabled={isSyncing || !syncCohortId}>
                                {isSyncing ? <><Loader2 size={16} className="lfm-spin" /> Executing Sync...</> : <><Send size={14} /> Push to Cohort Register</>}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <main className="cdp-main">
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={() => navigate(-1)}>
                            <ChevronLeft size={14} /> Back to Ecosystem
                        </button>
                        <div className="cdp-header__eyebrow">
                            <Calendar size={12} /> Event Overview
                        </div>
                        <h1 className="cdp-header__title">{event.eventName}</h1>
                        <p className="cdp-header__sub">
                            <Globe size={12} className="cdp-header__sub-icon" /> {event.location.split(',')[0]}
                            <span className="cdp-header__status cdp-header__status--active" style={{ marginLeft: '8px' }}>
                                Roster Management
                            </span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        <div className="cdp-header__actions">

                            <button className="cdp-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={() => setShowReportWizard(true)}>
                                <Sparkles size={13} fill="white" /> Generate AI Report
                            </button>

                            <button className="cdp-btn cdp-btn--outline" onClick={() => setShowReportHistory(true)}>
                                <FileText size={13} /> Report History
                            </button>

                            <button className="cdp-btn" style={{ background: '#f8fafc', color: 'var(--mlab-blue)', border: '1px solid #cbd5e1' }} onClick={handleOpenSyncModal}>
                                <UploadCloud size={13} /> Sync to Cohort
                            </button>
                            <button className="cdp-btn cdp-btn--outline" onClick={exportToCSV}>
                                <DownloadCloud size={13} /> Export Roster
                            </button>
                            <button className="cdp-btn cdp-btn--sky" onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}>
                                <QrCode size={13} /> Open TV Kiosk
                            </button>
                        </div>
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content">
                    <div className="cdp-stat-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><Users size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{displayCount}</span>
                                <span className="cdp-stat-card__label">{displayLabel}</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--green">
                            <div className="cdp-stat-card__icon"><Calendar size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{urlSelectedDate === 'all' ? availableDates.length || 1 : 1}</span>
                                <span className="cdp-stat-card__label">{urlSelectedDate === 'all' ? 'Total Active Days' : 'Selected Day'}</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--amber">
                            <div className="cdp-stat-card__icon"><Clock size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{displayPercent}%</span>
                                <span className="cdp-stat-card__label">Daily Capacity Usage</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--blue" style={{ borderLeftColor: '#8b5cf6' }}>
                            <div className="cdp-stat-card__icon" style={{ background: '#ede9fe', color: '#8b5cf6' }}><Users size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value" style={{ fontSize: '1.2rem' }}>
                                    {genderStats.female}F | {genderStats.male}M | {genderStats.unknown}U
                                </span>
                                <span className="cdp-stat-card__label">Gender Breakdown</span>
                            </div>
                        </div>
                    </div>

                    <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                        <div className="vp-card" style={{ marginBottom: 0, minHeight: '650px', display: 'flex', flexDirection: 'column' }}>
                            <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
                                <div className="vp-card-title-group" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Users size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Event Check-ins ({filteredCheckins.length})
                                        </h3>
                                    </div>
                                    {hasActiveFilters && (
                                        <button
                                            onClick={handleClearFilters}
                                            className="mlab-btn mlab-btn--sm animate-fade-in"
                                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                        >
                                            <FilterX size={14} /> Clear Filters
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>
                                    <div className="mlab-search" style={{ width: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Search size={16} color="var(--mlab-grey)" />
                                        <input
                                            type="text"
                                            placeholder="Search name or email..."
                                            value={localSearchTerm}
                                            onChange={(e) => setLocalSearchTerm(e.target.value)}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
                                        <Filter size={14} color="var(--mlab-grey)" />
                                        <select
                                            className="lfm-select"
                                            style={{ border: 'none', outline: 'none', background: 'transparent', padding: '2px', fontSize: '0.8rem' }}
                                            value={urlSelectedDate}
                                            onChange={(e) => updateUrlParams({ date: e.target.value })}
                                        >
                                            <option value="all">All Dates</option>
                                            {availableDates.map(d => (
                                                <option key={d} value={d}>{moment(d).format('D MMM YYYY')}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', width: '100%' }}>
                                <table className="mlab-table" style={{ width: '100%', minWidth: '1000px' }}>
                                    <thead>
                                        <tr>
                                            <th>Attendee Info</th>
                                            <th style={{ width: '160px' }}>Check-In Date</th>
                                            {event.guestFormBlueprint?.slice(0, 2).map(f => (
                                                <th key={f.id}>{f.label}</th>
                                            ))}
                                            <th className="att-td--right" style={{ width: '130px' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedCheckins.length > 0 ? paginatedCheckins.map((c) => {
                                            const safeTime = getSafeTime(c.timestamp);
                                            const profile = crmProfiles[c.guestEmail?.toLowerCase() || ''] || {};
                                            const displayPhone = profile.phone || c.guestPhone;

                                            // 🚀 NEW: Dynamic Gender Icon Rendering
                                            const gender = profile.gender || 'Unknown';
                                            const genderIcon = gender === 'Female' ? '♀' : gender === 'Male' ? '♂' : '?';
                                            const genderColor = gender === 'Female' ? '#db2777' : gender === 'Male' ? '#2563eb' : '#64748b';
                                            const genderBg = gender === 'Female' ? '#fce7f3' : gender === 'Male' ? '#dbeafe' : '#f1f5f9';

                                            return (
                                                <tr key={c.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>
                                                    <td>
                                                        <div className="cdp-learner-cell">
                                                            <div className="cdp-learner-avatar" style={{ backgroundColor: 'var(--mlab-green)' }}>
                                                                {c.guestName?.charAt(0) || '?'}
                                                            </div>
                                                            <div className="cdp-learner-cell__info">
                                                                <span className="cdp-learner-cell__name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    {c.guestName}
                                                                    <span
                                                                        title={`Gender: ${gender}`}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                            width: '18px', height: '18px', borderRadius: '50%',
                                                                            fontSize: '10px', fontWeight: 'bold',
                                                                            color: genderColor, backgroundColor: genderBg, border: `1px solid ${genderColor}40`
                                                                        }}
                                                                    >
                                                                        {genderIcon}
                                                                    </span>
                                                                </span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                                                    <Mail size={10} /> {c.guestEmail}
                                                                </div>
                                                                {displayPhone && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                                                        <Phone size={10} /> {displayPhone}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                                                            {moment(safeTime).format('D MMM YYYY')}
                                                        </span>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', marginTop: '4px', marginLeft: '4px' }}>
                                                            {moment(safeTime).format('HH:mm')}
                                                        </div>
                                                    </td>

                                                    {event.guestFormBlueprint?.slice(0, 2).map(f => {
                                                        const val = c.responses?.[f.id];
                                                        return (
                                                            <td key={f.id} style={{ fontSize: '0.85rem', color: '#475569' }}>
                                                                {typeof val === 'boolean' ? (
                                                                    val ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>
                                                                ) : (
                                                                    <span style={{ maxWidth: '200px', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {val || '—'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}

                                                    <td className="att-td--right">
                                                        <button
                                                            className="cdp-btn cdp-btn--sky"
                                                            onClick={() => setSelectedGuest(c)}
                                                        >
                                                            <Eye size={12} /> View Profile
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={4 + Math.min(event.guestFormBlueprint?.length || 0, 2)} style={{ padding: '4rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                    <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                    <p style={{ margin: 0, fontWeight: 500 }}>No attendees match your current filters.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)',
                                    marginTop: 'auto'
                                }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                        Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredCheckins.length)}</strong> of <strong>{filteredCheckins.length}</strong> attendees
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="wm-btn wm-btn--ghost"
                                            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1 }}
                                        >
                                            <ChevronLeft size={14} /> Previous
                                        </button>
                                        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="wm-btn wm-btn--ghost"
                                            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1 }}
                                        >
                                            Next <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};


// // src/app/guest/[eventId].tsx (or your respective path)

// import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
// import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
// import { createPortal } from 'react-dom';
// import {
//     Calendar, Users,
//     Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,
//     ChevronLeft,
//     Globe,
//     DownloadCloud,
//     Loader2,
//     UploadCloud, Send, FilterX, ChevronRight,
//     Info,
//     Sparkles, FileText, Image as ImageIcon, MessageSquare, CheckCircle, BarChart2, Upload
// } from 'lucide-react';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { useStore } from '../../../store/useStore';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import moment from 'moment';
// import { writeBatch, doc } from 'firebase/firestore';
// import { db, functions, storage } from '../../../lib/firebase';

// import type { EcosystemEvent } from '../../../types/ecosystem.types';

// import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// import '../../../pages/CohortDetails/CohortDetailsPage.css';
// import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
// import { httpsCallable } from 'firebase/functions';

// // ─── GUEST DETAILS MODAL ──────────────────────────────────────────────────
// const GuestDetailsModal: React.FC<{ guest: any, crmProfile: any, event: EcosystemEvent, onClose: () => void }> = ({ guest, crmProfile, event, onClose }) => {
//     if (!guest) return null;

//     const safeTime = guest.timestamp?.toDate ? guest.timestamp.toDate() : guest.timestamp;

//     // Merge data from the check-in ping and the rich CRM profile
//     const phone = crmProfile?.phone || guest.guestPhone || '—';
//     const idNumber = crmProfile?.idNumber || guest.guestIdNumber || 'Not provided';
//     const gender = crmProfile?.gender || '—';
//     const age = crmProfile?.age ? `${crmProfile.age} years old` : '—';
//     const isYouth = crmProfile?.isYouth;

//     // ─── COMPLIANCE FLAGS (Mapped directly from App Payload) ───
//     const rawPopia = crmProfile?.popiaConsent ?? guest.popiaConsent;
//     const popiaDate = crmProfile?.popiaConsentDate;

//     // Formatting the POPIA string to include the timestamp if it exists
//     const popiaDisplay = rawPopia
//         ? `Yes${popiaDate ? ` (Signed ${moment(popiaDate).format('D MMM YYYY')})` : ''}`
//         : '—';

//     const rawMarketing = crmProfile?.marketingOptIn ?? guest.marketingOptIn;
//     const marketingDisplay = rawMarketing === true ? 'Yes (Opted In)' : (rawMarketing === false ? 'No' : '—');

//     return createPortal(
//         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
//             <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>

//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title"><Users size={16} /> Guest Profile</h2>
//                     <button className="lfm-close-btn" type="button" onClick={onClose}><X size={20} /></button>
//                 </div>

//                 <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
//                         <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700 }}>
//                             {guest.guestName?.charAt(0) || '?'}
//                         </div>
//                         <div style={{ flex: 1 }}>
//                             <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.25rem', fontWeight: 700 }}>{guest.guestName}</h3>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
//                                 <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.65rem' }}>
//                                     Verified Attendance
//                                 </span>
//                                 {isYouth && (
//                                     <span style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
//                                         Youth (18-35)
//                                     </span>
//                                 )}
//                             </div>
//                         </div>
//                     </div>

//                     <div className="lfm-section-hdr"><ShieldCheck size={13} /> Contact & Demographic Details</div>
//                     <div className="lfm-grid" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
//                         <div className="lfm-fg">
//                             <label>Email Address</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{guest.guestEmail || '—'}</div>
//                         </div>
//                         <div className="lfm-fg">
//                             <label>Mobile Number</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{phone}</div>
//                         </div>
//                         <div className="lfm-fg lfm-fg--full">
//                             <label>ID / Passport Number</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{idNumber}</div>
//                         </div>
//                         <div className="lfm-fg">
//                             <label>Gender</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{gender}</div>
//                         </div>
//                         <div className="lfm-fg">
//                             <label>Age</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{age}</div>
//                         </div>
//                         <div className="lfm-fg">
//                             <label>POPIA Consent</label>
//                             <div style={{ fontSize: '0.9rem', color: rawPopia ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600 }}>{popiaDisplay}</div>
//                         </div>
//                         <div className="lfm-fg">
//                             <label>Marketing Opt-In</label>
//                             <div style={{ fontSize: '0.9rem', color: rawMarketing ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600 }}>{marketingDisplay}</div>
//                         </div>
//                         <div className="lfm-fg lfm-fg--full" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '4px' }}>
//                             <label>Event Check-in Time</label>
//                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{moment(safeTime).format('D MMM YYYY, HH:mm')}</div>
//                         </div>
//                     </div>

//                     {event.guestFormBlueprint && event.guestFormBlueprint.length > 0 && (
//                         <>
//                             <div className="lfm-section-hdr"><Filter size={13} /> Custom Event Responses</div>
//                             <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px dashed #0ea5e9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
//                                 {event.guestFormBlueprint.map(field => {
//                                     const rawVal = guest.responses?.[field.id];
//                                     const displayVal = typeof rawVal === 'boolean'
//                                         ? (rawVal ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>)
//                                         : (rawVal || <span style={{ color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Skipped</span>);

//                                     return (
//                                         <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #bae6fd', paddingBottom: '0.5rem' }}>
//                                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
//                                                 {field.label}
//                                             </span>
//                                             <span style={{ fontSize: '0.95rem', color: 'var(--mlab-midnight)' }}>{displayVal}</span>
//                                         </div>
//                                     );
//                                 })}
//                             </div>
//                         </>
//                     )}
//                 </div>

//                 <div className="lfm-footer">
//                     <button type="button" className="lfm-btn lfm-btn--primary" onClick={onClose}>Close Profile</button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// // ─── AI REPORT WIZARD MODAL ───────────────────────────────────────────────
// const AIReportWizardModal: React.FC<{
//     event: EcosystemEvent,
//     checkins: any[],
//     crmProfiles: Record<string, any>,
//     onClose: () => void
// }> = ({ event, checkins, crmProfiles, onClose }) => {
//     const [step, setStep] = useState(1);
//     const [isGenerating, setIsGenerating] = useState(false);

//     // 🚀 NEW: Progress Bar & Result States
//     const [progress, setProgress] = useState(0);
//     const [progressText, setProgressText] = useState("");
//     const [reportResult, setReportResult] = useState<{ markdown: string, modelUsed: string } | null>(null);

//     // State for user inputs
//     const [templateFile, setTemplateFile] = useState<File | null>(null);
//     const [photoFiles, setPhotoFiles] = useState<File[]>([]);
//     const [context, setContext] = useState({ objectives: '', highlights: '', challenges: '' });
//     const [includeCharts, setIncludeCharts] = useState(true);

//     const toast = useToast();
//     const templateInputRef = useRef<HTMLInputElement>(null);
//     const photoInputRef = useRef<HTMLInputElement>(null);
//     const intervalRef = useRef<NodeJS.Timeout | null>(null);

//     // Calculate Data Summary
//     const youthCount = checkins.filter(c => crmProfiles[c.guestEmail?.toLowerCase()]?.isYouth).length;
//     const femaleCount = checkins.filter(c => crmProfiles[c.guestEmail?.toLowerCase()]?.gender === 'Female').length;
//     const capacityPercent = event.maxCapacity ? Math.round((checkins.length / event.maxCapacity) * 100) : 0;

//     // Clean up interval on unmount
//     useEffect(() => {
//         return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
//     }, []);

//     const handleGenerate = async () => {
//         setIsGenerating(true);
//         setProgress(5);
//         setProgressText("Initializing AI Engine...");

//         try {
//             const uploadedPhotoUrls: string[] = [];
//             let uploadedTemplateUrl: string | null = null;

//             // 1. UPLOAD TEMPLATE TO STORAGE
//             if (templateFile) {
//                 setProgressText("Uploading template document...");
//                 setProgress(15);
//                 // Create a secure reference in Firebase Storage
//                 const tempRef = ref(storage, `ai_reports/templates/${event.id}_${Date.now()}_${templateFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
//                 await uploadBytes(tempRef, templateFile);
//                 uploadedTemplateUrl = await getDownloadURL(tempRef);
//             }

//             // 2. UPLOAD PHOTOS TO STORAGE
//             if (photoFiles.length > 0) {
//                 setProgressText(`Uploading ${photoFiles.length} photos...`);
//                 setProgress(25);
//                 for (let i = 0; i < photoFiles.length; i++) {
//                     const file = photoFiles[i];
//                     const photoRef = ref(storage, `ai_reports/events/${event.id}_photo_${i}_${Date.now()}`);
//                     await uploadBytes(photoRef, file);
//                     const url = await getDownloadURL(photoRef);
//                     uploadedPhotoUrls.push(url);
//                 }
//             }

//             setProgressText("Connecting to Multi-Provider AI Gateway...");
//             setProgress(35);

//             intervalRef.current = setInterval(() => {
//                 setProgress(prev => {
//                     if (prev >= 95) return prev;
//                     if (prev === 60) setProgressText("Synthesizing event metrics...");
//                     if (prev === 80) setProgressText("Formatting QCTO compliance structure...");
//                     return prev + 2;
//                 });
//             }, 800);

//             const generateEventReport = httpsCallable(functions, 'generateEventReport');

//             // 3. SEND EVERYTHING TO THE BACKEND
//             const payload = {
//                 eventId: event.id, // 🚀 Required to save history to the database
//                 eventDetails: {
//                     eventName: event.eventName,
//                     location: event.location,
//                     date: moment(event.date).format('D MMM YYYY'),
//                 },
//                 metrics: {
//                     totalAttendance: checkins.length,
//                     maxCapacity: event.maxCapacity || 0,
//                     youthCount: youthCount,
//                     femaleCount: femaleCount,
//                 },
//                 humanContext: {
//                     highlights: context.highlights,
//                     challenges: context.challenges,
//                 },
//                 includeCharts: includeCharts,
//                 photoUrls: uploadedPhotoUrls,    // 🚀 Now contains actual live URLs
//                 templateUrl: uploadedTemplateUrl // 🚀 Now contains actual live URL
//             };

//             const result = await generateEventReport(payload);
//             const data = result.data as any;

//             if (intervalRef.current) clearInterval(intervalRef.current);

//             if (data.success) {
//                 setProgress(100);
//                 setProgressText("Report saved to history!");

//                 setReportResult({ markdown: data.markdown, modelUsed: data.modelUsed });
//                 setTimeout(() => setStep(5), 600);
//             }

//         } catch (error: any) {
//             if (intervalRef.current) clearInterval(intervalRef.current);
//             console.error("Generation Error:", error);
//             toast.error(error.message || "Failed to generate report.");
//             setIsGenerating(false);
//             setProgress(0);
//         }
//     };

//     // Function to parse Markdown to a native Word Document (.docx)
//     const exportToWord = () => {
//         if (!reportResult) return;

//         // Convert basic Markdown to HTML layout
//         let html = reportResult.markdown
//             .replace(/^### (.*$)/gim, '<h3 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h3>')
//             .replace(/^## (.*$)/gim, '<h2 style="color: #073f4e; font-family: Arial, sans-serif; border-bottom: 1px solid #ccc; padding-bottom: 5px;">$1</h2>')
//             .replace(/^# (.*$)/gim, '<h1 style="color: #073f4e; font-family: Arial, sans-serif;">$1</h1>')
//             .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
//             .replace(/^\- (.*$)/gim, '<ul style="margin-top: 0; margin-bottom: 4px;"><li>$1</li></ul>')
//             .replace(/<\/ul>\n<ul[^>]*>/gim, '') // Merge adjacent lists
//             .replace(/\n\n/gim, '<br><br>');

//         // Detect the AI's <chart-data> JSON block and turn it into a beautiful Word Table!
//         html = html.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gim, (match, jsonString) => {
//             try {
//                 const data = JSON.parse(jsonString);
//                 let table = '<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-top: 15px; font-family: Arial, sans-serif;">';
//                 table += '<tr style="background-color: #f1f5f9;"><th style="text-align: left;">Demographic Metric</th><th style="text-align: left;">Count</th></tr>';
//                 data.forEach((row: any) => {
//                     table += `<tr><td>${row.name}</td><td><strong>${row.value}</strong></td></tr>`;
//                 });
//                 table += '</table>';
//                 return table;
//             } catch (e) {
//                 return '<em>[Chart Data Parsing Error]</em>';
//             }
//         });

//         // Wrap in Microsoft Office XML namespace wrapper
//         const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>mLab Report</title></head><body>";
//         const footer = "</body></html>";
//         const sourceHTML = header + html + footer;

//         // Create Blob and trigger download
//         const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
//         const fileDownload = document.createElement("a");
//         document.body.appendChild(fileDownload);
//         fileDownload.href = source;
//         fileDownload.download = `mLab_Report_${event.eventName.replace(/\s+/g, '_')}.docx`;
//         fileDownload.click();
//         document.body.removeChild(fileDownload);

//         toast.success("Word Document Downloaded!");
//     };

//     return createPortal(
//         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
//             <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: step === 5 ? '600px' : '750px', width: '95%' }}>

//                 <div className="lfm-header" style={{ background: '#073f4e', color: 'white' }}>
//                     <h2 className="lfm-header__title" style={{ color: 'white' }}><Sparkles size={16} color="#94c73d" /> Generate M&E Report</h2>
//                     <button className="lfm-close-btn" style={{ color: 'white' }} type="button" onClick={onClose} disabled={isGenerating}><X size={20} /></button>
//                 </div>

//                 {/* Hide progress bar on Step 5 */}
//                 {step < 5 && (
//                     <div style={{ display: 'flex', background: '#f8fafc', padding: '1rem 1.5rem', borderBottom: '1px solid #cbd5e1' }}>
//                         {[
//                             { num: 1, label: "Data Summary", icon: <Users size={14} /> },
//                             { num: 2, label: "Template", icon: <FileText size={14} /> },
//                             { num: 3, label: "Media", icon: <ImageIcon size={14} /> },
//                             { num: 4, label: "Context", icon: <MessageSquare size={14} /> }
//                         ].map((s) => (
//                             <div key={s.num} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: step >= s.num ? 1 : 0.4 }}>
//                                 <div style={{
//                                     width: '28px', height: '28px', borderRadius: '14px',
//                                     background: step >= s.num ? 'var(--mlab-green)' : '#cbd5e1',
//                                     color: step >= s.num ? '#073f4e' : 'white',
//                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
//                                     fontWeight: 'bold', marginBottom: '4px'
//                                 }}>
//                                     {step > s.num ? <CheckCircle size={16} /> : s.icon}
//                                 </div>
//                                 <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>{s.label}</span>
//                             </div>
//                         ))}
//                     </div>
//                 )}

//                 <div className="lfm-body" style={{ padding: '1.5rem', minHeight: '350px' }}>

//                     {step === 1 && (
//                         <div className="animate-fade-in">
//                             <h4 style={{ margin: '0 0 10px', color: 'var(--mlab-midnight)' }}>Data Ready for AI Extraction</h4>
//                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', marginBottom: '1.5rem' }}>
//                                 We have automatically gathered the following hard metrics from the ecosystem ledger to feed into your report.
//                             </p>
//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
//                                 <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '1rem', borderRadius: '8px' }}>
//                                     <div style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 700, textTransform: 'uppercase' }}>Total Attendance</div>
//                                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0c4a6e' }}>{checkins.length} <span style={{ fontSize: '1rem', fontWeight: 400 }}>/ {event.maxCapacity}</span></div>
//                                     <div style={{ fontSize: '0.8rem', color: '#0369a1' }}>{capacityPercent}% Capacity Reached</div>
//                                 </div>
//                                 <div style={{ background: '#fdf4ff', border: '1px solid #fbcfe8', padding: '1rem', borderRadius: '8px' }}>
//                                     <div style={{ fontSize: '0.75rem', color: '#c026d3', fontWeight: 700, textTransform: 'uppercase' }}>Demographics</div>
//                                     <div style={{ fontSize: '0.9rem', color: '#701a75', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                         <span style={{ fontWeight: 600 }}>{youthCount} Youth (18-35)</span>
//                                         <span style={{ fontWeight: 600 }}>{femaleCount} Female Participants</span>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {step === 2 && (
//                         <div className="animate-fade-in">
//                             <h4 style={{ margin: '0 0 10px', color: 'var(--mlab-midnight)' }}>Style & Formatting Template</h4>
//                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', marginBottom: '1.5rem' }}>
//                                 Upload a previous M&E report (PDF/Doc) or a screenshot of a format you like. The AI will mimic its tone and structural layout exactly.
//                             </p>

//                             <input
//                                 type="file"
//                                 ref={templateInputRef}
//                                 style={{ display: 'none' }}
//                                 accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
//                                 onChange={(e) => {
//                                     if (e.target.files && e.target.files[0]) {
//                                         setTemplateFile(e.target.files[0]);
//                                     }
//                                 }}
//                             />

//                             <div
//                                 onClick={() => templateInputRef.current?.click()}
//                                 style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '2rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' }}
//                                 onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
//                                 onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
//                             >
//                                 <Upload size={32} color={templateFile ? 'var(--mlab-green)' : '#94a3b8'} style={{ margin: '0 auto 10px' }} />
//                                 <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: templateFile ? 'var(--mlab-green-dark)' : 'var(--mlab-midnight)' }}>
//                                     {templateFile ? templateFile.name : "Drag & Drop Template Here"}
//                                 </span>
//                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
//                                     {templateFile ? "Click to change file" : "or click to browse files"}
//                                 </span>
//                             </div>
//                         </div>
//                     )}

//                     {step === 3 && (
//                         <div className="animate-fade-in">
//                             <h4 style={{ margin: '0 0 10px', color: 'var(--mlab-midnight)' }}>Event Highlights (Media)</h4>
//                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', marginBottom: '1.5rem' }}>
//                                 Upload up to 3 high-quality photos from the event. These will be automatically formatted into the final PDF.
//                             </p>

//                             <input
//                                 type="file"
//                                 ref={photoInputRef}
//                                 style={{ display: 'none' }}
//                                 accept="image/jpeg, image/png, image/webp"
//                                 multiple
//                                 onChange={(e) => {
//                                     if (e.target.files) {
//                                         const filesArray = Array.from(e.target.files).slice(0, 3);
//                                         setPhotoFiles(filesArray);
//                                     }
//                                 }}
//                             />

//                             <div
//                                 onClick={() => photoInputRef.current?.click()}
//                                 style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '2rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' }}
//                                 onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--mlab-blue)'}
//                                 onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
//                             >
//                                 <ImageIcon size={32} color={photoFiles.length > 0 ? 'var(--mlab-green)' : '#94a3b8'} style={{ margin: '0 auto 10px' }} />
//                                 <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: photoFiles.length > 0 ? 'var(--mlab-green-dark)' : 'var(--mlab-midnight)' }}>
//                                     {photoFiles.length > 0 ? `${photoFiles.length} photo(s) selected` : "Upload Event Photos"}
//                                 </span>
//                                 <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
//                                     {photoFiles.length > 0 ? "Click to change photos" : "JPEG, PNG (Max 3 files)"}
//                                 </span>
//                             </div>
//                         </div>
//                     )}

//                     {step === 4 && (
//                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                             <h4 style={{ margin: '0', color: 'var(--mlab-midnight)' }}>Human Context & Settings</h4>
//                             <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', marginBottom: '0.5rem' }}>Provide short bullet points; the AI will expand them professionally.</p>

//                             <div className="lfm-fg lfm-fg--full">
//                                 <label>What was the main objective or highlight of this event?</label>
//                                 <textarea className="lfm-input" rows={2} placeholder="e.g. The winning team built an AI agriculture app..." value={context.highlights} onChange={e => setContext({ ...context, highlights: e.target.value })}></textarea>
//                             </div>

//                             <div className="lfm-fg lfm-fg--full">
//                                 <label>Were there any notable challenges?</label>
//                                 <textarea className="lfm-input" rows={2} placeholder="e.g. Load shedding delayed the start by 30 mins..." value={context.challenges} onChange={e => setContext({ ...context, challenges: e.target.value })}></textarea>
//                             </div>

//                             <div style={{ background: '#f4fbf0', border: '1px solid #b7e387', padding: '1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
//                                 <div>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3f6212', fontWeight: 700, fontSize: '0.9rem' }}>
//                                         <BarChart2 size={16} /> Include Data Visualizations
//                                     </div>
//                                     <div style={{ fontSize: '0.75rem', color: '#4d7c0f', marginTop: '4px' }}>
//                                         Generate exact JSON structures to render beautiful demographics tables.
//                                     </div>
//                                 </div>
//                                 <div onClick={() => setIncludeCharts(!includeCharts)} style={{ width: '44px', height: '24px', background: includeCharts ? 'var(--mlab-green)' : '#cbd5e1', borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}>
//                                     <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '10px', position: 'absolute', top: '2px', left: includeCharts ? '22px' : '2px', transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
//                                 </div>
//                             </div>

//                             {/* 🚀 THE PROGRESS BAR */}
//                             {isGenerating && (
//                                 <div className="animate-fade-in" style={{ marginTop: '1rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
//                                         <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{progressText}</span>
//                                         <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mlab-green-dark)' }}>{progress}%</span>
//                                     </div>
//                                     <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
//                                         <div style={{ height: '100%', background: 'var(--mlab-green)', width: `${progress}%`, transition: 'width 0.4s ease' }} />
//                                     </div>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* 🚀 STEP 5: SUCCESS & DOWNLOAD SCREEN */}
//                     {step === 5 && reportResult && (
//                         <div className="animate-fade-in" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
//                             <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: '#ecfdf5', border: '2px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
//                                 <CheckCircle size={32} color="#10b981" />
//                             </div>

//                             <h3 style={{ margin: '0 0 8px', color: 'var(--mlab-midnight)', fontSize: '1.5rem' }}>Report Generated Successfully</h3>
//                             <p style={{ color: 'var(--mlab-grey)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.5 }}>
//                                 The AI has finished analyzing the event metrics and writing the formal post-event documentation.
//                             </p>

//                             <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '20px', marginBottom: '32px' }}>
//                                 <Sparkles size={14} color="#3b82f6" />
//                                 <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8' }}>AI Engine: {reportResult.modelUsed}</span>
//                             </div>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                                 <button type="button" className="mlab-btn mlab-btn--primary" onClick={exportToWord} style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}>
//                                     <FileText size={18} /> Download as Word Document (.doc)
//                                 </button>

//                                 <button type="button" className="mlab-btn mlab-btn--outline" onClick={() => {
//                                     // Fallback: Download Raw Text/Markdown
//                                     const blob = new Blob([reportResult.markdown], { type: 'text/plain' });
//                                     const url = URL.createObjectURL(blob);
//                                     const a = document.createElement('a');
//                                     a.href = url;
//                                     a.download = `Raw_Markdown_${event.eventName.replace(/\s+/g, '_')}.txt`;
//                                     a.click();
//                                 }} style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}>
//                                     <DownloadCloud size={18} /> Download Raw Text File
//                                 </button>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
//                     {step < 5 ? (
//                         <>
//                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={isGenerating}>
//                                 {step > 1 ? "Back" : "Cancel"}
//                             </button>

//                             {step < 4 ? (
//                                 <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => setStep(step + 1)}>
//                                     Continue <ChevronRight size={14} />
//                                 </button>
//                             ) : (
//                                 <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleGenerate} disabled={isGenerating} style={{ background: '#073f4e', borderColor: '#073f4e' }}>
//                                     {isGenerating ? <><Loader2 size={14} className="spin" /> Generating...</> : <><Sparkles size={14} color="#94c73d" /> Synthesize Report</>}
//                                 </button>
//                             )}
//                         </>
//                     ) : (
//                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} style={{ width: '100%', textAlign: 'center' }}>
//                             Close Window
//                         </button>
//                     )}
//                 </div>

//             </div>
//         </div>,
//         document.body
//     );
// };

// // ─── MAIN COMPONENT: EVENT DETAILS & SYNC ENGINE ───────────────────────────
// export const EventDetailsPage: React.FC = () => {
//     const { eventId } = useParams<{ eventId: string }>();
//     const navigate = useNavigate();
//     const [searchParams, setSearchParams] = useSearchParams();
//     const toast = useToast();

//     // 🚀 Connect to Global Store
//     const {
//         user, events, checkins: allCheckins, guests, ecosystemLoading,
//         fetchEcosystemData, cohorts, learners, enrollments,
//         fetchCohorts, fetchLearners, fetchEnrollments
//     } = useStore();

//     const [selectedGuest, setSelectedGuest] = useState<any | null>(null);

//     // ─── REPORT WIZARD STATE ───
//     const [showReportWizard, setShowReportWizard] = useState(false);

//     // ─── URL-BOUND FILTERS & PAGINATION ───
//     const urlSearchTerm = searchParams.get('search') || '';
//     const urlSelectedDate = searchParams.get('date') || 'all';

//     const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);
//     const [currentPage, setCurrentPage] = useState(1);
//     const ITEMS_PER_PAGE = 50;

//     // ─── SYNC ENGINE STATES ───
//     const [showSyncModal, setShowSyncModal] = useState(false);
//     const [syncCohortId, setSyncCohortId] = useState('');
//     const [syncSessionTitle, setSyncSessionTitle] = useState('');
//     const [syncSessionDescription, setSyncSessionDescription] = useState('');
//     const [isSyncing, setIsSyncing] = useState(false);

//     // 🚀 Fetch EVERYTHING on load if missing
//     useEffect(() => {
//         if (fetchEcosystemData) fetchEcosystemData();
//         if (fetchCohorts && cohorts.length === 0) fetchCohorts();
//         if (fetchLearners && learners.length === 0) fetchLearners();
//         if (fetchEnrollments && enrollments.length === 0) fetchEnrollments();
//     }, [fetchEcosystemData, fetchCohorts, fetchLearners, fetchEnrollments]);

//     useEffect(() => {
//         const handler = setTimeout(() => {
//             updateUrlParams({ search: localSearchTerm || null });
//         }, 400);
//         return () => clearTimeout(handler);
//     }, [localSearchTerm]);

//     useEffect(() => {
//         setLocalSearchTerm(urlSearchTerm);
//     }, [urlSearchTerm]);

//     useEffect(() => {
//         setCurrentPage(1);
//     }, [urlSearchTerm, urlSelectedDate]);

//     const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
//         setSearchParams(prev => {
//             const newParams = new URLSearchParams(prev);
//             Object.entries(updates).forEach(([key, value]) => {
//                 if (value === null || value === '' || value === 'all') {
//                     newParams.delete(key);
//                 } else {
//                     newParams.set(key, String(value));
//                 }
//             });
//             return newParams;
//         }, { replace: true });
//     }, [setSearchParams]);

//     const handleClearFilters = () => {
//         setLocalSearchTerm('');
//         setSearchParams(new URLSearchParams(), { replace: true });
//     };

//     const hasActiveFilters = Boolean(urlSearchTerm || urlSelectedDate !== 'all');

//     // ─── DATA PROCESSING FROM GLOBAL STORE ───────────────────────────────────

//     const event = useMemo(() => events.find(e => e.id === eventId) as EcosystemEvent | undefined, [events, eventId]);
//     const checkins = useMemo(() => allCheckins.filter(c => c.eventId === eventId), [allCheckins, eventId]);

//     const crmProfiles = useMemo(() => {
//         const profiles: Record<string, any> = {};
//         guests.forEach(g => {
//             profiles[g.email.toLowerCase()] = g;
//         });
//         return profiles;
//     }, [guests]);

//     const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : ts;

//     const availableDates = useMemo(() => {
//         const dates = checkins.map(c => moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD'));
//         return Array.from(new Set(dates)).sort();
//     }, [checkins]);

//     const filteredCheckins = useMemo(() => {
//         return checkins.filter(c => {
//             const matchesSearch =
//                 c.guestName?.toLowerCase().includes(urlSearchTerm.toLowerCase()) ||
//                 c.guestEmail?.toLowerCase().includes(urlSearchTerm.toLowerCase());

//             const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');
//             const matchesDate = urlSelectedDate === 'all' || checkinDate === urlSelectedDate;

//             return matchesSearch && matchesDate;
//         });
//     }, [checkins, urlSearchTerm, urlSelectedDate]);

//     const totalPages = Math.ceil(filteredCheckins.length / ITEMS_PER_PAGE);
//     const paginatedCheckins = filteredCheckins.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

//     const { displayCount, displayLabel, displayPercent } = useMemo(() => {
//         if (!event?.maxCapacity || event.maxCapacity <= 0) {
//             return { displayCount: filteredCheckins.length, displayLabel: "Total Attendees", displayPercent: 0 };
//         }

//         if (urlSelectedDate !== 'all') {
//             const percent = Math.round((filteredCheckins.length / event.maxCapacity) * 100);
//             return {
//                 displayCount: filteredCheckins.length,
//                 displayLabel: `Attendees on ${moment(urlSelectedDate).format('D MMM')}`,
//                 displayPercent: percent
//             };
//         } else {
//             const activeDaysCount = availableDates.length || 1;
//             const avgDailyAttendees = Math.round(checkins.length / activeDaysCount);
//             const avgPercent = Math.round((avgDailyAttendees / event.maxCapacity) * 100);

//             return {
//                 displayCount: avgDailyAttendees,
//                 displayLabel: "Avg Daily Attendees",
//                 displayPercent: avgPercent
//             };
//         }
//     }, [checkins, filteredCheckins, event?.maxCapacity, urlSelectedDate, availableDates]);

//     const handleOpenSyncModal = () => {
//         setSyncSessionTitle(event?.eventName || '');
//         setSyncSessionDescription('Automatically synced from Ecosystem Kiosk Check-ins.');
//         setShowSyncModal(true);
//     };

//     const executeCohortSync = async () => {
//         if (!syncCohortId) return toast.error("Please select a target cohort from the dropdown.");
//         setIsSyncing(true);

//         try {
//             const batch = writeBatch(db);

//             const cohortEnrollments = enrollments.filter(e => e.cohortId === syncCohortId);
//             const cohortLearnerIds = cohortEnrollments.map(e => e.learnerId);
//             const cohortLearners = learners.filter(l => cohortLearnerIds.includes(l.id) || l.cohortId === syncCohortId);

//             if (cohortLearners.length === 0) {
//                 setIsSyncing(false);
//                 return toast.error("This cohort currently has no active learners to sync.");
//             }

//             const checkinsByDate: Record<string, any[]> = {};

//             filteredCheckins.forEach(c => {
//                 const email = String(c.guestEmail || '').toLowerCase().trim();
//                 if (!email) return;

//                 const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');

//                 if (!checkinsByDate[checkinDate]) {
//                     checkinsByDate[checkinDate] = [];
//                 }
//                 checkinsByDate[checkinDate].push(c);
//             });

//             const uniqueDates = Object.keys(checkinsByDate).sort();
//             if (uniqueDates.length === 0) {
//                 setIsSyncing(false);
//                 return toast.error("No valid check-in dates found to sync.");
//             }

//             let totalPresentCount = 0;

//             uniqueDates.forEach(syncDate => {
//                 const dayCheckins = checkinsByDate[syncDate];
//                 const attendedEmails = new Set(dayCheckins.map(c => String(c.guestEmail || '').toLowerCase().trim()));

//                 let dailyPresentCount = 0;
//                 const syntheticRawZoomData: any[] = [];

//                 cohortLearners.forEach(learner => {
//                     const email = String(learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase().trim();
//                     const isPresent = attendedEmails.has(email);

//                     if (isPresent) {
//                         dailyPresentCount++;
//                         totalPresentCount++;

//                         syntheticRawZoomData.push({
//                             name: learner.fullName || crmProfiles[email]?.guestName || "Unknown Guest",
//                             email: email,
//                             duration: 120,
//                             sessions: [{
//                                 duration: 120,
//                                 tabName: syncDate.replace(/-/g, '_')
//                             }]
//                         });
//                     }

//                     const recId = `${syncCohortId}_${syncDate}_${learner.id}`;
//                     const recRef = doc(db, 'attendance_records', recId);

//                     batch.set(recRef, {
//                         cohortId: syncCohortId,
//                         learnerId: learner.id,
//                         sessionDate: syncDate,
//                         status: isPresent ? 'Present' : 'Absent',
//                         actualDuration: isPresent ? 120 : 0,
//                         updatedAt: new Date().toISOString(),
//                         source: 'ecosystem_sync',
//                         eventId: event?.id
//                     }, { merge: true });
//                 });

//                 const logId = `${syncCohortId}_${syncDate}_ecosystem_${event?.id}`;
//                 const logRef = doc(db, 'attendance_logs', logId);

//                 const dayLabel = uniqueDates.length > 1 ? ` (Day ${uniqueDates.indexOf(syncDate) + 1})` : '';
//                 const baseTitle = syncSessionTitle.trim() || event?.eventName || 'Ecosystem Event';
//                 const finalTitle = `${baseTitle}${dayLabel}`.trim();

//                 const finalDesc = syncSessionDescription.trim() || (uniqueDates.length > 1
//                     ? `Day ${uniqueDates.indexOf(syncDate) + 1} automatically synced from Ecosystem Kiosk Check-ins.`
//                     : 'Automatically synced from Ecosystem Kiosk Check-ins.');

//                 batch.set(logRef, {
//                     cohortId: syncCohortId,
//                     sessionDate: `${syncDate}T00:00:00.000Z`,
//                     sessionTitle: finalTitle,
//                     sessionDescription: finalDesc,
//                     expectedDuration: 120,
//                     totalEnrolled: cohortLearners.length,
//                     totalPresent: dailyPresentCount,
//                     totalAbsent: cohortLearners.length - dailyPresentCount,
//                     totalPartial: 0,
//                     createdAt: new Date().toISOString(),
//                     isBootcamp: true,
//                     importVersion: 1,
//                     isEcosystem: true,
//                     sourceEventId: event?.id,
//                     rawZoomData: syntheticRawZoomData,
//                     totalDaySessions: 1
//                 }, { merge: true });
//             });

//             await batch.commit();

//             toast.success(`Successfully synced! Recorded ${totalPresentCount} presences across ${uniqueDates.length} day(s).`);
//             setShowSyncModal(false);
//             setSyncCohortId('');
//             setSyncSessionTitle('');
//             setSyncSessionDescription('');
//         } catch (error) {
//             console.error("Sync Error:", error);
//             toast.error("Failed to map ecosystem records to the cohort.");
//         } finally {
//             setIsSyncing(false);
//         }
//     };

//     const exportToCSV = () => {
//         if (filteredCheckins.length === 0) {
//             toast.error("No records to export.");
//             return;
//         }

//         const escapeCSV = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

//         const headers = [
//             "Guest Name",
//             "Email",
//             "Mobile Number",
//             "ID/Passport Number",
//             "Gender",
//             "Age",
//             "Is Youth (18-35)",
//             "POPIA Consent",
//             "Marketing Opt-In",
//             "Check-in Time",
//             "Date"
//         ];

//         const customFieldKeys = event?.guestFormBlueprint?.map(f => f.label) || [];
//         const fullHeaders = [...headers, ...customFieldKeys];

//         const rows = filteredCheckins.map(c => {
//             const safeTime = getSafeTime(c.timestamp);
//             const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};

//             const baseData = [
//                 escapeCSV(c.guestName),
//                 escapeCSV(c.guestEmail),
//                 escapeCSV(profile.phone || c.guestPhone || 'N/A'),
//                 escapeCSV(profile.idNumber || c.guestIdNumber || 'N/A'),
//                 escapeCSV(profile.gender || 'N/A'),
//                 escapeCSV(profile.age ? String(profile.age) : 'N/A'),
//                 escapeCSV(profile.isYouth ? 'Yes' : 'No'),
//                 escapeCSV(profile.popiaConsent ? 'Yes' : 'No'),
//                 escapeCSV(profile.marketingOptIn ? 'Yes' : 'No'),
//                 escapeCSV(moment(safeTime).format('HH:mm:ss')),
//                 escapeCSV(moment(safeTime).format('YYYY-MM-DD'))
//             ];

//             const customData = event?.guestFormBlueprint?.map(f => {
//                 const answer = c.responses?.[f.id];
//                 const formattedAnswer = typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : (answer || 'N/A');
//                 return escapeCSV(formattedAnswer);
//             }) || [];

//             return [...baseData, ...customData].join(",");
//         });

//         const csvContent = [fullHeaders.map(escapeCSV).join(","), ...rows].join("\n");
//         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//         const url = URL.createObjectURL(blob);
//         const link = document.createElement("a");
//         link.setAttribute("href", url);
//         link.setAttribute("download", `Roster_${event?.eventName?.replace(/\s+/g, '_')}_${urlSelectedDate === 'all' ? 'All_Dates' : urlSelectedDate}.csv`);
//         link.click();
//         toast.success("Roster exported to CSV successfully.");
//     };

//     if (ecosystemLoading || !event) {
//         return (
//             <div className="cdp-layout">
//                 <Sidebar role={user?.role} currentNav="ecosystem" onLogout={() => navigate('/login')} />
//                 <main className="cdp-main cdp-main--centered">
//                     {ecosystemLoading ? (
//                         <div className="cdp-loading-state">
//                             <Loader2 size={40} className="cdp-spinner" color="var(--mlab-blue)" />
//                             <span className="cdp-loading-state__label">Loading Event Data...</span>
//                         </div>
//                     ) : (
//                         <div style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                             <h2>Event Not Found</h2>
//                             <button className="mlab-btn mlab-btn--outline" onClick={() => navigate(-1)} style={{ marginTop: '1rem' }}>
//                                 Return to Ecosystem
//                             </button>
//                         </div>
//                     )}
//                 </main>
//             </div>
//         );
//     }

//     return (
//         <div className="cdp-layout">
//             <Sidebar role={user?.role} currentNav="ecosystem" setCurrentNav={nav => navigate(`/admin?tab=${nav}`)} onLogout={() => navigate('/login')} />

//             {selectedGuest && (
//                 <GuestDetailsModal
//                     guest={selectedGuest}
//                     crmProfile={crmProfiles[selectedGuest.guestEmail?.toLowerCase()]}
//                     event={event}
//                     onClose={() => setSelectedGuest(null)}
//                 />
//             )}

//             {showReportWizard && (
//                 <AIReportWizardModal
//                     event={event}
//                     checkins={checkins}
//                     crmProfiles={crmProfiles}
//                     onClose={() => setShowReportWizard(false)}
//                 />
//             )}

//             {showSyncModal && createPortal(
//                 <div className="lfm-overlay" onClick={() => setShowSyncModal(false)} style={{ zIndex: 9999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title"><UploadCloud size={16} /> Sync Attendance to Cohort</h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setShowSyncModal(false)}><X size={20} /></button>
//                         </div>
//                         <div className="lfm-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

//                             <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', display: 'flex', gap: '10px' }}>
//                                 <Info size={16} color="#0ea5e9" style={{ flexShrink: 0, marginTop: '2px' }} />
//                                 <div>
//                                     <h4 style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#0369a1' }}>Sync Summary</h4>
//                                     <p style={{ margin: 0, fontSize: '0.75rem', color: '#0c4a6e', lineHeight: 1.4 }}>
//                                         Pushing <strong>{filteredCheckins.length}</strong> guest records across <strong>{urlSelectedDate !== 'all' ? `1 day` : `${availableDates.length} day(s)`}</strong> to the selected cohort. Matched learners will receive "Present" status for this activity.
//                                     </p>
//                                 </div>
//                             </div>

//                             <div>
//                                 <label className="lfm-label">Target Cohort to Update</label>
//                                 <select
//                                     className="lfm-input"
//                                     value={syncCohortId}
//                                     onChange={(e) => setSyncCohortId(e.target.value)}
//                                     style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}
//                                 >
//                                     <option value="">-- Choose a Cohort --</option>
//                                     {cohorts.filter(c => !c.isArchived).map(c => (
//                                         <option key={c.id} value={c.id}>{c.name}</option>
//                                     ))}
//                                 </select>
//                             </div>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
//                                 <div>
//                                     <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
//                                         Custom Session Title
//                                     </label>
//                                     <input
//                                         type="text"
//                                         className="lfm-input"
//                                         placeholder="Enter the title for the register"
//                                         value={syncSessionTitle}
//                                         onChange={e => setSyncSessionTitle(e.target.value)}
//                                         maxLength={100}
//                                         style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}
//                                     />
//                                 </div>
//                                 <div>
//                                     <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
//                                         Session Description
//                                     </label>
//                                     <textarea
//                                         className="lfm-input"
//                                         placeholder="Enter a description for this session..."
//                                         rows={3}
//                                         value={syncSessionDescription}
//                                         onChange={e => setSyncSessionDescription(e.target.value)}
//                                         style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', resize: 'vertical' }}
//                                     />
//                                 </div>
//                             </div>

//                         </div>
//                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
//                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowSyncModal(false)} disabled={isSyncing}>Cancel</button>
//                             <button type="button" className="mlab-btn mlab-btn--primary" onClick={executeCohortSync} disabled={isSyncing || !syncCohortId}>
//                                 {isSyncing ? <><Loader2 size={16} className="spin" /> Executing Sync...</> : <><Send size={14} /> Push to Cohort Register</>}
//                             </button>
//                         </div>
//                     </div>
//                 </div>,
//                 document.body
//             )}

//             <main className="cdp-main">
//                 <header className="cdp-header">
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={() => navigate(-1)}>
//                             <ChevronLeft size={14} /> Back to Ecosystem
//                         </button>
//                         <div className="cdp-header__eyebrow">
//                             <Calendar size={12} /> Event Overview
//                         </div>
//                         <h1 className="cdp-header__title">{event.eventName}</h1>
//                         <p className="cdp-header__sub">
//                             <Globe size={12} className="cdp-header__sub-icon" /> {event.location.split(',')[0]}
//                             <span className="cdp-header__status cdp-header__status--active" style={{ marginLeft: '8px' }}>
//                                 Roster Management
//                             </span>
//                         </p>
//                     </div>
//                     <div className="cdp-header__right">
//                         <div className="cdp-header__actions">

//                             {/* 🚀 NEW AI REPORT GENERATOR BUTTON */}
//                             <button className="cdp-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={() => setShowReportWizard(true)}>
//                                 <Sparkles size={13} fill="white" /> Generate AI Report
//                             </button>

//                             <button className="cdp-btn" style={{ background: '#f8fafc', color: 'var(--mlab-blue)', border: '1px solid #cbd5e1' }} onClick={handleOpenSyncModal}>
//                                 <UploadCloud size={13} /> Sync to Cohort
//                             </button>
//                             <button className="cdp-btn cdp-btn--outline" onClick={exportToCSV}>
//                                 <DownloadCloud size={13} /> Export Roster
//                             </button>
//                             <button className="cdp-btn cdp-btn--sky" onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}>
//                                 <QrCode size={13} /> Open TV Kiosk
//                             </button>
//                         </div>
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="cdp-content">
//                     <div className="cdp-stat-row">
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Users size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{displayCount}</span>
//                                 <span className="cdp-stat-card__label">{displayLabel}</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--green">
//                             <div className="cdp-stat-card__icon"><Calendar size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{urlSelectedDate === 'all' ? availableDates.length || 1 : 1}</span>
//                                 <span className="cdp-stat-card__label">{urlSelectedDate === 'all' ? 'Total Active Days' : 'Selected Day'}</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--amber">
//                             <div className="cdp-stat-card__icon"><Clock size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{displayPercent}%</span>
//                                 <span className="cdp-stat-card__label">Daily Capacity Usage</span>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
//                         <div className="vp-card" style={{ marginBottom: 0, minHeight: '650px', display: 'flex', flexDirection: 'column' }}>
//                             <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
//                                 <div className="vp-card-title-group" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                         <Users size={18} color="var(--mlab-blue)" />
//                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                             Event Check-ins ({filteredCheckins.length})
//                                         </h3>
//                                     </div>
//                                     {hasActiveFilters && (
//                                         <button
//                                             onClick={handleClearFilters}
//                                             className="mlab-btn mlab-btn--sm animate-fade-in"
//                                             style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
//                                         >
//                                             <FilterX size={14} /> Clear Filters
//                                         </button>
//                                     )}
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>
//                                     <div className="mlab-search" style={{ width: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <Search size={16} color="var(--mlab-grey)" />
//                                         <input
//                                             type="text"
//                                             placeholder="Search name or email..."
//                                             value={localSearchTerm}
//                                             onChange={(e) => setLocalSearchTerm(e.target.value)}
//                                             style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}
//                                         />
//                                     </div>

//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
//                                         <Filter size={14} color="var(--mlab-grey)" />
//                                         <select
//                                             className="lfm-select"
//                                             style={{ border: 'none', outline: 'none', background: 'transparent', padding: '2px', fontSize: '0.8rem' }}
//                                             value={urlSelectedDate}
//                                             onChange={(e) => updateUrlParams({ date: e.target.value })}
//                                         >
//                                             <option value="all">All Dates</option>
//                                             {availableDates.map(d => (
//                                                 <option key={d} value={d}>{moment(d).format('D MMM YYYY')}</option>
//                                             ))}
//                                         </select>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', width: '100%' }}>
//                                 <table className="mlab-table" style={{ width: '100%', minWidth: '1000px' }}>
//                                     <thead>
//                                         <tr>
//                                             <th>Attendee Info</th>
//                                             <th style={{ width: '160px' }}>Check-In Date</th>
//                                             {event.guestFormBlueprint?.slice(0, 2).map(f => (
//                                                 <th key={f.id}>{f.label}</th>
//                                             ))}
//                                             <th className="att-td--right" style={{ width: '130px' }}>Action</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {paginatedCheckins.length > 0 ? paginatedCheckins.map((c) => {
//                                             const safeTime = getSafeTime(c.timestamp);
//                                             const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};
//                                             const displayPhone = profile.phone || c.guestPhone;

//                                             return (
//                                                 <tr key={c.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>
//                                                     <td>
//                                                         <div className="cdp-learner-cell">
//                                                             <div className="cdp-learner-avatar" style={{ backgroundColor: 'var(--mlab-green)' }}>
//                                                                 {c.guestName?.charAt(0) || '?'}
//                                                             </div>
//                                                             <div className="cdp-learner-cell__info">
//                                                                 <span className="cdp-learner-cell__name">{c.guestName}</span>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
//                                                                     <Mail size={10} /> {c.guestEmail}
//                                                                 </div>
//                                                                 {displayPhone && (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
//                                                                         <Phone size={10} /> {displayPhone}
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     </td>
//                                                     <td>
//                                                         <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
//                                                             {moment(safeTime).format('D MMM YYYY')}
//                                                         </span>
//                                                         <div style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', marginTop: '4px', marginLeft: '4px' }}>
//                                                             {moment(safeTime).format('HH:mm')}
//                                                         </div>
//                                                     </td>

//                                                     {event.guestFormBlueprint?.slice(0, 2).map(f => {
//                                                         const val = c.responses?.[f.id];
//                                                         return (
//                                                             <td key={f.id} style={{ fontSize: '0.85rem', color: '#475569' }}>
//                                                                 {typeof val === 'boolean' ? (
//                                                                     val ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>
//                                                                 ) : (
//                                                                     <span style={{ maxWidth: '200px', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                                         {val || '—'}
//                                                                     </span>
//                                                                 )}
//                                                             </td>
//                                                         );
//                                                     })}

//                                                     <td className="att-td--right">
//                                                         <button
//                                                             className="cdp-btn cdp-btn--sky"
//                                                             onClick={() => setSelectedGuest(c)}
//                                                         >
//                                                             <Eye size={12} /> View Profile
//                                                         </button>
//                                                     </td>
//                                                 </tr>
//                                             );
//                                         }) : (
//                                             <tr>
//                                                 <td colSpan={4 + Math.min(event.guestFormBlueprint?.length || 0, 2)} style={{ padding: '4rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                     <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
//                                                     <p style={{ margin: 0, fontWeight: 500 }}>No attendees match your current filters.</p>
//                                                 </td>
//                                             </tr>
//                                         )}
//                                     </tbody>
//                                 </table>
//                             </div>

//                             {totalPages > 1 && (
//                                 <div style={{
//                                     display: 'flex', justifyContent: 'space-between', alignItems: 'center',
//                                     padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)',
//                                     marginTop: 'auto'
//                                 }}>
//                                     <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
//                                         Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredCheckins.length)}</strong> of <strong>{filteredCheckins.length}</strong> attendees
//                                     </div>
//                                     <div style={{ display: 'flex', gap: '8px' }}>
//                                         <button
//                                             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                                             disabled={currentPage === 1}
//                                             className="wm-btn wm-btn--ghost"
//                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1 }}
//                                         >
//                                             <ChevronLeft size={14} /> Previous
//                                         </button>
//                                         <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
//                                             Page {currentPage} of {totalPages}
//                                         </div>
//                                         <button
//                                             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                                             disabled={currentPage === totalPages}
//                                             className="wm-btn wm-btn--ghost"
//                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1 }}
//                                         >
//                                             Next <ChevronRight size={14} />
//                                         </button>
//                                     </div>
//                                 </div>
//                             )}

//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };




// // import React, { useEffect, useState, useMemo, useCallback } from 'react';

// // import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

// // import { createPortal } from 'react-dom';

// // import {

// //     Calendar, Users,

// //     Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,

// //     ChevronLeft,

// //     Globe,

// //     DownloadCloud,

// //     Loader2,

// //     UploadCloud, Send, FilterX, ChevronRight,

// //     Info

// // } from 'lucide-react';

// // import { useToast } from '../../../components/common/Toast/Toast';

// // import { useStore } from '../../../store/useStore';

// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';

// // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';

// // import moment from 'moment';

// // import { writeBatch, doc } from 'firebase/firestore';

// // import { db } from '../../../lib/firebase';



// // import type { EcosystemEvent } from '../../../types/ecosystem.types';



// // import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // import '../../../pages/CohortDetails/CohortDetailsPage.css';



// // // ─── GUEST DETAILS MODAL ──────────────────────────────────────────────────

// // const GuestDetailsModal: React.FC<{ guest: any, crmProfile: any, event: EcosystemEvent, onClose: () => void }> = ({ guest, crmProfile, event, onClose }) => {

// //     if (!guest) return null;



// //     const safeTime = guest.timestamp?.toDate ? guest.timestamp.toDate() : guest.timestamp;



// //     // Merge data from the check-in ping and the rich CRM profile

// //     const phone = crmProfile?.phone || guest.guestPhone || '—';

// //     const idNumber = crmProfile?.idNumber || guest.guestIdNumber || 'Not provided';

// //     const gender = crmProfile?.gender || '—';

// //     const age = crmProfile?.age ? `${crmProfile.age} years old` : '—';

// //     const isYouth = crmProfile?.isYouth;



// //     // ─── COMPLIANCE FLAGS (Mapped directly from App Payload) ───

// //     const rawPopia = crmProfile?.popiaConsent ?? guest.popiaConsent;

// //     const popiaDate = crmProfile?.popiaConsentDate;



// //     // Formatting the POPIA string to include the timestamp if it exists

// //     const popiaDisplay = rawPopia

// //         ? `Yes${popiaDate ? ` (Signed ${moment(popiaDate).format('D MMM YYYY')})` : ''}`

// //         : '—';



// //     const rawMarketing = crmProfile?.marketingOptIn ?? guest.marketingOptIn;

// //     const marketingDisplay = rawMarketing === true ? 'Yes (Opted In)' : (rawMarketing === false ? 'No' : '—');



// //     return createPortal(

// //         <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>

// //             <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>



// //                 <div className="lfm-header">

// //                     <h2 className="lfm-header__title"><Users size={16} /> Guest Profile</h2>

// //                     <button className="lfm-close-btn" type="button" onClick={onClose}><X size={20} /></button>

// //                 </div>



// //                 <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>



// //                     {/* Header Banner */}

// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>

// //                         <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700 }}>

// //                             {guest.guestName?.charAt(0) || '?'}

// //                         </div>

// //                         <div style={{ flex: 1 }}>

// //                             <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.25rem', fontWeight: 700 }}>{guest.guestName}</h3>

// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>

// //                                 <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.65rem' }}>

// //                                     Verified Attendance

// //                                 </span>

// //                                 {isYouth && (

// //                                     <span style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>

// //                                         Youth (18-35)

// //                                     </span>

// //                                 )}

// //                             </div>

// //                         </div>

// //                     </div>



// //                     {/* Core Contact Info */}

// //                     <div className="lfm-section-hdr"><ShieldCheck size={13} /> Contact & Demographic Details</div>

// //                     <div className="lfm-grid" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>

// //                         <div className="lfm-fg">

// //                             <label>Email Address</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{guest.guestEmail || '—'}</div>

// //                         </div>

// //                         <div className="lfm-fg">

// //                             <label>Mobile Number</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{phone}</div>

// //                         </div>



// //                         <div className="lfm-fg lfm-fg--full">

// //                             <label>ID / Passport Number</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{idNumber}</div>

// //                         </div>



// //                         <div className="lfm-fg">

// //                             <label>Gender</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{gender}</div>

// //                         </div>

// //                         <div className="lfm-fg">

// //                             <label>Age</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{age}</div>

// //                         </div>



// //                         <div className="lfm-fg">

// //                             <label>POPIA Consent</label>

// //                             <div style={{ fontSize: '0.9rem', color: rawPopia ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600 }}>

// //                                 {popiaDisplay}

// //                             </div>

// //                         </div>

// //                         <div className="lfm-fg">

// //                             <label>Marketing Opt-In</label>

// //                             <div style={{ fontSize: '0.9rem', color: rawMarketing ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)', fontWeight: 600 }}>

// //                                 {marketingDisplay}

// //                             </div>

// //                         </div>



// //                         <div className="lfm-fg lfm-fg--full" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '4px' }}>

// //                             <label>Event Check-in Time</label>

// //                             <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{moment(safeTime).format('D MMM YYYY, HH:mm')}</div>

// //                         </div>

// //                     </div>



// //                     {/* Dynamic Event Questions */}

// //                     {event.guestFormBlueprint && event.guestFormBlueprint.length > 0 && (

// //                         <>

// //                             <div className="lfm-section-hdr"><Filter size={13} /> Custom Event Responses</div>

// //                             <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px dashed #0ea5e9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

// //                                 {event.guestFormBlueprint.map(field => {

// //                                     const rawVal = guest.responses?.[field.id];

// //                                     const displayVal = typeof rawVal === 'boolean'

// //                                         ? (rawVal ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>)

// //                                         : (rawVal || <span style={{ color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Skipped</span>);



// //                                     return (

// //                                         <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #bae6fd', paddingBottom: '0.5rem' }}>

// //                                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>

// //                                                 {field.label}

// //                                             </span>

// //                                             <span style={{ fontSize: '0.95rem', color: 'var(--mlab-midnight)' }}>

// //                                                 {displayVal}

// //                                             </span>

// //                                         </div>

// //                                     );

// //                                 })}

// //                             </div>

// //                         </>

// //                     )}



// //                 </div>



// //                 <div className="lfm-footer">

// //                     <button type="button" className="lfm-btn lfm-btn--primary" onClick={onClose}>Close Profile</button>

// //                 </div>



// //             </div>

// //         </div>,

// //         document.body

// //     );

// // };





// // // ─── MAIN COMPONENT: EVENT DETAILS & SYNC ENGINE ───────────────────────────

// // export const EventDetailsPage: React.FC = () => {

// //     const { eventId } = useParams<{ eventId: string }>();

// //     const navigate = useNavigate();

// //     const [searchParams, setSearchParams] = useSearchParams();

// //     const toast = useToast();



// //     // 🚀 Connect to Global Store

// //     const {

// //         user, events, checkins: allCheckins, guests, ecosystemLoading,

// //         fetchEcosystemData, cohorts, learners, enrollments,

// //         fetchCohorts, fetchLearners, fetchEnrollments

// //     } = useStore();



// //     const [selectedGuest, setSelectedGuest] = useState<any | null>(null);



// //     // ─── URL-BOUND FILTERS & PAGINATION ───

// //     const urlSearchTerm = searchParams.get('search') || '';

// //     const urlSelectedDate = searchParams.get('date') || 'all';



// //     const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);

// //     const [currentPage, setCurrentPage] = useState(1);

// //     const ITEMS_PER_PAGE = 50;



// //     // ─── SYNC ENGINE STATES ───

// //     const [showSyncModal, setShowSyncModal] = useState(false);

// //     const [syncCohortId, setSyncCohortId] = useState('');

// //     const [syncSessionTitle, setSyncSessionTitle] = useState('');

// //     const [syncSessionDescription, setSyncSessionDescription] = useState('');

// //     const [isSyncing, setIsSyncing] = useState(false);



// //     // 🚀 Fetch EVERYTHING on load if missing

// //     useEffect(() => {

// //         if (fetchEcosystemData) fetchEcosystemData();

// //         if (fetchCohorts && cohorts.length === 0) fetchCohorts();

// //         if (fetchLearners && learners.length === 0) fetchLearners();

// //         if (fetchEnrollments && enrollments.length === 0) fetchEnrollments();

// //     }, [fetchEcosystemData, fetchCohorts, fetchLearners, fetchEnrollments]);



// //     // Debounce search to prevent lag

// //     useEffect(() => {

// //         const handler = setTimeout(() => {

// //             updateUrlParams({ search: localSearchTerm || null });

// //         }, 400);

// //         return () => clearTimeout(handler);

// //     }, [localSearchTerm]);



// //     // Keep local search synced if URL changes externally

// //     useEffect(() => {

// //         setLocalSearchTerm(urlSearchTerm);

// //     }, [urlSearchTerm]);



// //     // Reset pagination to page 1 whenever any filter changes

// //     useEffect(() => {

// //         setCurrentPage(1);

// //     }, [urlSearchTerm, urlSelectedDate]);



// //     const updateUrlParams = useCallback((updates: Record<string, string | null>) => {

// //         setSearchParams(prev => {

// //             const newParams = new URLSearchParams(prev);

// //             Object.entries(updates).forEach(([key, value]) => {

// //                 if (value === null || value === '' || value === 'all') {

// //                     newParams.delete(key);

// //                 } else {

// //                     newParams.set(key, String(value));

// //                 }

// //             });

// //             return newParams;

// //         }, { replace: true });

// //     }, [setSearchParams]);



// //     const handleClearFilters = () => {

// //         setLocalSearchTerm('');

// //         setSearchParams(new URLSearchParams(), { replace: true });

// //     };



// //     const hasActiveFilters = Boolean(urlSearchTerm || urlSelectedDate !== 'all');



// //     // ─── DATA PROCESSING FROM GLOBAL STORE ───────────────────────────────────



// //     const event = useMemo(() => events.find(e => e.id === eventId) as EcosystemEvent | undefined, [events, eventId]);

// //     const checkins = useMemo(() => allCheckins.filter(c => c.eventId === eventId), [allCheckins, eventId]);



// //     const crmProfiles = useMemo(() => {

// //         const profiles: Record<string, any> = {};

// //         guests.forEach(g => {

// //             profiles[g.email.toLowerCase()] = g;

// //         });

// //         return profiles;

// //     }, [guests]);



// //     const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : ts;



// //     const availableDates = useMemo(() => {

// //         const dates = checkins.map(c => moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD'));

// //         return Array.from(new Set(dates)).sort();

// //     }, [checkins]);



// //     const filteredCheckins = useMemo(() => {

// //         return checkins.filter(c => {

// //             const matchesSearch =

// //                 c.guestName?.toLowerCase().includes(urlSearchTerm.toLowerCase()) ||

// //                 c.guestEmail?.toLowerCase().includes(urlSearchTerm.toLowerCase());



// //             const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');

// //             const matchesDate = urlSelectedDate === 'all' || checkinDate === urlSelectedDate;



// //             return matchesSearch && matchesDate;

// //         });

// //     }, [checkins, urlSearchTerm, urlSelectedDate]);



// //     // Pagination Slicer

// //     const totalPages = Math.ceil(filteredCheckins.length / ITEMS_PER_PAGE);

// //     const paginatedCheckins = filteredCheckins.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);



// //     const { displayCount, displayLabel, displayPercent } = useMemo(() => {

// //         if (!event?.maxCapacity || event.maxCapacity <= 0) {

// //             return { displayCount: filteredCheckins.length, displayLabel: "Total Attendees", displayPercent: 0 };

// //         }



// //         if (urlSelectedDate !== 'all') {

// //             const percent = Math.round((filteredCheckins.length / event.maxCapacity) * 100);

// //             return {

// //                 displayCount: filteredCheckins.length,

// //                 displayLabel: `Attendees on ${moment(urlSelectedDate).format('D MMM')}`,

// //                 displayPercent: percent

// //             };

// //         } else {

// //             const activeDaysCount = availableDates.length || 1;

// //             const avgDailyAttendees = Math.round(checkins.length / activeDaysCount);

// //             const avgPercent = Math.round((avgDailyAttendees / event.maxCapacity) * 100);



// //             return {

// //                 displayCount: avgDailyAttendees,

// //                 displayLabel: "Avg Daily Attendees",

// //                 displayPercent: avgPercent

// //             };

// //         }

// //     }, [checkins, filteredCheckins, event?.maxCapacity, urlSelectedDate, availableDates]);



// //     // ─── 🚀 OPEN SYNC MODAL & PRE-FILL INPUTS ───

// //     const handleOpenSyncModal = () => {

// //         setSyncSessionTitle(event?.eventName || '');

// //         setSyncSessionDescription('Automatically synced from Ecosystem Kiosk Check-ins.');

// //         setShowSyncModal(true);

// //     };



// //     // ─── 🚀 SYNC ATTENDANCE TO COHORT ENGINE ───

// //     const executeCohortSync = async () => {

// //         if (!syncCohortId) return toast.error("Please select a target cohort from the dropdown.");

// //         setIsSyncing(true);



// //         try {

// //             const batch = writeBatch(db);



// //             // 1. Identify which learners belong to the selected cohort

// //             const cohortEnrollments = enrollments.filter(e => e.cohortId === syncCohortId);

// //             const cohortLearnerIds = cohortEnrollments.map(e => e.learnerId);

// //             const cohortLearners = learners.filter(l => cohortLearnerIds.includes(l.id) || l.cohortId === syncCohortId);



// //             if (cohortLearners.length === 0) {

// //                 setIsSyncing(false);

// //                 return toast.error("This cohort currently has no active learners to sync.");

// //             }



// //             // 2. Group all checkins strictly by the date they actually occurred

// //             const checkinsByDate: Record<string, any[]> = {};



// //             // Only sync the records matching the current UI filters (selectedDate / search)

// //             filteredCheckins.forEach(c => {

// //                 const email = String(c.guestEmail || '').toLowerCase().trim();

// //                 if (!email) return;



// //                 const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');



// //                 if (!checkinsByDate[checkinDate]) {

// //                     checkinsByDate[checkinDate] = [];

// //                 }

// //                 checkinsByDate[checkinDate].push(c);

// //             });



// //             const uniqueDates = Object.keys(checkinsByDate).sort();

// //             if (uniqueDates.length === 0) {

// //                 setIsSyncing(false);

// //                 return toast.error("No valid check-in dates found to sync.");

// //             }



// //             let totalPresentCount = 0;



// //             // 3. Loop through every distinct day an event check-in occurred

// //             uniqueDates.forEach(syncDate => {

// //                 const dayCheckins = checkinsByDate[syncDate];

// //                 const attendedEmails = new Set(dayCheckins.map(c => String(c.guestEmail || '').toLowerCase().trim()));



// //                 let dailyPresentCount = 0;



// //                 // 🚀 GENERATE SYNTHETIC RAW ZOOM DATA FOR BOOTCAMP ANALYTICS

// //                 const syntheticRawZoomData: any[] = [];



// //                 // Evaluate each learner for this specific day

// //                 cohortLearners.forEach(learner => {

// //                     const email = String(learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase().trim();

// //                     const isPresent = attendedEmails.has(email);



// //                     if (isPresent) {

// //                         dailyPresentCount++;

// //                         totalPresentCount++;



// //                         // Push into the synthetic array so the Bootcamp Dashboard calculates total minutes perfectly

// //                         syntheticRawZoomData.push({

// //                             name: learner.fullName || crmProfiles[email]?.guestName || "Unknown Guest",

// //                             email: email,

// //                             duration: 120, // Assign standard 2-hour duration for events

// //                             sessions: [{

// //                                 duration: 120,

// //                                 tabName: syncDate.replace(/-/g, '_')

// //                             }]

// //                         });

// //                     }



// //                     const recId = `${syncCohortId}_${syncDate}_${learner.id}`;

// //                     const recRef = doc(db, 'attendance_records', recId);



// //                     batch.set(recRef, {

// //                         cohortId: syncCohortId,

// //                         learnerId: learner.id,

// //                         sessionDate: syncDate,

// //                         status: isPresent ? 'Present' : 'Absent',

// //                         actualDuration: isPresent ? 120 : 0,

// //                         updatedAt: new Date().toISOString(),

// //                         source: 'ecosystem_sync',

// //                         eventId: event?.id

// //                     }, { merge: true });

// //                 });



// //                 // Create the Master Attendance Log for this specific day

// //                 const logId = `${syncCohortId}_${syncDate}_ecosystem_${event?.id}`;

// //                 const logRef = doc(db, 'attendance_logs', logId);



// //                 // Smart Titling: Just use the input title and append (Day X) if multi-day

// //                 const dayLabel = uniqueDates.length > 1 ? ` (Day ${uniqueDates.indexOf(syncDate) + 1})` : '';

// //                 const baseTitle = syncSessionTitle.trim() || event?.eventName || 'Ecosystem Event';

// //                 const finalTitle = `${baseTitle}${dayLabel}`.trim();



// //                 const finalDesc = syncSessionDescription.trim() || (uniqueDates.length > 1

// //                     ? `Day ${uniqueDates.indexOf(syncDate) + 1} automatically synced from Ecosystem Kiosk Check-ins.`

// //                     : 'Automatically synced from Ecosystem Kiosk Check-ins.');



// //                 batch.set(logRef, {

// //                     cohortId: syncCohortId,

// //                     sessionDate: `${syncDate}T00:00:00.000Z`,

// //                     sessionTitle: finalTitle,

// //                     sessionDescription: finalDesc,

// //                     expectedDuration: 120, // Standard 2-hour value

// //                     totalEnrolled: cohortLearners.length,

// //                     totalPresent: dailyPresentCount,

// //                     totalAbsent: cohortLearners.length - dailyPresentCount,

// //                     totalPartial: 0,

// //                     createdAt: new Date().toISOString(),

// //                     isBootcamp: true, // Native Bootcamp tracking format

// //                     importVersion: 1,

// //                     isEcosystem: true, // 🚀 ECOSYSTEM BADGE FLAG

// //                     sourceEventId: event?.id,

// //                     rawZoomData: syntheticRawZoomData, // 🚀 INJECTS THE ATTENDANCE INTO THE DASHBOARD ENGINE

// //                     totalDaySessions: 1

// //                 }, { merge: true });

// //             });



// //             // 4. Commit to Firestore

// //             await batch.commit();



// //             toast.success(`Successfully synced! Recorded ${totalPresentCount} presences across ${uniqueDates.length} day(s).`);

// //             setShowSyncModal(false);

// //             setSyncCohortId('');

// //             setSyncSessionTitle('');

// //             setSyncSessionDescription('');

// //         } catch (error) {

// //             console.error("Sync Error:", error);

// //             toast.error("Failed to map ecosystem records to the cohort.");

// //         } finally {

// //             setIsSyncing(false);

// //         }

// //     };



// //     // ─── CSV EXPORT ──────────────────────────────────────────────────────────

// //     const exportToCSV = () => {

// //         if (filteredCheckins.length === 0) {

// //             toast.error("No records to export.");

// //             return;

// //         }



// //         const escapeCSV = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;



// //         const headers = [

// //             "Guest Name",

// //             "Email",

// //             "Mobile Number",

// //             "ID/Passport Number",

// //             "Gender",

// //             "Age",

// //             "Is Youth (18-35)",

// //             "POPIA Consent",

// //             "Marketing Opt-In",

// //             "Check-in Time",

// //             "Date"

// //         ];



// //         const customFieldKeys = event?.guestFormBlueprint?.map(f => f.label) || [];

// //         const fullHeaders = [...headers, ...customFieldKeys];



// //         const rows = filteredCheckins.map(c => {

// //             const safeTime = getSafeTime(c.timestamp);

// //             const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};



// //             const baseData = [

// //                 escapeCSV(c.guestName),

// //                 escapeCSV(c.guestEmail),

// //                 escapeCSV(profile.phone || c.guestPhone || 'N/A'),

// //                 escapeCSV(profile.idNumber || c.guestIdNumber || 'N/A'),

// //                 escapeCSV(profile.gender || 'N/A'),

// //                 escapeCSV(profile.age ? String(profile.age) : 'N/A'),

// //                 escapeCSV(profile.isYouth ? 'Yes' : 'No'),

// //                 escapeCSV(profile.popiaConsent ? 'Yes' : 'No'),

// //                 escapeCSV(profile.marketingOptIn ? 'Yes' : 'No'),

// //                 escapeCSV(moment(safeTime).format('HH:mm:ss')),

// //                 escapeCSV(moment(safeTime).format('YYYY-MM-DD'))

// //             ];



// //             const customData = event?.guestFormBlueprint?.map(f => {

// //                 const answer = c.responses?.[f.id];

// //                 const formattedAnswer = typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : (answer || 'N/A');

// //                 return escapeCSV(formattedAnswer);

// //             }) || [];



// //             return [...baseData, ...customData].join(",");

// //         });



// //         const csvContent = [fullHeaders.map(escapeCSV).join(","), ...rows].join("\n");

// //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

// //         const url = URL.createObjectURL(blob);

// //         const link = document.createElement("a");

// //         link.setAttribute("href", url);

// //         link.setAttribute("download", `Roster_${event?.eventName?.replace(/\s+/g, '_')}_${urlSelectedDate === 'all' ? 'All_Dates' : urlSelectedDate}.csv`);

// //         link.click();

// //         toast.success("Roster exported to CSV successfully.");

// //     };



// //     if (ecosystemLoading || !event) {

// //         return (

// //             <div className="cdp-layout">

// //                 <Sidebar role={user?.role} currentNav="ecosystem" onLogout={() => navigate('/login')} />

// //                 <main className="cdp-main cdp-main--centered">

// //                     {ecosystemLoading ? (

// //                         <div className="cdp-loading-state">

// //                             <Loader2 size={40} className="cdp-spinner" color="var(--mlab-blue)" />

// //                             <span className="cdp-loading-state__label">Loading Event Data...</span>

// //                         </div>

// //                     ) : (

// //                         <div style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>

// //                             <h2>Event Not Found</h2>

// //                             <button className="mlab-btn mlab-btn--outline" onClick={() => navigate(-1)} style={{ marginTop: '1rem' }}>

// //                                 Return to Ecosystem

// //                             </button>

// //                         </div>

// //                     )}

// //                 </main>

// //             </div>

// //         );

// //     }



// //     return (

// //         <div className="cdp-layout">

// //             <Sidebar role={user?.role} currentNav="ecosystem" setCurrentNav={nav => navigate(`/admin?tab=${nav}`)} onLogout={() => navigate('/login')} />



// //             {selectedGuest && (

// //                 <GuestDetailsModal

// //                     guest={selectedGuest}

// //                     crmProfile={crmProfiles[selectedGuest.guestEmail?.toLowerCase()]}

// //                     event={event}

// //                     onClose={() => setSelectedGuest(null)}

// //                 />

// //             )}



// //             {/* 🚀 UPGRADED SYNC MODAL */}

// //             {showSyncModal && createPortal(

// //                 <div className="lfm-overlay" onClick={() => setShowSyncModal(false)} style={{ zIndex: 9999 }}>

// //                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>

// //                         <div className="lfm-header">

// //                             <h2 className="lfm-header__title"><UploadCloud size={16} /> Sync Attendance to Cohort</h2>

// //                             <button className="lfm-close-btn" type="button" onClick={() => setShowSyncModal(false)}><X size={20} /></button>

// //                         </div>

// //                         <div className="lfm-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>



// //                             <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', display: 'flex', gap: '10px' }}>

// //                                 <Info size={16} color="#0ea5e9" style={{ flexShrink: 0, marginTop: '2px' }} />

// //                                 <div>

// //                                     <h4 style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#0369a1' }}>Sync Summary</h4>

// //                                     <p style={{ margin: 0, fontSize: '0.75rem', color: '#0c4a6e', lineHeight: 1.4 }}>

// //                                         Pushing <strong>{filteredCheckins.length}</strong> guest records across <strong>{urlSelectedDate !== 'all' ? `1 day` : `${availableDates.length} day(s)`}</strong> to the selected cohort. Matched learners will receive "Present" status for this activity.

// //                                     </p>

// //                                 </div>

// //                             </div>



// //                             <div>

// //                                 <label className="lfm-label">Target Cohort to Update</label>

// //                                 <select

// //                                     className="lfm-input"

// //                                     value={syncCohortId}

// //                                     onChange={(e) => setSyncCohortId(e.target.value)}

// //                                     style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}

// //                                 >

// //                                     <option value="">-- Choose a Cohort --</option>

// //                                     {cohorts.filter(c => !c.isArchived).map(c => (

// //                                         <option key={c.id} value={c.id}>{c.name}</option>

// //                                     ))}

// //                                 </select>

// //                             </div>



// //                             {/* 🚀 CUSTOM TITLE & DESC FIELDS (Pre-filled) */}

// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>

// //                                 <div>

// //                                     <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>

// //                                         Custom Session Title

// //                                     </label>

// //                                     <input

// //                                         type="text"

// //                                         className="lfm-input"

// //                                         placeholder="Enter the title for the register"

// //                                         value={syncSessionTitle}

// //                                         onChange={e => setSyncSessionTitle(e.target.value)}

// //                                         maxLength={100}

// //                                         style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}

// //                                     />

// //                                 </div>

// //                                 <div>

// //                                     <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>

// //                                         Session Description

// //                                     </label>

// //                                     <textarea

// //                                         className="lfm-input"

// //                                         placeholder="Enter a description for this session..."

// //                                         rows={3}

// //                                         value={syncSessionDescription}

// //                                         onChange={e => setSyncSessionDescription(e.target.value)}

// //                                         style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', resize: 'vertical' }}

// //                                     />

// //                                 </div>

// //                             </div>



// //                         </div>

// //                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>

// //                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowSyncModal(false)} disabled={isSyncing}>Cancel</button>

// //                             <button type="button" className="mlab-btn mlab-btn--primary" onClick={executeCohortSync} disabled={isSyncing || !syncCohortId}>

// //                                 {isSyncing ? <><Loader2 size={16} className="spin" /> Executing Sync...</> : <><Send size={14} /> Push to Cohort Register</>}

// //                             </button>

// //                         </div>

// //                     </div>

// //                 </div>,

// //                 document.body

// //             )}



// //             <main className="cdp-main">

// //                 <header className="cdp-header">

// //                     <div className="cdp-header__left">

// //                         <button className="cdp-header__back" onClick={() => navigate(-1)}>

// //                             <ChevronLeft size={14} /> Back to Ecosystem

// //                         </button>

// //                         <div className="cdp-header__eyebrow">

// //                             <Calendar size={12} /> Event Overview

// //                         </div>

// //                         <h1 className="cdp-header__title">{event.eventName}</h1>

// //                         <p className="cdp-header__sub">

// //                             <Globe size={12} className="cdp-header__sub-icon" /> {event.location.split(',')[0]}

// //                             <span className="cdp-header__status cdp-header__status--active" style={{ marginLeft: '8px' }}>

// //                                 Roster Management

// //                             </span>

// //                         </p>

// //                     </div>

// //                     <div className="cdp-header__right">

// //                         <div className="cdp-header__actions">

// //                             {/* 🚀 UPDATED SYNC BUTTON */}

// //                             <button className="cdp-btn" style={{ background: '#f8fafc', color: 'var(--mlab-blue)', border: '1px solid #cbd5e1' }} onClick={handleOpenSyncModal}>

// //                                 <UploadCloud size={13} /> Sync to Cohort

// //                             </button>

// //                             <button className="cdp-btn cdp-btn--outline" onClick={exportToCSV}>

// //                                 <DownloadCloud size={13} /> Export Roster

// //                             </button>

// //                             <button className="cdp-btn cdp-btn--sky" onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}>

// //                                 <QrCode size={13} /> Open TV Kiosk

// //                             </button>

// //                         </div>

// //                         <NotificationBell />

// //                     </div>

// //                 </header>



// //                 <div className="cdp-content">

// //                     <div className="cdp-stat-row">

// //                         <div className="cdp-stat-card cdp-stat-card--blue">

// //                             <div className="cdp-stat-card__icon"><Users size={20} /></div>

// //                             <div className="cdp-stat-card__body">

// //                                 <span className="cdp-stat-card__value">{displayCount}</span>

// //                                 <span className="cdp-stat-card__label">{displayLabel}</span>

// //                             </div>

// //                         </div>

// //                         <div className="cdp-stat-card cdp-stat-card--green">

// //                             <div className="cdp-stat-card__icon"><Calendar size={20} /></div>

// //                             <div className="cdp-stat-card__body">

// //                                 <span className="cdp-stat-card__value">{urlSelectedDate === 'all' ? availableDates.length || 1 : 1}</span>

// //                                 <span className="cdp-stat-card__label">{urlSelectedDate === 'all' ? 'Total Active Days' : 'Selected Day'}</span>

// //                             </div>

// //                         </div>

// //                         <div className="cdp-stat-card cdp-stat-card--amber">

// //                             <div className="cdp-stat-card__icon"><Clock size={20} /></div>

// //                             <div className="cdp-stat-card__body">

// //                                 <span className="cdp-stat-card__value">{displayPercent}%</span>

// //                                 <span className="cdp-stat-card__label">Daily Capacity Usage</span>

// //                             </div>

// //                         </div>

// //                     </div>



// //                     <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>

// //                         <div className="vp-card" style={{ marginBottom: 0, minHeight: '650px', display: 'flex', flexDirection: 'column' }}>

// //                             <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>

// //                                 <div className="vp-card-title-group" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>

// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

// //                                         <Users size={18} color="var(--mlab-blue)" />

// //                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>

// //                                             Event Check-ins ({filteredCheckins.length})

// //                                         </h3>

// //                                     </div>

// //                                     {hasActiveFilters && (

// //                                         <button

// //                                             onClick={handleClearFilters}

// //                                             className="mlab-btn mlab-btn--sm animate-fade-in"

// //                                             style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}

// //                                         >

// //                                             <FilterX size={14} /> Clear Filters

// //                                         </button>

// //                                     )}

// //                                 </div>



// //                                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>

// //                                     <div className="mlab-search" style={{ width: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>

// //                                         <Search size={16} color="var(--mlab-grey)" />

// //                                         <input

// //                                             type="text"

// //                                             placeholder="Search name or email..."

// //                                             value={localSearchTerm}

// //                                             onChange={(e) => setLocalSearchTerm(e.target.value)}

// //                                             style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}

// //                                         />

// //                                     </div>



// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>

// //                                         <Filter size={14} color="var(--mlab-grey)" />

// //                                         <select

// //                                             className="lfm-select"

// //                                             style={{ border: 'none', outline: 'none', background: 'transparent', padding: '2px', fontSize: '0.8rem' }}

// //                                             value={urlSelectedDate}

// //                                             onChange={(e) => updateUrlParams({ date: e.target.value })}

// //                                         >

// //                                             <option value="all">All Dates</option>

// //                                             {availableDates.map(d => (

// //                                                 <option key={d} value={d}>{moment(d).format('D MMM YYYY')}</option>

// //                                             ))}

// //                                         </select>

// //                                     </div>

// //                                 </div>

// //                             </div>



// //                             {/* 🚀 FIXED TABLE WRAPPER (Scrollable & Responsive) */}

// //                             <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', width: '100%' }}>

// //                                 <table className="mlab-table" style={{ width: '100%', minWidth: '1000px' }}>

// //                                     <thead>

// //                                         <tr>

// //                                             <th>Attendee Info</th>

// //                                             <th style={{ width: '160px' }}>Check-In Date</th>

// //                                             {event.guestFormBlueprint?.slice(0, 2).map(f => (

// //                                                 <th key={f.id}>{f.label}</th>

// //                                             ))}

// //                                             <th className="att-td--right" style={{ width: '130px' }}>Action</th>

// //                                         </tr>

// //                                     </thead>

// //                                     <tbody>

// //                                         {paginatedCheckins.length > 0 ? paginatedCheckins.map((c) => {

// //                                             const safeTime = getSafeTime(c.timestamp);

// //                                             const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};

// //                                             const displayPhone = profile.phone || c.guestPhone;



// //                                             return (

// //                                                 <tr key={c.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>

// //                                                     <td>

// //                                                         <div className="cdp-learner-cell">

// //                                                             <div className="cdp-learner-avatar" style={{ backgroundColor: 'var(--mlab-green)' }}>

// //                                                                 {c.guestName?.charAt(0) || '?'}

// //                                                             </div>

// //                                                             <div className="cdp-learner-cell__info">

// //                                                                 <span className="cdp-learner-cell__name">{c.guestName}</span>

// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>

// //                                                                     <Mail size={10} /> {c.guestEmail}

// //                                                                 </div>

// //                                                                 {displayPhone && (

// //                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>

// //                                                                         <Phone size={10} /> {displayPhone}

// //                                                                     </div>

// //                                                                 )}

// //                                                             </div>

// //                                                         </div>

// //                                                     </td>

// //                                                     <td>

// //                                                         <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal' }}>

// //                                                             {moment(safeTime).format('D MMM YYYY')}

// //                                                         </span>

// //                                                         <div style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', marginTop: '4px', marginLeft: '4px' }}>

// //                                                             {moment(safeTime).format('HH:mm')}

// //                                                         </div>

// //                                                     </td>



// //                                                     {event.guestFormBlueprint?.slice(0, 2).map(f => {

// //                                                         const val = c.responses?.[f.id];

// //                                                         return (

// //                                                             <td key={f.id} style={{ fontSize: '0.85rem', color: '#475569' }}>

// //                                                                 {typeof val === 'boolean' ? (

// //                                                                     val ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>

// //                                                                 ) : (

// //                                                                     <span style={{ maxWidth: '200px', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>

// //                                                                         {val || '—'}

// //                                                                     </span>

// //                                                                 )}

// //                                                             </td>

// //                                                         );

// //                                                     })}



// //                                                     <td className="att-td--right">

// //                                                         <button

// //                                                             className="cdp-btn cdp-btn--sky"

// //                                                             onClick={() => setSelectedGuest(c)}

// //                                                         >

// //                                                             <Eye size={12} /> View Profile

// //                                                         </button>

// //                                                     </td>

// //                                                 </tr>

// //                                             );

// //                                         }) : (

// //                                             <tr>

// //                                                 <td colSpan={4 + Math.min(event.guestFormBlueprint?.length || 0, 2)} style={{ padding: '4rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>

// //                                                     <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />

// //                                                     <p style={{ margin: 0, fontWeight: 500 }}>No attendees match your current filters.</p>

// //                                                 </td>

// //                                             </tr>

// //                                         )}

// //                                     </tbody>

// //                                 </table>

// //                             </div>



// //                             {/* PAGINATION FOOTER */}

// //                             {totalPages > 1 && (

// //                                 <div style={{

// //                                     display: 'flex', justifyContent: 'space-between', alignItems: 'center',

// //                                     padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)',

// //                                     marginTop: 'auto'

// //                                 }}>

// //                                     <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>

// //                                         Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredCheckins.length)}</strong> of <strong>{filteredCheckins.length}</strong> attendees

// //                                     </div>

// //                                     <div style={{ display: 'flex', gap: '8px' }}>

// //                                         <button

// //                                             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}

// //                                             disabled={currentPage === 1}

// //                                             className="wm-btn wm-btn--ghost"

// //                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1 }}

// //                                         >

// //                                             <ChevronLeft size={14} /> Previous

// //                                         </button>

// //                                         <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>

// //                                             Page {currentPage} of {totalPages}

// //                                         </div>

// //                                         <button

// //                                             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}

// //                                             disabled={currentPage === totalPages}

// //                                             className="wm-btn wm-btn--ghost"

// //                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1 }}

// //                                         >

// //                                             Next <ChevronRight size={14} />

// //                                         </button>

// //                                     </div>

// //                                 </div>

// //                             )}



// //                         </div>

// //                     </div>

// //                 </div>

// //             </main>

// //         </div>

// //     );

// // };
