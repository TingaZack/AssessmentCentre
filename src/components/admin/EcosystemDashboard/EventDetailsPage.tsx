import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Calendar, Users,
    Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,
    ChevronLeft,
    Globe,
    DownloadCloud,
    Loader2,
    UploadCloud, Send, FilterX, ChevronRight,
    Info
} from 'lucide-react';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import moment from 'moment';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

import type { EcosystemEvent } from '../../../types/ecosystem.types';

import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import '../../../pages/CohortDetails/CohortDetailsPage.css';

// ─── GUEST DETAILS MODAL ──────────────────────────────────────────────────
const GuestDetailsModal: React.FC<{ guest: any, crmProfile: any, event: EcosystemEvent, onClose: () => void }> = ({ guest, crmProfile, event, onClose }) => {
    if (!guest) return null;

    const safeTime = guest.timestamp?.toDate ? guest.timestamp.toDate() : guest.timestamp;

    // Merge data from the check-in ping and the rich CRM profile
    const phone = crmProfile?.phone || guest.guestPhone || '—';
    const idNumber = crmProfile?.idNumber || guest.guestIdNumber || 'Not provided';
    const gender = crmProfile?.gender || '—';
    const age = crmProfile?.age ? `${crmProfile.age} years old` : '—';
    const isYouth = crmProfile?.isYouth;

    return createPortal(
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title"><Users size={16} /> Guest Profile</h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>

                    {/* Header Banner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--mlab-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700 }}>
                            {guest.guestName?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.25rem', fontWeight: 700 }}>{guest.guestName}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.65rem' }}>
                                    Verified Attendance
                                </span>
                                {isYouth && (
                                    <span style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                        Youth (18-35)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Core Contact Info */}
                    <div className="lfm-section-hdr"><ShieldCheck size={13} /> Contact & Demographic Details</div>
                    <div className="lfm-grid" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--mlab-border)', marginBottom: '1.5rem' }}>
                        <div className="lfm-fg">
                            <label>Email Address</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{guest.guestEmail || '—'}</div>
                        </div>
                        <div className="lfm-fg">
                            <label>Mobile Number</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{phone}</div>
                        </div>
                        <div className="lfm-fg lfm-fg--full">
                            <label>ID / Passport Number</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{idNumber}</div>
                        </div>
                        <div className="lfm-fg">
                            <label>Gender</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{gender}</div>
                        </div>
                        <div className="lfm-fg">
                            <label>Age</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{age}</div>
                        </div>
                        <div className="lfm-fg">
                            <label>Check-in Time</label>
                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-midnight)', fontWeight: 500 }}>{moment(safeTime).format('D MMM YYYY, HH:mm')}</div>
                        </div>
                    </div>

                    {/* Dynamic Event Questions */}
                    {event.guestFormBlueprint && event.guestFormBlueprint.length > 0 && (
                        <>
                            <div className="lfm-section-hdr"><Filter size={13} /> Custom Event Responses</div>
                            <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px dashed #0ea5e9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {event.guestFormBlueprint.map(field => {
                                    const rawVal = guest.responses?.[field.id];
                                    const displayVal = typeof rawVal === 'boolean'
                                        ? (rawVal ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>)
                                        : (rawVal || <span style={{ color: 'var(--mlab-grey)', fontStyle: 'italic' }}>Skipped</span>);

                                    return (
                                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #bae6fd', paddingBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-heading)' }}>
                                                {field.label}
                                            </span>
                                            <span style={{ fontSize: '0.95rem', color: 'var(--mlab-midnight)' }}>
                                                {displayVal}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                </div>

                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={onClose}>Close Profile</button>
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
            const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};

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
                    crmProfile={crmProfiles[selectedGuest.guestEmail?.toLowerCase()]}
                    event={event}
                    onClose={() => setSelectedGuest(null)}
                />
            )}

            {/* 🚀 UPGRADED SYNC MODAL */}
            {showSyncModal && createPortal(
                <div className="lfm-overlay" onClick={() => setShowSyncModal(false)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><UploadCloud size={16} /> Sync Attendance to Cohort</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setShowSyncModal(false)}><X size={20} /></button>
                        </div>
                        <div className="lfm-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                            <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', display: 'flex', gap: '10px' }}>
                                <Info size={16} color="#0ea5e9" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <h4 style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#0369a1' }}>Sync Summary</h4>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#0c4a6e', lineHeight: 1.4 }}>
                                        Pushing <strong>{filteredCheckins.length}</strong> guest records across <strong>{urlSelectedDate !== 'all' ? `1 day` : `${availableDates.length} day(s)`}</strong> to the selected cohort. Matched learners will receive "Present" status for this activity.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="lfm-label">Target Cohort to Update</label>
                                <select
                                    className="lfm-input"
                                    value={syncCohortId}
                                    onChange={(e) => setSyncCohortId(e.target.value)}
                                    style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}
                                >
                                    <option value="">-- Choose a Cohort --</option>
                                    {cohorts.filter(c => !c.isArchived).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 🚀 CUSTOM TITLE & DESC FIELDS (Pre-filled) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--mlab-border)', paddingTop: '1rem' }}>
                                <div>
                                    <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Custom Session Title
                                    </label>
                                    <input
                                        type="text"
                                        className="lfm-input"
                                        placeholder="Enter the title for the register"
                                        value={syncSessionTitle}
                                        onChange={e => setSyncSessionTitle(e.target.value)}
                                        maxLength={100}
                                        style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label className="lfm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        Session Description
                                    </label>
                                    <textarea
                                        className="lfm-input"
                                        placeholder="Enter a description for this session..."
                                        rows={3}
                                        value={syncSessionDescription}
                                        onChange={e => setSyncSessionDescription(e.target.value)}
                                        style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', resize: 'vertical' }}
                                    />
                                </div>
                            </div>

                        </div>
                        <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setShowSyncModal(false)} disabled={isSyncing}>Cancel</button>
                            <button type="button" className="mlab-btn mlab-btn--primary" onClick={executeCohortSync} disabled={isSyncing || !syncCohortId}>
                                {isSyncing ? <><Loader2 size={16} className="spin" /> Executing Sync...</> : <><Send size={14} /> Push to Cohort Register</>}
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
                            {/* 🚀 UPDATED SYNC BUTTON */}
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
                    <div className="cdp-stat-row">
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

                            <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <table className="mlab-table" style={{ tableLayout: 'fixed' }}>
                                    <colgroup>
                                        <col style={{ width: '30%' }} />
                                        <col style={{ width: '20%' }} />
                                        <col style={{ width: '20%' }} />
                                        <col style={{ width: '15%' }} />
                                        <col style={{ width: '15%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th>Attendee Info</th>
                                            <th>Check-In Date</th>
                                            {event.guestFormBlueprint?.slice(0, 2).map(f => (
                                                <th key={f.id}>{f.label}</th>
                                            ))}
                                            <th className="att-td--right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedCheckins.length > 0 ? paginatedCheckins.map((c) => {
                                            const safeTime = getSafeTime(c.timestamp);
                                            const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};
                                            const displayPhone = profile.phone || c.guestPhone;

                                            return (
                                                <tr key={c.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>
                                                    <td>
                                                        <div className="cdp-learner-cell">
                                                            <div className="cdp-learner-avatar" style={{ backgroundColor: 'var(--mlab-green)' }}>
                                                                {c.guestName?.charAt(0) || '?'}
                                                            </div>
                                                            <div className="cdp-learner-cell__info">
                                                                <span className="cdp-learner-cell__name">{c.guestName}</span>
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
                                                                    <span style={{ maxWidth: '150px', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

                            {/* 🚀 PAGINATION FOOTER */}
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