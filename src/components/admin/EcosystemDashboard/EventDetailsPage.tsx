// src/pages/Ecosystem/EventDetailsPage/EventDetailsPage.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import {
    Calendar, Users,
    Filter, Search, Mail, Phone, Clock, QrCode, X, Eye, ShieldCheck,
    ChevronLeft,
    Globe,
    DownloadCloud,
    Loader2
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import moment from 'moment';

import type { EcosystemEvent } from '../../../types/ecosystem.types';

import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
import '../../../pages/CohortDetails/CohortDetailsPage.css'


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


// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export const EventDetailsPage: React.FC = () => {
    const { eventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useStore();

    const [event, setEvent] = useState<EcosystemEvent | null>(null);
    const [checkins, setCheckins] = useState<any[]>([]);

    // MASTER CRM PROFILES DICTIONARY
    const [crmProfiles, setCrmProfiles] = useState<Record<string, any>>({});

    const [loading, setLoading] = useState(true);
    const [selectedGuest, setSelectedGuest] = useState<any | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState<string>('all');

    useEffect(() => {
        if (!eventId) return;

        // 1. Fetch Event Meta
        const unsubEvent = onSnapshot(doc(db, 'events', eventId), (snap) => {
            if (snap.exists()) {
                setEvent({ id: snap.id, ...snap.data() } as EcosystemEvent);
            }
            setLoading(false);
        });

        // 2. Fetch All Check-ins for this Event
        const q = query(
            collection(db, 'event_checkins'),
            where('eventId', '==', eventId),
            orderBy('timestamp', 'desc')
        );

        const unsubCheckins = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setCheckins(data);
        });

        // 3. Fetch Master CRM Profiles (To enrich the CSV and Modal)
        const unsubGuests = onSnapshot(collection(db, 'ecosystem_guests'), (snapshot) => {
            const profiles: Record<string, any> = {};
            snapshot.docs.forEach(doc => {
                profiles[doc.id.toLowerCase()] = doc.data();
            });
            setCrmProfiles(profiles);
        });

        return () => {
            unsubEvent();
            unsubCheckins();
            unsubGuests();
        };
    }, [eventId]);

    // ─── DATA PROCESSING ─────────────────────────────────────────────────────

    const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : ts;

    const availableDates = useMemo(() => {
        const dates = checkins.map(c => moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD'));
        return Array.from(new Set(dates)).sort();
    }, [checkins]);

    const filteredCheckins = useMemo(() => {
        return checkins.filter(c => {
            const matchesSearch =
                c.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.guestEmail?.toLowerCase().includes(searchTerm.toLowerCase());

            const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');
            const matchesDate = selectedDate === 'all' || checkinDate === selectedDate;

            return matchesSearch && matchesDate;
        });
    }, [checkins, searchTerm, selectedDate]);

    const capacityPercent = event?.maxCapacity && event.maxCapacity > 0
        ? Math.round((checkins.length / event.maxCapacity) * 100)
        : 0;

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

            // Map the lightweight check-in to their rich CRM profile
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
        link.setAttribute("download", `Roster_${event?.eventName.replace(/\s+/g, '_')}_${moment().format('YYYYMMDD')}.csv`);
        link.click();
        toast.success("Roster exported to CSV successfully.");
    };

    if (loading || !event) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="ecosystem" onLogout={() => navigate('/login')} />
                <main className="cdp-main cdp-main--centered">
                    {loading ? (
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
                                <span className="cdp-stat-card__value">{checkins.length}</span>
                                <span className="cdp-stat-card__label">Total Attendees</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--green">
                            <div className="cdp-stat-card__icon"><Calendar size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{availableDates.length || 1}</span>
                                <span className="cdp-stat-card__label">Active Days</span>
                            </div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--amber">
                            <div className="cdp-stat-card__icon"><Clock size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{capacityPercent}%</span>
                                <span className="cdp-stat-card__label">Capacity Reached</span>
                            </div>
                        </div>
                    </div>

                    <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                        <div className="vp-card" style={{ marginBottom: 0 }}>
                            <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
                                <div className="vp-card-title-group">
                                    <Users size={18} color="var(--mlab-blue)" />
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                        Event Check-ins
                                    </h3>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div className="mlab-search" style={{ width: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Search size={16} color="var(--mlab-grey)" />
                                        <input
                                            type="text"
                                            placeholder="Search name or email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
                                        <Filter size={14} color="var(--mlab-grey)" />
                                        <select
                                            className="lfm-select"
                                            style={{ border: 'none', outline: 'none', background: 'transparent', padding: '2px', fontSize: '0.8rem' }}
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                        >
                                            <option value="all">All Dates</option>
                                            {availableDates.map(d => (
                                                <option key={d} value={d}>{moment(d).format('D MMM YYYY')}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="mlab-table-wrap">
                                <table className="mlab-table">
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
                                        {filteredCheckins.length > 0 ? filteredCheckins.map((c) => {
                                            const safeTime = getSafeTime(c.timestamp);
                                            const profile = crmProfiles[c.guestEmail?.toLowerCase()] || {};
                                            const displayPhone = profile.phone || c.guestPhone;

                                            return (
                                                <tr key={c.id}>
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

                                                    {/* Show only first 2 custom fields in table to prevent overflow */}
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
                                                            // className="mlab-btn mlab-btn--outline"
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
                                                    <Users size={40} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                                                    <p style={{ margin: 0 }}>No attendees found matching your filters.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// // src/pages/Ecosystem/EventDetailsPage/EventDetailsPage.tsx

// import React, { useEffect, useState, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
// import {
//     Calendar, Users, Filter, Search, Mail, Phone, Clock, QrCode,
//     ChevronLeft, Globe, DownloadCloud, Loader2
// } from 'lucide-react';
// import { db } from '../../../lib/firebase';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { useStore } from '../../../store/useStore';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// import moment from 'moment';

// import type { EcosystemEvent } from '../../../types/ecosystem.types';

// // Reuse the exact styling from CohortDetailsPage to ensure brand consistency
// // import '../../CohortDetailsPage/CohortDetailsPage.css';
// import '../../../pages/CohortDetails/CohortDetailsPage.css'

// export const EventDetailsPage: React.FC = () => {
//     const { eventId } = useParams<{ eventId: string }>();
//     const navigate = useNavigate();
//     const toast = useToast();
//     const { user } = useStore();

//     const [event, setEvent] = useState<EcosystemEvent | null>(null);
//     const [checkins, setCheckins] = useState<any[]>([]);
//     const [loading, setLoading] = useState(true);

//     // Filters
//     const [searchTerm, setSearchTerm] = useState('');
//     const [selectedDate, setSelectedDate] = useState<string>('all');

//     useEffect(() => {
//         if (!eventId) return;

//         // 1. Fetch Event Meta
//         const unsubEvent = onSnapshot(doc(db, 'events', eventId), (snap) => {
//             if (snap.exists()) {
//                 setEvent({ id: snap.id, ...snap.data() } as EcosystemEvent);
//             }
//             setLoading(false);
//         });

//         // 2. Fetch All Check-ins for this Event
//         const q = query(
//             collection(db, 'event_checkins'),
//             where('eventId', '==', eventId),
//             orderBy('timestamp', 'desc')
//         );

//         const unsubCheckins = onSnapshot(q, (snapshot) => {
//             const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
//             setCheckins(data);
//         });

//         return () => {
//             unsubEvent();
//             unsubCheckins();
//         };
//     }, [eventId]);

//     // ─── DATA PROCESSING ─────────────────────────────────────────────────────

//     // Helper to safely parse Firestore timestamps
//     const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : ts;

//     // Generate unique dates for the filter dropdown
//     const availableDates = useMemo(() => {
//         const dates = checkins.map(c => moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD'));
//         return Array.from(new Set(dates)).sort();
//     }, [checkins]);

//     // Filtered List
//     const filteredCheckins = useMemo(() => {
//         return checkins.filter(c => {
//             const matchesSearch =
//                 c.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
//                 c.guestEmail?.toLowerCase().includes(searchTerm.toLowerCase());

//             const checkinDate = moment(getSafeTime(c.timestamp)).format('YYYY-MM-DD');
//             const matchesDate = selectedDate === 'all' || checkinDate === selectedDate;

//             return matchesSearch && matchesDate;
//         });
//     }, [checkins, searchTerm, selectedDate]);

//     // Calculate capacity percentage safely
//     const capacityPercent = event?.maxCapacity && event.maxCapacity > 0
//         ? Math.round((checkins.length / event.maxCapacity) * 100)
//         : 0;

//     // ─── CSV EXPORT ──────────────────────────────────────────────────────────
//     const exportToCSV = () => {
//         if (filteredCheckins.length === 0) {
//             toast.error("No records to export.");
//             return;
//         }

//         // CSV Escape Helper to prevent commas in answers from breaking columns
//         const escapeCSV = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

//         // Headers
//         const headers = ["Guest Name", "Email", "Phone", "Check-in Time", "Date"];
//         // Add dynamic headers for custom questions
//         const customFieldKeys = event?.guestFormBlueprint?.map(f => f.label) || [];
//         const fullHeaders = [...headers, ...customFieldKeys];

//         const rows = filteredCheckins.map(c => {
//             const safeTime = getSafeTime(c.timestamp);
//             const baseData = [
//                 escapeCSV(c.guestName),
//                 escapeCSV(c.guestEmail),
//                 escapeCSV(c.guestPhone || 'N/A'),
//                 escapeCSV(moment(safeTime).format('HH:mm:ss')),
//                 escapeCSV(moment(safeTime).format('YYYY-MM-DD'))
//             ];

//             // Map responses to custom columns
//             const customData = event?.guestFormBlueprint?.map(f => {
//                 const answer = c.responses?.[f.id];
//                 const formattedAnswer = typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : (answer || '');
//                 return escapeCSV(formattedAnswer);
//             }) || [];

//             return [...baseData, ...customData].join(",");
//         });

//         const csvContent = [fullHeaders.map(escapeCSV).join(","), ...rows].join("\n");
//         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//         const url = URL.createObjectURL(blob);
//         const link = document.createElement("a");
//         link.setAttribute("href", url);
//         link.setAttribute("download", `Roster_${event?.eventName.replace(/\s+/g, '_')}_${moment().format('YYYYMMDD')}.csv`);
//         link.click();
//         toast.success("Roster exported to CSV successfully.");
//     };

//     // ─── LOADING STATE ───────────────────────────────────────────────────────
//     if (loading || !event) {
//         return (
//             <div className="cdp-layout">
//                 <Sidebar role={user?.role} currentNav="ecosystem" onLogout={() => navigate('/login')} />
//                 <main className="cdp-main cdp-main--centered">
//                     {loading ? (
//                         <div className="cdp-loading-state">
//                             <Loader2 size={40} className="cdp-spinner" color="var(--mlab-blue)" />
//                             <span className="cdp-loading-state__label">Loading Event Data...</span>
//                         </div>
//                     ) : (
//                         <div style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                             <h2>Event Not Found</h2>
//                             <button className="mlab-btn mlab-btn--outline" onClick={() => {
//                                 // navigate('/admin/ecosystem')
//                                 navigate(-1)
//                             }} style={{ marginTop: '1rem' }}>
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

//             <main className="cdp-main">
//                 {/* ─── PAGE HEADER (Matches CohortDetailsPage) ─── */}
//                 <header className="cdp-header">
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={() => {
//                             // navigate('/admin/ecosystem')
//                             navigate(-1)
//                         }}>
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

//                 {/* ─── CONTENT AREA ─── */}
//                 <div className="cdp-content">

//                     {/* ─── STAT CARDS (Matches CohortDetailsPage) ─── */}
//                     <div className="cdp-stat-row">
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Users size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{checkins.length}</span>
//                                 <span className="cdp-stat-card__label">Total Attendees</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--green">
//                             <div className="cdp-stat-card__icon"><Calendar size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{availableDates.length || 1}</span>
//                                 <span className="cdp-stat-card__label">Active Days</span>
//                             </div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--amber">
//                             <div className="cdp-stat-card__icon"><Clock size={20} /></div>
//                             <div className="cdp-stat-card__body">
//                                 <span className="cdp-stat-card__value">{capacityPercent}%</span>
//                                 <span className="cdp-stat-card__label">Capacity Reached</span>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
//                         <div className="vp-card" style={{ marginBottom: 0 }}>

//                             {/* ─── TABLE HEADER / TOOLBAR ─── */}
//                             <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
//                                 <div className="vp-card-title-group">
//                                     <Users size={18} color="var(--mlab-blue)" />
//                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                         Event Check-ins
//                                     </h3>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                                     <div className="mlab-search" style={{ width: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <Search size={16} color="var(--mlab-grey)" />
//                                         <input
//                                             type="text"
//                                             placeholder="Search name or email..."
//                                             value={searchTerm}
//                                             onChange={(e) => setSearchTerm(e.target.value)}
//                                             style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}
//                                         />
//                                     </div>

//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
//                                         <Filter size={14} color="var(--mlab-grey)" />
//                                         <select
//                                             className="lfm-select"
//                                             style={{ border: 'none', outline: 'none', background: 'transparent', padding: '2px', fontSize: '0.8rem' }}
//                                             value={selectedDate}
//                                             onChange={(e) => setSelectedDate(e.target.value)}
//                                         >
//                                             <option value="all">All Dates</option>
//                                             {availableDates.map(d => (
//                                                 <option key={d} value={d}>{moment(d).format('D MMM YYYY')}</option>
//                                             ))}
//                                         </select>
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* ─── DATA TABLE ─── */}
//                             <div className="mlab-table-wrap">
//                                 <table className="mlab-table">
//                                     <thead>
//                                         <tr>
//                                             <th>Attendee Info</th>
//                                             <th>Check-In Date</th>
//                                             {event.guestFormBlueprint?.map(f => (
//                                                 <th key={f.id}>{f.label}</th>
//                                             ))}
//                                             <th className="att-td--right">Time</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {filteredCheckins.length > 0 ? filteredCheckins.map((c) => {
//                                             const safeTime = getSafeTime(c.timestamp);
//                                             return (
//                                                 <tr key={c.id}>
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
//                                                                 {c.guestPhone && (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
//                                                                         <Phone size={10} /> {c.guestPhone}
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     </td>
//                                                     <td>
//                                                         <span className="cdp-status-badge cdp-status-badge--active" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
//                                                             {moment(safeTime).format('D MMM YYYY')}
//                                                         </span>
//                                                     </td>

//                                                     {/* Dynamic Custom Field Cells */}
//                                                     {event.guestFormBlueprint?.map(f => {
//                                                         const val = c.responses?.[f.id];
//                                                         return (
//                                                             <td key={f.id} style={{ fontSize: '0.85rem', color: '#475569' }}>
//                                                                 {typeof val === 'boolean' ? (
//                                                                     val ? <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--mlab-grey)' }}>No</span>
//                                                                 ) : (
//                                                                     val || '—'
//                                                                 )}
//                                                             </td>
//                                                         );
//                                                     })}

//                                                     <td className="att-td--right">
//                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', fontWeight: 600, color: 'var(--mlab-grey)' }}>
//                                                             <Clock size={12} /> {moment(safeTime).format('HH:mm')}
//                                                         </div>
//                                                     </td>
//                                                 </tr>
//                                             );
//                                         }) : (
//                                             <tr>
//                                                 <td colSpan={4 + (event.guestFormBlueprint?.length || 0)} style={{ padding: '4rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                     <Users size={40} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
//                                                     <p style={{ margin: 0 }}>No attendees found matching your filters.</p>
//                                                 </td>
//                                             </tr>
//                                         )}
//                                     </tbody>
//                                 </table>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };