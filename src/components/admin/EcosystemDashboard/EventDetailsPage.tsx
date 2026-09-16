import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Calendar, Users, Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,
    ChevronLeft, Globe, DownloadCloud, Loader2, UploadCloud, Send, FilterX, ChevronRight,
    Info, Sparkles, FileText
} from 'lucide-react';
import moment from 'moment';

// ─── FIREBASE IMPORTS ───
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

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

// ─── GUEST DETAILS MODAL ──────────────────────────────────────────────────
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
    const [syncMode, setSyncMode] = useState<'all_detected' | 'custom'>('all_detected');
    const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>([]);
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

    useEffect(() => {
        setLocalSearchTerm(urlSearchTerm);
    }, [urlSearchTerm]);

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

            const guestRef = doc(db, 'ecosystem_guests', normalizedEmail);
            batch.set(guestRef, {
                guestName: data.guestName,
                phone: data.phone,
                idNumber: data.idNumber,
                gender: data.gender,
                age: Number(data.age) || null,
                isYouth: data.isYouth,
                updatedAt: new Date().toISOString()
            }, { merge: true });

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

    // 🚀 AUTO-DETECT COHORTS THAT HAVE ATTENDING LEARNERS IN THIS EVENT
    const detectedCohortStats = useMemo(() => {
        const checkedInEmails = new Set(filteredCheckins.map(c => String(c.guestEmail || '').toLowerCase().trim()));
        const cohortMap = new Map<string, { cohort: any; count: number; learnerIds: Set<string> }>();

        learners.forEach(learner => {
            const email = String(learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase().trim();
            if (email && checkedInEmails.has(email)) {
                const cId = learner.cohortId;
                if (cId) {
                    const matchedCohort = cohorts.find(c => c.id === cId);
                    if (matchedCohort && !matchedCohort.isArchived) {
                        if (!cohortMap.has(cId)) {
                            cohortMap.set(cId, { cohort: matchedCohort, count: 0, learnerIds: new Set() });
                        }
                        const entry = cohortMap.get(cId)!;
                        if (!entry.learnerIds.has(learner.id)) {
                            entry.learnerIds.add(learner.id);
                            entry.count++;
                        }
                    }
                }
            }
        });

        return Array.from(cohortMap.values());
    }, [filteredCheckins, learners, cohorts]);

    // ─── 🚀 OPEN SYNC MODAL & PRE-SELECT ALL DETECTED COHORTS ───
    const handleOpenSyncModal = () => {
        setSyncSessionTitle(event?.eventName || '');
        setSyncSessionDescription('Automatically synced from Ecosystem Workshop Check-ins.');
        setSyncMode('all_detected');

        // Pre-select all auto-detected cohorts
        const autoDetectedIds = detectedCohortStats.map(d => d.cohort.id);
        setSelectedCohortIds(autoDetectedIds);
        setShowSyncModal(true);
    };

    const toggleCohortSelection = (cohortId: string) => {
        setSelectedCohortIds(prev =>
            prev.includes(cohortId) ? prev.filter(id => id !== cohortId) : [...prev, cohortId]
        );
    };

    // ─── 🚀 MULTI-COHORT DUAL-WRITE SYNC ENGINE (8 HOURS CREDIT + METADATA) ───
    const executeCohortSync = async () => {
        const targetCohortList = syncMode === 'all_detected'
            ? detectedCohortStats.map(d => d.cohort.id)
            : selectedCohortIds;

        if (targetCohortList.length === 0) return toast.error("Please select at least one target cohort to sync.");
        setIsSyncing(true);

        try {
            const batch = writeBatch(db);
            const EIGHT_HOURS_MINUTES = 480; // Standard 8 Hours

            // 1. Group checkins strictly by event date
            const checkinsByDate: Record<string, any[]> = {};
            filteredCheckins.forEach(c => {
                const email = String(c.guestEmail || '').toLowerCase().trim();
                if (!email) return;

                const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');
                if (!checkinsByDate[checkinDate]) checkinsByDate[checkinDate] = [];
                checkinsByDate[checkinDate].push(c);
            });

            const uniqueDates = Object.keys(checkinsByDate).sort();
            if (uniqueDates.length === 0) {
                setIsSyncing(false);
                return toast.error("No valid check-in dates found to sync.");
            }

            let grandTotalPresencesSynced = 0;

            // 2. Iterate through EVERY target cohort
            targetCohortList.forEach(targetCohortId => {
                const cohortEnrollments = enrollments.filter(e => e.cohortId === targetCohortId);
                const cohortLearnerIds = cohortEnrollments.map(e => e.learnerId);
                const cohortLearners = learners.filter(l => cohortLearnerIds.includes(l.id) || l.cohortId === targetCohortId);

                if (cohortLearners.length === 0) return;

                // 3. Process each distinct date for this cohort
                uniqueDates.forEach(syncDate => {
                    const dayCheckins = checkinsByDate[syncDate];
                    const attendedEmails = new Set(dayCheckins.map(c => String(c.guestEmail || '').toLowerCase().trim()));

                    let dailyPresentCount = 0;
                    const syntheticRawZoomData: any[] = [];

                    cohortLearners.forEach(learner => {
                        const email = String(learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase().trim();
                        const isPresent = attendedEmails.has(email);

                        if (isPresent) {
                            dailyPresentCount++;
                            grandTotalPresencesSynced++;

                            syntheticRawZoomData.push({
                                name: learner.fullName || crmProfiles[email]?.guestName || "Unknown Guest",
                                email: email,
                                duration: EIGHT_HOURS_MINUTES,
                                sessions: [{
                                    duration: EIGHT_HOURS_MINUTES,
                                    tabName: syncDate.replace(/-/g, '_')
                                }]
                            });

                            // ─── A. WRITE DIRECTLY TO DAILY COMPLIANCE LOGBOOK ('attendance') ───
                            // Full 8-hour credit + metadata payload for UI badges
                            const dailyLogbookRef = doc(db, 'attendance', `${targetCohortId}_${syncDate}_${learner.id}`);
                            batch.set(dailyLogbookRef, {
                                cohortId: targetCohortId,
                                learnerId: learner.id,
                                date: syncDate,
                                status: 'Present - Workshop',
                                hoursCredited: 8,
                                isEcosystemEvent: true,
                                eventDetails: {
                                    id: event?.id,
                                    title: event?.eventName || 'Curriculum Workshop',
                                    type: event?.eventType || 'Workshop',
                                    location: event?.location || 'Offsite / Hub',
                                    syncedAt: new Date().toISOString()
                                },
                                notes: `Event Credit (8h Full Day): ${event?.eventName || 'Workshop'}`,
                                syncedFromEventId: event?.id,
                                updatedAt: new Date().toISOString()
                            }, { merge: true });
                        }

                        // ─── B. WRITE TO SESSION RECORDS ('attendance_records') ───
                        const recId = `${targetCohortId}_${syncDate}_${learner.id}`;
                        const recRef = doc(db, 'attendance_records', recId);

                        batch.set(recRef, {
                            cohortId: targetCohortId,
                            learnerId: learner.id,
                            sessionDate: syncDate,
                            status: isPresent ? 'Present' : 'Absent',
                            actualDuration: isPresent ? EIGHT_HOURS_MINUTES : 0,
                            updatedAt: new Date().toISOString(),
                            source: 'ecosystem_sync',
                            eventId: event?.id
                        }, { merge: true });
                    });

                    // ─── C. WRITE MASTER SESSION LOG ('attendance_logs') ───
                    const logId = `${targetCohortId}_${syncDate}_ecosystem_${event?.id}`;
                    const logRef = doc(db, 'attendance_logs', logId);

                    const dayLabel = uniqueDates.length > 1 ? ` (Day ${uniqueDates.indexOf(syncDate) + 1})` : '';
                    const baseTitle = syncSessionTitle.trim() || event?.eventName || 'Ecosystem Event';

                    batch.set(logRef, {
                        cohortId: targetCohortId,
                        sessionDate: `${syncDate}T00:00:00.000Z`,
                        sessionTitle: `${baseTitle}${dayLabel}`.trim(),
                        sessionDescription: syncSessionDescription.trim() || `Full 8-Hour Day credited from Event: ${event?.eventName}`,
                        expectedDuration: EIGHT_HOURS_MINUTES,
                        totalEnrolled: cohortLearners.length,
                        totalPresent: dailyPresentCount,
                        totalAbsent: cohortLearners.length - dailyPresentCount,
                        totalPartial: 0,
                        createdAt: new Date().toISOString(),
                        isBootcamp: true,
                        importVersion: 1,
                        isEcosystem: true,
                        sourceEventId: event?.id,
                        rawZoomData: syntheticRawZoomData,
                        totalDaySessions: 1
                    }, { merge: true });
                });
            });

            await batch.commit();

            toast.success(`Multi-Cohort Sync Complete! Synced ${grandTotalPresencesSynced} presences across ${targetCohortList.length} cohort(s) for ${uniqueDates.length} day(s).`);
            setShowSyncModal(false);
            setSelectedCohortIds([]);
            setSyncSessionTitle('');
            setSyncSessionDescription('');
        } catch (error: any) {
            console.error("Multi-Cohort Sync Error:", error);
            toast.error(error.message || "Failed to execute multi-cohort sync.");
        } finally {
            setIsSyncing(false);
        }
    };

    const exportToCSV = () => {
        if (filteredCheckins.length === 0) {
            toast.error("No records to export.");
            return;
        }

        const escapeCSV = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

        const headers = [
            "Guest Name", "Email", "Mobile Number", "ID/Passport Number", "Gender",
            "Age", "Is Youth (18-35)", "POPIA Consent", "Marketing Opt-In", "Check-in Time", "Date"
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

            {/* 🚀 MULTI-COHORT SYNC MODAL WITH SCOPE TOGGLE */}
            {showSyncModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowSyncModal(false)}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UploadCloud size={16} /> Sync Attendance to Cohorts</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowSyncModal(false)}><X size={20} /></button>
                        </div>
                        <div className="lfm-body">
                            <div className="lfm-section-hdr"><Info size={13} /> Sync Summary &amp; Cohort Detection</div>
                            <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px dashed #0ea5e9', marginBottom: '1.25rem' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#0c4a6e', lineHeight: 1.5 }}>
                                    Pushing <strong>{filteredCheckins.length}</strong> check-ins across <strong>{urlSelectedDate !== 'all' ? `1 day` : `${availableDates.length} day(s)`}</strong>. Matched learners will receive an <strong>8-Hour Full Day Credit (Present - Workshop)</strong> on their compliance logbooks.
                                </p>
                            </div>

                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--mlab-midnight)', marginBottom: '8px', display: 'block' }}>
                                        Target Cohort Sync Scope
                                    </label>

                                    {/* MASTER TOGGLE 1: ALL DETECTED COHORTS */}
                                    <label style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                        background: syncMode === 'all_detected' ? '#f0fdf4' : '#f8fafc',
                                        border: `1px solid ${syncMode === 'all_detected' ? '#86efac' : '#cbd5e1'}`,
                                        borderRadius: '6px', marginBottom: '8px', cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="syncScope"
                                            checked={syncMode === 'all_detected'}
                                            onChange={() => {
                                                setSyncMode('all_detected');
                                                setSelectedCohortIds(detectedCohortStats.map(d => d.cohort.id));
                                            }}
                                            style={{ accentColor: 'var(--mlab-green)' }}
                                        />
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>
                                                All Cohorts with Attending Learners ({detectedCohortStats.length} Detected)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                                                Automatically syncs to every active cohort that has attending learners present in this event.
                                            </div>
                                        </div>
                                    </label>

                                    {/* MASTER TOGGLE 2: SPECIFIC COHORTS ONLY */}
                                    <label style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                        background: syncMode === 'custom' ? '#f0f9ff' : '#f8fafc',
                                        border: `1px solid ${syncMode === 'custom' ? '#7dd3fc' : '#cbd5e1'}`,
                                        borderRadius: '6px', marginBottom: '10px', cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="syncScope"
                                            checked={syncMode === 'custom'}
                                            onChange={() => setSyncMode('custom')}
                                            style={{ accentColor: 'var(--mlab-blue)' }}
                                        />
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>
                                                Select Specific Cohorts Manually
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                                                Choose manually from a list of active cohorts.
                                            </div>
                                        </div>
                                    </label>

                                    {/* GRANULAR CHECKBOX LIST (SHOWN WHEN 'CUSTOM' IS SELECTED) */}
                                    {syncMode === 'custom' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', background: 'white', border: '1px solid var(--mlab-border)', padding: '8px', borderRadius: '6px' }}>
                                            {cohorts.filter(c => !c.isArchived).map(c => {
                                                const isChecked = selectedCohortIds.includes(c.id);
                                                const detectedInfo = detectedCohortStats.find(d => d.cohort.id === c.id);

                                                return (
                                                    <label
                                                        key={c.id}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px',
                                                            borderRadius: '4px', background: isChecked ? '#e0f2fe' : 'white', border: `1px solid ${isChecked ? '#bae6fd' : '#e2e8f0'}`,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleCohortSelection(c.id)}
                                                                style={{ accentColor: 'var(--mlab-blue)' }}
                                                            />
                                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{c.name}</span>
                                                        </div>
                                                        {detectedInfo && (
                                                            <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#f3e8ff', color: '#6b21a8', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {detectedInfo.count} matched
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
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
                                        rows={2}
                                        value={syncSessionDescription}
                                        onChange={e => setSyncSessionDescription(e.target.value)}
                                        style={{ resize: 'vertical' }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowSyncModal(false)} disabled={isSyncing}>Cancel</button>
                            <button
                                type="button"
                                className="lfm-btn lfm-btn--primary"
                                onClick={executeCohortSync}
                                disabled={isSyncing || (syncMode === 'custom' && selectedCohortIds.length === 0)}
                            >
                                {isSyncing ? <><Loader2 size={16} className="lfm-spin" /> Executing Sync...</> : <><Send size={14} /> Push to {syncMode === 'all_detected' ? detectedCohortStats.length : selectedCohortIds.length} Cohort Register(s)</>}
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